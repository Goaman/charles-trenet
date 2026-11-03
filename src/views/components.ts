import { articleUrl, queries, type ArticleSummary, type Song, type Theme } from "../db.ts";
import { formatDate, formatNumber, hue, year } from "../format.ts";
import { html, raw, type SafeHtml } from "../html.ts";

let themeCache: Map<number, Theme> | null = null;
export function themesById(): Map<number, Theme> {
  themeCache ??= new Map(queries.themes.all().map((t) => [t.id, t]));
  return themeCache;
}

export function seriesSlug(series: string): string {
  return series.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function articleCard(a: ArticleSummary, opts: { size?: "lg" | "md" | "sm"; showTheme?: boolean } = {}): SafeHtml {
  const theme = a.theme_id ? themesById().get(a.theme_id) : undefined;
  const size = opts.size ?? "md";
  return html`<article class="card card-${size}${a.cover_url ? "" : " no-cover"}">
  ${a.cover_url
    ? html`<a class="card-media" href="${articleUrl(a)}" tabindex="-1" aria-hidden="true"><img src="${a.cover_url}" alt="" width="${a.cover_width}" height="${a.cover_height}" loading="lazy" decoding="async"></a>`
    : ""}
  <div class="card-body">
    <p class="kicker">${a.series ? html`<a href="/series/${seriesSlug(a.series)}">${a.series}${a.series_part ? html` · ${a.series_part}` : ""}</a>` : opts.showTheme !== false && theme ? html`<a href="/themes/${theme.slug}">${theme.name}</a>` : html`<span>${year(a.published_at)}</span>`}</p>
    <h3 class="card-title"><a href="${articleUrl(a)}">${a.title}</a></h3>
    ${size !== "sm" ? html`<p class="card-excerpt">${a.excerpt}</p>` : ""}
    <p class="byline">${a.author ? html`<span>${a.author}</span> · ` : ""}<time datetime="${a.published_at}">${formatDate(a.published_at)}</time> · ${a.reading_minutes}&nbsp;min</p>
  </div>
</article>`;
}

export function articleRow(a: ArticleSummary): SafeHtml {
  const theme = a.theme_id ? themesById().get(a.theme_id) : undefined;
  return html`<li class="row">
  <time class="row-date" datetime="${a.published_at}">${formatDate(a.published_at)}</time>
  <div class="row-main">
    <a class="row-title" href="${articleUrl(a)}">${a.series && a.series_part ? html`<span class="part">${a.series_part}.</span> ` : ""}${a.title}</a>
    <span class="row-meta">${a.author ? html`${a.author} · ` : ""}${theme ? theme.name : ""}${a.comment_count ? html` · ${a.comment_count}&nbsp;comm.` : ""}</span>
  </div>
  <span class="row-aside">${a.reading_minutes}&nbsp;min</span>
</li>`;
}

export function pagination(page: number, pages: number, href: (p: number) => string): SafeHtml {
  if (pages <= 1) return html``;
  const items: (number | "…")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) items.push(p);
    else if (items.at(-1) !== "…") items.push("…");
  }
  return html`<nav class="pagination" aria-label="Pagination">
  ${page > 1 ? html`<a rel="prev" href="${href(page - 1)}">← Précédent</a>` : html`<span class="disabled">← Précédent</span>`}
  <ol>${items.map((p) => (p === "…" ? html`<li class="gap">…</li>` : p === page ? html`<li><span aria-current="page">${p}</span></li>` : html`<li><a href="${href(p)}">${p}</a></li>`))}</ol>
  ${page < pages ? html`<a rel="next" href="${href(page + 1)}">Suivant →</a>` : html`<span class="disabled">Suivant →</span>`}
</nav>`;
}

export function breadcrumbs(items: [string, string?][]): SafeHtml {
  return html`<nav class="crumbs" aria-label="Fil d’Ariane"><ol>${items.map(([label, href]) => (href ? html`<li><a href="${href}">${label}</a></li>` : html`<li aria-current="page">${label}</li>`))}</ol></nav>`;
}

export function monogram(name: string): SafeHtml {
  const initials = name.replace(/[^\p{L}\s-]/gu, "").split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  return html`<span class="monogram" style="--h:${hue(name)}" aria-hidden="true">${initials}</span>`;
}

export function songBadges(s: Song & { has_text?: number }): SafeHtml {
  return html`${s.text_id ? html`<span class="badge badge-lyrics" title="Paroles disponibles">paroles</span>` : ""}${s.unpublished ? html`<span class="badge" title="Chanson non éditée">inédite</span>` : ""}${s.performed_only ? html`<span class="badge badge-blue" title="Chantée par Trenet, mais écrite et composée par d’autres">interprète</span>` : ""}`;
}

export function pageHeader(o: { kicker?: SafeHtml | string; title: string | SafeHtml; lede?: SafeHtml | string; crumbs?: SafeHtml }): SafeHtml {
  return html`<header class="page-head">
  ${o.crumbs ?? ""}
  ${o.kicker ? html`<p class="kicker">${o.kicker}</p>` : ""}
  <h1>${o.title}</h1>
  ${o.lede ? html`<p class="lede">${o.lede}</p>` : ""}
</header>`;
}

export const views = (n: number) => (n ? html`<span title="Lectures sur l’ancien site">${formatNumber(n)}&nbsp;lectures</span>` : "");
export const ornament = raw(`<div class="ornament" aria-hidden="true"><span>✦</span></div>`);
