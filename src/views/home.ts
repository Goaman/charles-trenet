import { articleUrl, meta, queries, songUrl, stats, threadUrl, type Ephemeris } from "../db.ts";
import { formatDate, formatDayMonth, formatNumber, parisToday, seeded } from "../format.ts";
import { html, raw } from "../html.ts";
import { articleCard, seriesSlug } from "./components.ts";
import { layout, SITE_URL } from "./layout.ts";

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** The ephemeris for today, or the next one in the calendar. */
export function ephemerisFor(day: number, month: number): { e: Ephemeris; today: boolean } | null {
  const all = queries.ephemerides.all();
  if (!all.length) return null;
  const todays = all.filter((e) => e.day === day && e.month === month);
  if (todays.length) return { e: todays[seeded(`${month}-${day}`, todays.length)]!, today: true };
  const key = month * 100 + day;
  const next = all.find((e) => e.month * 100 + e.day > key) ?? all[0]!;
  return { e: next, today: false };
}

/** First stanza of a text, for teasers. */
export function firstStanza(bodyHtml: string, maxLines = 6): string {
  const p = /<p>([\s\S]*?)<\/p>/.exec(bodyHtml)?.[1] ?? "";
  const lines = p.split("<br>").map((l) => l.replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  return lines.slice(0, maxLines).join("\n") + (lines.length > maxLines ? "\n…" : "");
}

export function renderHome(now = new Date()): string {
  const { day, month } = parisToday(now);
  const dayKey = now.toISOString().slice(0, 10);
  const intro = queries.page.get("accueil");
  const eph = ephemerisFor(day, month);

  const withText = queries.songsWithText.all();
  const song = withText[seeded(`song-${dayKey}`, withText.length)]!;
  const songText = queries.textById.get(song.text_id!)!;

  const all = queries.allArticleSummaries.all();
  const latest = all.slice(0, 3);
  const pickPool = all.filter((a) => a.cover_url && !latest.includes(a));
  const featured = pickPool[seeded(`article-${dayKey}`, pickPool.length)]!;
  const popular = queries.articlesPopular.all(6, 0).filter((a) => a.id !== featured.id).slice(0, 5);
  const moments = queries.articlesBySeries.all("Les grands moments");
  const themes = queries.themes.all();
  const threads = queries.allThreads.all().sort((a, b) => b.legacy_views - a.legacy_views).slice(0, 4);

  const body = html`
<section class="hero">
  <div class="hero-text">
    <p class="kicker">Narbonne 1913 — Créteil 2001</p>
    <h1 class="hero-title">Y’a d’la joie<span class="hero-title-sub">… et mille chansons.</span></h1>
    <div class="hero-intro prose">${raw(intro?.body_html)}</div>
    <p class="hero-actions">
      <a class="button" href="/chansons">Toutes ses chansons</a>
      <a class="button button-ghost" href="/chronologie">Sa vie, de 1913 à 2001</a>
    </p>
  </div>
  <figure class="hero-figure">
    <img src="${meta.hero_image}" alt="Charles Trenet sur scène, un œillet rouge à la boutonnière" width="261" height="400" fetchpriority="high">
    <figcaption>Au Palais des Congrès, 1993.</figcaption>
  </figure>
</section>

<section class="stats" aria-label="L’archive en chiffres">
  <ul>
    <li><a href="/articles"><strong>${formatNumber(stats.articles)}</strong> articles</a></li>
    <li><a href="/chansons"><strong>${formatNumber(stats.songs)}</strong> chansons au catalogue</a></li>
    <li><a href="/chansons?paroles=1"><strong>${formatNumber(stats.lyrics)}</strong> textes de chansons</a></li>
    <li><a href="/forum"><strong>${formatNumber(stats.posts)}</strong> messages de forum</a></li>
  </ul>
</section>

<section class="duo">
  ${eph
    ? html`<article class="panel panel-day">
    <h2 class="panel-title"><span class="kicker">${eph.today ? "Ce jour-là" : "Bientôt"}</span> ${eph.e.day === 1 ? "1er" : eph.e.day} ${MONTHS[eph.e.month - 1]}${eph.e.year ? html` <span class="muted">${eph.e.year}</span>` : ""}</h2>
    <div class="prose quote">${raw(eph.e.body_html)}</div>
    <p class="panel-foot">${eph.today ? `Une éphéméride pour le ${formatDayMonth(now)}.` : `Rien pour le ${formatDayMonth(now)} : voici la prochaine date.`}</p>
  </article>`
    : ""}
  <article class="panel panel-song">
    <h2 class="panel-title"><span class="kicker">La chanson du jour</span> <a href="${songUrl(song)}">${song.title}</a>${song.year ? html` <span class="muted">${song.year}</span>` : ""}</h2>
    <blockquote class="stanza">${firstStanza(songText.body_html)}</blockquote>
    <p class="panel-foot"><a href="${songUrl(song)}">Lire toute la chanson →</a> <a class="muted" href="/hasard" rel="nofollow">Une autre, au hasard</a></p>
  </article>
</section>

<section class="section">
  <header class="section-head">
    <h2>L’article du jour</h2>
    <a href="/articles">Tous les articles →</a>
  </header>
  <div class="feature">
    ${articleCard(featured, { size: "lg" })}
    <aside class="popular">
      <h3>Les plus lus</h3>
      <ol>${popular.map((a) => html`<li><a href="${articleUrl(a)}">${a.title}</a><span>${formatNumber(a.legacy_views)} lectures</span></li>`)}</ol>
    </aside>
  </div>
</section>

<section class="section section-moments">
  <header class="section-head">
    <h2>Les grands moments</h2>
    <a href="/series/${seriesSlug("Les grands moments")}">Les ${moments.length} épisodes →</a>
  </header>
  <p class="section-lede">De l’ABC en 1938 au Palais des Congrès en 1989, Elisabeth Duncker raconte, récital après récital, la carrière scénique du Fou chantant.</p>
  <ol class="rail" tabindex="0" aria-label="Épisodes des grands moments">
    ${moments.map((a) => html`<li class="rail-item"><a href="${articleUrl(a)}"><span class="rail-num">${a.series_part}</span><span class="rail-title">${a.title}</span></a></li>`)}
  </ol>
</section>

<section class="section">
  <header class="section-head"><h2>Les thèmes</h2></header>
  <ul class="themes">
    ${themes.map((t) => html`<li><a href="/themes/${t.slug}"><span class="theme-name">${t.name}</span><span class="theme-desc">${t.description}</span><span class="theme-count">${t.count} articles</span></a></li>`)}
  </ul>
</section>

<section class="section">
  <header class="section-head"><h2>Les derniers articles</h2><a href="/articles">Archive complète →</a></header>
  <div class="grid">${latest.map((a) => articleCard(a))}</div>
</section>

<section class="section section-forum">
  <header class="section-head"><h2>Dans les archives du forum</h2><a href="/forum">${formatNumber(stats.threads)} discussions →</a></header>
  <ul class="threads-mini">
    ${threads.map((t) => html`<li><a href="${threadUrl(t)}">${t.subject}</a><span>${t.author} · ${formatDate(t.created_at)} · ${t.post_count} messages</span></li>`)}
  </ul>
</section>`;

  return layout({
    title: "Charles Trenet, le Fou chantant",
    path: "/",
    section: "accueil",
    body,
    bodyClass: "home",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Charles Trenet — Le portail des amis du Fou chantant",
      url: `${SITE_URL}/`,
      inLanguage: "fr",
      potentialAction: { "@type": "SearchAction", target: `${SITE_URL}/recherche?q={q}`, "query-input": "required name=q" },
      about: { "@type": "Person", name: "Charles Trenet", birthDate: "1913-05-18", deathDate: "2001-02-19", birthPlace: "Narbonne" },
    },
  });
}
