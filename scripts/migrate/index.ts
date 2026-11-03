#!/usr/bin/env bun
/**
 * One-shot migration: PostNuke (MySQL dump + legacy files) → SQLite + media.
 *
 *   bun scripts/migrate/index.ts --dump data/db_2026-11-03.sql --legacy site
 *
 * Writes db/charles-trenet.sqlite and public/media/. Only public content is
 * migrated: no accounts, passwords, e-mail addresses, IPs, private messages,
 * newsletter subscribers or referrer logs.
 */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { resolveLegacyUrl, type LegacyLookup } from "../../src/legacy.ts";
import { bbcodeToHtml } from "./bbcode.ts";
import { cleanHtml, decodeSafeEntities, finalize, type CleanOptions } from "./clean-html.ts";
import { isDead, removeDeadLinks } from "./dead-links.ts";
import { agendaAdditions, applyAdditions, CONTENT_MEDIA } from "./additions.ts";
import { applyCatalog } from "./catalogs.ts";
import { MediaLibrary } from "./media.ts";
import { loadDump, type Row } from "./mysql-dump.ts";
import { listLegacyTexts, parseCatalogue, splitLyrics } from "./songs.ts";
import {
  collapseWs, decodeEntities, escapeHtml, excerpt, fold, looksAccentDamaged, readingMinutes,
  normaliseName, redactEmails, repairLegacyChars, repairQuestionMarks, SlugRegistry, slugify, smartTitle,
  stripSlashes, stripTags, typography, Vocabulary,
} from "./text.ts";
import { parseTimeline } from "./timeline.ts";

const ROOT = join(import.meta.dir, "../..");
const { values: args } = parseArgs({
  options: {
    dump: { type: "string", default: join(ROOT, "data/db_2026-11-03.sql") },
    legacy: { type: "string", default: join(ROOT, "legacy/site") },
    out: { type: "string", default: join(ROOT, "db/charles-trenet.sqlite") },
    media: { type: "string", default: join(ROOT, "public/media") },
  },
});
const LEGACY = args.legacy!;
const log = (...a: unknown[]) => console.log("•", ...a);

for (const [what, path] of [["dump", args.dump!], ["legacy site", LEGACY]] as const) {
  if (!existsSync(path)) {
    console.error(`Missing ${what}: ${path}\nSee README.md, section “The migration”.`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 1. Load sources
// ---------------------------------------------------------------------------
log("Reading MySQL dump…");
const dbs = await loadDump(args.dump!);
const live = dbs.get("dalilol_dalilol2");
if (!live) throw new Error("Live database dalilol_dalilol2 not found in dump");
const rows = (table: string): Row[] => live.get(table)?.rows ?? [];
const str = (v: string | null | undefined) => (v ?? "").toString();
const int = (v: string | null | undefined) => Number.parseInt(str(v), 10) || 0;
const unixToIso = (s: string | null | undefined) => new Date(int(s) * 1000).toISOString();
const sqlToIso = (s: string | null | undefined) => (s ? `${s.replace(" ", "T")}+01:00` : new Date(0).toISOString());

const catalogue = parseCatalogue(LEGACY);
const legacyTexts = listLegacyTexts(LEGACY);
const stories = rows("nuke_stories").sort((a, b) => int(a.pn_sid) - int(b.pn_sid));
log(`${stories.length} articles, ${catalogue.length} catalogue entries, ${legacyTexts.length} text pages`);

// ---------------------------------------------------------------------------
// 2. Vocabulary from clean text (for accent repair and title casing)
// ---------------------------------------------------------------------------
const vocab = new Vocabulary();
for (const s of stories) {
  const t = stripTags(str(s.pn_hometext) + " " + str(s.pn_bodytext));
  if (!looksAccentDamaged(t)) vocab.add(t);
}
for (const t of legacyTexts) vocab.add(repairLegacyChars(stripTags(t.html)));
for (const p of rows("nuke_XForum_posts")) if (!looksAccentDamaged(str(p.message))) vocab.add(str(p.message));

/** Apply a function to the text nodes of an HTML string only. */
const mapText = (html: string, fn: (t: string) => string) =>
  html.replace(/(^|>)([^<]+)(?=<|$)/g, (_, gt: string, text: string) => gt + fn(text));
const repairHtml = (html: string) => mapText(html, (t) => repairQuestionMarks(t, vocab));
const repairText = (t: string) => repairQuestionMarks(t, vocab);

// ---------------------------------------------------------------------------
// 3. URLs for everything (needed before cleaning, to rewrite links)
// ---------------------------------------------------------------------------
const THEMES: Record<number, { slug: string; position: number; description: string }> = {
  32: { slug: "chanson", position: 1, description: "Ses disques, ses récitals, ses musiciens, ses grands moments sur scène : le chanteur, de l’ABC au Palais des Congrès." },
  33: { slug: "l-homme", position: 2, description: "Enfance, famille, amitiés, procès et zones d’ombre : l’homme derrière l’artiste." },
  2: { slug: "litterature", position: 3, description: "Romans, poèmes et écrits : Trenet l’écrivain, ses lectures et ses maîtres." },
  31: { slug: "cinema", position: 4, description: "De « La Route enchantée » à « Printemps à Paris » : ses films et sa filmographie." },
  30: { slug: "peinture", position: 5, description: "Le violon d’Ingres d’un poète qui peignait aussi." },
  1: { slug: "coup-de-chapeau", position: 6, description: "Hommages, témoignages et coups de cœur des amis de Charles Trenet." },
  29: { slug: "coup-de-venin", position: 7, description: "La rubrique des humeurs, des polémiques et des coups de gueule." },
};
const themeUrl = new Map<number, string>();
for (const t of rows("nuke_topics")) {
  const meta = THEMES[int(t.pn_topicid)];
  if (meta) themeUrl.set(int(t.pn_topicid), `/themes/${meta.slug}`);
}

/** Titles the automatic re-casing cannot get right (proper names of venues…). */
const TITLE_OVERRIDES: Record<number, string> = {
  31: "1913-2001, le siècle Trenet",
  33: "Le petit Charles et la musique des sphères",
  35: "Chantons Noël ! Une crise de foi pour le Fou chantant ?",
  38: "Le Fou chantant",
  43: "Le Fou chantait : un audacieux pari",
  45: "Mon voyage en Languedoc-Roussillon",
  127: "L’hommage de Charlie Hebdo : entretien avec Georges El Assidi",
  133: "1981, autour de l’album « Vrai ! Vrai ! Vrai ! »",
  134: "Ce que Charles Trenet pense de « ses » films en 1943…",
  146: "1989, un punch d’enfer au Palais des Congrès",
  147: "Son violon d’Ingres",
  149: "« Voyage au bout de la nuit » de Céline…",
  48: "Trenet à la Rose Rouge",
  84: "Je n’irai pas à Notre-Dame… L’album posthume !",
  115: "1938, les débuts à l’A.B.C.",
  118: "Charles Trenet triomphe au Théâtre de l’Étoile à Paris",
  121: "1961, récital à l’Étoile — Le secret de Trenet : il est fou sans être dément",
  126: "1969, un jeune homme en complet marron — Charles Trenet au Théâtre de la Ville",
  129: "1971, Charles Trenet à l’Olympia…",
  136: "Charles Trenet au Théâtre du Rond-Point, 29 juin 1981",
  142: "Les DVD et Blu-ray",
  144: "Printemps à Paris, tourné en juillet 1956, sorti le 3 mars 1957",
  155: "La Panthère, de Benno Vigny",
};
/** Same person, several spellings. */
const AUTHOR_ALIASES: Record<string, string> = { "Ann Alnatt": "Ann Allnatt" };

interface ArticleMeta { id: number; slug: string; title: string; series: string | null; part: number | null; url: string }
const articleMeta = new Map<number, ArticleMeta>();
for (const s of stories) {
  const id = int(s.pn_sid);
  let raw = collapseWs(decodeEntities(str(s.pn_title)));
  let series: string | null = null;
  let part: number | null = null;
  const gm = /^LES GRANDS MOMENTS\s*[-–]?\s*(\d+)\s*:\s*(.*)$/i.exec(raw);
  if (gm) {
    series = "Les grands moments";
    part = Number(gm[1]);
    raw = gm[2]!;
  } else if (int(s.pn_catid) === 3) {
    series = "Sa route enchantée";
    const m = /^(\d+)\s*-\s*(.*)$/.exec(raw);
    if (m) {
      part = Number(m[1]);
      raw = m[2]!;
    }
  }
  const title = typography((TITLE_OVERRIDES[id] ?? smartTitle(raw, vocab)).replace(/\s*\(\*\)\s*$/, ""));
  const slug = slugify(title, 70);
  articleMeta.set(id, { id, slug, title, series, part, url: `/articles/${id}-${slug}` });
}

// Texts and songs
const textSlugs = new SlugRegistry();
const songSlugs = new SlugRegistry();
const songUrlByFile = new Map<string, string>();
const songSlugByIndex = catalogue.map((c) => songSlugs.take(slugify(c.title, 70)));
catalogue.forEach((c, i) => {
  if (c.file && !songUrlByFile.has(c.file)) songUrlByFile.set(c.file, `/chansons/${songSlugByIndex[i]}`);
});
const fileExists = new Set(legacyTexts.map((t) => t.file));
const catalogueTitleByFile = new Map(catalogue.filter((c) => c.file).map((c) => [c.file!, c.title]));
const TEXT_TITLES: Record<string, string> = {
  "palavas.html": "Palavas",
  "politique.html": "Politique ? Cinéma ? Bohème ?",
  "synopsis_route_enchantee.html": "La Route enchantée — synopsis",
  "RTBF50ans.html": "RTBF : 50 ans de télévision en Belgique",
  "pleyel.html": "Pleyel ’99, le dernier témoignage public",
  "ecouter_aux_portes.html": "Écouter aux portes",
  "maitre.html": "Ô mon Maître",
};
/** Pages whose <title> was copy-pasted: the first capitalised line of the body is the real title. */
function bodyHeading(html: string): string | null {
  const lines = stripTags(repairLegacyChars(html)).split("\n").map((l) => collapseWs(l)).filter((l) => l && !/=|>/.test(l));
  const first = lines[0];
  if (!first || first.length > 80) return null;
  const letters = first.replace(/[^\p{L}]/gu, "");
  return letters.length > 1 && letters.replace(/[^\p{Lu}]/gu, "").length / letters.length > 0.6 ? first : null;
}
const titleKey = (t: string) => fold(t).toLowerCase().replace(/[^a-z0-9]/g, "");
const textTitleByFile = new Map<string, string>();
for (const t of legacyTexts) {
  let title = catalogueTitleByFile.get(t.file);
  if (!title) {
    title = t.title;
    const h = bodyHeading(t.html);
    if (h && titleKey(h) !== titleKey(t.title)) {
      const s = typography(smartTitle(h, vocab));
      title = s[0]!.toUpperCase() + s.slice(1);
    }
    title = typography(TEXT_TITLES[t.file] ?? title);
  }
  textTitleByFile.set(t.file, title);
}
// Catalogue songs without a lyrics link, but whose lyrics page exists under the same title.
const catalogueKeys = new Map<string, number>();
catalogue.forEach((c, i) => {
  if (!c.file && !c.seeAlso) catalogueKeys.set(titleKey(c.title), i);
});
for (const t of legacyTexts) {
  if (catalogueTitleByFile.has(t.file)) continue;
  const i = catalogueKeys.get(titleKey(textTitleByFile.get(t.file)!));
  if (i === undefined || catalogue[i]!.file) continue;
  catalogue[i]!.file = t.file;
  catalogueTitleByFile.set(t.file, catalogue[i]!.title);
  textTitleByFile.set(t.file, catalogue[i]!.title);
  if (!songUrlByFile.has(t.file)) songUrlByFile.set(t.file, `/chansons/${songSlugByIndex[i]}`);
}
const textSlugByFile = new Map<string, string>();
for (const t of legacyTexts) textSlugByFile.set(t.file, textSlugs.take(slugify(textTitleByFile.get(t.file)!, 70)));

// Forum
const forumRows = rows("nuke_XForum_forums").filter((f) => f.type === "forum" && f.status === "on" && str(f.name).trim());
const forumSlug = new Map<number, string>(forumRows.map((f) => [int(f.fid), slugify(decodeEntities(str(f.name)))]));
const threadRows = rows("nuke_XForum_threads").filter((t) => forumSlug.has(int(t.fid)));
const threadUrl = new Map<number, string>(
  threadRows.map((t) => [int(t.tid), `/forum/sujet/${int(t.tid)}-${slugify(decodeEntities(stripSlashes(str(t.subject))), 60)}`]),
);

// Media
rmSync(args.media!, { recursive: true, force: true });
const media = new MediaLibrary(LEGACY, args.media!);

// Text dedupe is computed after cleaning; until then aliases are empty.
const textAlias = new Map<string, string>();
const lookup: LegacyLookup = {
  article: (sid) => articleMeta.get(sid)?.url ?? null,
  text: (file) => {
    const f = [...fileExists].find((x) => x.toLowerCase() === file.toLowerCase());
    if (!f) return null;
    const canonical = textAlias.get(f) ?? f;
    return songUrlByFile.get(canonical) ?? `/textes/${textSlugByFile.get(canonical)}`;
  },
  thread: (tid) => threadUrl.get(tid) ?? null,
  forum: (fid) => (forumSlug.has(fid) ? `/forum/${forumSlug.get(fid)}` : null),
  topic: (id) => themeUrl.get(id) ?? null,
  media: (path) => media.resolve(path)?.url ?? null,
};

let currentMentions: Set<string> | null = null;
const resolveLink = (href: string, baseDir = "") => {
  // Relative links inside chansons/*.html point to siblings.
  const h = baseDir && !/^([a-z]+:|\/|#)/i.test(href) ? `/${baseDir}/${href}` : href;
  const url = resolveLegacyUrl(h, lookup);
  if (url && currentMentions && (url.startsWith("/chansons/") || url.startsWith("/textes/"))) currentMentions.add(url);
  return url;
};
const DECOR = /(\/|^)(logo(chansons)?\.(gif|jpe?g)|themes\/|images\/(global|topics|forum|smilies)|alphabet\/|spacer|pixel|arrow\d*\.gif|puce|bullet)/i;
const cleanOpts = (baseDir = ""): CleanOptions => ({
  resolveLink: (h) => resolveLink(h, baseDir),
  resolveImage: (src) => {
    const m = media.resolve(src, baseDir);
    return m ? { src: m.url, width: m.width, height: m.height } : null;
  },
  dropImage: (src) => DECOR.test(src),
});
const clean = (html: string, baseDir = "") => cleanHtml(html, cleanOpts(baseDir));

// ---------------------------------------------------------------------------
// 4. Content
// ---------------------------------------------------------------------------
const out = {
  articles: [] as Record<string, unknown>[],
  comments: [] as Record<string, unknown>[],
  texts: [] as Record<string, unknown>[],
  songs: [] as Record<string, unknown>[],
  mentions: [] as [number, number][],
};

// --- Texts (lyrics, poems, letters) ---
log("Cleaning lyrics and texts…");
const poemFiles = new Set(
  [...str(stories.find((s) => int(s.pn_sid) === 135)?.pn_bodytext).matchAll(/chansons\/+([\w.-]+\.html)/gi)].map((m) => m[1]!),
);
const textIdByFile = new Map<string, number>();
const plainSeen = new Map<string, string>();
// Catalogue-linked texts first so they win deduplication.
const orderedTexts = [...legacyTexts].sort((a, b) => Number(songUrlByFile.has(b.file)) - Number(songUrlByFile.has(a.file)));
let textId = 0;
const textMentions = new Map<string, number>(); // url -> text id
const KIND_OVERRIDES: Record<string, string> = { "pleyel.html": "document", "RTBF50ans.html": "document", "swing.html": "chanson" };

const catalogueTextTitle = new Map<string, string>(); // folded title -> file, for catalogue songs with lyrics
for (const c of catalogue) if (c.file) catalogueTextTitle.set(titleKey(c.title), c.file);
for (const t of orderedTexts) {
  const inCatalogue = catalogueTitleByFile.get(t.file);
  const cleaned = clean(t.html, "chansons");
  const title = textTitleByFile.get(t.file)!;
  const parsed = splitLyrics(cleaned, inCatalogue ?? t.title);
  const plain = stripTags(parsed.html);
  if (plain.length < 40) {
    log(`  skip near-empty text ${t.file}`);
    continue;
  }
  const key = fold(plain).toLowerCase().replace(/[^a-z]/g, "");
  const twin = !inCatalogue ? catalogueTextTitle.get(titleKey(title)) : undefined;
  const dup = plainSeen.get(key) ?? (twin && twin !== t.file && fileExists.has(twin) ? twin : undefined);
  if (dup) {
    textAlias.set(t.file, dup);
    continue;
  }
  plainSeen.set(key, t.file);
  const songCredits = parsed.credits && /paroles|musique|words|music/i.test(parsed.credits);
  let kind = "document";
  if (KIND_OVERRIDES[t.file]) kind = KIND_OVERRIDES[t.file]!;
  else if (songUrlByFile.has(t.file) || t.author !== "Charles Trenet" || songCredits) kind = "chanson";
  else if (/^lettre/i.test(t.file) || /^lettre/i.test(title)) kind = "lettre";
  else if (poemFiles.has(t.file) || (parsed.credits && /po[eè]me/i.test(parsed.credits))) kind = "poeme";
  else {
    const lines = plain.split("\n").filter(Boolean);
    const avg = lines.reduce((a, l) => a + l.length, 0) / Math.max(1, lines.length);
    if (lines.length > 6 && avg < 55) kind = "poeme";
  }
  const id = ++textId;
  textIdByFile.set(t.file, id);
  const slug = textSlugByFile.get(t.file)!;
  textMentions.set(songUrlByFile.get(t.file) ?? `/textes/${slug}`, id);
  out.texts.push({
    id, slug, legacy_file: t.file, kind, title, author: t.author,
    credits: parsed.credits ? typography(parsed.credits) : null, copyright: parsed.copyright, body_html: parsed.html, plain,
  });
}
for (const [alias, canonical] of textAlias) textIdByFile.set(alias, textIdByFile.get(canonical)!);
log(`  ${out.texts.length} texts (${textAlias.size} duplicates merged)`);

// --- Songs ---
const songIdBySortKey = new Map<string, number>();
catalogue.forEach((c, i) => {
  const id = i + 1;
  songIdBySortKey.set(fold(c.sortTitle).toLowerCase(), id);
  songIdBySortKey.set(fold(c.title).toLowerCase(), id);
});
catalogue.forEach((c, i) => {
  const seeAlsoId = c.seeAlso
    ? songIdBySortKey.get(fold(c.seeAlso).toLowerCase()) ??
      songIdBySortKey.get(fold(c.seeAlso.replace(/\s*\((?:l'|le|la|les)\)$/i, "")).toLowerCase()) ??
      null
    : null;
  out.songs.push({
    id: i + 1, slug: songSlugByIndex[i], title: c.title, sort_title: c.sortTitle, letter: c.letter,
    year: c.year, publisher: c.publisher, unpublished: c.unpublished ? 1 : 0,
    performed_only: c.performedOnly ? 1 : 0, text_id: c.file ? textIdByFile.get(c.file) ?? null : null,
    see_also_id: seeAlsoId, see_also_title: c.seeAlso, position: c.order,
  });
});

// --- Articles ---
log("Cleaning articles…");
const commentRows = rows("nuke_comments");
const commentCount = new Map<number, number>();
for (const c of commentRows) commentCount.set(int(c.pn_sid), (commentCount.get(int(c.pn_sid)) ?? 0) + 1);
const CATEGORY: Record<number, string> = { 1: "Références", 2: "Témoignages", 3: "Sa route enchantée" };

function extractByline(html: string): { author: string | null; html: string } {
  const text = stripTags(html).slice(0, 300);
  const m = /(?:^|\n)\s*par\s+([A-ZÉÈ][^\n]{2,55}?)\s*(?:\n|$)/.exec(text);
  if (!m) return { author: null, html };
  const author = m[1]!.replace(/[.,:;]+$/, "").trim();
  const words = author.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`((?:<(?:strong|em|u)>\\s*)*)par\\s+${words.join("\\s+")}[.,:;]?\\s*((?:<\\/(?:strong|em|u)>\\s*)*)`, "i");
  const stripped = html
    .replace(re, "")
    .replace(/<(strong|em|u)>\s*<\/\1>/g, "")
    .replace(/<p>\s*(<br>\s*)*<\/p>/g, "")
    .replace(/<p>\s*(?:<br>\s*)+/g, "<p>")
    .trim();
  return { author, html: stripped };
}

for (const s of stories) {
  const id = int(s.pn_sid);
  const meta = articleMeta.get(id)!;
  const mentions = new Set<string>();
  currentMentions = mentions;
  let intro = removeDeadLinks(repairHtml(clean(str(s.pn_hometext))));
  let body = removeDeadLinks(repairHtml(clean(str(s.pn_bodytext))));
  currentMentions = null;
  let { author, html } = extractByline(intro);
  intro = html;
  body = applyCatalog(id, applyAdditions(id, body)); // new entries; discography and bibliographies as cards
  if (!author) {
    const b = extractByline(body);
    if (b.author) [author, body] = [b.author, b.html];
  }
  if (author) {
    author = normaliseName(author);
    author = AUTHOR_ALIASES[author] ?? author;
  }
  const plain = stripTags(intro + "\n" + body);
  const coverMatch = /<img src="([^"]+)" alt="[^"]*" width="(\d+)" height="(\d+)"/.exec(intro + body);
  const cover = coverMatch && Number(coverMatch[2]) >= 140 && Number(coverMatch[3]) >= 100 ? coverMatch : null;
  out.articles.push({
    id, slug: meta.slug, title: meta.title, legacy_title: decodeEntities(str(s.pn_title)),
    theme_id: THEMES[int(s.pn_topic)] ? int(s.pn_topic) : null,
    category: CATEGORY[int(s.pn_catid)] ?? null, series: meta.series, series_part: meta.part,
    author, published_at: sqlToIso(s.pn_time), intro_html: intro, body_html: body,
    excerpt: excerpt(stripTags(intro) || plain, 240),
    cover_url: cover?.[1] ?? null, cover_width: cover ? Number(cover[2]) : null, cover_height: cover ? Number(cover[3]) : null,
    reading_minutes: readingMinutes(plain), legacy_views: int(s.pn_counter), comment_count: commentCount.get(id) ?? 0,
  });
  for (const url of mentions) {
    const tid = textMentions.get(url);
    if (tid) out.mentions.push([tid, id]);
  }
}

for (const c of commentRows) {
  const articleId = int(c.pn_sid);
  if (!articleMeta.has(articleId)) continue;
  const body = removeDeadLinks(repairHtml(redactEmails(clean(str(c.pn_comment).replace(/\n/g, "<br>")))));
  if (!stripTags(body)) continue;
  let subject = collapseWs(repairText(decodeEntities(str(c.pn_subject))));
  if (/^re\s*:/i.test(subject) || !subject) subject = "";
  out.comments.push({
    id: int(c.pn_tid), article_id: articleId, parent_id: int(c.pn_pid) || null,
    author: collapseWs(decodeEntities(str(c.pn_name))) || "Anonyme", posted_at: sqlToIso(c.pn_date),
    subject: subject || null, body_html: body,
  });
}

// --- Timeline ---
log("Parsing the timeline…");
const timeline = parseTimeline(LEGACY, cleanOpts("chansons"));

// --- Forum ---
log("Converting the forum…");
const bbOpts = {
  resolveLink: (h: string) => resolveLink(h),
  resolveImage: (src: string) => {
    if (/^https?:/i.test(src) && !/charles-trenet\./i.test(src)) return null;
    const m = media.resolve(src);
    return m ? { src: m.url, width: m.width, height: m.height } : null;
  },
};
const forumPosts = new Map<number, Row[]>();
for (const p of rows("nuke_XForum_posts")) {
  const list = forumPosts.get(int(p.tid)) ?? [];
  list.push(p);
  forumPosts.set(int(p.tid), list);
}
const forumOut: Record<string, unknown>[] = [];
const threadOut: Record<string, unknown>[] = [];
const postOut: Record<string, unknown>[] = [];
const authorName = (a: string | null | undefined) => collapseWs(decodeEntities(stripSlashes(str(a)))) || "Anonyme";
let postId = 0;
for (const t of threadRows) {
  const tid = int(t.tid);
  // Messages left empty (only a video that has since disappeared) are dropped
  const posts = [
    { author: t.author, dateline: t.dateline, message: t.message, pid: "0" } as Row,
    ...(forumPosts.get(tid) ?? []).sort((a, b) => int(a.dateline) - int(b.dateline) || int(a.pid) - int(b.pid)),
  ]
    .map((p) => ({ author: p.author, dateline: p.dateline, body: removeDeadLinks(repairHtml(decodeSafeEntities(bbcodeToHtml(repairLegacyChars(str(p.message)), bbOpts)))) }))
    .filter((p) => stripTags(p.body).trim() || /<(img|figure)\b/.test(p.body));
  if (!posts.length) continue;
  posts.forEach((p, i) => {
    postOut.push({
      id: ++postId, thread_id: tid, position: i + 1, author: authorName(p.author),
      posted_at: unixToIso(p.dateline), body_html: p.body,
    });
  });
  const url = threadUrl.get(tid)!;
  threadOut.push({
    id: tid, forum_id: int(t.fid), slug: url.split("/").pop()!.replace(/^\d+-/, ""),
    subject: collapseWs(repairText(decodeEntities(stripSlashes(str(t.subject))))) || "Sans titre",
    author: authorName(t.author), created_at: unixToIso(posts[0]!.dateline),
    last_post_at: unixToIso(posts.at(-1)!.dateline), post_count: posts.length, legacy_views: int(t.views),
  });
}
const FORUM_DESCRIPTIONS: Record<string, string> = {
  general: "Débats sur Charles Trenet, l’homme et l’œuvre.",
  "questions-reponses": "Une chanson, un disque, une date ? Les trenetophiles répondent.",
  "charles-au-quebec": "Trenet et le Québec, une longue histoire d’amour.",
  "jeunes-talents": "Coups de cœur pour les jeunes (ou moins jeunes) talents de la scène francophone.",
};
forumRows
  .sort((a, b) => int(a.displayorder) - int(b.displayorder) || int(a.fid) - int(b.fid))
  .forEach((f, i) => {
    const fid = int(f.fid);
    const threads = threadOut.filter((t) => t.forum_id === fid);
    const posts = postOut.filter((p) => threads.some((t) => t.id === p.thread_id));
    const dates = posts.map((p) => String(p.posted_at)).sort();
    const slug = forumSlug.get(fid)!;
    forumOut.push({
      id: fid, slug, name: decodeEntities(str(f.name)),
      description: FORUM_DESCRIPTIONS[slug] ?? collapseWs(stripTags(str(f.description))),
      position: i + 1, thread_count: threads.length, post_count: posts.length,
      first_post_at: dates[0] ?? null, last_post_at: dates.at(-1) ?? null,
    });
  });

// --- Agenda, ephemerides, links ---
const agendaOut = rows("sil_agenda").map((a) => ({
  id: int(a.id),
  // Titles are too short to show damage on their own: use the whole row as evidence.
  title: collapseWs(repairQuestionMarks(decodeEntities(str(a.titre)), vocab, looksAccentDamaged(str(a.titre) + str(a.presentation)))),
  event_date: unixToIso(a.date),
  body_html: removeDeadLinks(repairHtml(redactEmails(clean(str(a.presentation))))),
  url: /^https?:\/\//i.test(str(a.url)) && !isDead(str(a.url).trim()) ? str(a.url).trim() : null,
})).concat(agendaAdditions());
const ephemOut = rows("nuke_ephem")
  .map((e) => ({
    id: int(e.pn_eid), day: int(e.pn_did), month: int(e.pn_mid), year: int(e.pn_yid) || null,
    body_html: repairHtml(clean(str(e.pn_content).replace(/[ \t]{3,}/g, " ").replace(/\r?\n/g, "<br>"))),
  }))
  .filter((e) => e.day && e.month && stripTags(e.body_html));
const linkCats = rows("nuke_links_categories").map((c) => ({
  id: int(c.pn_cat_id), parent_id: int(c.pn_parent_id) || null,
  title: collapseWs(repairText(decodeEntities(str(c.pn_title)))),
  description: collapseWs(repairText(stripTags(str(c.pn_description)))),
}));
const linksOut = rows("nuke_links_links")
  // Only the sites that still answer (see dead-links.ts)
  .filter((l) => /^https?:\/\//i.test(str(l.pn_url).trim()) && !isDead(str(l.pn_url).trim()))
  .map((l) => ({
    id: int(l.pn_lid), category_id: int(l.pn_cat_id),
    title: collapseWs(repairText(decodeEntities(str(l.pn_title)))), url: str(l.pn_url).trim(),
    description: collapseWs(repairText(stripTags(str(l.pn_description)))), added_at: sqlToIso(l.pn_date),
  }));

// --- Editorial pages (reused legacy text) ---
const message = rows("nuke_message").find((m) => int(m.pn_mid) === 5);
const introHtml = clean(str(message?.pn_content).split(/Alors, si votre coeur/i)[0]!)
  .replace(/<p>\s*<img[^>]*>\s*<\/p>/, "")
  .replace(/<img[^>]*>/g, "");
const faq = (id: number) => rows("nuke_faqanswer").find((f) => int(f.pn_id) === id);
const whyHtml = repairHtml(clean(str(faq(1)?.pn_answer).split(/Un petit clic/i)[0]!)).replace(/\s*\(voir menu de gauche\)/, "");
const criticHtml = repairHtml(clean(str(faq(2)?.pn_answer)));
const pagesOut = [
  { slug: "accueil", title: "Le portail des amis de Charles Trenet", body_html: introHtml },
  { slug: "pourquoi", title: "Pourquoi ce portail ?", body_html: whyHtml },
  { slug: "critique", title: "Et si Charles Trenet vous déplaît ?", body_html: criticHtml },
];

// ---------------------------------------------------------------------------
// 5. Write the database
// ---------------------------------------------------------------------------
log("Writing SQLite database…");
const tmp = `${args.out}.tmp`;
mkdirSync(dirname(args.out!), { recursive: true });
rmSync(tmp, { force: true });
const db = new Database(tmp, { create: true });
db.run("PRAGMA journal_mode = OFF");
db.run("PRAGMA synchronous = OFF");
db.exec(readFileSync(join(import.meta.dir, "schema.sql"), "utf8"));

function insert(table: string, items: Record<string, unknown>[]) {
  if (!items.length) return;
  const cols = Object.keys(items[0]!);
  const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`);
  db.transaction(() => {
    for (const it of items)
      stmt.run(...(cols.map((c) => {
        const v = (it[c] ?? null) as string | number | null;
        return c.endsWith("_html") && typeof v === "string" ? finalize(v) : v;
      })));
  })();
}

insert(
  "themes",
  rows("nuke_topics")
    .filter((t) => THEMES[int(t.pn_topicid)])
    .map((t) => {
      const meta = THEMES[int(t.pn_topicid)]!;
      return { id: int(t.pn_topicid), slug: meta.slug, name: decodeEntities(str(t.pn_topictext)), description: meta.description, position: meta.position };
    }),
);
insert("articles", out.articles);
insert("comments", out.comments);
insert("texts", out.texts);
insert("songs", out.songs);
insert("text_mentions", [...new Set(out.mentions.map((m) => m.join(":")))].map((k) => {
  const [text_id, article_id] = k.split(":").map(Number);
  return { text_id, article_id };
}));
insert("timeline", timeline.map((t, i) => ({
  id: i + 1, start_year: t.startYear, end_year: t.endYear, events_html: t.eventsHtml, related_json: JSON.stringify(t.related),
})));
insert("forums", forumOut);
insert("threads", threadOut);
insert("posts", postOut);
insert("agenda", agendaOut);
insert("ephemerides", ephemOut);
insert("link_categories", linkCats);
insert("links", linksOut);
insert("pages", pagesOut);
media.addLocal(CONTENT_MEDIA); // after the old images: their names stay as they were
insert("media", media.all().map((m) => ({ url: m.url, legacy_path: m.legacyPath, width: m.width ?? null, height: m.height ?? null, bytes: m.bytes })));

// Full-text search index
const idx = db.prepare("INSERT INTO search (kind, url, title, body, meta) VALUES (?, ?, ?, ?, ?)");
db.transaction(() => {
  for (const a of out.articles) {
    const meta = articleMeta.get(a.id as number)!;
    // No year next to the articles in the results: they must look current
    idx.run("article", meta.url, String(a.title), stripTags(`${a.intro_html}\n${a.body_html}`), "");
  }
  const songByText = new Map<number, Record<string, unknown>>();
  for (const s of out.songs) if (s.text_id && !songByText.has(s.text_id as number)) songByText.set(s.text_id as number, s);
  for (const t of out.texts) {
    const song = songByText.get(t.id as number);
    const url = song ? `/chansons/${song.slug}` : `/textes/${t.slug}`;
    idx.run(song ? "chanson" : String(t.kind), url, String(t.title), String(t.plain), song?.year ? String(song.year) : "");
  }
  for (const s of out.songs) {
    if (s.text_id) continue;
    idx.run("chanson", `/chansons/${s.slug}`, String(s.title), [s.publisher, s.see_also_title].filter(Boolean).join(" "), s.year ? String(s.year) : "");
  }
  const postsByThread = new Map<number, string[]>();
  for (const p of postOut) {
    const list = postsByThread.get(p.thread_id as number) ?? [];
    list.push(stripTags(String(p.body_html)));
    postsByThread.set(p.thread_id as number, list);
  }
  for (const t of threadOut) {
    idx.run("forum", threadUrl.get(t.id as number)!, String(t.subject), (postsByThread.get(t.id as number) ?? []).join("\n\n"), String(t.created_at).slice(0, 4));
  }
  for (const a of agendaOut) idx.run("agenda", `/agenda#evenement-${a.id}`, a.title, stripTags(a.body_html), a.event_date.slice(0, 4));
  for (const t of timeline) idx.run("chronologie", `/chronologie#annee-${t.startYear}`, String(t.startYear), stripTags(t.eventsHtml), String(t.startYear));
})();
db.run("INSERT INTO search(search) VALUES ('optimize')");

const brand = (path: string) => media.resolve(path);
const hero = brand("dominic/Palais1_1993.jpg");
const poster = brand("dalilol/charlesjohnny1934.jpg");
db.prepare("INSERT OR IGNORE INTO media (url, legacy_path, width, height, bytes) VALUES (?, ?, ?, ?, ?)").run(hero!.url, hero!.legacyPath, hero!.width ?? null, hero!.height ?? null, hero!.bytes);
db.prepare("INSERT OR IGNORE INTO media (url, legacy_path, width, height, bytes) VALUES (?, ?, ?, ?, ?)").run(poster!.url, poster!.legacyPath, poster!.width ?? null, poster!.height ?? null, poster!.bytes);
const metaRows = {
  hero_image: hero!.url,
  poster_image: poster!.url,
  generated_at: new Date().toISOString(),
  source_dump: args.dump!.split("/").pop()!,
  last_article_at: String(out.articles.map((a) => a.published_at).sort().at(-1)),
};
insert("meta", Object.entries(metaRows).map(([key, value]) => ({ key, value })));
db.run("ANALYZE");
db.close();
const vac = new Database(tmp);
vac.run("VACUUM");
vac.close();
rmSync(args.out!, { force: true });
await Bun.write(args.out!, Bun.file(tmp));
rmSync(tmp, { force: true });

const totalBytes = media.all().reduce((a, m) => a + m.bytes, 0);
log(
  `Done: ${out.articles.length} articles, ${out.comments.length} comments, ${out.songs.length} songs, ` +
    `${out.texts.length} texts, ${timeline.length} timeline rows, ${threadOut.length} threads / ${postOut.length} posts, ` +
    `${agendaOut.length} agenda, ${ephemOut.length} ephemerides, ${linksOut.length} links, ` +
    `${media.all().length} images (${(totalBytes / 1e6).toFixed(1)} MB)`,
);
if (media.missing.size) {
  log(`${media.missing.size} images referenced but missing from the legacy files (dropped):`);
  for (const [p, n] of media.missing) console.log(`    ${p} ×${n}`);
}
void escapeHtml;
