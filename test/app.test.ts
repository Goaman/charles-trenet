import { describe, expect, test } from "bun:test";
import { handle } from "../src/app.ts";
import { db } from "../src/db.ts";
import { resolveLegacyUrl, type LegacyLookup } from "../src/legacy.ts";

const get = (path: string, headers: Record<string, string> = {}) => handle(new Request(`http://localhost${path}`, { headers }));

describe("pages", () => {
  const article = db.query<{ id: number; slug: string }, []>("SELECT id, slug FROM articles ORDER BY id LIMIT 1").get()!;
  const song = db.query<{ slug: string }, []>("SELECT slug FROM songs WHERE text_id IS NOT NULL LIMIT 1").get()!;
  const thread = db.query<{ id: number; slug: string }, []>("SELECT id, slug FROM threads ORDER BY post_count DESC LIMIT 1").get()!;
  const pages = [
    "/", "/articles", "/articles/populaires", "/articles/anciens", `/articles/${article.id}-${article.slug}`,
    "/themes/chanson", "/series/les-grands-moments", "/chansons", "/chansons?annee=1938&paroles=1", `/chansons/${song.slug}`,
    "/textes", "/chronologie", "/forum", "/forum/general", `/forum/sujet/${thread.id}-${thread.slug}`, `/forum/sujet/${thread.id}-${thread.slug}/page/2`, "/forum/general/page/2", "/agenda", "/liens",
    "/a-propos", "/recherche?q=theatre", "/recherche", "/flux.xml", "/sitemap.xml", "/robots.txt",
  ];
  for (const p of pages) {
    test(`GET ${p}`, async () => {
      const res = await get(p);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body.length).toBeGreaterThan(100);
      if (res.headers.get("content-type")?.startsWith("text/html")) {
        expect(body).toContain("<main");
        expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
      }
    });
  }
  test("every article renders", async () => {
    for (const a of db.query<{ id: number; slug: string }, []>("SELECT id, slug FROM articles").all()) {
      expect((await get(`/articles/${a.id}-${a.slug}`)).status).toBe(200);
    }
  });
  test("every song renders", async () => {
    for (const s of db.query<{ slug: string }, []>("SELECT slug FROM songs WHERE see_also_id IS NULL").all()) {
      expect((await get(`/chansons/${s.slug}`)).status).toBe(200);
    }
  });
  test("unknown pages are 404", async () => {
    expect((await get("/n-existe-pas")).status).toBe(404);
    expect((await get("/articles/99999-x")).status).toBe(404);
  });
  test("paginated URLs: one canonical form", async () => {
    const base = `/forum/sujet/${thread.id}-${thread.slug}`;
    const cases: [string, number, string?][] = [
      ["/articles?tri=populaires", 301, "/articles/populaires"],
      [`${base}?page=2`, 301, `${base}/page/2`],
      [`/forum/sujet/${thread.id}-mauvais-titre/page/2`, 301, `${base}/page/2`],
      ["/forum/general?page=2", 301, "/forum/general/page/2"],
      ["/forum/general?page=1", 200],
      ["/forum/general/page/1", 404],
      ["/forum/general/page/02", 404],
      ["/forum/general/page/9999", 404],
    ];
    for (const [from, status, to] of cases) {
      const res = await get(from);
      expect([from, res.status]).toEqual([from, status]);
      if (to) expect(res.headers.get("location")).toBe(to);
    }
  });
  test("writes are refused", async () => {
    expect((await handle(new Request("http://localhost/forum", { method: "POST" }))).status).toBe(405);
  });
  test("search escapes FTS syntax", async () => {
    expect((await get('/recherche?q=%22%29%20OR%20*')).status).toBe(200);
    const res = await get("/recherche?q=%3Cscript%3E");
    expect(await res.text()).not.toContain("<script>alert");
  });
  test("ETag and compression", async () => {
    const res = await get("/chronologie", { "accept-encoding": "br, gzip" });
    expect(res.headers.get("content-encoding")).toBe("br");
    const again = await get("/chronologie", { "if-none-match": res.headers.get("etag")! });
    expect(again.status).toBe(304);
  });
});

describe("legacy URLs", () => {
  test.each([
    ["/modules.php?op=modload&name=News&file=article&sid=48&mode=thread&order=0&thold=0", /^\/articles\/48-/],
    ["/article.php?sid=31&mode=nested", /^\/articles\/31-/],
    ["/chansons/mer.html", /^\/chansons\/la-mer$/],
    ["/chansons/index3.html", /^\/chansons$/],
    ["/modules.php?op=modload&name=XForum&file=viewthread&tid=3", /^\/forum\/sujet\/3-/],
    ["/modules.php?op=modload&name=News&file=index&catid=&topic=30", /^\/themes\/peinture$/],
    ["/chansons/ligne1.html", /^\/chronologie$/],
    ["/dominic/vian.gif", /^\/media\/vian\.gif$/],
    ["/backend.php", /^\/flux\.xml$/],
  ])("%s", async (from, to) => {
    const res = await get(from);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toMatch(to);
  });

  const lookup: LegacyLookup = { article: (n) => `/a/${n}`, text: (f) => `/t/${f}`, thread: (n) => `/f/${n}`, forum: (n) => `/ff/${n}`, topic: (n) => `/th/${n}`, media: (p) => `/m/${p}` };
  test("external links are kept, mailto removed", () => {
    expect(resolveLegacyUrl("https://fr.wikipedia.org/wiki/Charles_Trenet", lookup)).toBe("https://fr.wikipedia.org/wiki/Charles_Trenet");
    expect(resolveLegacyUrl("mailto:webmaster@charles-trenet.net", lookup)).toBeNull();
    expect(resolveLegacyUrl("http://charles-trenet.org/modules.php?name=News&file=article&sid=5", lookup)).toBe("/a/5");
  });
});
