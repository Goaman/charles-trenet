import { html, raw, type SafeHtml } from "../html.ts";
import { assetUrl } from "../assets.ts";
import { meta } from "../db.ts";
import { CSP_META, STATIC } from "../mode.ts";

export const SITE_NAME = "Charles Trenet — Le portail des amis du Fou chantant";
export const SITE_URL = (process.env.SITE_URL ?? "https://www.charles-trenet.net").replace(/\/$/, "");

export interface PageOptions {
  title: string;
  description?: string;
  path: string;
  body: SafeHtml;
  section?: "accueil" | "articles" | "chansons" | "chronologie" | "forum" | "agenda" | "liens" | "a-propos" | "recherche";
  image?: string | null;
  type?: "website" | "article" | "music.song";
  jsonLd?: Record<string, unknown>;
  noindex?: boolean;
  /** Extra class on <body>. */
  bodyClass?: string;
}

const NAV: [PageOptions["section"], string, string][] = [
  ["articles", "/articles", "Articles"],
  ["chansons", "/chansons", "Chansons"],
  ["chronologie", "/chronologie", "Sa vie"],
  ["forum", "/forum", "Forum"],
  ["agenda", "/agenda", "Agenda"],
  ["a-propos", "/a-propos", "À propos"],
];

export const hatIcon = html`<svg class="hat" viewBox="0 0 64 40" aria-hidden="true"><path d="M14 27c1-9 4-19 18-19s17 10 18 19c-5 1.6-11 2.4-18 2.4S19 28.6 14 27Z" fill="currentColor"/><path d="M15 23.5c5 1.6 11 2.3 17 2.3s12-.7 17-2.3l.4 3.6c-5 1.6-11 2.4-17.4 2.4S19.6 28.7 14.6 27Z" class="hat-band"/><path d="M2 29.5c4 3.6 15 6.5 30 6.5s26-2.9 30-6.5c-1.4-1.9-6.3-3.6-12.4-4.6.3 1 .4 1.4.4 2.1-5 1.7-11 2.6-18 2.6s-13-.9-18-2.6c0-.7.1-1.1.4-2.1C8.3 25.9 3.4 27.6 2 29.5Z" fill="currentColor"/></svg>`;

export function layout(o: PageOptions): string {
  const url = SITE_URL + o.path;
  const description = o.description ?? "Archive du portail des amis de Charles Trenet : articles, toutes ses chansons et leurs paroles, sa vie de 1913 à 2001, et vingt ans de forum.";
  const image = SITE_URL + (o.image ?? meta.hero_image ?? "/assets/og.png");
  const fullTitle = o.path === "/" ? SITE_NAME : `${o.title} · Charles Trenet`;
  return (
    "<!doctype html>\n" +
    html`<html lang="fr" data-theme="auto"${STATIC ? raw(" data-static") : ""}>
<head>
<meta charset="utf-8">
${STATIC ? html`<meta http-equiv="Content-Security-Policy" content="${CSP_META}">` : ""}
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${url}">
${o.noindex ? html`<meta name="robots" content="noindex">` : ""}
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f4ede0" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#14161d" media="(prefers-color-scheme: dark)">
<meta property="og:site_name" content="Charles Trenet">
<meta property="og:locale" content="fr_FR">
<meta property="og:type" content="${o.type ?? "website"}">
<meta property="og:title" content="${o.title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="${assetUrl("favicon.svg")}" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="Charles Trenet — articles" href="/flux.xml">
<link rel="search" type="application/opensearchdescription+xml" title="Charles Trenet" href="/opensearch.xml">
<link rel="preload" href="${assetUrl("fonts/fraunces.woff2")}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${assetUrl("fonts/source-serif-4.woff2")}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${assetUrl("site.css")}">
<script src="${assetUrl("theme.js")}"></script>
${STATIC ? html`<script src="${assetUrl("static.js")}" defer></script>` : ""}
<script src="${assetUrl("site.js")}" defer></script>
${o.jsonLd ? raw(`<script type="application/ld+json">${JSON.stringify(o.jsonLd).replace(/</g, "\\u003c")}</script>`) : ""}
</head>
<body class="${o.bodyClass ?? ""}">
<a class="skip" href="#contenu">Aller au contenu</a>
<header class="masthead">
  <div class="masthead-inner">
    <a class="brand" href="/" aria-label="Accueil — Charles Trenet">
      ${hatIcon}
      <span class="brand-text"><span class="brand-name">Charles Trenet</span><span class="brand-sub">le portail des amis du Fou chantant</span></span>
    </a>
    <nav class="nav" aria-label="Navigation principale">
      <ul>
        ${NAV.map(([key, href, label]) => html`<li><a href="${href}"${o.section === key ? raw(' aria-current="page"') : ""}>${label}</a></li>`)}
      </ul>
    </nav>
    <div class="masthead-tools">
      <form class="search-mini" action="/recherche" method="get" role="search">
        <label class="visually-hidden" for="q-top">Rechercher</label>
        <input id="q-top" name="q" type="search" placeholder="Rechercher…" autocomplete="off" data-shortcut="/">
        <kbd aria-hidden="true">/</kbd>
      </form>
      <button class="theme-toggle" type="button" data-theme-toggle aria-label="Changer de thème (le soleil / la lune)" title="Le soleil a rendez-vous avec la lune">
        <svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3M4.8 4.8l2.1 2.1M17.1 17.1l2.1 2.1M4.8 19.2l2.1-2.1M17.1 6.9l2.1-2.1"/></svg>
        <svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z"/></svg>
      </button>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="menu-mobile" data-menu-toggle>
        <span class="visually-hidden">Menu</span><span class="burger" aria-hidden="true"></span>
      </button>
    </div>
  </div>
  <div class="menu-mobile" id="menu-mobile" hidden>
    <form action="/recherche" method="get" role="search"><input name="q" type="search" placeholder="Rechercher une chanson, un article…" aria-label="Rechercher"></form>
    <ul>${NAV.map(([key, href, label]) => html`<li><a href="${href}"${o.section === key ? raw(' aria-current="page"') : ""}>${label}</a></li>`)}<li><a href="/liens">Liens</a></li></ul>
  </div>
</header>
<main id="contenu">
${o.body}
</main>
<footer class="colophon">
  <div class="colophon-inner">
    <div class="colophon-brand">
      ${hatIcon}
      <p><strong>charles-trenet.net</strong><br>Le portail des amis de Charles Trenet, créé en 2001 par Dominic Daussaint et nourri pendant vingt ans par ses lecteurs.</p>
      <p class="archive-note">Ce site est désormais une <a href="/a-propos#archive">archive en lecture seule</a>&nbsp;: les inscriptions, le forum et les commentaires sont fermés.</p>
    </div>
    <nav aria-label="Plan du site">
      <h2>Explorer</h2>
      <ul>
        <li><a href="/articles">Tous les articles</a></li>
        <li><a href="/series/les-grands-moments">Les grands moments</a></li>
        <li><a href="/chansons">Toutes ses chansons</a></li>
        <li><a href="/textes">Poèmes, lettres &amp; documents</a></li>
        <li><a href="/chronologie">Sa vie, de 1913 à 2001</a></li>
      </ul>
    </nav>
    <nav aria-label="Archives">
      <h2>Archives</h2>
      <ul>
        <li><a href="/forum">Le forum (2002–2021)</a></li>
        <li><a href="/agenda">L’agenda</a></li>
        <li><a href="/liens">Liens</a></li>
        <li><a href="/hasard" rel="nofollow">Une chanson au hasard</a></li>
        <li><a href="/flux.xml">Flux RSS</a></li>
      </ul>
    </nav>
  </div>
  <p class="fineprint">Les textes des chansons et poèmes restent la propriété de leurs auteurs et éditeurs ; ils sont reproduits ici à des fins de documentation, comme sur le site d’origine.</p>
</footer>
</body>
</html>`.value
  );
}
