/**
 * Read-only access to the content database. Every query the site needs lives
 * here, as prepared statements.
 */
import { Database } from "bun:sqlite";
import { join } from "node:path";

export const DB_PATH = process.env.DB_PATH ?? join(import.meta.dir, "../db/charles-trenet.sqlite");

export const db = new Database(DB_PATH, { readonly: true, strict: true });
db.run("PRAGMA query_only = ON");
db.run("PRAGMA mmap_size = 268435456");

// --- Types -----------------------------------------------------------------

export interface Theme { id: number; slug: string; name: string; description: string; position: number; count: number }
export interface ArticleSummary {
  id: number; slug: string; title: string; theme_id: number | null; category: string | null;
  series: string | null; series_part: number | null; author: string | null; published_at: string;
  excerpt: string; cover_url: string | null; cover_width: number | null; cover_height: number | null;
  reading_minutes: number; legacy_views: number; comment_count: number;
}
export interface Article extends ArticleSummary { intro_html: string; body_html: string; legacy_title: string }
export interface Comment { id: number; parent_id: number | null; author: string; posted_at: string; subject: string | null; body_html: string }
export interface Song {
  id: number; slug: string; title: string; sort_title: string; letter: string; year: number | null;
  publisher: string | null; unpublished: number; performed_only: number; text_id: number | null;
  see_also_id: number | null; see_also_title: string | null; position: number;
}
export interface Text {
  id: number; slug: string; legacy_file: string; kind: string; title: string; author: string;
  credits: string | null; copyright: string | null; body_html: string; plain: string;
}
export interface TimelineRow { id: number; start_year: number; end_year: number | null; events_html: string; related_json: string }
export interface Forum { id: number; slug: string; name: string; description: string; thread_count: number; post_count: number; first_post_at: string | null; last_post_at: string | null }
export interface Thread { id: number; forum_id: number; slug: string; subject: string; author: string; created_at: string; last_post_at: string; post_count: number; legacy_views: number }
export interface Post { id: number; position: number; author: string; posted_at: string; body_html: string }
export interface AgendaItem { id: number; title: string; event_date: string; body_html: string; url: string | null }
export interface Ephemeris { id: number; day: number; month: number; year: number | null; body_html: string }
export interface Link { id: number; category_id: number; title: string; url: string; description: string; added_at: string }
export interface LinkCategory { id: number; parent_id: number | null; title: string; description: string }
export interface SearchHit { kind: string; url: string; title: string; snippet: string; meta: string; rank: number }

const SUMMARY = `id, slug, title, theme_id, category, series, series_part, author, published_at, excerpt,
  cover_url, cover_width, cover_height, reading_minutes, legacy_views, comment_count`;

// --- Queries -----------------------------------------------------------------

const q = {
  meta: db.query<{ key: string; value: string }, []>("SELECT key, value FROM meta"),
  themes: db.query<Theme, []>(`SELECT t.*, (SELECT count(*) FROM articles a WHERE a.theme_id = t.id) AS count FROM themes t ORDER BY position`),
  articleById: db.query<Article, [number]>("SELECT * FROM articles WHERE id = ?"),
  articles: db.query<ArticleSummary, [number, number]>(`SELECT ${SUMMARY} FROM articles ORDER BY published_at DESC LIMIT ? OFFSET ?`),
  articlesPopular: db.query<ArticleSummary, [number, number]>(`SELECT ${SUMMARY} FROM articles ORDER BY legacy_views DESC LIMIT ? OFFSET ?`),
  articlesOldest: db.query<ArticleSummary, [number, number]>(`SELECT ${SUMMARY} FROM articles ORDER BY published_at ASC LIMIT ? OFFSET ?`),
  articlesByTheme: db.query<ArticleSummary, [number]>(`SELECT ${SUMMARY} FROM articles WHERE theme_id = ? ORDER BY published_at DESC`),
  articlesBySeries: db.query<ArticleSummary, [string]>(`SELECT ${SUMMARY} FROM articles WHERE series = ? ORDER BY coalesce(series_part, 0), published_at`),
  articlesByAuthor: db.query<ArticleSummary, [string]>(`SELECT ${SUMMARY} FROM articles WHERE author = ? ORDER BY published_at DESC`),
  articleCount: db.query<{ n: number }, []>("SELECT count(*) AS n FROM articles"),
  authors: db.query<{ author: string; n: number }, []>("SELECT author, count(*) AS n FROM articles WHERE author IS NOT NULL GROUP BY author ORDER BY n DESC, author"),
  allArticleSummaries: db.query<ArticleSummary, []>(`SELECT ${SUMMARY} FROM articles ORDER BY published_at DESC`),
  articleNeighbours: db.query<ArticleSummary, [string, string]>(
    `SELECT * FROM (SELECT ${SUMMARY} FROM articles WHERE published_at < ? ORDER BY published_at DESC LIMIT 1)
     UNION ALL SELECT * FROM (SELECT ${SUMMARY} FROM articles WHERE published_at > ? ORDER BY published_at ASC LIMIT 1)`,
  ),
  comments: db.query<Comment, [number]>("SELECT id, parent_id, author, posted_at, subject, body_html FROM comments WHERE article_id = ? ORDER BY posted_at"),
  mentionedTexts: db.query<{ title: string; url: string; kind: string }, [number]>(
    `SELECT t.title, t.kind, coalesce('/chansons/' || (SELECT s.slug FROM songs s WHERE s.text_id = t.id ORDER BY s.position LIMIT 1), '/textes/' || t.slug) AS url
     FROM text_mentions m JOIN texts t ON t.id = m.text_id WHERE m.article_id = ? ORDER BY t.title`,
  ),
  articlesMentioning: db.query<ArticleSummary, [number]>(
    `SELECT ${SUMMARY.split(",").map((c) => "a." + c.trim()).join(", ")} FROM text_mentions m JOIN articles a ON a.id = m.article_id WHERE m.text_id = ? ORDER BY a.published_at`,
  ),

  songs: db.query<Song & { has_text: number }, []>("SELECT *, text_id IS NOT NULL AS has_text FROM songs ORDER BY position"),
  songBySlug: db.query<Song, [string]>("SELECT * FROM songs WHERE slug = ?"),
  songById: db.query<Song, [number]>("SELECT * FROM songs WHERE id = ?"),
  songsByText: db.query<Song, [number]>("SELECT * FROM songs WHERE text_id = ? ORDER BY position"),
  songsWithText: db.query<Song, []>("SELECT * FROM songs WHERE text_id IS NOT NULL ORDER BY position"),
  songNeighbours: db.query<Song, [number, number]>(
    `SELECT * FROM (SELECT * FROM songs WHERE position < ? AND see_also_id IS NULL ORDER BY position DESC LIMIT 1)
     UNION ALL SELECT * FROM (SELECT * FROM songs WHERE position > ? AND see_also_id IS NULL ORDER BY position ASC LIMIT 1)`,
  ),
  songsSameYear: db.query<Song, [number, number]>("SELECT * FROM songs WHERE year = ? AND id != ? ORDER BY position"),
  textById: db.query<Text, [number]>("SELECT * FROM texts WHERE id = ?"),
  textBySlug: db.query<Text, [string]>("SELECT * FROM texts WHERE slug = ?"),
  textsByKind: db.query<Text, [string]>("SELECT * FROM texts WHERE kind = ? ORDER BY title"),
  textsNotInCatalogue: db.query<Text, []>("SELECT * FROM texts WHERE id NOT IN (SELECT text_id FROM songs WHERE text_id IS NOT NULL) ORDER BY kind, title"),
  textCount: db.query<{ n: number }, []>("SELECT count(*) AS n FROM texts"),

  timeline: db.query<TimelineRow, []>("SELECT * FROM timeline ORDER BY start_year, id"),

  forums: db.query<Forum, []>("SELECT * FROM forums ORDER BY position"),
  forumBySlug: db.query<Forum, [string]>("SELECT * FROM forums WHERE slug = ?"),
  forumById: db.query<Forum, [number]>("SELECT * FROM forums WHERE id = ?"),
  threads: db.query<Thread, [number, number, number]>("SELECT * FROM threads WHERE forum_id = ? ORDER BY last_post_at DESC LIMIT ? OFFSET ?"),
  threadById: db.query<Thread, [number]>("SELECT * FROM threads WHERE id = ?"),
  posts: db.query<Post, [number, number, number]>("SELECT id, position, author, posted_at, body_html FROM posts WHERE thread_id = ? ORDER BY position LIMIT ? OFFSET ?"),
  postCount: db.query<{ n: number }, []>("SELECT count(*) AS n FROM posts"),
  threadCount: db.query<{ n: number }, []>("SELECT count(*) AS n FROM threads"),
  recentThreads: db.query<Thread, [number]>("SELECT * FROM threads ORDER BY last_post_at DESC LIMIT ?"),
  allThreads: db.query<Thread, []>("SELECT * FROM threads"),

  agenda: db.query<AgendaItem, []>("SELECT * FROM agenda ORDER BY event_date DESC"),
  ephemerides: db.query<Ephemeris, []>("SELECT * FROM ephemerides ORDER BY month, day"),
  linkCategories: db.query<LinkCategory, []>("SELECT * FROM link_categories ORDER BY coalesce(parent_id, id), parent_id IS NOT NULL, id"),
  links: db.query<Link, []>("SELECT * FROM links ORDER BY category_id, title"),
  page: db.query<{ slug: string; title: string; body_html: string }, [string]>("SELECT * FROM pages WHERE slug = ?"),
  mediaByLegacy: db.query<{ url: string }, [string]>("SELECT url FROM media WHERE legacy_path = ? COLLATE NOCASE"),
  textByLegacyFile: db.query<Text, [string]>("SELECT * FROM texts WHERE legacy_file = ? COLLATE NOCASE"),
  search: db.query<SearchHit, [string, string, number]>(
    `SELECT kind, url, highlight(search, 2, '<mark>', '</mark>') AS title,
            snippet(search, 3, '<mark>', '</mark>', '…', 28) AS snippet, meta, bm25(search, 0, 0, 8.0, 1.0) AS rank
     FROM search WHERE search MATCH ? AND (? = '' OR kind = ?2) ORDER BY rank LIMIT ?`,
  ),
  searchCounts: db.query<{ kind: string; n: number }, [string]>("SELECT kind, count(*) AS n FROM search WHERE search MATCH ? GROUP BY kind"),
};
export const queries = q;

export const meta: Record<string, string> = Object.fromEntries(q.meta.all().map((r) => [r.key, r.value]));

/** Things computed once at start-up (the database never changes at runtime). */
export const stats = {
  articles: q.articleCount.get()!.n,
  songs: q.songs.all().filter((s) => !s.see_also_id).length,
  lyrics: q.songsWithText.all().length,
  texts: q.textCount.get()!.n,
  threads: q.threadCount.get()!.n,
  posts: q.postCount.get()!.n,
};

export function articleUrl(a: { id: number; slug: string }) {
  return `/articles/${a.id}-${a.slug}`;
}
export function songUrl(s: { slug: string }) {
  return `/chansons/${s.slug}`;
}
export function textUrl(t: { slug: string }) {
  return `/textes/${t.slug}`;
}
export function threadUrl(t: { id: number; slug: string }) {
  return `/forum/sujet/${t.id}-${t.slug}`;
}
/** Page N of a paginated listing: /forum/x, /forum/x/page/2… */
export function pagedUrl(base: string, page: number) {
  return page > 1 ? `${base}/page/${page}` : base;
}

/** Canonical URL of a text: its catalogue song page if any, else /textes/. */
export function canonicalTextUrl(t: Text): string {
  const song = q.songsByText.all(t.id)[0];
  return song ? songUrl(song) : textUrl(t);
}

/** Turn free text into a safe FTS5 query: every word is a prefix term. */
export function ftsQuery(input: string): string | null {
  const words = input
    .normalize("NFC")
    .replace(/[’']/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0)
    .slice(0, 12);
  if (!words.length) return null;
  return words.map((w) => `"${w.replace(/"/g, "")}"*`).join(" ");
}
