#!/usr/bin/env bun
/**
 * Check, online, the outbound links of the site: the "Liens" page and every
 * link to a video (YouTube, Dailymotion, Vimeo, INA, Facebook…) in the
 * content. Writes the dead ones to scripts/migrate/dead-links.json, which the
 * migration reads to remove them (it stays offline and deterministic).
 *
 *   bun scripts/check-links.ts [--db db/charles-trenet.sqlite] [--report /tmp/links.json]
 *
 * Verdicts are kept for the URLs already in dead-links.json (a video removed
 * once is not looked for again: it is no longer in the database).
 */
import { Database } from "bun:sqlite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { isVideoUrl, normalizeUrl, videoKey } from "./migrate/dead-links.ts";

const { values: args } = parseArgs({
  options: { db: { type: "string", default: "db/charles-trenet.sqlite" }, report: { type: "string" } },
});
const OUT = join(import.meta.dir, "migrate/dead-links.json");
const db = new Database(args.db!, { readonly: true });

// --- What to check ---------------------------------------------------------------

const where = new Map<string, Set<string>>(); // url → "links:12", "posts:1403"…
const add = (url: string, at: string) => (where.get(url) ?? where.set(url, new Set()).get(url)!).add(at);

for (const l of db.query<{ id: number; url: string }, []>("SELECT id, url FROM links").all()) add(normalizeUrl(l.url), `links:${l.id}`);
const SOURCES: [string, string][] = [
  ["articles", "intro_html || ' ' || body_html"], ["comments", "body_html"], ["texts", "body_html"], ["posts", "body_html"],
  ["agenda", "body_html || ' href=\"' || coalesce(url, '') || '\"'"], ["timeline", "events_html"], ["ephemerides", "body_html"],
];
for (const [table, expr] of SOURCES) {
  for (const r of db.query<{ id: number; v: string }, []>(`SELECT rowid AS id, ${expr} AS v FROM ${table}`).all()) {
    for (const m of r.v.matchAll(/data-youtube="([\w-]{11})"/g)) add(`https://www.youtube.com/watch?v=${m[1]}`, `${table}:${r.id}`);
    for (const m of r.v.matchAll(/href="(https?:[^"]+)"/g)) {
      const url = normalizeUrl(m[1]!);
      if (isVideoUrl(url)) add(url, `${table}:${r.id}`);
    }
  }
}

// --- How to check ----------------------------------------------------------------

type Verdict = { ok: boolean; why: string };
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

async function get(url: string, headers: Record<string, string> = {}): Promise<{ status: number; url: string; text: string }> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { redirect: "follow", headers: { "user-agent": UA, "accept-language": "fr,en", ...headers }, signal: AbortSignal.timeout(25_000) });
      return { status: r.status, url: r.url, text: await r.text() };
    } catch (e) {
      last = e;
      await Bun.sleep(1000 * (attempt + 1));
    }
  }
  throw last;
}
const title = (html: string) => (/<title[^>]*>([^<]*)/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 120);

/** A page that is gone without saying so: parked domain, redirect to a home page, "page introuvable". */
function soft404(original: string, res: { status: number; url: string; text: string }): string | null {
  const o = new URL(original), f = new URL(res.url);
  const host = (h: string) => h.replace(/^www\d?\./, "");
  if (host(o.hostname) !== host(f.hostname) && !f.hostname.endsWith(host(o.hostname))) return `redirige vers un autre site (${f.hostname})`;
  if (o.pathname.length > 1 && (f.pathname === "/" || f.pathname === "") && !f.search) return "redirige vers la page d’accueil";
  const t = title(res.text).toLowerCase();
  if (/\b(404|not found|introuvable|n'existe pas|n’existe pas|page non trouvée|domain (is )?for sale|domaine .*à vendre|parked|buy this domain|expired)\b/.test(t)) return `page d’erreur (« ${title(res.text)} »)`;
  const head = res.text.slice(0, 20000);
  if (/sedoparking|parkingcrew|bodis\.com|domain-for-sale|hugedomains|dan\.com|afternic|abovedomains|may be for sale|location\.href="\/lander"/i.test(head)) return "domaine parqué ou à vendre";
  const text = res.text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length < 40) return "page vide";
  if (/^(site )?en construction$/i.test(title(res.text))) return "site en construction";
  return null;
}

/**
 * Videos that YouTube does not describe (401/403: embedding disabled, or
 * private), seen by hand on their page when YouTube rate-limits robots.
 */
const BY_HAND_YOUTUBE: Record<string, Verdict> = {
  "7qhbJYtIiAI": { ok: true, why: "vidéo YouTube (intégration désactivée)" },
  "wJ9VupctMic": { ok: true, why: "vidéo YouTube (intégration désactivée)" },
  "FPSfiNewEJo": { ok: false, why: "vidéo YouTube privée" },
};

/** One verdict per YouTube video, whatever the address used to link it. */
const youtubeCache = new Map<string, Promise<Verdict>>();
function youtube(id: string): Promise<Verdict> {
  if (!youtubeCache.has(id)) youtubeCache.set(id, (async () => {
    const o = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
    if (o.status === 200) return { ok: true, why: JSON.parse(o.text).title };
    if (o.status === 400 || o.status === 404) return { ok: false, why: `vidéo YouTube supprimée (${o.status})` };
    if (BY_HAND_YOUTUBE[id]) return BY_HAND_YOUTUBE[id]!;
    // 401: embedding disabled, or private. The watch page tells (past the
    // cookie banner); without an answer, retry rather than guess.
    for (let attempt = 0; attempt < 4; attempt++) {
      const w = await get(`https://www.youtube.com/watch?v=${id}&hl=fr`, { cookie: "SOCS=CAI; CONSENT=YES+" });
      const status = /"playabilityStatus":\{"status":"(\w+)"/.exec(w.text)?.[1];
      if (status === "OK") return { ok: true, why: "vidéo YouTube (intégration désactivée)" };
      if (status) return { ok: false, why: `vidéo YouTube indisponible (${o.status}, ${status})` };
      await Bun.sleep(3000 * (attempt + 1));
    }
    throw new Error(`YouTube ${id}: pas de réponse claire`);
  })());
  return youtubeCache.get(id)!;
}

/**
 * Verdicts that a robot cannot reach: sites that block robots, or that
 * answer with a generic page. Checked by hand (date in dead-links.json).
 */
const BY_HAND: Record<string, Verdict> = {
  "http://www.ebay.fr/": { ok: true, why: "eBay refuse les robots ; site actif" },
  "http://www.chorus-chanson.fr/HOME2/NUMERO28/edito28.htm": { ok: false, why: "éditorial de 2001 de la revue Chorus (arrêtée en 2009) ; le site refuse toute vérification" },
  "http://www.academie-des-beaux-arts.fr/membres/actuel/Musique/Trenet/fiche.htm": { ok: false, why: "ancienne adresse de l’Académie des beaux-arts, qui a refait son site" },
  "http://www.annuaire-celebrite.com/celebrite/1154/trenet/charles_trenet.php": { ok: false, why: "la fiche Trenet renvoie désormais vers une liste générique" },
  "http://www.christophe-pochon.com/": { ok: false, why: "ne reste qu’une intro Flash ; le lien vers le site renvoie une erreur 404" },
  "http://www.tino-rossi.fr.st": { ok: false, why: "le service de redirection fr.st n’affiche plus qu’une page générique" },
  "http://www.ambfrance.com": { ok: false, why: "redirige vers un autre site, fermé (403)" },
};

async function check(url: string): Promise<Verdict> {
  if (BY_HAND[url]) return BY_HAND[url]!;
  const key = videoKey(url);
  if (key?.service === "youtube") {
    if (!key.id) {
      const r = await get(url);
      return r.status === 200 && !soft404(url, r) ? { ok: true, why: "chaîne YouTube" } : { ok: false, why: `chaîne YouTube introuvable (${r.status})` };
    }
    return youtube(key.id);
  }
  if (key?.service === "dailymotion") {
    if (!key.id) return { ok: false, why: "page de recherche Dailymotion, pas une vidéo" };
    const r = await get(`https://api.dailymotion.com/video/${key.id}?fields=id,status,title,private`);
    if (r.status !== 200) return { ok: false, why: `vidéo Dailymotion introuvable (${r.status})` };
    const v = JSON.parse(r.text);
    return v.status === "published" && !v.private ? { ok: true, why: v.title } : { ok: false, why: `vidéo Dailymotion ${v.status}` };
  }
  if (key?.service === "vimeo") {
    const r = await get(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${key.id}`)}`);
    return r.status === 200 ? { ok: true, why: JSON.parse(r.text).title } : { ok: false, why: `vidéo Vimeo introuvable (${r.status})` };
  }
  const r = await get(url);
  if (r.status >= 400) return { ok: false, why: `erreur ${r.status}` };
  const soft = soft404(url, r);
  if (soft) return { ok: false, why: soft };
  if (key?.service === "ina" && !/\/video\/|\/audio\//i.test(r.url)) return { ok: false, why: "INA : plus de vidéo à cette adresse" };
  if (key?.service === "facebook" && /log ?in|connexion|se connecter|^facebook$|^vid(é|Ã©)o$|vidéos populaires/i.test(title(r.text))) return { ok: false, why: "Facebook : vidéo introuvable" };
  return { ok: true, why: title(r.text) || `HTTP ${r.status}` };
}

// --- Run -----------------------------------------------------------------------------

const previous: { dead: Record<string, string>; no_embed?: string[] } = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { dead: {} };
const urls = [...where.keys()].sort();
const report: Record<string, Verdict & { at: string[] }> = {};
let i = 0;
async function worker() {
  while (i < urls.length) {
    const url = urls[i++]!;
    let v: Verdict;
    try {
      v = await check(url);
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      // No verdict: keep the previous one rather than guess
      if (/pas de réponse claire/.test(msg)) { console.log(`??   ${url}  — ${msg}`); continue; }
      v = { ok: false, why: `injoignable (${msg.slice(0, 60)})` };
    }
    report[url] = { ...v, at: [...where.get(url)!] };
    console.log(`${v.ok ? "ok  " : "MORT"} ${url}  — ${v.why}`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

const dead = { ...previous.dead };
for (const [url, v] of Object.entries(report)) {
  if (v.ok) delete dead[url];
  else dead[url] = v.why;
}
// Alive, but YouTube refuses to play them elsewhere: a link, not an embed
const noEmbed = new Set<string>(previous.no_embed ?? []);
for (const [url, v] of Object.entries(report)) {
  const k = videoKey(url);
  if (k?.service === "youtube" && k.id && v.ok && /intégration désactivée/.test(v.why)) noEmbed.add(k.id);
}
writeFileSync(OUT, JSON.stringify({ checked_at: new Date().toISOString().slice(0, 10), no_embed: [...noEmbed].sort(), dead: Object.fromEntries(Object.entries(dead).sort()) }, null, 2) + "\n");
if (args.report) writeFileSync(args.report, JSON.stringify(report, null, 2));
const n = Object.values(report).filter((v) => !v.ok).length;
console.log(`\n${urls.length} liens vérifiés, ${n} morts → ${OUT}`);
