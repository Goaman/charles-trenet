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

describe("SEO", () => {
  test("image descriptions from file names, accents restored", async () => {
    const { describeFile, describeImages } = await import("../src/alt.ts");
    expect(describeFile("/media/album-etoile-1961.jpg")).toBe("Album étoile 1961");
    expect(describeFile("/media/quand-j-etais-petit.jpg")).toBe("Quand j’étais petit");
    expect(describeFile("/media/palais-congres-1989-3.jpg")).toBe("Palais Congrès 1989");
    expect(describeFile("/media/0m4zjjo5.jpeg")).toBeNull();
    expect(describeFile("/media/cocteaublanc.jpg")).toBeNull();
    expect(describeImages('<img src="/media/0m4zjjo5.jpeg" alt="">', "Un <titre>")).toBe('<img src="/media/0m4zjjo5.jpeg" alt="Illustration : Un &lt;titre&gt;">');
    expect(describeImages('<img src="/media/x.jpg" alt="Déjà">', "T")).toBe('<img src="/media/x.jpg" alt="Déjà">');
  });
  test("no content image without a description", async () => {
    const a = db.query<{ id: number; slug: string }, []>("SELECT id, slug FROM articles WHERE body_html LIKE '%<img%src=\"/media/%' LIMIT 1").get()!;
    const body = await (await get(`/articles/${a.id}-${a.slug}`)).text();
    expect(body).toContain("<img");
    expect(body.slice(body.indexOf("<main"))).not.toMatch(/<img\b[^>]*src="\/media\/[^>]*alt=""/);
  });
  test("sort orders point to one canonical list", async () => {
    const body = await (await get("/articles/populaires")).text();
    expect(body).toContain('<link rel="canonical" href="https://www.charles-trenet.net/articles">');
    expect(body).toContain("<title>Les articles les plus lus · Le portail des amis de Charles Trenet</title>");
  });
  test("articles show no publication date", async () => {
    const a = db.query<{ id: number; slug: string; published_at: string }, []>("SELECT id, slug, published_at FROM articles ORDER BY id LIMIT 1").get()!;
    for (const path of [`/articles/${a.id}-${a.slug}`, "/articles", "/", "/series/les-grands-moments"]) {
      const body = await (await get(path)).text();
      const main = body.slice(body.indexOf("<main"), body.indexOf("</main>"));
      expect(path === "/" ? main.slice(0, main.indexOf("section-forum")) : main).not.toMatch(/<time\b|class="year"/);
      expect(body).not.toContain(`"datePublished":"${a.published_at}"`);
    }
  });
  test("new entries: Intégrale 13–16, three books, Les Rois fainéants", async () => {
    const disco = await (await get("/articles/34-sa-discographie-disponible")).text();
    for (const v of [13, 14, 15, 16]) expect(disco).toContain(`Intégrale vol. ${v} –`);
    expect(disco.indexOf("Intégrale vol. 16")).toBeLessThan(disco.indexOf("Anthologie I"));
    const autour = await (await get("/articles/40-bibliographie-autour-de-charles-trenet")).text();
    for (const t of ["La vie qui va", "La révolution Trenet", "que reste-t-il du fou chantant"]) expect(autour).toContain(t);
    const oeuvres = await (await get("/articles/17-bibliographie-de-ses-oeuvres")).text();
    expect(oeuvres.indexOf("Les Rois fainéants</h3>")).toBeGreaterThan(0);
    expect(oeuvres.indexOf("Les Rois fainéants</h3>")).toBeLessThan(oeuvres.indexOf("Quelques recueils"));
    expect(oeuvres).toContain("Vincent Lisita</strong>");
    for (const img of ["integrale-vol-16.jpg", "rois-faineants.jpg"]) expect((await get(`/media/${img}`)).status).toBe(200);
  });
  test("discography and bibliographies: one card per entry, no underlined passages", async () => {
    const pages = { "/articles/34-sa-discographie-disponible": 33, "/articles/40-bibliographie-autour-de-charles-trenet": 36, "/articles/17-bibliographie-de-ses-oeuvres": 12 };
    for (const [path, n] of Object.entries(pages)) {
      const body = await (await get(path)).text();
      expect(body.match(/<section class="fiche">/g)?.length).toBe(n);
      expect(body.match(/<h3 class="fiche-title">/g)?.length).toBe(n);
      if (!path.includes("17-")) expect(body).not.toMatch(/<u>|4ème de couverture|CD 1/);
    }
  });
  test("Intégrale: Vincent Lisita and Pascal Halbeher took over from Daniel Nevers", async () => {
    const disco = await (await get("/articles/34-sa-discographie-disponible")).text();
    expect(disco).toContain("puis par Vincent Lisita et Pascal Halbeher qui ont pris la relève");
    expect(disco).not.toContain("compte goutte");
  });
  test("home: the four references, authors of the most read; footer: contact and copyright", async () => {
    const home = await (await get("/")).text();
    for (const href of ["/articles/34-", "/articles/13-", "/articles/40-", "/articles/17-"]) expect(home).toMatch(new RegExp(`<nav class="references"[\\s\\S]*href="${href}`));
    const popular = home.slice(home.indexOf('class="popular"'), home.indexOf("</aside>", home.indexOf('class="popular"')));
    expect(popular).toContain("par ");
    expect(home).toContain('href="mailto:dominic@alvos.com"');
    expect(home).toContain("Code de la propriété intellectuelle");
    expect(home).not.toContain("brand-logo");
    expect(home).toContain("colophon-logo");
  });
  test("frames baked into old images are clipped, clean covers are left alone", async () => {
    const disco = await (await get("/articles/34-sa-discographie-disponible")).text();
    expect(disco).toMatch(/<img style="clip-path:inset\([\d.]+% [\d.]+% [\d.]+% [\d.]+%\)" src="\/media\/cd-integrale-vol-1\.jpg"/);
    expect(disco).toMatch(/<img src="\/media\/integrale-vol-13\.jpg"/);
  });
  test("agenda: Nelson Monfort in Brussels, 29 November 2026", async () => {
    const body = await (await get("/agenda")).text();
    expect(body).toContain("Nelson Monfort raconte et chante Charles Trenet");
    expect(body).toContain("ya-d-la-joie-nelson-monfort.jpg");
    expect((await get("/media/ya-d-la-joie-nelson-monfort.jpg")).status).toBe(200);
  });
  test("no 'archive' outside the forum", async () => {
    for (const path of ["/", "/articles", "/a-propos", "/liens", "/agenda", "/textes"]) {
      // The content may speak of archives ("les archives de l’INA"): only the site’s own words count
      const body = (await (await get(path)).text()).replace(/archives du forum/gi, "").replace(/<details>[\s\S]*?<\/details>/g, "");
      expect(body).not.toMatch(/archiv/i);
    }
  });
  test("forum threads: distinct titles and DiscussionForumPosting", async () => {
    const titles = await Promise.all([2, 3].map(async (id) => {
      const t = db.query<{ slug: string }, [number]>("SELECT slug FROM threads WHERE id = ?").get(id)!;
      const body = await (await get(`/forum/sujet/${id}-${t.slug}`)).text();
      const ld = [...body.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]!));
      expect(ld.map((x) => x["@type"])).toEqual(expect.arrayContaining(["DiscussionForumPosting", "BreadcrumbList"]));
      const post = ld.find((x) => x["@type"] === "DiscussionForumPosting");
      expect(post.author.name).toBeTruthy();
      expect(post.text.length).toBeGreaterThan(10);
      return /<title>([^<]*)<\/title>/.exec(body)![1];
    }));
    expect(titles[0]).not.toBe(titles[1]);
  });
});
