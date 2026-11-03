import { articleUrl, canonicalTextUrl, queries, songUrl, textUrl, type Song, type Text } from "../db.ts";
import { formatDate, plural } from "../format.ts";
import { html, raw, type SafeHtml } from "../html.ts";
import { breadcrumbs, pageHeader, songBadges } from "./components.ts";
import { layout } from "./layout.ts";

export interface SongFilters {
  q: string;
  lyrics: boolean;
  year: number | null;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Songs per year, as a clickable histogram (one bar per year, zero years included). */
function yearHistogram(songs: Song[], selected: number | null): SafeHtml {
  const counts = new Map<number, number>();
  for (const s of songs) if (s.year) counts.set(s.year, (counts.get(s.year) ?? 0) + 1);
  const years = [...counts.keys()];
  const min = Math.min(...years);
  const max = Math.max(...years);
  const peak = Math.max(...counts.values());
  const peakYear = [...counts].find(([, n]) => n === peak)![0];
  const bars: SafeHtml[] = [];
  for (let y = min; y <= max; y++) {
    const n = counts.get(y) ?? 0;
    const label = `${y} : ${n === 0 ? "aucune chanson" : plural(n, "chanson", "chansons")}`;
    bars.push(html`<a class="bar${y === selected ? " is-selected" : ""}${n === 0 ? " is-empty" : ""}" href="/chansons?annee=${y}" data-year="${y}" style="--v:${n / peak}" aria-label="${label}" data-tip="${label}"${n === 0 ? raw(' tabindex="-1"') : ""}>${y === peakYear ? html`<span class="bar-label">${n}</span>` : ""}</a>`);
  }
  const ticks: SafeHtml[] = [];
  for (let y = Math.ceil(min / 10) * 10; y <= max; y += 10) ticks.push(html`<span style="--x:${(y - min + 0.5) / (max - min + 1)}">${y}</span>`);
  return html`<figure class="histogram">
  <figcaption><strong>Chansons par année de création</strong> <span class="muted">— de ${min} à ${max}, pic en ${peakYear} (${peak}). Cliquez sur une année pour filtrer.</span></figcaption>
  <div class="histogram-plot" role="list">${bars}</div>
  <div class="histogram-axis" aria-hidden="true">${ticks}</div>
</figure>`;
}

export function renderCatalogue(f: SongFilters): string {
  const songs = queries.songs.all();
  const letters = [...new Set(songs.map((s) => s.letter))];
  const nq = fold(f.q.trim());
  const matches = (s: Song & { has_text: number }) =>
    (!nq || fold(`${s.title} ${s.sort_title}`).includes(nq)) && (!f.lyrics || s.has_text) && (!f.year || s.year === f.year);
  const visible = songs.filter(matches).length;
  const active = Boolean(nq || f.lyrics || f.year);

  const body = html`
${pageHeader({
  kicker: "Le répertoire",
  title: "Toutes ses chansons",
  lede: html`De <em>L’abbé à l’harmonium</em> à <em>Zéphyr</em>, de 1933 à 1999 : les chansons dont Charles Trenet a écrit les paroles, la musique, ou les deux — y compris les inédites. Celles marquées <span class="badge badge-blue">interprète</span> sont des chansons qu’il a chantées sans les avoir écrites.`,
})}
${yearHistogram(songs, f.year)}
<form class="catalogue-tools" action="/chansons" method="get" data-catalogue-filter>
  <label class="field"><span class="visually-hidden">Filtrer par titre</span><input type="search" name="q" value="${f.q}" placeholder="Filtrer par titre… (ex. « mer », « Paris »)" autocomplete="off"></label>
  <label class="check"><input type="checkbox" name="paroles" value="1"${f.lyrics ? raw(" checked") : ""}> Avec les paroles</label>
  ${f.year ? html`<input type="hidden" name="annee" value="${f.year}">` : ""}
  <button class="button button-small" type="submit">Filtrer</button>
  <p class="catalogue-count" aria-live="polite"><span data-count>${visible}</span> / ${songs.length} chansons${f.year ? html` · année <strong>${f.year}</strong>` : ""}<span data-reset-wrap${active ? "" : raw(" hidden")}> · <a href="/chansons" data-reset>tout afficher</a></span></p>
</form>
<nav class="letters" aria-label="Initiales">${letters.map((l) => html`<a href="#lettre-${l}">${l}</a>`)}</nav>
<div class="catalogue" data-catalogue>
${letters.map((l) => {
  const group = songs.filter((s) => s.letter === l);
  return html`<section class="letter-group" id="lettre-${l}" ${group.some(matches) ? "" : raw("hidden")}>
  <h2 class="letter">${l}</h2>
  <ul class="songs">
    ${group.map((s) => {
      const see = s.see_also_id ? queries.songById.get(s.see_also_id) : undefined;
      return html`<li class="song${s.has_text ? " has-lyrics" : ""}" data-title="${fold(`${s.title} ${s.sort_title}`)}" data-year="${s.year ?? ""}" data-lyrics="${s.has_text ? 1 : 0}"${matches(s) ? "" : raw(" hidden")}>
      ${see
        ? html`<span class="song-title">${s.title}</span> <span class="see">→ voir <a href="${songUrl(see)}">${see.title}</a></span>`
        : html`<a class="song-title" href="${songUrl(s)}">${s.title}</a>${songBadges(s)}<span class="song-meta">${s.year ?? ""}${s.publisher ? html`<span class="publisher"> · ${s.publisher}</span>` : ""}</span>`}
    </li>`;
    })}
  </ul>
</section>`;
})}
<p class="empty" data-empty ${visible ? raw("hidden") : ""}>Aucune chanson ne correspond. <a href="/recherche?q=${f.q}">Chercher « ${f.q} » dans tout le site</a> (les paroles comprises).</p>
</div>
<p class="note">Vous cherchez un poème, une lettre ou un document ? Voir <a href="/textes">les autres textes</a>.</p>`;

  return layout({
    title: "Toutes ses chansons",
    description: "Le catalogue des chansons de Charles Trenet, de 1933 à 1999, avec les paroles de plus de 300 d’entre elles.",
    path: "/chansons",
    section: "chansons",
    body,
    noindex: active,
  });
}

const KIND_LABEL: Record<string, string> = { chanson: "Chanson", poeme: "Poème", lettre: "Lettre", document: "Document" };

function lyricsBlock(t: Text): SafeHtml {
  return html`<div class="lyrics-tools" aria-label="Outils de lecture">
  <button type="button" class="tool" data-lyrics-size title="Agrandir le texte">A<sup>+</sup></button>
  <button type="button" class="tool" data-print title="Imprimer">Imprimer</button>
  <button type="button" class="tool" data-copy-link title="Copier le lien">Copier le lien</button>
</div>
<div class="lyrics${t.kind === "document" || t.kind === "lettre" ? " lyrics-prose" : ""}" data-lyrics>${raw(t.body_html)}</div>`;
}

function mentions(textId: number): SafeHtml {
  const arts = queries.articlesMentioning.all(textId);
  if (!arts.length) return html``;
  return html`<section class="box"><h2>Évoquée dans</h2><ul class="plain">${arts.map((a) => html`<li><a href="${articleUrl(a)}">${a.title}</a> <span class="muted">${formatDate(a.published_at)}</span></li>`)}</ul></section>`;
}

export function renderSong(s: Song): string {
  const text = s.text_id ? queries.textById.get(s.text_id) : undefined;
  const [prev, next] = (() => {
    const n = queries.songNeighbours.all(s.position, s.position);
    return [n.find((x) => x.position < s.position), n.find((x) => x.position > s.position)];
  })();
  const sameYear = s.year ? queries.songsSameYear.all(s.year, s.id).filter((x) => !x.see_also_id) : [];
  const aliases = queries.songs.all().filter((x) => x.see_also_id === s.id);
  const facts: [string, SafeHtml | string][] = [];
  if (s.year) facts.push(["Année", html`<a href="/chansons?annee=${s.year}">${s.year}</a>`]);
  if (text?.credits) facts.push(["Auteurs", text.credits]);
  if (s.publisher) facts.push(["Éditeur", s.publisher]);
  if (s.unpublished) facts.push(["Édition", "non éditée"]);
  if (aliases.length) facts.push(["Aussi connue sous", aliases.map((a) => a.title).join(", ")]);

  const body = html`
<article class="song-page">
  <header class="song-head">
    ${breadcrumbs([["Chansons", "/chansons"], [s.letter, `/chansons#lettre-${s.letter}`]])}
    <p class="kicker">Chanson${s.performed_only ? " interprétée" : ""}${s.year ? ` · ${s.year}` : ""}</p>
    <h1>${s.title}</h1>
    <dl class="facts">${facts.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
    <p>${songBadges(s)}</p>
  </header>
  ${text ? lyricsBlock(text) : html`<p class="no-lyrics">Les paroles de cette chanson ne figurent pas dans l’archive du site.<br><a href="/recherche?q=${s.title}">Chercher « ${s.title} » dans les articles et le forum →</a></p>`}
  <aside class="song-aside">
    ${text ? mentions(text.id) : ""}
    ${sameYear.length ? html`<section class="box"><h2>En ${s.year}, il écrivait aussi</h2><ul class="plain cols">${sameYear.map((x) => html`<li><a href="${songUrl(x)}">${x.title}</a>${x.text_id ? html` <span class="dot" title="paroles disponibles">♪</span>` : ""}</li>`)}</ul></section>` : ""}
  </aside>
</article>
<nav class="prevnext" aria-label="Chansons voisines">
  ${prev ? html`<a class="prev" href="${songUrl(prev)}"><span>← Chanson précédente</span>${prev.title}</a>` : html`<span></span>`}
  ${next ? html`<a class="next" href="${songUrl(next)}"><span>Chanson suivante →</span>${next.title}</a>` : html`<span></span>`}
</nav>`;

  const desc = text
    ? `Paroles de « ${s.title} »${s.year ? ` (${s.year})` : ""}, chanson de Charles Trenet. ${text.plain.split("\n").slice(0, 2).join(" / ")}…`
    : `« ${s.title} »${s.year ? `, ${s.year}` : ""} — une chanson du répertoire de Charles Trenet.`;
  return layout({
    title: text ? `${s.title} — paroles` : s.title,
    description: desc,
    path: songUrl(s),
    section: "chansons",
    type: "music.song",
    body,
    bodyClass: "page-song",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "MusicComposition",
      name: s.title,
      composer: s.performed_only ? undefined : { "@type": "Person", name: "Charles Trenet" },
      dateCreated: s.year ? String(s.year) : undefined,
      publisher: s.publisher ?? undefined,
      inLanguage: "fr",
    },
  });
}

export function renderText(t: Text): string {
  const body = html`
<article class="song-page">
  <header class="song-head">
    ${breadcrumbs([["Textes", "/textes"], [KIND_LABEL[t.kind] ?? "Texte"]])}
    <p class="kicker">${KIND_LABEL[t.kind] ?? "Texte"}${t.author !== "Charles Trenet" ? ` · ${t.author}` : ""}</p>
    <h1>${t.title}</h1>
    ${t.credits || t.copyright ? html`<dl class="facts">${t.credits ? html`<div><dt>Auteurs</dt><dd>${t.credits}</dd></div>` : ""}${t.copyright ? html`<div><dt>Source</dt><dd>${t.copyright}</dd></div>` : ""}</dl>` : ""}
  </header>
  ${lyricsBlock(t)}
  <aside class="song-aside">${mentions(t.id)}</aside>
</article>`;
  return layout({
    title: t.title,
    description: `${KIND_LABEL[t.kind] ?? "Texte"} — ${t.plain.split("\n").slice(0, 2).join(" / ").slice(0, 150)}…`,
    path: textUrl(t),
    section: "chansons",
    body,
    bodyClass: "page-song",
  });
}

export function renderTextIndex(): string {
  const texts = queries.textsNotInCatalogue.all();
  const groups: [string, string, Text[]][] = [
    ["poeme", "Poèmes", texts.filter((t) => t.kind === "poeme")],
    ["lettre", "Lettres", texts.filter((t) => t.kind === "lettre")],
    ["document", "Documents", texts.filter((t) => t.kind === "document")],
    ["chanson", "Autres chansons", texts.filter((t) => t.kind === "chanson")],
  ];
  const body = html`
${pageHeader({
  kicker: "Le répertoire",
  title: "Poèmes, lettres et documents",
  lede: "Les textes de l’archive qui ne figurent pas au catalogue des chansons : poèmes de jeunesse, lettres de Paul Fort ou de Max-Pol Fouchet, chansons des amis (Brassens…) et documents.",
})}
<div class="text-groups">
${groups.filter(([, , list]) => list.length).map(([kind, label, list]) => html`<section id="${kind}"><h2>${label} <span class="muted">${list.length}</span></h2><ul class="plain">${list.map((t) => html`<li><a href="${canonicalTextUrl(t)}">${t.title}</a>${t.author !== "Charles Trenet" ? html` <span class="muted">— ${t.author}</span>` : ""}</li>`)}</ul></section>`)}
</div>`;
  return layout({ title: "Poèmes, lettres et documents", path: "/textes", section: "chansons", body });
}
