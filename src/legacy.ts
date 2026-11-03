/**
 * Mapping of the old PostNuke URLs to the new site.
 *
 * Used twice: by the migration, to rewrite links inside the content, and by
 * the server, to answer old bookmarks / search engine links with a 301.
 */

export interface LegacyLookup {
  article(sid: number): string | null;
  /** A page of the old chansons/ directory, e.g. "aline.html". */
  text(file: string): string | null;
  thread(tid: number): string | null;
  forum(fid: number): string | null;
  topic(topicId: number): string | null;
  /** An image of the old site, path relative to the site root. */
  media(path: string): string | null;
}

const HOSTS = /^(?:https?:)?\/\/(?:www\.)?charles-trenet\.(?:net|org|com|fr)(?::\d+)?/i;

/** Root-level copies of pages that also live in chansons/. */
const ROOT_ALIASES: Record<string, string> = {
  "ligne12.html": "ligne1.html",
};

const MODULE_PAGES: Record<string, string> = {
  topics: "/articles",
  web_links: "/liens",
  faq: "/a-propos",
  sil_agenda: "/agenda",
  agenda: "/agenda",
  sections: "/chronologie",
  search: "/recherche",
  stats: "/a-propos",
  recommend_us: "/",
  top_list: "/articles/populaires",
  members_list: "/forum",
  your_account: "/",
  "ns-polls": "/",
  "ns-user": "/",
  messages: "/",
};

export function isLegacyHost(url: string): boolean {
  return HOSTS.test(url);
}

/**
 * Resolve an old URL (absolute or relative) to a new site path.
 * Returns the URL unchanged for external links, null for internal links
 * that no longer lead anywhere.
 */
export function resolveLegacyUrl(raw: string, lookup: LegacyLookup): string | null {
  let url = raw.trim().replace(/&amp;/g, "&").replace(/\\/g, "");
  if (!url || url === "#") return null;
  if (url.startsWith("#")) return url;
  if (/^mailto:/i.test(url)) return null; // no more contact addresses
  if (/^javascript:/i.test(url)) return null;
  const external = /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//");
  if (external && !HOSTS.test(url)) return /^https?:/i.test(url) ? url : null;
  url = url.replace(HOSTS, "");
  if (!url.startsWith("/")) url = "/" + url;

  const hashAt = url.indexOf("#");
  const hash = hashAt >= 0 ? url.slice(hashAt) : "";
  if (hashAt >= 0) url = url.slice(0, hashAt);
  const qAt = url.indexOf("?");
  const path = decodeSafe(qAt >= 0 ? url.slice(0, qAt) : url).replace(/\/{2,}/g, "/");
  const params = new URLSearchParams(qAt >= 0 ? url.slice(qAt + 1) : "");
  const p = (k: string) => {
    for (const [key, v] of params) if (key.toLowerCase() === k) return v;
    return null;
  };
  const num = (k: string) => {
    const v = Number.parseInt(p(k) ?? "", 10);
    return Number.isFinite(v) ? v : null;
  };
  const lower = path.toLowerCase();

  if (lower === "/" || lower === "/index.php" || lower === "/index.html" || lower === "/index2.php") {
    const name = p("name");
    if (!name) return "/";
  }

  if (lower === "/article.php" || lower === "/print.php") {
    const sid = num("sid");
    return sid ? lookup.article(sid) : "/articles";
  }
  if (lower === "/backend.php" || lower === "/xforumrdf.php") return "/flux.xml";
  if (lower === "/user.php" || lower === "/admin.php" || lower === "/banners.php" || lower === "/referer.php" || lower === "/error.php") return "/";
  if (lower === "/agenda.php") return "/agenda";

  if (lower === "/modules.php" || lower === "/index.php") {
    const name = (p("name") ?? "").toLowerCase();
    const file = (p("file") ?? "index").toLowerCase();
    if (name === "news") {
      const sid = num("sid");
      if (sid) return lookup.article(sid);
      const topic = num("topic");
      if (topic) return lookup.topic(topic) ?? "/articles";
      return "/articles";
    }
    if (name === "xforum" || name === "forum" || name === "pnphpbb2") {
      const tid = num("tid");
      if (tid && (file === "viewthread" || file === "printable" || tid)) return lookup.thread(tid) ?? "/forum";
      const fid = num("fid");
      if (fid) return lookup.forum(fid) ?? "/forum";
      return "/forum";
    }
    if (name === "topics") {
      const topic = num("topic");
      return topic ? lookup.topic(topic) ?? "/articles" : "/articles";
    }
    return MODULE_PAGES[name] ?? null;
  }

  // Song pages and other static HTML pages
  const file = path.split("/").pop() ?? "";
  if (/\.html?$/i.test(file)) {
    const dir = lower.slice(0, lower.length - file.length);
    const name = file.toLowerCase();
    if (/^index[1-5]\.html$/.test(name) && (dir === "/chansons/" || dir === "/gps/" || dir === "/dominic/" || dir === "/")) {
      const letter = /^#([a-z])$/i.exec(hash)?.[1];
      return letter ? `/chansons#lettre-${letter.toUpperCase()}` : "/chansons";
    }
    if (name === "ligne1.html" || name === "ligne12.html") return "/chronologie";
    if (dir === "/chansons/" && name === "index.html") return "/chansons";
    const target = lookup.text(ROOT_ALIASES[name] ?? file) ?? lookup.text(name);
    if (target) return target;
    return null;
  }

  if (/\.(jpe?g|gif|png|bmp)$/i.test(path)) {
    return lookup.media(path.replace(/^\/+/, ""));
  }
  if (lower === "/chansons" || lower === "/chansons/") return "/chansons";
  return null;
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
