/**
 * New content, written after the old site: entries added to existing articles
 * (discography, bibliographies). Applied by the migration to the cleaned HTML,
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
function cover(file: string, cls = "float-left"): string {
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

const integrale = (o: { vol: number; years: string; title: string; ref: string; discs: string; asin: string; image: string; note?: string; cds: string[] }) => `
<p>Charles Trenet – Intégrale vol. ${o.vol} – ${o.years} - « ${o.title} » <br>Label : Frémeaux &amp; Associés (${o.ref})<br>${o.discs}<br>Direction artistique : Pascal Halbeher et Vincent Lisita – collection Daniel Nevers<br>${amazon(o.asin)}<br>${cover(o.image)}</p>
${o.note ? `<p><em>${o.note}</em></p>\n` : ""}${o.cds.map((cd, i) => `<p><strong>CD ${i + 1} :</strong><br>${cd}</p>`).join("\n")}`;

const book = (o: { image: string; title: string; by: string; publisher: string; asin: string; label: string; text: string; extra?: string }) => `
<p>${cover(o.image)}<br>${o.title}<br><em>${o.by}</em><br>${o.publisher}</p>
<p><em><u>${o.label}</u> : <br>${o.text}</em></p>
<p>${amazon(o.asin)}${o.extra ? ` – ${o.extra}` : ""}</p>`;

export const ADDITIONS: Addition[] = [
  // --- Sa discographie… disponible ! : the Intégrale, volumes 13 to 16 -------------
  {
    article: 34,
    before: "<p>Charles Trenet, Anthologie I - <br>",
    html: () =>
      [
        integrale({
          vol: 13, years: "1956 - 1960", title: "Qu’est devenue la Madelon ?", ref: "FA 093", discs: "Coffret 2 CD avec livret",
          asin: "B0CCW8HB83", image: "integrale-vol-13.jpg",
          cds: [
            "Rendez-vous sous la pluie – C’était… c’était… c’était… – Les trois roses – Vivre en chantant – Pauvre Georges André – En tournée – Les corbeaux – C’est le Rhône qui ronronne (par Mouloudji) – Les mites (par Claude Prats, alias Claude Trenet) – Sonate pour violon et piano n° 6 (par Lucien Trenet) – Printemps à Paris – Les coupeurs de bois (par les Trois Ménestrels) – I wish you love (par Keely Smith) – A million stars above (par Petula Clark) – La maison du poète (par Benny Vasseur et André Paquinet) – En avril à Paris (par Alexis Weissenberg) – Vous qui passez sans me voir (par les Peters Sisters) – Moi, j’aime le music-hall (par les Wackadous) – <em>Récital à Tokyo, salle Hibiya :</em> En avril à Paris – La petite musique – Mes jeunes années – Le jardin extraordinaire – Papa pique et maman coud – Le piano de la plage – Berceuse – Coin de rue – La polka du roi – L’âme des poètes (en japonais) – La mer (en japonais).",
            "Cha cha boum – Le grand café (par Marcel Amont) – J’ai ta main (par Milt Jackson, Barney Wilen, Percy Heath et Kenny Clarke) – J’ai mordu dans le fruit (par Zack Matalon) – Le jardin extraordinaire (par Eddie Barclay et son grand orchestre) – Boum (par Tommy Desserre à l’orgue de cinéma) – Valse des amours passées (par Alec Siniavine) – Beyond the sea (par Bobby Darin) – Le piano de la plage (par Hazel Scott) – Un jour vous comprendrez – Rome (par Jean-Claude Pascal) – Le piano de la plage (par Gérard Brumières) – Panorama Charles Trenet (par Jean Leccia) – Le soleil et la lune (par Vanny Cogan et Laurent Marchat) – L’âme des poètes (par les Djinns) – Source d’or – Cloches, sonnez ! – La bonne planète – Sacré farceur – Le jongleur – Par la porte entr’ouverte – Les petits regrets – Obéis au bey ! – Rien ne peut changer ma joie – Je fais la course avec le train – La mer (avec les Petits Chanteurs à la Croix de Bois) – Dis-moi quel est ton nom… – Les soldats – Qu’est devenue la Madelon ? – Barcelone.",
          ],
        }),
        integrale({
          vol: 14, years: "1957 - 1961", title: "Narbonne mon amie", ref: "FA 094", discs: "Coffret 2 CD avec livret",
          asin: "B0D7DBMYSZ", image: "integrale-vol-14.jpg",
          cds: [
            "Les chansons de la nuit – Le jardin extraordinaire – La maison du poète – Fleur bleue – À ciel ouvert (par Patricia Lamour et son orgue) – Je chante (par Armand Migiani) – Les enfants s’ennuient le dimanche (par Toots Thielemans et le trio Ray Bryant) – Du, du gehst an mir vorbei / Vous qui passez sans me voir – Rien ne peut changer ma joie – Cloches, sonnez ! – Ménilmontant – Rome – Lorelei – Sacré farceur (avec Claude Bessy) – I wish you love (par Nancy Wilson) – <em>« Je re-chante ! Mes anciennes chansons en stéréo » :</em> Je chante – Verlaine – Le grand café – Pigeon vole – La biguine à Bango – Boum – Fleur bleue – Retour à Paris – Ah ! dis, ah ! dis, ah ! bonjour – La cigale et la fourmi – Il pleut dans ma chambre – Y’a d’la joie ! – Moi, j’aime le music-hall – La jolie sardane – La mer (par Hiroshi Ashino).",
            "Patronages – Le soleil a des rayons de pluie – C’est bon – L’héritage infernal – La romance de Paris – Source bleue – Près de toi mon amour (par Yves Montand) – Bonsoir jolie Callas – Quand vous entendrez Maria – En attendant ma belle – Elle chante / Y’a d’la joie ! – Frère Jacques (avec Gilbert Bécaud, Luis Mariano, Henri Salvador et Maria Callas) – Interview de Maria Callas par Charles Trenet – Bonsoir jolie Genève – J’ai ta main (par Jack Diéval et le J.A.C.E. All-Stars) – Nuit d’hiver (par Hubert Clavecin) – Ma rivière – Quand un facteur s’envole – Narbonne mon amie – Vous oubliez votre cheval – La folle complainte – Qu’est devenue la Madelon ? (par Jean-Louis Guérin) – Mourir au printemps (par Corinne Marchand) – Les voix du ciel – Orphée – La plus belle nuit – Narbonne mon amie – Les relations mondaines – Les voix du ciel (par les Djinns) – Orphée (par Katia Valère) – En avril à Paris / April in Paris (par Joséphine Baker) – Monsieur Trenet (par René-Louis Lafforgue).",
          ],
        }),
        integrale({
          vol: 15, years: "1960 - 1962", title: "Kangourou", ref: "FA 095", discs: "Coffret CD avec livret",
          asin: "B0FMFSHDPS", image: "integrale-vol-15.jpg",
          cds: [
            "Présentation des spectacles de Charles Trenet et d’Édith Piaf à Paris (avec Juliette Gréco) – <em>Récital 1961 au Théâtre de l’Étoile :</em> pot-pourri – Qu’est devenue la Madelon ? – Rien ne peut changer ma joie – Dis-moi, quel est ton nom ? – Bonsoir jolie madame – Le piano de la plage – La folle complainte – Dans les pharmacies – Boum – Orphée – La java du diable – Les voix du ciel – Le jardin extraordinaire – La mer – Y’a d’la joie ! – Les trois roses (par Claude Chevalier et son musette) – Nuit d’hiver – Les petits regrets – Les soldats – Les voix du ciel (par Danielle Darrieux) – Kangourou – La p’tit’ Didi – Au fil du temps perdu – Le pauvre Antoine – Tu reverras l’île Maurice (This is you) – Toi qui passais – La mer (par René Glaneau, en polonais).",
            "La chanson est un art mineur – Ma philosophie – Kangourou – Au clair de la lune – I wish you love (par Dean Martin) – La valse à tout le monde (par Lucienne Delyle) – L’horrible tango (version Gomina) – Jardin du mois de mai – Si loin de ton amour – Lundi au lit (Les bruits de Paris) – I wish you love (par Duke Ellington) – L’horrible tango (par Janine Wolf) – Au fil du temps perdu – Retour à Paris / Hello Paris – Que reste-t-il de nos amours ? / How much remains of all our loves ? – Le piano de la plage – En ce temps-là – Dis-moi, quel est ton nom ? – En Seine-et-Oise – Vous oubliez votre cheval – Why do you pass me by ? (par Caterina Valente) – Le grand partage – Jeunesse plumée – Adieu mes beaux rivages – Annie-Anna – Le grand partage (par Colette Renard) – Simple et légère – Marie Marie – L’inquiet – Je twiste.",
          ],
        }),
        integrale({
          vol: 16, years: "1932 - 1955", title: "Poésie", ref: "FA 096", discs: "Coffret 3 CD avec livret – rattrapages, inédits, raretés et enregistrements publics",
          asin: "B0H6GP5F7L", image: "integrale-vol-16.jpg",
          note: "Un volume de trésors : la toute première chanson de Charles Trenet enregistrée, des maquettes et des chansons inédites, et des récitals jamais publiés. Une sélection parmi les 101 titres du coffret :",
          cds: [
            "Hélène (par Hélène Régelly : la première chanson de Charles Trenet enregistrée, en 1932) – Sais-tu ? (par Robert Burnier) et Pourquoi ces p’tits trucs-là ? (par Jean Dunot), du film <em>Bariole</em> – dix publicités chantées par Charles et Johnny (Brunswick, Lévitan, Thé des Familles, Lory) – Le prince (par Morgane, son unique enregistrement connu) – J’aime une rivière (par Germaine Sablon) – Ma ville (par Jean-Fred Mélé) – L’amour m’a (par Henri Vertal) – Le courrier du fou chantant (rubrique radiophonique) – La mer (la genèse, 1942) – Poésie (inédite) – Colin-maillard (inédite).",
            "La folle complainte (maquette) – Enfant, ta tante t’attend (maquette inédite) – Folie du rythme (par Claude Trenet, inédite) – Les gendarmes s’endorment sous la pluie (maquette inédite) – Prosper… (Yop la boum !) et un poème improvisé – How much remains of all our loves ? – C’était… c’était… c’était… (par Marie-Louise Caussat-Trenet, sa mère) – Les mites (première version) – Buenas noches Buenos Aires – Caboclo – Dans le bois de Chapultepec et La barbe (débuts de chansons inédites).",
            "<em>Théâtre des Champs-Élysées :</em> Un air qui vient de chez nous – Au clair de la lune – <em>Récital salle Pleyel, 3 mars 1947 :</em> Tombé du ciel (couplet inédit) – Le retour des saisons (version inédite) – Sur le fil – La mer (a cappella) – N’y pensez pas trop (avec Ray Ventura) – Seul depuis toujours – Berceuse – (All of a sudden) My heart sings – Boum – Quand un bateau blanc (au Moulin Rouge).",
          ],
        }),
      ].join("\n"),
  },

  // --- Bibliographie autour de Charles Trenet: three books, by date -----------------
  {
    article: 40,
    html: () =>
      [
        book({
          image: "la-vie-qui-va.jpg", title: "LA VIE QUI VA", by: "Textes de Charles Trenet réunis par Vincent Lisita, illustrés par Cabu",
          publisher: "Editions Robert Laffont, 2018", asin: "222121546X", label: "Présentation de l’éditeur",
          text: "Œuvre posthume de deux créateurs de génie, ce livre réalise l’un des derniers rêves de Cabu : illustrer un recueil des meilleurs textes de Charles Trenet en dehors de ses chansons. Des centaines d’écrits de tonalité et de genre divers, nés au fil du temps et de la plume, parus pour la plupart dans des journaux ou restés inédits. Retrouvés et rassemblés par Vincent Lisita, ils constituent l’« œuvre parallèle » du Fou chantant, demeurée jusqu’ici inaccessible en raison de son éparpillement.",
          extra: `lire aussi notre article <a href="/articles/161-trenet-cabu-la-vie-qui-va">Trenet &amp; Cabu, la vie qui va</a>`,
        }),
        book({
          image: "revolution-trenet.jpg", title: "LA RÉVOLUTION TRENET", by: "par Valentin Schmite",
          publisher: "Editions EPA, 2021", asin: "237671267X", label: "Présentation de l’éditeur",
          text: "Passerelle entre Jacques Prévert, Stevie Wonder, Michel Houellebecq et François Mitterrand, Charles Trenet est à l’origine d’une révolution de rythme et de mots qui dépasse les frontières de son art. Influencé par le jazz et le surréalisme, il offre au grand public, dès les années 1930, un vocabulaire nouveau. […] Cet ouvrage met en image et en lumière la place singulière d’une des œuvres les plus marquantes du XX<sup>e</sup> siècle, entre humour et poésie, joie et mélancolie.",
        }),
        book({
          image: "que-reste-t-il-du-fou-chantant.jpg", title: "CHARLES TRENET – QUE RESTE-T-IL DU FOU CHANTANT ?", by: "par Noël Balen",
          publisher: "Editions Frémeaux &amp; Associés / Pollen, 2026", asin: "2382834404", label: "Présentation de l’éditeur",
          text: "Une biographie qui suit la discographie de Charles Trenet. Noël Balen retrace la vie du chanteur en mêlant récit intime et contexte historique. […] Le livre montre comment ce « fou chantant » transforme ses blessures et son émerveillement en poésie. Balen interroge aussi le mythe Trenet, entre légèreté apparente et zones d’ombre. C’est à la fois une biographie sensible et une réflexion sur ce qu’il reste d’une icône de la chanson française.",
        }),
      ].join("\n"),
  },

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
const nbsp = (html: string) =>
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
