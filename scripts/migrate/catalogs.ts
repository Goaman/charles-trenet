/**
 * The discography and the two bibliographies, as catalogues: one card
 * ("fiche") per disc or book, with its cover, a title that stands out and its
 * references, in the same style for the three articles.
 *
 * The old pages ran the entries together, with long underlined passages
 * (track lists, back-cover blurbs) that were removed on the webmaster's
 * request. Their entries are written here; the covers keep the image tags of
 * the cleaned article (sizes, descriptions). For "Bibliographie de ses
 * œuvres", whose texts stay (Trenet's own words, prefaces), the entries are
 * read from the article and only restructured.
 */
import { cover, nbsp } from "./additions.ts";

export interface Fiche {
  title: string;
  /** Author, illustrator, prefacer: the line under the title. */
  by?: string;
  lines: string[];
  covers: string[];
  links?: string[];
  /** Kept text (HTML), under the card. */
  text?: string;
}

const amazon = (asin: string) => `<a href="https://www.amazon.fr/dp/${asin}" rel="noopener nofollow">Voir sur Amazon</a>`;
const onSite = (href: string, text: string) => `<a href="${href}">${text}</a>`;

/** The <img> of a cover: the article's own tag, or a new one from content/media. */
function coverTag(source: string, file: string, alt: string): string {
  const tag = new RegExp(`<img\\b[^>]*\\bsrc="/media/${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`).exec(source)?.[0];
  const img = tag ? tag.replace(/\sclass="[^"]*"/, "").replace(/>$/, ' class="fiche-cover">') : cover(file, "fiche-cover");
  return img.replace(/\balt="[^"]*"/, `alt="${alt}"`);
}

export function renderFiche(f: Fiche, source: string): string {
  const alt = `Couverture : ${f.title.replace(/<[^>]+>/g, "").replace(/"/g, "&quot;")}`;
  const covers = f.covers.map((c) => coverTag(source, c, alt)).join("");
  return `<section class="fiche">
${covers ? `<div class="fiche-covers">${covers}</div>\n` : ""}<div class="fiche-text">
<h3 class="fiche-title">${f.title}</h3>
${f.by ? `<p class="fiche-by">${f.by}</p>\n` : ""}${f.lines.length ? `<p class="fiche-meta">${f.lines.join("<br>")}</p>\n` : ""}${f.links?.length ? `<p class="fiche-links">${f.links.join(" · ")}</p>\n` : ""}</div>
${f.text ? `<div class="fiche-more">\n${f.text.trim()}\n</div>\n` : ""}</section>`;
}

// --- Sa discographie… disponible ! ---------------------------------------------------

const FREMEAUX = "Frémeaux &amp; Associés";
const LISITA = "Direction artistique : Pascal Halbeher et Vincent Lisita, collection Daniel Nevers";

const integrale = (vol: number, title: string, years: string, more: { ref?: string; discs?: string; asin?: string; links?: string[]; cover?: string; note?: string } = {}): Fiche => ({
  title: `Intégrale vol. ${vol} – « ${title} »`,
  lines: [
    years,
    `Label : ${FREMEAUX}${more.ref ? ` (${more.ref})` : ""}`,
    more.discs ?? "Coffret 2 CD avec livret",
    ...(more.ref ? [LISITA] : []),
    ...(more.note ? [`<em>${more.note}</em>`] : []),
  ],
  covers: [more.cover ?? `cd-integrale-vol-${vol}.jpg`],
  links: [...(more.asin ? [amazon(more.asin)] : []), ...(more.links ?? [])],
});

const disc = (title: string, lines: string[], cover: string, links?: string[]): Fiche => ({ title, lines, covers: [cover], links });

export const INTEGRALE: Fiche[] = [
  integrale(1, "Charles et Johnny", "1933-1936"),
  integrale(2, "Y’a d’la joie", "1934-1938"),
  integrale(3, "Boum !", "1937-1941"),
  integrale(4, "Que reste-t-il de nos amours ?", "1941-1943"),
  integrale(5, "Que reste-t-il de nos amours ?", "1941-1943"),
  integrale(6, "L’âme des poètes", "1939-1951", { links: [`Lire notre article ${onSite("/articles/57-le-vol-6-de-l-integrale-pour-vos-fetes", "L’intégrale 6")}`] }),
  integrale(7, "Formidable", "1947-1951"),
  integrale(8, "La folle complainte", "1951-1952"),
  integrale(9, "En avril à Paris", "1952-1953", { links: [`Lire notre article ${onSite("/articles/92-le-vol-9-de-l-integrale-en-avril-a-paris-1952-1953", "L’intégrale 9")}`] }),
  integrale(10, "Moi, j’aime le music-hall", "1949-1955"),
  integrale(11, "Le jardin extraordinaire", "1955-1957"),
  integrale(12, "Le piano de la plage", "1956-1959"),
  integrale(13, "Qu’est devenue la Madelon ?", "1956-1960", { ref: "FA 093", asin: "B0CCW8HB83", cover: "integrale-vol-13.jpg" }),
  integrale(14, "Narbonne mon amie", "1957-1961", { ref: "FA 094", asin: "B0D7DBMYSZ", cover: "integrale-vol-14.jpg" }),
  integrale(15, "Kangourou", "1960-1962", { ref: "FA 095", discs: "Coffret CD avec livret", asin: "B0FMFSHDPS", cover: "integrale-vol-15.jpg" }),
  integrale(16, "Poésie", "1932-1955", {
    ref: "FA 096", discs: "Coffret 3 CD avec livret", asin: "B0H6GP5F7L", cover: "integrale-vol-16.jpg",
    note: "Rattrapages, inédits, raretés et enregistrements publics, dont la toute première chanson de Charles Trenet enregistrée.",
  }),
];

export const DISCS: Fiche[] = [
  disc("Anthologie I", ["8 CD", "EMI France – Capitol Music"], "cd-anthologie1.jpg"),
  disc("Anthologie II – Raretés et inédits", [
    "7 CD : Je rechante mes chansons en stéréo, Bonsoir jolie madame, Morceaux choisis par l’auteur, Grand Mama it’s New York, Chansons sans époque et le récital au théâtre de l’Étoile (2 CD, 1952)",
    "EMI France – Capitol Music",
  ], "rarete-inedits.jpg"),
  disc("La vie en mauve", [
    "2 CD et livret illustré par Cabu",
    "Auteurs : Stéphane Ollivier, Karine Le Bail et Philippe Tétart",
    "Radio France et BD Jazz, collection « Les Greniers de la mémoire »",
  ], "cd-la-vie-en-mauve.jpg"),
  disc("Récital de l’Étoile, Paris, 1952", ["2 CD", "EMI France"], "cd-etoile-1952.jpg"),
  disc("Concert à La Varenne-Saint-Hilaire en 1954 (inédit)", ["1 CD, notes en français et en anglais", "Abeille Musique – INA, Mémoire vive"], "cd-la-varenne.jpg",
    [`Lire notre article ${onSite("/articles/80-recital-inedit-a-la-varenne-en-1954", "Récital inédit à La Varenne, 1954")}`]),
  disc("Les grands moments de l’Olympia : Charles Trenet, 1956", ["1 CD", "EMI France"], "cd-olympia-1956.jpg"),
  disc("Trenet, l’album Barclay", ["1 CD", "Universal Music, division Barclay"], "cd-barclay.jpg"),
  disc("Olympia 75 (extraits du récital)", ["1 CD", "CBS"], "olympia-75.jpg"),
  disc("Au bal de la nuit", ["Les chansons de la période CBS, 1 / 2 (1971-1976)", "1 CD", "Sony BMG"], "cbs-2.jpg"),
  disc("Juste pour rire", ["Les chansons de la période CBS, 2 / 2 (1981-1986)", "1 CD", "Sony BMG"], "cbs-1.jpg"),
  disc("Récital de 1987 au Théâtre des Champs-Élysées", ["1 CD", "EMI France"], "cd-mumm.jpg"),
  disc("Le récital de la tournée triomphale 1993-1994", ["1 CD", "EMI France"], "recital.jpg"),
  disc("Mon cœur s’envole (1992)", ["1 CD", "Warner Bros"], "coeur-senvole.jpg"),
  disc("Fais ta vie (1995)", ["1 CD", "Warner Bros"], "fais-ta-vie.jpg"),
  disc("Les poètes descendent dans la rue (1999)", ["1 CD", "Warner Bros"], "poetes-rues.jpg"),
  disc("Charles Trenet à Pleyel (1999)", ["1 CD", "Warner Bros"], "cd-pleyel.jpg",
    [`Lire notre article ${onSite("/articles/30-pleyel-99-les-derniers-feux", "Les derniers feux")}`]),
  disc("Je n’irai pas à Notre-Dame (2006)", ["1 CD", "Warner Bros"], "notre-dame.jpg"),
];

// --- Bibliographie autour de Charles Trenet ------------------------------------------

const book = (title: string, by: string | undefined, lines: string[], covers: string[], links?: string[]): Fiche => ({ title, by, lines, covers, links });

export const BOOKS: Fiche[] = [
  book("Charles Trenet", "par Marc Andry", ["Calmann-Lévy, collection « Masques et visages », 1953"], ["andry.jpg"]),
  book("Charles Trenet", "par Michel Perez", [
    "Seghers, collection « Poètes d’aujourd’hui », 1964",
    "Rééditions en 1979, avec et sans photo",
    "Édition de 2002, « Charles Trenet, sa vie, ses chansons », collection « Seghers : Poésie et chansons », entièrement revue et réécrite par Richard Cannavo",
  ], ["perez-1964.jpg", "perez.jpg", "perez-1979-2.jpg", "perez-2002.jpg"]),
  book("Charles Trenet, la route enchantée", "préface de Serge Gainsbourg", ["Le Temps singulier, 1981"], ["route-enchantee.jpg"]),
  book("Trenet", "par Geneviève Beauvarlet", ["Bréa, 1983"], ["beauvarlet.jpg"]),
  book("La ballade de Charles Trenet", "par Richard Cannavo", ["Le Seuil, collection « Point virgule », 1988"], ["ballade.jpg", "cannavo.jpg"]),
  book("Trenet par Trenet", "par Pierre Saka", ["Éditions n° 1, 1993"], ["saka.jpg", "trenet-par-trenet-2.jpg"]),
  book("L’âme d’un poète", "par Jacques Pessis", ["Plon, 1993"], ["ame-poete.jpg"]),
  book("Monsieur Trenet", "par Richard Cannavo, illustrations de Cabu", ["Biographie", "Lieu Commun – Edima, 1993"], ["monsieur-trenet.jpg", "cannavo-siecle-liberte.jpg", "cannavo-dedicace.jpg"]),
  book("Charles Trenet, la vie qui chante", "par Fabienne Pavia", ["Solar, 1993"], ["vie-qui-chante.jpg"]),
  book("Le grand Charles, le roman de Charles Trenet", "par Stéphane Hoffmann", ["Albin Michel, 1998"], ["hoffman.jpg"]),
  book("Le Trenet", "illustré par Natali", ["Recueil de 19 chansons", "Mango Jeunesse, 1999"], ["letrenet.gif"]),
  book("Charles Trenet", "par Pascal Bussy", ["Librio, 1999"], ["libris.gif"]),
  book("Trenet illustré", "par Dupuy-Berberian", ["Albin Michel, collection « Les chanteurs s’illustrent », 2000"], ["trenetillustre.gif"]),
  book("Charles Trenet", "par Noël Balen", ["Éditions du Rocher, 2001"], ["balen.gif"]),
  book("Charles Trenet… sur parole", "par Jacques Percioy", ["Didier Carpentier, 2001"], ["trenet-sur-parole.jpg"]),
  book("De Charles d’Orléans à Charles Trenet", "par Pierre Delanoë", ["Anthologie et portraits de la poésie française", "Le Layeur, 2000"], ["anthologie.jpg"]),
  book("Charles Trenet, appelez-moi à 11 heures précises", "par Christian Lebon", ["Didier Carpentier, 2008"], ["appelez-moi.jpg"]),
  book("Bulles enchantées", "illustré par Filipandré", ["Éditions DS, 1993"], ["bulles-enchantees.jpg"]),
  book("Charles Trenet", "<em>Europe</em>, revue littéraire mensuelle", ["Numéro 805, mai 1996"], ["europe.jpg"]),
  book("Madame la pluie", "illustré par Hélène Vincent", ["Limaille, 1993"], ["madame-la-pluie.jpg", "madame-la-pluie-2.jpg"]),
  book("Mam’zelle Clio, lettres d’amour à Charles Trenet", "par André Coutin", ["L’Harmattan, 2002"], ["mamzelle-clio.jpg"]),
  book("Charles Trenet", "illustré par Pascal Rabaté", ["Bande dessinée et double CD", "BD Music"], ["rabate.jpg", "rabate-2.jpg"],
    [onSite("/forum/sujet/385-rabate-dessine-trenet", "La discussion sur le forum")]),
  book("Charles Trenet, 50 ans de chansons, 50 ans d’images", "par Jacques Pessis et Jacques Lapelle", ["Flammarion, collection « Beaux livres », 2008"], ["trenet-50ans.jpg"]),
  book("Une noix", "illustrations de M. Guiré-Vaka", ["Hachette, collection « Le Vert Paradis » (jeunesse), 1974"], ["une-noix.jpg"]),
  book("Charles Trenet, une vie enchantée", "par Sandro Cassati", ["City Éditions, 2011"], ["une-vie-enchantee.jpg"]),
  book("L’affaire Trenet, bataille pour un héritage", "par Julien Jouanneau", ["Éditions du Rocher, 2009"], ["affaire-trenet.jpg"],
    [`Lire ${onSite("/articles/91-l-affaire-trenet-la-contre-attaque-de-trenetophiles", "quelques extraits")}`]),
  book("La folle jeunesse de Charles Trenet", "par Bernard Revel", ["Mare Nostrum, Perpignan, 2002"], ["follejeunesse.jpg"],
    [`Lire ${onSite("/articles/55-le-coq-catalan-1-2", "quelques extraits")}`]),
  book("Trenet, le philosophe du bonheur", "par Jacques Pessis", ["L’Archipel, 2011"], ["trenet-philosophe.jpg"]),
  book("La France de Charles Trenet", "par Jacques Pessis", ["Richer – Hoa-Qui – Vilo, 1989"], ["france-trenet.jpg", "livre-la-france-2.jpg"]),
  book("Le roman de Charles Trenet", "par Nelson Monfort", ["Éditions du Rocher, 2013"], ["livre-monfort.jpg"]),
  book("Trenet méconnu", "par Vincent Lisita", ["Les Échappés, 2013"], ["trenet-meconnu.jpg"]),
  book("Piaf-Trenet, le dîner extraordinaire", "par Jacques Pessis", ["Don Quichotte, 2013"], ["diner-extraordinaire.jpg"]),
  book("Charles Trenet, à ciel ouvert", "par Jean-Philippe Ségot", ["Fayard, 2013"], ["ciel-ouvert.jpg"]),
  book("La vie qui va", "textes de Charles Trenet réunis par Vincent Lisita, illustrés par Cabu", ["Robert Laffont, 2018"], ["la-vie-qui-va.jpg"],
    [amazon("222121546X"), `Lire notre article ${onSite("/articles/161-trenet-cabu-la-vie-qui-va", "Trenet &amp; Cabu, la vie qui va")}`]),
  book("La révolution Trenet", "par Valentin Schmite", ["EPA, 2021"], ["revolution-trenet.jpg"], [amazon("237671267X")]),
  book("Charles Trenet, que reste-t-il du fou chantant ?", "par Noël Balen", [`${FREMEAUX} – Pollen, 2026`], ["que-reste-t-il-du-fou-chantant.jpg"], [amazon("2382834404")]),
];

// --- Bibliographie de ses œuvres: read from the article --------------------------------

/** His titles, in capitals on the old page. */
const WORK_TITLES: Record<string, string> = {
  "DODO MANIERES": "Dodo Manières",
  "LA BONNE PLANETE": "La bonne planète",
  "UN NOIR EBLOUISSANT": "Un noir éblouissant",
  "MES JEUNES ANNEES RACONTEES PAR MA MERE ET MOI": "Mes jeunes années racontées par ma mère et moi",
  "PIERRE, JULIETTE ET L'AUTOMATE": "Pierre, Juliette et l’automate",
  "CHARLES TRENET, OEUVRES D'ETERNELLE JEUNESSE : DODO MANIERES et LA BONNE PLANETE": "Œuvres d’éternelle jeunesse : Dodo Manières et La bonne planète",
  "LES ROIS FAINÉANTS": "Les Rois fainéants",
  "BOUM, CHANSONS FOLLES": "Boum, chansons folles",
  "LE JARDIN EXTRAORDINAIRE": "Le jardin extraordinaire",
  "TOMBE DU CIEL, L'INTEGRALE": "Tombé du ciel, l’intégrale",
  "LE TRENET": "Le Trenet",
  "CHARLES TRENET, Y'a d'la joie – L'intégrale des chansons": "Y’a d’la joie, l’intégrale des chansons",
};

const BULLET = /<img\b[^>]*src="\/media\/image1\.gif"[^>]*>\s*/;
const IMG = /<img\b[^>]*src="\/media\/([^"]+)"[^>]*>/g;
const inner = (block: string) => block.replace(/^<p>|<\/p>$/g, "");
const tidy = (s: string) => s.replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");

/** The entries of "Bibliographie de ses œuvres", from its blocks (one per line). */
export function readWorks(blocks: string[]): Fiche[] {
  const fiches: Fiche[] = [];
  let i = 0;
  while (i < blocks.length) {
    const head = inner(blocks[i]!);
    if (!BULLET.test(head)) throw new Error(`Bibliographie de ses œuvres: unexpected block: ${head.slice(0, 80)}`);
    const [rawTitle, ...rest] = head.replace(BULLET, "").split(/<br>/);
    const key = tidy(rawTitle!);
    const title = WORK_TITLES[key];
    if (!title) throw new Error(`Bibliographie de ses œuvres: no title for ${key}`);
    i++;
    // References and covers: in the head itself, or in the next block
    const refs = rest.length ? rest : inner(blocks[i++] ?? "").split(/<br>/);
    const lines: string[] = [], covers: string[] = [], labels: string[] = [];
    for (const seg of refs) {
      const imgs = [...seg.matchAll(IMG)].map((m) => m[1]!);
      const text = tidy(seg.replace(IMG, ""));
      if (imgs.length) covers.push(...imgs);
      if (!text) continue;
      (covers.length ? labels : lines).push(text);
    }
    const text: string[] = labels.map((l) => `<p class="fiche-label">${l.replace(/\s*:$/, "")}</p>`);
    const links: string[] = [];
    while (i < blocks.length && !BULLET.test(blocks[i]!)) {
      const b = blocks[i++]!;
      if (/^<p><a [^>]*amazon[^>]*>Voir sur Amazon<\/a><\/p>$/.test(b)) links.push(inner(b));
      else if (/^<p>[^<]{0,90}:\s*<\/p>$/.test(b)) text.push(`<p class="fiche-label">${tidy(inner(b)).replace(/\s*:$/, "")}</p>`);
      else text.push(b);
    }
    // "Roman", "Essai biographique": the kind of book, under the title
    const by = lines[0] && /^<em>[^<]*<\/em>/.test(lines[0]) ? lines.shift() : undefined;
    fiches.push({ title, by: by?.replace(/<\/?em>/g, ""), lines, covers, links, text: text.join("\n") });
  }
  return fiches;
}

// --- Applying them ---------------------------------------------------------------------

const cut = (html: string, marker: string, id: number) => {
  const at = html.indexOf(marker);
  if (at < 0) throw new Error(`Catalogue of article ${id}: marker not found: ${marker}`);
  return at;
};

/** The article's HTML, its entries rebuilt as cards (articles 17, 34 and 40). */
export function applyCatalog(id: number, html: string): string {
  const render = (list: Fiche[]) => list.map((f) => renderFiche(f, html)).join("\n");
  if (id === 34) {
    const intro = html.slice(0, cut(html, "<p>DISCOGRAPHIE SELECTIVE</p>", id));
    const about = /<p>L'intégrale Frémeaux[\s\S]*?<\/p>/.exec(html)?.[0];
    if (!about) throw new Error("Discography: the Intégrale paragraph is missing");
    return nbsp(`${intro.trimEnd()}
<h2>L’Intégrale Frémeaux &amp; Associés</h2>
${about}
<div class="fiches">
${render(INTEGRALE)}
</div>
<h2>Anthologies, récitals et albums</h2>
<div class="fiches">
${render(DISCS)}
</div>`);
  }
  if (id === 40) {
    const intro = html.slice(0, cut(html, "<p>BIBLIOGRAPHIE AUTOUR DE CHARLES TRENET</p>", id));
    return nbsp(`${intro.trimEnd()}
<h2>Bibliographie sélective</h2>
<div class="fiches">
${render(BOOKS)}
</div>`);
  }
  if (id === 17) {
    const start = "<p><strong>BIBLIOGRAPHIE DES OEUVRES DE CHARLES TRENET</strong></p>";
    const songs = "<p>QUELQUES RECUEILS DE TEXTES DE CHANSONS</p>";
    const intro = html.slice(0, cut(html, start, id));
    const blocks = (s: string) => s.split("\n").map((b) => b.trim()).filter((b) => b && !/^<hr\/?>$/.test(b));
    const works = blocks(html.slice(cut(html, start, id) + start.length, cut(html, songs, id)));
    let collections = blocks(html.slice(cut(html, songs, id) + songs.length));
    // The manuscript page at the very end belongs to no entry
    const last = collections.at(-1)!;
    const tail = /^<p><img\b[^>]*><\/p>$/.test(last) ? (collections = collections.slice(0, -1), last) : "";
    return nbsp(`${intro.trimEnd()}
<h2>Ses romans et récits</h2>
<div class="fiches">
${render(readWorks(works))}
</div>
<h2>Quelques recueils de textes de chansons</h2>
<div class="fiches">
${render(readWorks(collections))}
</div>
${tail}`);
  }
  return html;
}
