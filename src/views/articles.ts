import { articleUrl, queries, type Article, type ArticleSummary, type Comment } from "../db.ts";
import { formatDate, formatNumber, plural, seeded, summary, year } from "../format.ts";
import { html, raw, type SafeHtml } from "../html.ts";
import { articleCard, articleRow, breadcrumbs, monogram, pageHeader, seriesSlug, themesById } from "./components.ts";
import { layout, SITE_URL } from "./layout.ts";

export function authorSlug(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type Sort = "recents" | "anciens" | "populaires";

export function renderArticleIndex(sort: Sort): string {
  const all = queries.allArticleSummaries.all();
  const themes = queries.themes.all();
  const authors = queries.authors.all().filter((a) => a.n >= 2);
  let list: SafeHtml;
  if (sort === "populaires") {
    const ranked = [...all].sort((a, b) => b.legacy_views - a.legacy_views);
    list = html`<ol class="rows rows-ranked">${ranked.map((a) => html`<li class="row"><span class="row-date">${formatNumber(a.legacy_views)} lectures</span><div class="row-main"><a class="row-title" href="${articleUrl(a)}">${a.title}</a><span class="row-meta">${a.author ?? ""}</span></div><span class="row-aside">${a.reading_minutes}&nbsp;min</span></li>`)}</ol>`;
  } else {
    // No years: the articles are shown without their publication date
    const ordered = sort === "anciens" ? [...all].reverse() : all;
    list = html`<ul class="rows">${ordered.map(articleRow)}</ul>`;
  }
  const sortLink = (s: Sort, label: string) =>
    html`<a href="${s === "recents" ? "/articles" : `/articles/${s}`}"${s === sort ? raw(' aria-current="true"') : ""}>${label}</a>`;

  const body = html`
${pageHeader({
  kicker: "Le magazine",
  title: "Tous les articles",
  lede: html`${all.length} articles écrits par les amis de Charles Trenet : témoignages, enquêtes, souvenirs de récitals, coups de chapeau et coups de venin.`,
})}
<div class="with-sidebar">
  <div>
    <div class="toolbar">
      <nav class="segmented" aria-label="Trier">${sortLink("recents", "Les derniers")}${sortLink("anciens", "Depuis le début")}${sortLink("populaires", "Les plus lus")}</nav>
    </div>
    ${list}
  </div>
  <aside class="sidebar">
    <section>
      <h2>Thèmes</h2>
      <ul class="chips">${themes.map((t) => html`<li><a class="chip" href="/themes/${t.slug}">${t.name} <span>${t.count}</span></a></li>`)}</ul>
    </section>
    <section>
      <h2>Séries</h2>
      <ul class="plain"><li><a href="/series/les-grands-moments">Les grands moments</a></li><li><a href="/series/sa-route-enchantee">Sa route enchantée</a></li></ul>
    </section>
    <section>
      <h2>Les plumes</h2>
      <ul class="plain authors">${authors.map((a) => html`<li><a href="/auteurs/${authorSlug(a.author)}">${a.author}</a> <span class="muted">${a.n}</span></li>`)}</ul>
    </section>
  </aside>
</div>`;
  return layout({
    title: { recents: "Tous les articles", anciens: "Tous les articles, depuis le début", populaires: "Les articles les plus lus" }[sort],
    description: `Les ${all.length} articles du portail des amis de Charles Trenet : témoignages, enquêtes, souvenirs de récitals, disques, livres et films.`,
    path: sort === "recents" ? "/articles" : `/articles/${sort}`,
    canonical: "/articles", // same list, another order
    section: "articles",
    body,
  });
}

export function renderTheme(slug: string): string | null {
  const theme = queries.themes.all().find((t) => t.slug === slug);
  if (!theme) return null;
  const items = queries.articlesByTheme.all(theme.id);
  const body = html`
${pageHeader({ crumbs: breadcrumbs([["Articles", "/articles"], [theme.name]]), kicker: "Thème", title: theme.name, lede: theme.description })}
<p class="count">${plural(items.length, "article", "articles")}</p>
<div class="grid">${items.map((a) => articleCard(a, { showTheme: false }))}</div>`;
  return layout({ title: theme.name, description: theme.description, path: `/themes/${slug}`, section: "articles", body });
}

const SERIES: Record<string, { name: string; lede: string }> = {
  "les-grands-moments": {
    name: "Les grands moments",
    lede: "Seize épisodes, de l’ABC en 1938 au Palais des Congrès en 1989 : la carrière scénique de Charles Trenet racontée récital après récital, avec les coupures de presse de l’époque.",
  },
  "sa-route-enchantee": {
    name: "Sa route enchantée",
    lede: "L’enfance et la jeunesse de Charles Trenet, de Narbonne à Perpignan, en épisodes.",
  },
};

export function renderSeries(slug: string): string | null {
  const s = SERIES[slug];
  if (!s) return null;
  const items = queries.articlesBySeries.all(s.name);
  const body = html`
${pageHeader({ crumbs: breadcrumbs([["Articles", "/articles"], [s.name]]), kicker: "Série", title: s.name, lede: s.lede })}
<ol class="episodes">
  ${items.map((a) => html`<li><a href="${articleUrl(a)}">
    <span class="episode-num">${a.series_part ?? "◆"}</span>
    <span class="episode-body"><span class="episode-title">${a.title}</span><span class="episode-excerpt">${a.excerpt}</span><span class="byline">${a.author ? `${a.author} · ` : ""}${a.reading_minutes}&nbsp;min de lecture</span></span>
    ${a.cover_url ? html`<img src="${a.cover_url}" alt="" width="${a.cover_width}" height="${a.cover_height}" loading="lazy">` : ""}
  </a></li>`)}
</ol>`;
  return layout({ title: s.name, description: s.lede, path: `/series/${slug}`, section: "articles", body });
}

export function renderAuthor(slug: string): string | null {
  const author = queries.authors.all().find((a) => authorSlug(a.author) === slug);
  if (!author) return null;
  const items = queries.articlesByAuthor.all(author.author);
  const body = html`
${pageHeader({ crumbs: breadcrumbs([["Articles", "/articles"], [author.author]]), kicker: "Auteur", title: author.author, lede: `${plural(items.length, "article", "articles")} publiés sur le portail.` })}
<ul class="rows">${items.map(articleRow)}</ul>`;
  return layout({
    title: `Les articles de ${author.author}`,
    description: summary(`${plural(items.length, "article", "articles")} de ${author.author} sur Charles Trenet, publiés sur le portail des amis de Charles Trenet : ${items.slice(0, 3).map((a) => `« ${a.title} »`).join(", ")}${items.length > 3 ? "…" : "."}`, 200),
    path: `/auteurs/${slug}`,
    section: "articles",
    body,
  });
}

function commentThread(comments: Comment[]): SafeHtml {
  return html`<ol class="comments">${comments.map((c) => html`<li class="comment" id="commentaire-${c.id}">
    <header>${monogram(c.author)}<span class="comment-author">${c.author}</span></header>
    ${c.subject ? html`<p class="comment-subject">${c.subject}</p>` : ""}
    <div class="prose prose-sm">${raw(c.body_html)}</div>
  </li>`)}</ol>`;
}

export function renderArticle(a: Article): string {
  const theme = a.theme_id ? themesById().get(a.theme_id) : undefined;
  const comments = queries.comments.all(a.id);
  const mentioned = queries.mentionedTexts.all(a.id);
  const [prev, next] = (() => {
    const n = queries.articleNeighbours.all(a.published_at, a.published_at);
    return [n.find((x) => x.published_at < a.published_at), n.find((x) => x.published_at > a.published_at)];
  })();
  const series = a.series ? queries.articlesBySeries.all(a.series) : [];
  const sameTheme = theme ? queries.articlesByTheme.all(theme.id).filter((x) => x.id !== a.id && !series.some((s) => s.id === x.id)) : [];
  const related: ArticleSummary[] = [];
  for (let i = 0; related.length < 3 && i < sameTheme.length * 2 && sameTheme.length; i++) {
    const pick = sameTheme[seeded(`${a.id}-${i}`, sameTheme.length)]!;
    if (!related.includes(pick)) related.push(pick);
  }

  const crumbs: [string, string?][] = [["Articles", "/articles"]];
  if (a.series) crumbs.push([a.series, `/series/${seriesSlug(a.series)}`]);
  else if (theme) crumbs.push([theme.name, `/themes/${theme.slug}`]);

  const body = html`
<article class="article" data-article="${a.id}">
  <header class="article-head">
    ${breadcrumbs(crumbs)}
    <p class="kicker">${a.series ? html`<a href="/series/${seriesSlug(a.series)}">${a.series}${a.series_part ? ` · épisode ${a.series_part}` : ""}</a>` : theme ? html`<a href="/themes/${theme.slug}">${theme.name}</a>` : a.category ?? "Article"}</p>
    <h1>${a.title}</h1>
    <p class="byline">
      ${a.author ? html`<span class="by">par <a href="/auteurs/${authorSlug(a.author)}">${a.author}</a></span>` : ""}
      <span>${a.reading_minutes}&nbsp;min de lecture</span>
      ${a.legacy_views ? html`<span>${formatNumber(a.legacy_views)} lectures</span>` : ""}
    </p>
  </header>
  <div class="article-body prose" data-lightbox>
    ${a.intro_html ? html`<div class="chapo">${raw(a.intro_html)}</div>` : ""}
    ${raw(a.body_html)}
  </div>
  <aside class="article-aside">
    ${mentioned.length
      ? html`<section class="box"><h2>Les textes cités</h2><ul class="plain">${mentioned.map((m) => html`<li><a href="${m.url}">${m.title}</a>${m.kind !== "chanson" ? html` <span class="muted">(${m.kind === "poeme" ? "poème" : m.kind})</span>` : ""}</li>`)}</ul></section>`
      : ""}
    ${series.length > 1
      ? html`<section class="box"><h2>${a.series}</h2><ol class="series-nav">${series.map((s) => html`<li${s.id === a.id ? raw(' aria-current="true"') : ""}><a href="${articleUrl(s)}">${s.series_part ? html`<span>${s.series_part}</span>` : ""}${s.title}</a></li>`)}</ol></section>`
      : ""}
  </aside>
</article>

${comments.length
  ? html`<section class="comments-section" id="commentaires">
  <details>
    <summary><h2>${plural(comments.length, "commentaire", "commentaires")} de lecteurs</h2></summary>
    ${commentThread(comments)}
  </details>
</section>`
  : ""}

<nav class="prevnext" aria-label="Articles voisins">
  ${prev ? html`<a class="prev" href="${articleUrl(prev)}"><span>← Article précédent</span>${prev.title}</a>` : html`<span></span>`}
  ${next ? html`<a class="next" href="${articleUrl(next)}"><span>Article suivant →</span>${next.title}</a>` : html`<span></span>`}
</nav>

${related.length ? html`<section class="section"><header class="section-head"><h2>Sur le même thème</h2>${theme ? html`<a href="/themes/${theme.slug}">${theme.name} →</a>` : ""}</header><div class="grid">${related.map((r) => articleCard(r, { size: "sm" }))}</div></section>` : ""}`;

  return layout({
    title: a.title,
    description: a.excerpt,
    path: articleUrl(a),
    section: "articles",
    type: "article",
    image: a.cover_url,
    body,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: a.title,
      url: SITE_URL + articleUrl(a),
      author: a.author ? { "@type": "Person", name: a.author } : undefined,
      image: a.cover_url ? SITE_URL + a.cover_url : undefined,
      inLanguage: "fr",
      about: { "@type": "Person", name: "Charles Trenet" },
      commentCount: comments.length || undefined,
    },
  });
}
