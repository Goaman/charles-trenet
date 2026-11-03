import { meta, pagedUrl, queries, songUrl, stats, threadUrl, type Forum, type SearchHit, type Thread } from "../db.ts";
import { formatDate, formatMonth, formatNumber, plural, year } from "../format.ts";
import { html, raw, type SafeHtml } from "../html.ts";
import { breadcrumbs, monogram, pageHeader, pagination } from "./components.ts";
import { layout } from "./layout.ts";

// --- Chronologie ---------------------------------------------------------------

export function renderTimeline(): string {
  const rows = queries.timeline.all();
  const decades = [...new Set(rows.map((r) => Math.floor(r.start_year / 10) * 10))];
  const body = html`
${pageHeader({
  kicker: "Sa vie",
  title: "De 1913 à 2001",
  lede: html`Quatre-vingt-sept ans de vie, soixante-dix de chansons. La chronologie établie par le portail, avec les articles qui racontent chaque époque. Pour l’enfance, lire aussi <a href="/series/sa-route-enchantee">Sa route enchantée</a>.`,
})}
<nav class="decades" aria-label="Décennies">${decades.map((d) => html`<a href="#decennie-${d}">${d}</a>`)}</nav>
<ol class="timeline">
${rows.map((r, i) => {
  const decade = Math.floor(r.start_year / 10) * 10;
  const firstOfDecade = i === 0 || Math.floor(rows[i - 1]!.start_year / 10) * 10 !== decade;
  const related = JSON.parse(r.related_json) as { title: string; href: string }[];
  return html`<li class="tl-item" id="annee-${r.start_year}"${firstOfDecade ? raw(` data-decade="${decade}"`) : ""}>
  ${firstOfDecade ? html`<span class="tl-anchor" id="decennie-${decade}"></span>` : ""}
  <p class="tl-year">${r.start_year}${r.end_year ? html`<span>–${r.end_year}</span>` : ""}</p>
  <div class="tl-body">
    <div class="prose">${raw(r.events_html)}</div>
    ${related.length ? html`<ul class="tl-links">${related.map((l) => html`<li><a href="${l.href}">${l.title}</a></li>`)}</ul>` : ""}
  </div>
</li>`;
})}
</ol>`;
  return layout({
    title: "Sa vie, de 1913 à 2001",
    description: "Chronologie de la vie de Charles Trenet, de sa naissance à Narbonne en 1913 à sa mort en 2001.",
    path: "/chronologie",
    section: "chronologie",
    body,
  });
}

// --- Forum ---------------------------------------------------------------------

const archiveNotice = html`<p class="notice"><strong>Forum archivé.</strong> Ouvert en juin 2002, le forum est aujourd’hui fermé : les discussions restent lisibles, mais on ne peut plus y répondre. Les adresses électroniques ont été masquées.</p>`;

export function renderForumIndex(): string {
  const forums = queries.forums.all();
  const top = queries.allThreads.all().sort((a, b) => b.legacy_views - a.legacy_views).slice(0, 10);
  const authors = new Map<string, number>();
  for (const t of queries.allThreads.all()) authors.set(t.author, (authors.get(t.author) ?? 0) + 1);
  const body = html`
${pageHeader({ kicker: "Archives", title: "Le forum", lede: `${formatNumber(stats.threads)} discussions et ${formatNumber(stats.posts)} messages échangés entre trenetophiles, de 2002 à 2021.` })}
${archiveNotice}
<ul class="forums">
  ${forums.map((f) => html`<li><a href="/forum/${f.slug}">
    <span class="forum-name">${f.name}</span>
    <span class="forum-desc">${f.description}</span>
    <span class="forum-stats">${plural(f.thread_count, "discussion", "discussions")} · ${plural(f.post_count, "message", "messages")}${f.first_post_at ? ` · ${year(f.first_post_at)}–${year(f.last_post_at!)}` : ""}</span>
  </a></li>`)}
</ul>
<section class="section">
  <header class="section-head"><h2>Les discussions les plus lues</h2></header>
  ${threadTable(top, true)}
</section>`;
  return layout({ title: "Le forum (archives)", path: "/forum", section: "forum", body });
}

function threadTable(threads: Thread[], showForum = false): SafeHtml {
  const forums = new Map(queries.forums.all().map((f) => [f.id, f]));
  return html`<ol class="thread-list">${threads.map((t) => html`<li>
    ${monogram(t.author)}
    <div class="thread-main"><a href="${threadUrl(t)}">${t.subject}</a><span class="muted">${t.author} · ${formatDate(t.created_at)}${showForum ? ` · ${forums.get(t.forum_id)?.name ?? ""}` : ""}</span></div>
    <span class="thread-stats"><strong>${t.post_count}</strong> msg<br><span class="muted">${formatNumber(t.legacy_views)} vues</span></span>
  </li>`)}</ol>`;
}

const THREADS_PER_PAGE = 30;
export function renderForum(f: Forum, page: number): string | null {
  const pages = Math.max(1, Math.ceil(f.thread_count / THREADS_PER_PAGE));
  if (page > pages) return null;
  const threads = queries.threads.all(f.id, THREADS_PER_PAGE, (page - 1) * THREADS_PER_PAGE);
  const body = html`
${pageHeader({ crumbs: breadcrumbs([["Forum", "/forum"], [f.name]]), kicker: "Forum", title: f.name, lede: f.description })}
${archiveNotice}
${threadTable(threads)}
${pagination(page, pages, (p) => pagedUrl(`/forum/${f.slug}`, p))}`;
  return layout({ title: page > 1 ? `${f.name} — page ${page}` : f.name, path: pagedUrl(`/forum/${f.slug}`, page), section: "forum", body });
}

const POSTS_PER_PAGE = 25;
export function renderThread(t: Thread, page: number): string | null {
  const pages = Math.max(1, Math.ceil(t.post_count / POSTS_PER_PAGE));
  if (page > pages) return null;
  const forum = queries.forumById.get(t.forum_id)!;
  const posts = queries.posts.all(t.id, POSTS_PER_PAGE, (page - 1) * POSTS_PER_PAGE);
  const body = html`
${pageHeader({ crumbs: breadcrumbs([["Forum", "/forum"], [forum.name, `/forum/${forum.slug}`]]), kicker: forum.name, title: t.subject, lede: html`Discussion ouverte par <strong>${t.author}</strong> le ${formatDate(t.created_at)} · ${plural(t.post_count, "message", "messages")}` })}
<ol class="posts" start="${(page - 1) * POSTS_PER_PAGE + 1}">
  ${posts.map((p) => html`<li class="post" id="message-${p.position}">
    <header>${monogram(p.author)}<span class="post-author">${p.author}</span><a class="post-date" href="#message-${p.position}"><time datetime="${p.posted_at}">${formatDate(p.posted_at)}</time></a><span class="post-num">#${p.position}</span></header>
    <div class="prose prose-sm">${raw(p.body_html)}</div>
  </li>`)}
</ol>
${pagination(page, pages, (p) => pagedUrl(threadUrl(t), p))}
${archiveNotice}`;
  return layout({ title: t.subject, description: `Forum ${forum.name} — discussion ouverte par ${t.author} le ${formatDate(t.created_at)}.`, path: pagedUrl(threadUrl(t), page), section: "forum", body });
}

// --- Agenda --------------------------------------------------------------------

export function renderAgenda(): string {
  const items = queries.agenda.all();
  const byYear = new Map<string, typeof items>();
  for (const it of items) byYear.set(year(it.event_date), [...(byYear.get(year(it.event_date)) ?? []), it]);
  const body = html`
${pageHeader({ kicker: "Archives", title: "L’agenda", lede: "Concerts, spectacles, émissions et expositions autour de Charles Trenet, annoncés sur le portail de 2002 à 2018." })}
<div class="agenda">
${[...byYear].map(([y, list]) => html`<section><h2 class="year">${y}</h2>
  ${list.map((it) => {
    const [where, ...what] = it.title.split(/\s+-\s+/);
    return html`<article class="event" id="evenement-${it.id}">
    <p class="event-date">${formatMonth(it.event_date)}</p>
    <div><h3>${what.length ? what.join(" — ") : it.title}</h3>${what.length ? html`<p class="event-where">${where}</p>` : ""}
    <details><summary>Lire l’annonce</summary><div class="prose prose-sm">${raw(it.body_html)}</div>${it.url ? html`<p><a href="${it.url}" rel="noopener nofollow">${it.url.replace(/^https?:\/\//, "").slice(0, 60)}</a></p>` : ""}</details></div>
  </article>`;
  })}
</section>`)}
</div>`;
  return layout({ title: "L’agenda (archives)", path: "/agenda", section: "agenda", body });
}

// --- Liens ---------------------------------------------------------------------

export function renderLinks(): string {
  const cats = queries.linkCategories.all();
  const links = queries.links.all();
  const body = html`
${pageHeader({ kicker: "Archives", title: "Liens", lede: "Les sites recommandés par le portail depuis 2001. Beaucoup ont disparu depuis : chaque lien propose aussi sa copie sur Internet Archive." })}
<div class="links">
${cats.map((c) => {
  const list = links.filter((l) => l.category_id === c.id);
  if (!list.length) return "";
  const parent = c.parent_id ? cats.find((p) => p.id === c.parent_id) : undefined;
  return html`<section><h2>${parent ? html`<span class="muted">${parent.title} › </span>` : ""}${c.title}</h2>${c.description ? html`<p class="muted">${c.description}</p>` : ""}
  <ul class="link-list">${list.map((l) => html`<li><a href="${l.url}" rel="noopener nofollow">${l.title}</a> <a class="wayback" href="https://web.archive.org/web/${year(l.added_at)}/${l.url}" rel="noopener nofollow" title="Version archivée">archive</a>${l.description ? html`<p>${l.description}</p>` : ""}</li>`)}</ul></section>`;
})}
</div>`;
  return layout({ title: "Liens", path: "/liens", section: "liens", body });
}

// --- À propos --------------------------------------------------------------------

export function renderAbout(): string {
  const why = queries.page.get("pourquoi");
  const critic = queries.page.get("critique");
  const body = html`
${pageHeader({ kicker: "À propos", title: "Le portail des amis de Charles Trenet", lede: "Vingt ans de passion partagée, désormais préservés en archive." })}
<div class="about prose">
  <figure class="float-right"><img src="${meta.poster_image}" alt="Affiche Disques Pathé, avril 1934 : les duettistes Charles et Johnny" width="216" height="300" loading="lazy"><figcaption>Disques Pathé, avril 1934 : « les duettistes Charles &amp; Johnny ».</figcaption></figure>
  <h2>${why?.title ?? "Pourquoi ce portail ?"}</h2>
  ${raw(why?.body_html)}
  <p class="signature">— Dominic Daussaint, fondateur et webmestre</p>
  <h2>${critic?.title ?? ""}</h2>
  ${raw(critic?.body_html)}
  <h2 id="archive">Une archive en lecture seule</h2>
  <p>Créé en août 2001, quelques mois après la disparition du poète, le portail a publié ${formatNumber(stats.articles)} articles, réuni un catalogue de ${formatNumber(stats.songs)} chansons et accueilli ${formatNumber(stats.posts)} messages sur son forum. Il fonctionnait sous PostNuke, un système de 2001.</p>
  <p>En 2026, le site a été entièrement reconstruit pour préserver ce travail : tout le contenu public a été repris — articles, commentaires, paroles, poèmes, chronologie, agenda et forum —, nettoyé, et rendu consultable sur téléphone comme sur ordinateur. Les comptes, l’espace d’administration, les formulaires et les inscriptions ont disparu : <strong>plus rien ne s’écrit, tout se lit</strong>.</p>
  <ul>
    <li>Les adresses électroniques présentes dans les messages ont été masquées ; aucune donnée personnelle des anciens membres n’a été conservée.</li>
    <li>Les accents perdus par l’ancienne base de données ont été restaurés automatiquement ; il peut subsister quelques coquilles.</li>
    <li>Les anciennes adresses (<code>modules.php?…</code>, <code>chansons/….html</code>) redirigent vers les nouvelles pages.</li>
  </ul>
  <p>Pour suivre l’actualité de Charles Trenet aujourd’hui, rendez-vous sur <a href="https://www.facebook.com/charlestrenet" rel="noopener">la page Charles Trenet sur Facebook</a>.</p>
</div>`;
  return layout({ title: "À propos", path: "/a-propos", section: "a-propos", body });
}

// --- Recherche -------------------------------------------------------------------

export const KIND_LABELS: Record<string, string> = {
  article: "Articles",
  chanson: "Chansons",
  poeme: "Poèmes",
  lettre: "Lettres",
  document: "Documents",
  forum: "Forum",
  agenda: "Agenda",
  chronologie: "Chronologie",
};

export function renderSearch(q: string, kind: string, hits: SearchHit[], counts: Map<string, number>): string {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const tab = (k: string, label: string, n: number) =>
    html`<a href="/recherche?q=${encodeURIComponent(q)}${k ? `&type=${k}` : ""}"${k === kind ? raw(' aria-current="true"') : ""}>${label} <span>${n}</span></a>`;
  const body = html`
${pageHeader({ kicker: "Recherche", title: q ? html`« ${q} »` : "Rechercher" })}
<form class="search-big" action="/recherche" method="get" role="search">
  <label class="visually-hidden" for="q-page">Rechercher dans le site</label>
  <input id="q-page" name="q" type="search" value="${q}" placeholder="Un titre, un vers, un nom, une ville…" autofocus>
  <button class="button" type="submit">Rechercher</button>
</form>
<div data-search-results>
${q
  ? total
    ? html`<nav class="segmented tabs" aria-label="Filtrer les résultats">${tab("", "Tout", total)}${[...counts].map(([k, n]) => tab(k, KIND_LABELS[k] ?? k, n))}</nav>
<ol class="results">${hits.map((h) => html`<li><p class="result-kind">${KIND_LABELS[h.kind]?.replace(/s$/, "") ?? h.kind}${h.meta ? ` · ${h.meta}` : ""}</p><a class="result-title" href="${h.url}">${raw(h.title)}</a><p class="result-snippet">${raw(h.snippet)}</p></li>`)}</ol>
${hits.length >= 60 ? html`<p class="muted">Seuls les 60 premiers résultats sont affichés : précisez votre recherche.</p>` : ""}`
    : html`<p class="empty">Aucun résultat pour « ${q} ». Essayez un autre mot, ou parcourez <a href="/chansons">le catalogue des chansons</a>.</p>`
  : html`<p class="muted">La recherche porte sur les articles, les paroles des chansons, les poèmes, le forum, l’agenda et la chronologie. Les accents sont facultatifs : « theatre » trouve « théâtre ».</p>`}
</div>`;
  return layout({ title: q ? `Recherche : ${q}` : "Recherche", path: "/recherche", section: "recherche", body, noindex: true });
}

// --- 404 -------------------------------------------------------------------------

export function renderNotFound(path: string): string {
  const body = html`
<section class="not-found" data-not-found>
  <p class="kicker">Erreur 404</p>
  <h1>Que reste-t-il de cette page&nbsp;?</h1>
  <p class="lede">Rien, hélas : l’adresse <code data-path>${path}</code> ne mène nulle part. Peut-être a-t-elle disparu avec l’ancien site.</p>
  <form class="search-big" action="/recherche" method="get" role="search"><input name="q" type="search" placeholder="Rechercher…" aria-label="Rechercher"><button class="button" type="submit">Rechercher</button></form>
  <p><a href="/">Retour à l’accueil</a> · <a href="/hasard" rel="nofollow">Une chanson au hasard</a></p>
</section>`;
  return layout({ title: "Page introuvable", path, body, noindex: true });
}

// --- Une chanson au hasard (static export only; the server answers with a redirect) ---

export function renderRandom(): string {
  const urls = queries.songsWithText.all().map(songUrl);
  const body = html`
<section class="not-found" data-random>
  <p class="kicker">Une chanson au hasard</p>
  <h1>Je chante…</h1>
  <p class="lede">Un instant, on tire une chanson au sort. Si rien ne se passe, choisissez-la vous-même dans <a href="/chansons?paroles=1">le catalogue</a>.</p>
  <ul hidden>${urls.map((u) => html`<li><a href="${u}">${u}</a></li>`)}</ul>
</section>`;
  return layout({ title: "Une chanson au hasard", path: "/hasard", body, noindex: true });
}
