#!/usr/bin/env bun
/**
 * Static export of the whole site, for a static host (GitHub Pages).
 *
 *   bun run export [--site-url https://goaman.github.io/charles-trenet] [--out dist]
 *
 * Pages are rendered by the same router as the server (src/app.ts, in static
 * mode), found by crawling: start from the sitemap, follow every internal
 * link. Any internal link leading to a 404 fails the export.
 *
 * Output layout: /a/b → a/b.html (GitHub Pages serves it without the
 * extension), plus a/b/index.html when a/b is also a directory. When the site
 * lives under a sub-path (https://user.github.io/repo), every root-relative URL
 * is prefixed with it.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    out: { type: "string", default: "dist" },
    "site-url": { type: "string" },
  },
});
const SITE_URL = (args["site-url"] ?? process.env.SITE_URL ?? "https://goaman.github.io/charles-trenet").replace(/\/+$/, "");
const BASE = new URL(SITE_URL).pathname.replace(/\/+$/, "");
const OUT = args.out!;

// Must be set before the app modules are loaded.
process.env.SITE_URL = SITE_URL;
process.env.STATIC_EXPORT = "1";
const { handle } = await import("../src/app.ts");
const { canonicalTextUrl, db, queries, songUrl, textUrl, threadUrl, articleUrl } = await import("../src/db.ts");
const { PUBLIC_DIR } = await import("../src/assets.ts");

const started = performance.now();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// --- Static files and data for static.js ---------------------------------------

cpSync(PUBLIC_DIR, OUT, { recursive: true });
writeFileSync(join(OUT, ".nojekyll"), ""); // serve files as they are

const dataDir = join(OUT, "assets/data");
mkdirSync(dataDir, { recursive: true });
/** Write a content-hashed file under /assets/data, return its public URL. */
function writeData(name: string, ext: string, content: string): string {
  const file = `${name}.${Bun.hash(content).toString(36).slice(0, 10)}.${ext}`;
  writeFileSync(join(dataDir, file), content);
  return `${BASE}/assets/data/${file}`;
}

const searchRows = db.query<{ kind: string; url: string; title: string; body: string; meta: string | null }, []>(
  "SELECT kind, url, title, body, meta FROM search",
).all();
const searchIndex = writeData("recherche", "json", JSON.stringify(searchRows.map((r) => [r.kind, r.url, r.title, r.body.replace(/[ \t]+/g, " "), r.meta ?? ""])));
const searchTitles = writeData("titres", "json", JSON.stringify(searchRows.map((r) => [r.kind, r.url, r.title])));

const legacy = {
  articles: Object.fromEntries(queries.allArticleSummaries.all().map((a) => [a.id, articleUrl(a)])),
  texts: Object.fromEntries(db.query<{ id: number }, []>("SELECT id FROM texts WHERE legacy_file IS NOT NULL").all().map(({ id }) => {
    const t = db.query<Parameters<typeof canonicalTextUrl>[0] & { legacy_file: string }, [number]>("SELECT * FROM texts WHERE id = ?").get(id)!;
    return [t.legacy_file.toLowerCase(), canonicalTextUrl(t)];
  })),
  threads: Object.fromEntries(queries.allThreads.all().map((t) => [t.id, threadUrl(t)])),
  forums: Object.fromEntries(queries.forums.all().map((f) => [f.id, f.slug])),
  topics: Object.fromEntries(queries.themes.all().map((t) => [t.id, t.slug])),
  media: Object.fromEntries(db.query<{ legacy_path: string; url: string }, []>("SELECT legacy_path, url FROM media").all().map((m) => [m.legacy_path.toLowerCase(), m.url])),
};
const legacyData = writeData("legacy", "json", JSON.stringify(legacy));
const built = await Bun.build({ entrypoints: [join(import.meta.dir, "../src/legacy.ts")], format: "esm", target: "browser", minify: true });
if (!built.success) throw new AggregateError(built.logs, "legacy.ts bundle failed");
const legacyJs = writeData("legacy", "js", await built.outputs[0]!.text());

// --- Rewriting of every HTML page ------------------------------------------------------

const withBase = (u: string) => (BASE && u.startsWith("/") && !u.startsWith("//") ? BASE + u : u);
const URL_ATTRS = ["href", "src", "action", "poster"];

async function finish(body: string): Promise<string> {
  let rw = new HTMLRewriter().on("html", {
    element(el) {
      el.setAttribute("data-base", BASE);
      el.setAttribute("data-search-index", searchIndex);
      el.setAttribute("data-search-titles", searchTitles);
      el.setAttribute("data-legacy", legacyData);
      el.setAttribute("data-legacy-js", legacyJs);
    },
  });
  if (BASE) {
    for (const attr of URL_ATTRS) {
      rw = rw.on(`[${attr}]`, {
        element(el) {
          el.setAttribute(attr, withBase(el.getAttribute(attr)!));
        },
      });
    }
    rw = rw.on("[srcset]", {
      element(el) {
        el.setAttribute("srcset", el.getAttribute("srcset")!.split(",").map((s) => withBase(s.trim())).join(", "));
      },
    });
  }
  return rw.transform(body);
}

// --- Crawl -----------------------------------------------------------------------------

const seeds = new Set<string>(["/", "/recherche", "/hasard", "/themes", "/articles/anciens", "/articles/populaires"]);
const sitemapXml = await (await handle(new Request("http://localhost/sitemap.xml"))).text();
for (const m of sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)) seeds.add(m[1]!.replace(SITE_URL, "") || "/");
// Old and alternative addresses that the server redirects: kept as redirect pages
for (const s of queries.songs.all()) if (s.see_also_id) seeds.add(songUrl(s));
for (const t of db.query<{ slug: string }, []>("SELECT slug FROM texts").all()) seeds.add(textUrl(t));

const queue = [...seeds];
const seen = new Set(queue);
const referrers = new Map<string, Set<string>>();
const pages = new Map<string, string>(); // path → HTML
const redirects = new Map<string, string>(); // path → target
const broken = new Map<string, Set<string>>(); // path → pages linking to it
const missingFiles = new Map<string, Set<string>>();

function follow(from: string, raw: string) {
  if (!raw.startsWith("/") || raw.startsWith("//")) return;
  const path = raw.replace(/[?#].*$/, "") || "/";
  if (path.startsWith("/assets/") || path.startsWith("/media/")) {
    if (!existsSync(join(PUBLIC_DIR, decodeURIComponent(path)))) (missingFiles.get(path) ?? missingFiles.set(path, new Set()).get(path)!).add(from);
    return;
  }
  (referrers.get(path) ?? referrers.set(path, new Set()).get(path)!).add(from);
  if (!seen.has(path)) {
    seen.add(path);
    queue.push(path);
  }
}

const FILES: Record<string, string> = { "/flux.xml": "flux.xml", "/sitemap.xml": "sitemap.xml", "/robots.txt": "robots.txt", "/opensearch.xml": "opensearch.xml" };

while (queue.length) {
  const path = queue.shift()!;
  const res = await handle(new Request(`http://localhost${path}`));
  if (res.status === 301 || res.status === 302) {
    const to = res.headers.get("location")!;
    redirects.set(path, to);
    follow(path, to);
    continue;
  }
  if (res.status !== 200) {
    broken.set(path, referrers.get(path) ?? new Set(["(seed)"]));
    continue;
  }
  const body = await res.text();
  if (FILES[path]) {
    writeFileSync(join(OUT, FILES[path]), body);
    continue;
  }
  if (!res.headers.get("content-type")?.startsWith("text/html")) throw new Error(`Unexpected ${res.headers.get("content-type")} for ${path}`);
  pages.set(path, body);
  const links: string[] = [];
  const collect = new HTMLRewriter();
  for (const attr of URL_ATTRS) collect.on(`[${attr}]`, { element: (el) => void links.push(el.getAttribute(attr)!) });
  collect.transform(body);
  for (const l of links) follow(path, l);
}
for (const f of Object.keys(FILES)) if (!existsSync(join(OUT, FILES[f]!))) {
  writeFileSync(join(OUT, FILES[f]!), await (await handle(new Request(`http://localhost${f}`))).text());
}

// --- Write -----------------------------------------------------------------------------

const all = [...pages.keys(), ...redirects.keys()];
const isDir = new Set<string>();
for (const p of all) for (let i = p.indexOf("/", 1); i > 0; i = p.indexOf("/", i + 1)) isDir.add(p.slice(0, i));

function targets(path: string): string[] {
  if (path === "/") return ["index.html"];
  const files = [`${path.slice(1)}.html`];
  if (isDir.has(path)) files.push(`${path.slice(1)}/index.html`);
  return files;
}
function write(path: string, html: string) {
  for (const f of targets(path)) {
    const file = join(OUT, f);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html);
  }
}

for (const [path, body] of pages) write(path, await finish(body));
const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
for (const [path, to] of redirects) {
  if (pages.has(path)) continue;
  const href = escapeAttr(withBase(to));
  write(path, `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Redirection</title><meta name="robots" content="noindex"><link rel="canonical" href="${escapeAttr(SITE_URL + to)}"><meta http-equiv="refresh" content="0; url=${href}"><p>Cette page a déménagé : <a href="${href}">${escapeAttr(to)}</a></p></html>\n`);
}
const notFound = await handle(new Request("http://localhost/introuvable"));
writeFileSync(join(OUT, "404.html"), await finish(await notFound.text()));

// --- Report ----------------------------------------------------------------------------

const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(`${pages.size} pages, ${redirects.size} redirects → ${OUT}/ (base "${BASE || "/"}", ${seconds} s)`);
let failed = false;
for (const [label, map] of [["Broken internal link", broken], ["Missing file", missingFiles]] as const) {
  for (const [path, from] of map) {
    failed = true;
    console.error(`${label}: ${path}  ← ${[...from].slice(0, 3).join(", ")}${from.size > 3 ? ` (+${from.size - 3})` : ""}`);
  }
}
if (failed) process.exit(1);
