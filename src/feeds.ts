import { articleUrl, queries, songUrl, textUrl, threadUrl } from "./db.ts";
import { escape } from "./html.ts";
import { SITE_NAME, SITE_URL } from "./views/layout.ts";

export function rss(): string {
  const items = queries.articles.all(30, 0);
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${SITE_NAME}</title>
<link>${SITE_URL}/</link>
<atom:link href="${SITE_URL}/flux.xml" rel="self" type="application/rss+xml"/>
<description>Les articles du portail des amis de Charles Trenet.</description>
<language>fr</language>
${items
  .map(
    (a) => `<item>
<title>${escape(a.title)}</title>
<link>${SITE_URL}${articleUrl(a)}</link>
<guid isPermaLink="true">${SITE_URL}${articleUrl(a)}</guid>
${a.author ? `<author>noreply@charles-trenet.net (${escape(a.author)})</author>` : ""}
<description>${escape(a.excerpt)}</description>
</item>`,
  )
  .join("\n")}
</channel>
</rss>`;
}

export function sitemap(): string {
  const urls: [string, string?][] = [
    ["/"], ["/articles"], ["/chansons"], ["/textes"], ["/chronologie"], ["/forum"], ["/agenda"], ["/liens"], ["/a-propos"],
    ["/series/les-grands-moments"], ["/series/sa-route-enchantee"],
  ];
  for (const t of queries.themes.all()) urls.push([`/themes/${t.slug}`]);
  for (const a of queries.allArticleSummaries.all()) urls.push([articleUrl(a), a.published_at.slice(0, 10)]);
  for (const s of queries.songs.all()) if (!s.see_also_id) urls.push([songUrl(s)]);
  for (const t of queries.textsNotInCatalogue.all()) urls.push([textUrl(t)]);
  for (const f of queries.forums.all()) urls.push([`/forum/${f.slug}`]);
  for (const t of queries.allThreads.all()) urls.push([threadUrl(t), t.last_post_at.slice(0, 10)]);
  return `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, d]) => `<url><loc>${SITE_URL}${escape(u)}</loc>${d ? `<lastmod>${d}</lastmod>` : ""}</url>`).join("\n")}
</urlset>`;
}

export function robots(): string {
  return `User-agent: *\nDisallow: /recherche\nDisallow: /api/\nDisallow: /hasard\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

export function opensearch(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
<ShortName>Charles Trenet</ShortName>
<Description>Rechercher dans le portail des amis de Charles Trenet</Description>
<InputEncoding>UTF-8</InputEncoding>
<Url type="text/html" template="${SITE_URL}/recherche?q={searchTerms}"/>
</OpenSearchDescription>`;
}
