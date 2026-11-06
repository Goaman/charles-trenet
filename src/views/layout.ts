import { html, raw, type SafeHtml } from "../html.ts";
import { assetUrl } from "../assets.ts";
import { meta } from "../db.ts";
import { describeImages } from "../alt.ts";
import { CSP_META, STATIC } from "../mode.ts";

export const SITE_NAME = "Le portail des amis de Charles Trenet";
/** The official Facebook page, which took over from the forum. */
export const CONTACT_EMAIL = "dominic@alvos.com";
export const FACEBOOK_URL = "https://www.facebook.com/charlestrenet";
export const SITE_URL = (process.env.SITE_URL ?? "https://www.charles-trenet.net").replace(/\/$/, "");

/** schema.org description of the subject of the whole site. */
export const TRENET = {
  "@type": "Person",
  name: "Charles Trenet",
  alternateName: "Le Fou chantant",
  birthDate: "1913-05-18",
  deathDate: "2001-02-19",
  birthPlace: { "@type": "Place", name: "Narbonne" },
  deathPlace: { "@type": "Place", name: "Créteil" },
  jobTitle: "Auteur-compositeur-interprète",
  sameAs: ["https://fr.wikipedia.org/wiki/Charles_Trenet"],
};

export interface PageOptions {
  title: string;
  description?: string;
  path: string;
  /** When several URLs show the same list (sort orders), the one to index. */
  canonical?: string;
  body: SafeHtml;
  section?: "accueil" | "articles" | "chansons" | "chronologie" | "forum" | "agenda" | "liens" | "a-propos" | "recherche";
  image?: string | null;
  type?: "website" | "article" | "music.song";
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
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

/** The logo: a drawing of Charles Trenet, blue eyes and a red carnation. */
const logo = (cls: string) => html`<img class="${cls}" src="${assetUrl("charles-trenet-dessin.png")}" alt="" width="200" height="310">`;

export function layout(o: PageOptions): string {
  const url = SITE_URL + (o.canonical ?? o.path);
  const content = raw(describeImages(o.body.value, o.title));
  const description = o.description ?? "Le portail des amis de Charles Trenet : articles, toutes ses chansons et leurs paroles, sa vie de 1913 à 2001, et la mémoire du forum des trenetophiles.";
  const image = SITE_URL + (o.image ?? meta.hero_image ?? "/assets/og.png");
  const fullTitle = o.path === "/" ? SITE_NAME : `${o.title} · ${SITE_NAME}`;
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
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:locale" content="fr_FR">
<meta property="og:type" content="${o.type ?? "website"}">
<meta property="og:title" content="${o.title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="${assetUrl("favicon.png")}" type="image/png">
<link rel="apple-touch-icon" href="${assetUrl("apple-touch-icon.png")}">
<link rel="alternate" type="application/rss+xml" title="${SITE_NAME} — articles" href="/flux.xml">
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
<div class="banner">
  <a href="/" aria-label="Accueil — ${SITE_NAME}">
    <picture>
      <source type="image/webp" srcset="${assetUrl("banniere.webp")}">
      <img src="${assetUrl("banniere.png")}" alt="${SITE_NAME}" width="1353" height="206">
    </picture>
  </a>
</div>
<header class="masthead">
  <div class="masthead-inner">
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
${content}
</main>
<footer class="colophon">
  <div class="colophon-inner">
    <div class="colophon-brand">
      ${logo("colophon-logo")}
      <p><strong>Le portail des amis de Charles Trenet</strong><br>Créé en 2001 par Dominic Daussaint, nourri depuis par ses lecteurs et régulièrement enrichi.</p>
      <p class="colophon-note">L’actualité de Charles Trenet et les échanges entre ses admirateurs se poursuivent sur <a href="${FACEBOOK_URL}" rel="noopener">la page Facebook officielle</a>.</p>
      <p class="colophon-contact">Pour proposer un article ou contacter Dominic Daussaint&nbsp;: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
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
    <nav aria-label="Et aussi">
      <h2>Et aussi</h2>
      <ul>
        <li><a href="/forum">Les archives du forum</a></li>
        <li><a href="/agenda">L’agenda</a></li>
        <li><a href="/liens">Liens</a></li>
        <li><a href="/hasard" rel="nofollow">Une chanson au hasard</a></li>
        <li><a href="/flux.xml">Flux RSS</a></li>
      </ul>
    </nav>
  </div>
  <p class="fineprint">Les textes des chansons et poèmes restent la propriété de leurs auteurs et éditeurs ; ils sont reproduits ici à des fins de documentation, comme sur le site d’origine.<br>Conformément au Code de la propriété intellectuelle, toute exploitation (représentation ou reproduction) de tout ou partie du site internet est strictement interdite sauf autorisation expresse et préalable d’Alvos Films – Dominic Daussaint.</p>
</footer>
</body>
</html>`.value
  );
}
