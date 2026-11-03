/**
 * Request handling. Kept separate from server.ts so tests can call handle()
 * directly without opening a port.
 */
import { brotliCompressSync, constants as zlib } from "node:zlib";
import { join, normalize } from "node:path";
import { BUILD_ID, PUBLIC_DIR } from "./assets.ts";
import { articleUrl, canonicalTextUrl, ftsQuery, pagedUrl, queries, songUrl, threadUrl, type SearchHit } from "./db.ts";
import { resolveLegacyUrl, type LegacyLookup } from "./legacy.ts";
import { renderArticle, renderArticleIndex, renderAuthor, renderSeries, renderTheme } from "./views/articles.ts";
import { renderHome } from "./views/home.ts";
import {
  renderAbout, renderAgenda, renderForum, renderForumIndex, renderLinks, renderNotFound, renderRandom, renderSearch,
  renderThread, renderTimeline,
} from "./views/pages.ts";
import { renderCatalogue, renderSong, renderText, renderTextIndex } from "./views/songs.ts";
import { rss, sitemap, opensearch, robots } from "./feeds.ts";
import { CSP, STATIC } from "./mode.ts";

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
};

// --- Response helpers ---------------------------------------------------------------

interface Rendered {
  body: string;
  type: string;
  status: number;
  etag: string;
  gzip?: Uint8Array<ArrayBuffer>;
  br?: Uint8Array<ArrayBuffer>;
}

/** Rendered-page cache. The database is read-only, so pages never go stale. */
const cache = new Map<string, Rendered>();
const CACHE_MAX = 2000;

function remember(key: string, r: Rendered): Rendered {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, r);
  return r;
}

function make(body: string, type = "text/html; charset=utf-8", status = 200): Rendered {
  return { body, type, status, etag: `W/"${BUILD_ID}-${Bun.hash(body).toString(36)}"` };
}

function send(req: Request, r: Rendered, cacheControl = "public, max-age=300, stale-while-revalidate=86400"): Response {
  const headers: Record<string, string> = {
    "Content-Type": r.type,
    "Cache-Control": r.status === 200 ? cacheControl : "no-store",
    ETag: r.etag,
    Vary: "Accept-Encoding",
    ...SECURITY_HEADERS,
  };
  if (r.status === 200 && req.headers.get("if-none-match") === r.etag) return new Response(null, { status: 304, headers });
  const accept = req.headers.get("accept-encoding") ?? "";
  if (r.body.length > 1024) {
    if (/\bbr\b/.test(accept)) {
      r.br ??= new Uint8Array(brotliCompressSync(r.body, { params: { [zlib.BROTLI_PARAM_QUALITY]: 9 } }));
      return new Response(req.method === "HEAD" ? null : r.br, { status: r.status, headers: { ...headers, "Content-Encoding": "br" } });
    }
    if (/\bgzip\b/.test(accept)) {
      r.gzip ??= new Uint8Array(Bun.gzipSync(r.body, { level: 9 }));
      return new Response(req.method === "HEAD" ? null : r.gzip, { status: r.status, headers: { ...headers, "Content-Encoding": "gzip" } });
    }
  }
  return new Response(req.method === "HEAD" ? null : r.body, { status: r.status, headers });
}

const redirect = (to: string, status = 301) => new Response(null, { status, headers: { Location: to, "Cache-Control": status === 301 ? "public, max-age=86400" : "no-store" } });

function notFound(req: Request, path: string): Response {
  return send(req, make(renderNotFound(path), "text/html; charset=utf-8", 404));
}

// --- Legacy URLs ----------------------------------------------------------------------

const legacyLookup: LegacyLookup = {
  article: (sid) => {
    const a = queries.articleById.get(sid);
    return a ? articleUrl(a) : null;
  },
  text: (file) => {
    const t = queries.textByLegacyFile.get(file);
    return t ? canonicalTextUrl(t) : null;
  },
  thread: (tid) => {
    const t = queries.threadById.get(tid);
    return t ? threadUrl(t) : null;
  },
  forum: (fid) => {
    const f = queries.forumById.get(fid);
    return f ? `/forum/${f.slug}` : null;
  },
  topic: (id) => {
    const t = queries.themes.all().find((x) => x.id === id);
    return t ? `/themes/${t.slug}` : null;
  },
  media: (path) => queries.mediaByLegacy.get(path)?.url ?? null,
};

const LEGACY_PATH = /\.(php|html?)$|^\/(chansons|dominic|bases|images|themes|modules|gps|dalilol)\//i;

// --- Static files -----------------------------------------------------------------------

const STATIC_TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", svg: "image/svg+xml",
  woff2: "font/woff2", png: "image/png", jpg: "image/jpeg", gif: "image/gif", ico: "image/x-icon",
  txt: "text/plain; charset=utf-8", webp: "image/webp",
};

async function serveStatic(req: Request, path: string): Promise<Response | null> {
  const rel = normalize(decodeURIComponent(path)).replace(/^(\.\.(\/|$))+/, "");
  if (rel.includes("..")) return null;
  const file = Bun.file(join(PUBLIC_DIR, rel));
  if (!(await file.exists())) return null;
  const ext = rel.split(".").pop()!.toLowerCase();
  const versioned = new URL(req.url).searchParams.has("v") || rel.startsWith("/media/");
  const headers: Record<string, string> = {
    "Content-Type": STATIC_TYPES[ext] ?? "application/octet-stream",
    "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  };
  if (ext === "css" || ext === "js" || ext === "svg") {
    const key = `static:${rel}`;
    const r = cache.get(key) ?? remember(key, make(await file.text(), headers["Content-Type"]));
    return send(req, r, headers["Cache-Control"]);
  }
  return new Response(req.method === "HEAD" ? null : file, { headers });
}

// --- Routing ---------------------------------------------------------------------------

function page(req: Request, key: string, render: () => string | null): Response {
  const hit = cache.get(key);
  if (hit) return send(req, hit);
  const body = render();
  if (body === null) return notFound(req, new URL(req.url).pathname);
  return send(req, remember(key, make(body)));
}

/**
 * Page number of a paginated listing: /page/N in the path, or the older
 * ?page=N (redirected by the caller). null for /page/1 or /page/0, which are
 * not canonical.
 */
function pathPage(segment: string | undefined, url: URL): number | null {
  if (segment !== undefined) {
    const n = Number(segment);
    return n >= 2 && String(n) === segment ? n : null;
  }
  const q = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  return Number.isFinite(q) && q >= 1 ? q : 1;
}

function search(q: string, kind: string): { hits: SearchHit[]; counts: Map<string, number> } {
  const fts = ftsQuery(q);
  if (!fts) return { hits: [], counts: new Map() };
  try {
    const counts = new Map(queries.searchCounts.all(fts).sort((a, b) => b.n - a.n).map((r) => [r.kind, r.n]));
    const hits = queries.search.all(fts, counts.has(kind) ? kind : "", 60);
    return { hits, counts };
  } catch {
    return { hits: [], counts: new Map() };
  }
}

export async function handle(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Lecture seule.", { status: 405, headers: { Allow: "GET, HEAD" } });
  const url = new URL(req.url);
  let path = url.pathname;

  // Trailing slashes
  if (path.length > 1 && path.endsWith("/")) return redirect(path.replace(/\/+$/, "") + url.search);

  if (path.startsWith("/assets/") || path.startsWith("/media/")) {
    return (await serveStatic(req, path)) ?? notFound(req, path);
  }
  if (path === "/favicon.ico") return redirect("/assets/favicon.png");

  if (path === "/") {
    // Home changes daily (song and "ce jour-là"): cache per day.
    return page(req, `home:${new Date().toISOString().slice(0, 10)}`, () => renderHome());
  }

  // Articles
  if (path === "/articles") {
    // Older form of the sort links
    const sort = url.searchParams.get("tri");
    if (sort === "anciens" || sort === "populaires") return redirect(`/articles/${sort}`);
    return page(req, "articles:recents", () => renderArticleIndex("recents"));
  }
  if (path === "/articles/anciens" || path === "/articles/populaires") {
    const s = path === "/articles/anciens" ? "anciens" : "populaires";
    return page(req, `articles:${s}`, () => renderArticleIndex(s));
  }
  let m = /^\/articles\/(\d+)(?:-([\w-]*))?$/.exec(path);
  if (m) {
    const a = queries.articleById.get(Number(m[1]));
    if (!a) return notFound(req, path);
    if (m[2] !== a.slug) return redirect(articleUrl(a));
    return page(req, `article:${a.id}`, () => renderArticle(a));
  }
  if ((m = /^\/themes\/([\w-]+)$/.exec(path))) return page(req, `theme:${m[1]}`, () => renderTheme(m![1]!));
  if (path === "/themes") return redirect("/articles");
  if ((m = /^\/series\/([\w-]+)$/.exec(path))) return page(req, `series:${m[1]}`, () => renderSeries(m![1]!));
  if ((m = /^\/auteurs\/([\w-]+)$/.exec(path))) return page(req, `author:${m[1]}`, () => renderAuthor(m![1]!));

  // Songs & texts
  if (path === "/chansons") {
    const q = (url.searchParams.get("q") ?? "").slice(0, 80);
    const lyrics = url.searchParams.get("paroles") === "1";
    const y = Number.parseInt(url.searchParams.get("annee") ?? "", 10);
    const year = y >= 1900 && y <= 2001 ? y : null;
    return page(req, `chansons:${q}|${lyrics}|${year}`, () => renderCatalogue({ q, lyrics, year }));
  }
  if ((m = /^\/chansons\/([\w-]+)$/.exec(path))) {
    const s = queries.songBySlug.get(m[1]!);
    if (!s) return notFound(req, path);
    if (s.see_also_id) {
      const target = queries.songById.get(s.see_also_id);
      if (target) return redirect(songUrl(target));
    }
    return page(req, `song:${s.id}`, () => renderSong(s));
  }
  if (path === "/hasard") {
    if (STATIC) return page(req, "hasard", renderRandom);
    const pool = queries.songsWithText.all();
    const s = pool[Math.floor(Math.random() * pool.length)]!;
    return redirect(songUrl(s), 302);
  }
  if (path === "/textes") return page(req, "textes", renderTextIndex);
  if ((m = /^\/textes\/([\w-]+)$/.exec(path))) {
    const t = queries.textBySlug.get(m[1]!);
    if (!t) return notFound(req, path);
    const canonical = canonicalTextUrl(t);
    if (canonical !== path) return redirect(canonical);
    return page(req, `text:${t.id}`, () => renderText(t));
  }

  if (path === "/chronologie") return page(req, "chronologie", renderTimeline);

  // Forum
  if (path === "/forum") return page(req, "forum", renderForumIndex);
  if ((m = /^\/forum\/sujet\/(\d+)(?:-([\w-]*))?(?:\/page\/(\d+))?$/.exec(path))) {
    const t = queries.threadById.get(Number(m[1]));
    if (!t) return notFound(req, path);
    const p = pathPage(m[3], url);
    if (p === null) return notFound(req, path);
    const canonical = pagedUrl(threadUrl(t), p);
    if (canonical !== path) return redirect(canonical);
    return page(req, `thread:${t.id}:${p}`, () => renderThread(t, p));
  }
  if ((m = /^\/forum\/([\w-]+)(?:\/page\/(\d+))?$/.exec(path))) {
    const f = queries.forumBySlug.get(m[1]!);
    if (!f) return notFound(req, path);
    const p = pathPage(m[2], url);
    if (p === null) return notFound(req, path);
    const canonical = pagedUrl(`/forum/${f.slug}`, p);
    if (canonical !== path) return redirect(canonical);
    return page(req, `forum:${f.id}:${p}`, () => renderForum(f, p));
  }

  if (path === "/agenda") return page(req, "agenda", renderAgenda);
  if (path === "/liens") return page(req, "liens", renderLinks);
  if (path === "/a-propos") return page(req, "a-propos", renderAbout);

  if (path === "/recherche") {
    if (STATIC) return page(req, "recherche", () => renderSearch("", "", [], new Map()));
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
    const kind = url.searchParams.get("type") ?? "";
    const { hits, counts } = search(q, kind);
    // Search pages are not cached server-side (unbounded key space), only rendered.
    return send(req, make(renderSearch(q, counts.has(kind) ? kind : "", hits, counts)), "public, max-age=300");
  }
  if (path === "/api/recherche") {
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
    const { hits } = search(q, "");
    return Response.json(
      hits.slice(0, 8).map((h) => ({ kind: h.kind, url: h.url, title: h.title.replace(/<\/?mark>/g, "") })),
      { headers: { "Cache-Control": "public, max-age=300", ...SECURITY_HEADERS } },
    );
  }

  // Feeds & robots
  if (path === "/flux.xml") return send(req, cache.get("rss") ?? remember("rss", make(rss(), "application/rss+xml; charset=utf-8")));
  if (path === "/sitemap.xml") return send(req, cache.get("sitemap") ?? remember("sitemap", make(sitemap(), "application/xml; charset=utf-8")));
  if (path === "/robots.txt") return send(req, make(robots(), "text/plain; charset=utf-8"));
  if (path === "/opensearch.xml") return send(req, make(opensearch(), "application/opensearchdescription+xml; charset=utf-8"));
  if (path === "/sante") return new Response("ok", { headers: { "Cache-Control": "no-store" } });

  // Old PostNuke / static URLs → 301
  if (LEGACY_PATH.test(path) || path === "/index.php") {
    const target = resolveLegacyUrl(path + url.search + url.hash, legacyLookup);
    if (target && target !== path) return redirect(target);
  }
  return notFound(req, path);
}
