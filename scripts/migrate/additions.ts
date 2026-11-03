/**
 * New content, written after the old site: entries added to existing articles
 * (the discography and the "Bibliographie autour" are in catalogs.ts). Applied by the migration to the cleaned HTML,
 * so they are part of the article (search, excerpts) like the rest.
 *
 * Their images live in content/media/ (the migration copies them to
 * public/media/). Each addition is inserted before a piece of the article
 * (`before`), or at its end; a missing anchor fails the migration.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { imageSize } from "./media.ts";

export const CONTENT_MEDIA = join(import.meta.dir, "../../content/media");

/** A cover from content/media, shown at half its pixel size (sharp on retina screens). */
export function cover(file: string, cls = "float-left"): string {
  const size = imageSize(readFileSync(join(CONTENT_MEDIA, file)));
  if (!size) throw new Error(`content/media/${file}: unknown image size`);
  return `<img src="/media/${file}" width="${Math.round(size.width / 2)}" height="${Math.round(size.height / 2)}" alt="" loading="lazy" decoding="async" class="${cls}">`;
}
const amazon = (asin: string) => `<a href="https://www.amazon.fr/dp/${asin}" rel="noopener nofollow">Voir sur Amazon</a>`;

interface Addition {
  article: number;
  /** Insert before this (exact) piece of the article's HTML; at the end if absent. */
  before?: string;
  html: () => string;
}

export const ADDITIONS: Addition[] = [
  // --- Bibliographie de ses œuvres: his first novel, found again --------------------
  {
    article: 17,
    before: "<p>QUELQUES RECUEILS DE TEXTES DE CHANSONS</p>",
    html: () => `
<p><img height="13" width="15" src="/media/image1.gif" alt="" loading="lazy" decoding="async" class="inline-img"> LES ROIS FAINÉANTS</p>
<p><em>Roman inédit</em> – présentation et biographie de Charles Trenet par Vincent Lisita, préface de Patrick Frémeaux<br>Editions Frémeaux &amp; Associés / Pollen - Paris – 2026.<br>${cover("rois-faineants.jpg")}</p>
<p><strong>Le premier roman de Charles Trenet, que l’on croyait perdu.</strong> En 1930, à dix-sept ans, il « monte » à Paris avec, dans sa valise, deux cents feuillets : <em>Les Rois fainéants</em>. Les éditeurs le refusent, mais ce manuscrit le conduit vers Max Jacob, puis Jean Cocteau. Trenet lui-même le pensait disparu à jamais.</p>
<p>C’est à <strong>Vincent Lisita</strong> que l’on doit de pouvoir enfin le lire. Historien d’art, spécialiste de Charles Trenet, auteur de <em>Trenet méconnu</em>, maître d’œuvre de <em>La vie qui va</em> et directeur de l’Intégrale chez Frémeaux, il a retrouvé le manuscrit et l’a publié pour la première fois, avec une présentation et une biographie du poète. Un très beau travail de chercheur passionné, qui rend à Charles Trenet son tout premier livre.</p>
<p>Présentation de l’éditeur :</p>
<p><em>Ce manuscrit marque sa première entreprise d’envergure : on y retrouve sa sensibilité à fleur de peau et sa joie de vivre, l’ironie, la nostalgie, l’humour, mais aussi la culture littéraire et historique qui nourriront plus tard ses chansons. […] Ce roman de jeunesse n’est pas seulement l’essai d’un apprenti écrivain : il constitue l’acte de naissance littéraire de celui qui allait révolutionner la chanson française.</em></p>
<p>${amazon("238283370X")}</p>
`,
  },
];

/** French typography in text (not in tags): no line break before ? ! : ; » or after «. */
export const nbsp = (html: string) =>
  html.replace(/(<[^>]*>)|([^<]+)/g, (_, tag: string | undefined, text: string | undefined) =>
    tag ?? text!.replace(/ ([?!:;»])/g, "\u00a0$1").replace(/« /g, "«\u00a0"));

/** The article's HTML with its additions. */
export function applyAdditions(articleId: number, html: string): string {
  let out = html;
  for (const a of ADDITIONS.filter((x) => x.article === articleId)) {
    const add = nbsp(a.html().trim());
    if (!a.before) {
      out = `${out.trimEnd()}\n${add}`;
      continue;
    }
    const at = out.indexOf(a.before);
    if (at < 0) throw new Error(`Addition to article ${articleId}: anchor not found: ${a.before}`);
    out = `${out.slice(0, at)}${add}\n${out.slice(at)}`;
  }
  return out;
}

// --- Agenda --------------------------------------------------------------------------

export interface AgendaAddition { id: number; title: string; event_date: string; body_html: () => string; url: string | null }

/** Events announced after the old site (ids after the old ones). */
export const AGENDA_ADDITIONS: AgendaAddition[] = [
  {
    id: 101,
    title: "Belgique - Bruxelles - Y’a d’la joie ! Nelson Monfort raconte et chante Charles Trenet",
    event_date: "2026-11-29T15:00:00.000Z", // 16 h in Brussels
    url: null, // the booking link is in the announcement
    body_html: () => `
<p><strong>Dimanche 29 novembre 2026 à 16 h</strong></p>
<p>${cover("ya-d-la-joie-nelson-monfort.jpg", "float-right")}<strong>Y’A D’LA JOIE !</strong><br>Nelson Monfort raconte et chante Charles Trenet<br>Nicolas Dewaelheyns présente</p>
<p>Le plus célèbre des journalistes sportifs dans son seul-en-scène « Y’a d’la joie ! » : un voyage culturel, passionné et truffé d’anecdotes savoureuses sur la vie, la carrière exceptionnelle et les plus grandes chansons du Fou chantant. Un hommage vibrant porté par la verve et l’élégance inimitables de Nelson Monfort, auteur du <a href="/articles/40-bibliographie-autour-de-charles-trenet"><em>Roman de Charles Trenet</em></a> (Éditions du Rocher, 2013).</p>
<p>Places limitées : réservez dès maintenant pour ne pas manquer cette date exclusive !</p>
<p><strong>Théâtre Vita, sous la basilique de Koekelberg – Bruxelles<br>Réservations : <a href="https://www.resevents.be/" rel="noopener nofollow">www.resevents.be</a></strong></p>`,
  },
];

export const agendaAdditions = () => AGENDA_ADDITIONS.map((a) => ({ ...a, body_html: nbsp(a.body_html().trim()) }));
