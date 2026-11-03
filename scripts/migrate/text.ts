/**
 * Text helpers for the migration: entity decoding, legacy-encoding repair,
 * slugs, accent restoration and smart casing of ALL-CAPS titles.
 */

// --- Encoding repair ------------------------------------------------------

/**
 * Windows-1252 code points 0x80–0x9F. Some legacy pages were typed on a Mac and
 * mix Mac Roman bytes (é = 0x8E, è = 0x8F, à = 0x88…) with genuine CP1252
 * punctuation (’ = 0x92, œ = 0x9C, … = 0x85) in the *same* file. We therefore
 * use CP1252 except for the code points that never make sense in French CP1252
 * text, which are mapped to their Mac Roman letter.
 */
const HYBRID_C1: Record<number, string> = {
  0x80: "€", 0x81: "", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†",
  0x87: "á", 0x88: "à", 0x89: "â", 0x8a: "ä", 0x8b: "‹", 0x8c: "Œ", 0x8d: "ç",
  0x8e: "é", 0x8f: "è", 0x90: "ê", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”",
  0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "ô", 0x9a: "ö", 0x9b: "›",
  0x9c: "œ", 0x9d: "ù", 0x9e: "û", 0x9f: "ü",
};

/** Characters produced by decoding Mac Roman bytes as CP1252, mapped back. */
const MAC_MISDECODED: Record<string, string> = {
  "\u0081": "", "‡": "á", "ˆ": "à", "‰": "â", "Š": "ä", "\u008d": "ç", "Ž": "é",
  "\u008f": "è", "\u0090": "ê", "™": "ô", "š": "ö", "\u009d": "ù", "ž": "û", "Ÿ": "ü",
};

export function repairLegacyChars(s: string): string {
  return s.replace(/[\u0081‡ˆ‰Š\u008dŽ\u008f\u0090™šž\u009dŸ]/g, (c, i: number) => {
    // ™ and Ÿ are legitimate on their own; only treat them as Mac letters
    // when they sit inside a word.
    if ((c === "™" || c === "Ÿ" || c === "‰") && !(/\p{L}/u.test(s[i - 1] ?? "") || /\p{L}/u.test(s[i + 1] ?? ""))) return c;
    return MAC_MISDECODED[c] ?? c;
  });
}

// --- HTML entities ----------------------------------------------------------

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0",
  iexcl: "¡", cent: "¢", pound: "£", curren: "¤", yen: "¥", brvbar: "¦", sect: "§",
  uml: "¨", copy: "©", ordf: "ª", laquo: "«", not: "¬", shy: "\u00ad", reg: "®",
  macr: "¯", deg: "°", plusmn: "±", sup2: "²", sup3: "³", acute: "´", micro: "µ",
  para: "¶", middot: "·", cedil: "¸", sup1: "¹", ordm: "º", raquo: "»",
  frac14: "¼", frac12: "½", frac34: "¾", iquest: "¿", times: "×", divide: "÷",
  Agrave: "À", Aacute: "Á", Acirc: "Â", Atilde: "Ã", Auml: "Ä", Aring: "Å", AElig: "Æ",
  Ccedil: "Ç", Egrave: "È", Eacute: "É", Ecirc: "Ê", Euml: "Ë", Igrave: "Ì", Iacute: "Í",
  Icirc: "Î", Iuml: "Ï", ETH: "Ð", Ntilde: "Ñ", Ograve: "Ò", Oacute: "Ó", Ocirc: "Ô",
  Otilde: "Õ", Ouml: "Ö", Oslash: "Ø", Ugrave: "Ù", Uacute: "Ú", Ucirc: "Û", Uuml: "Ü",
  Yacute: "Ý", THORN: "Þ", szlig: "ß", agrave: "à", aacute: "á", acirc: "â",
  atilde: "ã", auml: "ä", aring: "å", aelig: "æ", ccedil: "ç", egrave: "è",
  eacute: "é", ecirc: "ê", euml: "ë", igrave: "ì", iacute: "í", icirc: "î", iuml: "ï",
  eth: "ð", ntilde: "ñ", ograve: "ò", oacute: "ó", ocirc: "ô", otilde: "õ", ouml: "ö",
  oslash: "ø", ugrave: "ù", uacute: "ú", ucirc: "û", uuml: "ü", yacute: "ý",
  thorn: "þ", yuml: "ÿ", OElig: "Œ", oelig: "œ", Scaron: "Š", scaron: "š", Yuml: "Ÿ",
  circ: "ˆ", tilde: "˜", ensp: " ", emsp: " ", thinsp: " ", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„",
  dagger: "†", Dagger: "‡", bull: "•", hellip: "…", permil: "‰", lsaquo: "‹",
  rsaquo: "›", euro: "€", trade: "™", hearts: "♥", larr: "←", rarr: "→",
};

function codePoint(n: number): string {
  if (n >= 0x80 && n <= 0x9f) return HYBRID_C1[n] ?? "";
  if (n === 0 || n > 0x10ffff) return "";
  return String.fromCodePoint(n);
}

/** Decode HTML entities. Handles the double-escaped `&amp;#142;` seen in titles. */
export function decodeEntities(s: string): string {
  const once = (t: string) =>
    t.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return codePoint(n);
      }
      // Named entities require the trailing ';' unless they are well known.
      const v = NAMED[e] ?? NAMED[e.toLowerCase()];
      if (v === undefined) return m;
      if (!m.endsWith(";") && !["amp", "lt", "gt", "quot", "nbsp", "copy", "eacute", "egrave", "agrave"].includes(e)) return m;
      return v;
    });
  let out = once(s);
  if (/&#\d+;|&[a-z]+;/i.test(out) && /&amp;(#\d+|[a-z]+);/i.test(s)) out = once(out);
  return out;
}

/** Normalise C1 numeric references inside HTML (keeps other markup intact). */
export function fixNumericRefs(html: string): string {
  return html
    .replace(/&amp;#(1[2-5]\d);/g, "&#$1;")
    .replace(/&#(1[2-5]\d);/g, (_, n: string) => HYBRID_C1[Number(n)] ?? "");
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h\d|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function collapseWs(s: string): string {
  return s.replace(/[\s\u00a0]+/g, " ").trim();
}

// --- Slugs ----------------------------------------------------------------

export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/œ/g, "oe").replace(/Œ/g, "OE").replace(/æ/g, "ae");
}

export function slugify(s: string, max = 80): string {
  const slug = fold(s)
    .toLowerCase()
    .replace(/['’`]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= max) return slug || "sans-titre";
  return slug.slice(0, max).replace(/-[^-]*$/, "") || slug.slice(0, max);
}

export class SlugRegistry {
  private used = new Set<string>();
  take(base: string): string {
    let slug = base;
    for (let i = 2; this.used.has(slug); i++) slug = `${base}-${i}`;
    this.used.add(slug);
    return slug;
  }
}

// --- Vocabulary built from clean text --------------------------------------

/**
 * Word statistics gathered from well-encoded, mixed-case French text (articles
 * and lyrics). Used to restore accents lost as "?" and to re-case titles that
 * were typed in capitals.
 */
export class Vocabulary {
  /** folded lowercase -> (exact form -> count) */
  private forms = new Map<string, Map<string, number>>();
  /** lowercase form -> count, for "?" repair candidates */
  private lower = new Map<string, number>();
  /** character bigram counts (with ^ and $ word boundaries) */
  private bigrams = new Map<string, number>();

  add(text: string) {
    for (const m of text.matchAll(/[\p{L}][\p{L}'’-]*/gu)) {
      let w = m[0].replace(/['’-]+$/, "");
      // Split elisions: l'homme -> homme
      w = w.replace(/^(?:[ldjmnstc]|qu|jusqu|lorsqu|puisqu)['’]/i, "");
      if (!w || w.length > 30) continue;
      // Ignore words written entirely in capitals: they carry no casing info
      // and are usually stripped of accents.
      if (w.length > 1 && w === w.toUpperCase()) continue;
      const key = fold(w).toLowerCase();
      let f = this.forms.get(key);
      if (!f) this.forms.set(key, (f = new Map()));
      f.set(w, (f.get(w) ?? 0) + 1);
      const lw = w.toLowerCase();
      this.lower.set(lw, (this.lower.get(lw) ?? 0) + 1);
      const chars = ["^", ...lw, "$"];
      for (let i = 1; i < chars.length; i++) {
        const bg = chars[i - 1]! + chars[i]!;
        this.bigrams.set(bg, (this.bigrams.get(bg) ?? 0) + 1);
      }
    }
  }

  /** Most frequent spelling (accents + case) of a word, if known. */
  best(word: string): string | undefined {
    const f = this.forms.get(fold(word).toLowerCase());
    if (!f) return undefined;
    let best: string | undefined;
    let n = 0;
    for (const [w, c] of f) if (c > n) [best, n] = [w, c];
    return best;
  }

  /** Is this word (any accents) written with a capital in most of its occurrences? */
  mostlyCapitalised(word: string): boolean {
    const f = this.forms.get(fold(word).toLowerCase());
    if (!f) return false;
    let cap = 0;
    let all = 0;
    for (const [w, c] of f) {
      all += c;
      if (/^\p{Lu}/u.test(w)) cap += c;
    }
    return cap / all > 0.8 && all >= 2;
  }

  /** Is this lowercase spelling (with accents) more frequent than its alternatives? */
  count(lowerForm: string): number {
    return this.lower.get(lowerForm) ?? 0;
  }

  /** Exact vocabulary match for a word whose accented letters became '?'. */
  repair(word: string): string | undefined {
    const pattern = new RegExp(
      "^" + word.toLowerCase().replace(/[.*+^${}()|[\]\\]/g, "\\$&").replace(/\?/g, "[àâäçéèêëîïôöùûüœæ]") + "$",
    );
    let best: string | undefined;
    let n = 0;
    for (const [w, c] of this.lower) if (c > n && w.length === word.length && pattern.test(w)) [best, n] = [w, c];
    return best ? restoreCase(best, word) : undefined;
  }

  /** Statistical guess, letter by letter, from character bigrams. */
  guess(word: string): string {
    const CANDIDATES = [..."éèêàâçîôûùïë"];
    const chars = [...word.toLowerCase()];
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] !== "?") continue;
      const prev = i === 0 ? "^" : chars[i - 1]!;
      const next = i === chars.length - 1 ? "$" : chars[i + 1] === "?" ? "" : chars[i + 1]!;
      let best = "é";
      let score = -1;
      for (const c of CANDIDATES) {
        const a = this.bigrams.get(prev + c) ?? 0;
        const b = next ? this.bigrams.get(c + next) ?? 0 : 1;
        if (a * b > score) [best, score] = [c, a * b];
      }
      chars[i] = best;
    }
    return restoreCase(chars.join(""), word);
  }
}

function restoreCase(fixed: string, original: string): string {
  return [...fixed].map((ch, i) => (original[i] && original[i] !== "?" && original[i] === original[i]!.toUpperCase() ? ch.toUpperCase() : ch)).join("");
}

/** Does this text look like its accents were destroyed into '?' ? */
export function looksAccentDamaged(s: string): boolean {
  return /\p{L}\?{1,2}\p{L}/u.test(s);
}

const INTERROGATIVES = /^(pourquoi|quoi|comment|où|ou|quand|combien|qui|non|oui|hein|vrai|donc|alors|ici|là|encore|aussi|vous|toi|moi|lui|elle|eux|nous|tu|je|il|on)$/i;
const ELISION = /^(qu|jusqu|lorsqu|puisqu|presqu|quelqu|dell|[dljmnstcy])\?([\p{L}?].*)$/iu;

function repairWord(w: string, vocab: Vocabulary): string {
  const exact = vocab.repair(w);
  if (exact) return exact;
  // "d?autres", "Y?a", "s?entrem?lent": the '?' was an apostrophe.
  const el = ELISION.exec(w);
  if (el) {
    const rest = el[2]!.includes("?") ? repairWord(el[2]!, vocab) : el[2]!;
    // Elision happens before a vowel or h ("d’autres", "l’émerveillement"),
    // and colloquially before very common words ("d’la", "j’te").
    const known = vocab.count(rest.toLowerCase());
    if ((/^[aeiouyhàâéèêîôûœ]/i.test(rest) && (known > 0 || rest.length >= 4)) || known >= 5) return `${el[1]}’${rest}`;
  }
  return vocab.guess(w);
}

/** Restore accents lost as '?' using the vocabulary. Works on plain text. */
export function repairQuestionMarks(s: string, vocab: Vocabulary, force = false): string {
  if (!force && !looksAccentDamaged(s)) return s;
  // 1. "jusqu'? sa mort", "qu'? Paris" -> à
  let out = s.replace(/(\p{L}['’])\?(?=\s)/gu, "$1à");
  // 2. words with '?' inside (t?l?vision, r?alis?e) or at the end (consacr?)
  out = out.replace(/[\p{L}]*\?[\p{L}?]*/gu, (w) => {
    if (!/\p{L}/u.test(w)) return w;
    if (/^\p{L}+\?$/u.test(w)) {
      // Trailing '?': a real question mark ("pourquoi?") or a lost é ("consacr?")?
      const fixed = vocab.repair(w);
      return fixed && vocab.count(fixed.toLowerCase()) > vocab.count(w.slice(0, -1).toLowerCase()) ? fixed : w;
    }
    if (/^\?/.test(w)) return w.length > 1 && /^\?\p{L}/u.test(w) ? (vocab.repair(w) ?? w) : w;
    return repairWord(w, vocab);
  });
  // 3. a standalone '?' after a lowercase word or a comma is "à": "consacré ? Charles", "Resto ? la gloire"
  //    Before a capital, a real question ("Pourquoi ? Parce que") is more likely after an interrogative.
  out = out.replace(/(\p{L}+|,) \? (?=(\p{L}|\d|«|"))/gu, (m, prev: string, next: string) => {
    if (/^\p{Lu}/u.test(next) && INTERROGATIVES.test(prev)) return m;
    return /\p{Ll}$|,$/u.test(prev) ? `${prev} à ` : m;
  });
  return out;
}

// --- Title casing -----------------------------------------------------------

const ALWAYS_LOWER = new Set([
  "le", "la", "les", "l", "un", "une", "des", "du", "de", "d", "et", "ou", "en", "au", "aux",
  "pour", "par", "sur", "sous", "dans", "avec", "sans", "chez", "vers", "qui", "que", "qu",
  "ne", "pas", "se", "sa", "son", "ses", "mon", "ma", "mes", "ton", "ta", "tes", "notre",
  "nos", "votre", "vos", "leur", "leurs", "ce", "cet", "cette", "ces", "il", "elle", "on",
  "est", "sont", "fut", "était", "à", "y", "s", "n", "j", "m", "t", "c",
]);
/** Words where accents are routinely dropped in capitals but the vocabulary is ambiguous. */
const CAPS_ACCENTS: Record<string, string> = {
  a: "à", ou: "ou", theatre: "théâtre", etoile: "Étoile", pedo: "pédo", ete: "été",
  eternel: "éternel", derniere: "dernière", dernieres: "dernières", annees: "années",
  premiere: "première", recital: "récital", inedit: "inédit", enchantee: "enchantée",
  desenchantee: "désenchantée", fevrier: "février", celine: "Céline", poemes: "poèmes",
  poeme: "poème", poete: "poète", revolutionnaire: "révolutionnaire", siecle: "siècle",
  inne: "inné", television: "télévision", rentree: "rentrée", verite: "vérité",
  epuration: "épuration", comite: "comité", oiseaux: "oiseaux", melodie: "Mélodie",
  remplaca: "remplaça", coincidence: "coïncidence", fanatisme: "fanatisme",
  frole: "frôle", noel: "Noël", quebec: "Québec", bucherons: "bûcherons",
  posterite: "postérité", gerard: "Gérard", dessinee: "dessinée", psychanalytique: "psychanalytique",
  honorifiques: "honorifiques", recompenses: "récompenses", interview: "interview",
  francaise: "française", juvenile: "juvénile", jubile: "jubilé", enthousiasme: "enthousiasme",
  repare: "réparé", eglise: "église", celebrer: "célébrer", jeunes: "jeunes",
  maitre: "maître", chateau: "château", ferme: "ferme", calamiteuse: "calamiteuse",
  carriere: "carrière", rimes: "rimes", avoua: "avoua", experience: "expérience",
  disponible: "disponible", collabo: "collabo", grace: "grâce", fete: "fête", fetes: "fêtes",
  integrale: "intégrale", chanteur: "chanteur", varenne: "Varenne", tres: "très",
  ondioline: "Ondioline", oeuvres: "œuvres", oeuvre: "œuvre", coeur: "cœur",
  electoral: "électoral", academique: "académique", decembre: "décembre", ecrivait: "écrivait",
  orchestre: "orchestre", bresil: "Brésil", eleve: "élève", republique: "République",
};
const PRONOUNS_BEFORE_A = new Set(["il", "elle", "on", "qui", "y", "ça", "cela", "tout", "qu", "n"]);
const ACRONYMS = new Set(["DRH", "DVD", "CD", "ABC", "RTBF", "TV", "BD", "ORTF", "RTL", "SACEM", "USA", "BBC"]);
const ABBREVIATIONS = new Set(["vol", "mr", "m", "st", "ste", "dr", "no", "n°", "p"]);
const ROMAN = /^(?=[MDCLXVI]{2,})M{0,3}(C[MD]|D?C{0,3})(X[CL]|L?X{0,3})(I[XV]|V?I{0,3})$/;

/**
 * Re-case the words of a title that were typed in capitals ("TRENET A LA
 * ROSE ROUGE" -> "Trenet à la rose rouge"). Words already in mixed case are
 * kept, so partly-shouted titles are fixed too.
 */
export function smartTitle(title: string, vocab: Vocabulary): string {
  const tokens = title.trim().split(/([\p{L}\d]+)/u);
  // tokens: [sep, word, sep, word, …, sep]
  const isShout = (w: string) => /\p{L}/u.test(w) && w === w.toUpperCase() && (w.length > 1 || /^[A-ZÀ-Ý]$/.test(w));
  const words = tokens.filter((_, i) => i % 2 === 1);
  const shouting = words.map(isShout);
  // A lone capital letter is "shouting" only if a neighbour shouts (e.g. "A" in "TRENET A LA").
  words.forEach((w, i) => {
    if (w.length === 1 && shouting[i] && !(shouting[i - 1] && words[i - 1]!.length > 1) && !(shouting[i + 1] && words[i + 1]!.length > 1)) shouting[i] = false;
  });
  if (!shouting.some(Boolean)) return title.trim();

  let sentenceStart = true;
  let prevWord = "";
  let wi = -1;
  const out = tokens.map((tok, ti) => {
    if (ti % 2 === 0) {
      // separator
      if (/[.!?]\s*$/.test(tok) && !/\.\.\.\s*$|…\s*$/.test(tok) && !ABBREVIATIONS.has(prevWord)) sentenceStart = true;
      if (/[!?]\s*$/.test(tok)) sentenceStart = true;
      if (/[«"“]\s*$/.test(tok) || /\s[-–—]\s*$/.test(tok)) sentenceStart = true;
      if (tok.trim() === "." && prevWord.length === 1) sentenceStart = false; // initials A.B.C.
      return tok;
    }
    wi++;
    const word = tok;
    const next = tokens[ti + 1] ?? "";
    if (!shouting[wi]) {
      const startOfSentence = sentenceStart;
      sentenceStart = false;
      prevWord = fold(word).toLowerCase();
      return startOfSentence && /^\p{Ll}/u.test(word) ? word[0]!.toUpperCase() + word.slice(1) : word;
    }
    let out: string;
    const low = word.toLowerCase();
    const folded = fold(low);
    if (/^\d/.test(word)) out = word;
    else if (ROMAN.test(word) || ACRONYMS.has(word)) out = word;
    else if (word.length === 1 && next.startsWith(".") && /^[A-Z]$/.test(word) && (tokens[ti + 3]?.startsWith(".") || prevWord.length === 1)) out = word; // initials
    else if (folded === "a" && low === "a") out = PRONOUNS_BEFORE_A.has(prevWord) ? "a" : "à";
    else if (low !== folded) {
      const known = vocab.best(low);
      out = known && known.toLowerCase() === low && vocab.mostlyCapitalised(low) ? known : low;
    } else if (CAPS_ACCENTS[folded] !== undefined) out = CAPS_ACCENTS[folded]!;
    else if (ALWAYS_LOWER.has(folded)) out = low;
    else {
      const known = vocab.best(low);
      out = known && fold(known).toLowerCase() === folded ? known : low;
      if (!vocab.mostlyCapitalised(out)) out = out.toLowerCase();
    }
    if (sentenceStart) out = out[0]!.toUpperCase() + out.slice(1);
    sentenceStart = false;
    prevWord = folded;
    return out;
  });
  return out.join("").replace(/\s+/g, " ");
}

/** "Bernard revel", "Raymond DEVOS" -> "Bernard Revel", "Raymond Devos". */
export function normaliseName(name: string): string {
  const PARTICLES = new Set(["de", "du", "des", "le", "la", "et", "alias", "van", "von", "d", "l"]);
  return name
    .split(/(\s+|-|')/)
    .map((w, i) => {
      if (!/\p{L}/u.test(w) || /^\(|"/.test(w)) return w;
      const low = w.toLowerCase();
      if (i > 0 && PARTICLES.has(low) && w === low) return w;
      if (w === w.toUpperCase() && w.length >= 2) return low[0]!.toUpperCase() + low.slice(1);
      if (w === low) return low[0]!.toUpperCase() + low.slice(1);
      return w;
    })
    .join("");
}

/** French typography for short strings (titles): ’ … « » and thin spaces. */
export function typography(s: string): string {
  return s
    .replace(/'/g, "’")
    .replace(/\s*\.{3,}|\s*\.\.(?=\s|$)/g, "…")
    .replace(/^…\s*/, "… ")
    .replace(/"([^"]+)"/g, "« $1 »")
    .replace(/«\s*/g, "«\u00a0")
    .replace(/\s*»/g, "\u00a0»")
    .replace(/\s+([!?:;])/g, "\u202f$1")
    .replace(/([!?])(?=[!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// --- Misc -------------------------------------------------------------------

export function readingMinutes(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function excerpt(text: string, max = 220): string {
  const t = collapseWs(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:.\s–-]+$/, "") + "…";
}

export function stripSlashes(s: string): string {
  return s.replace(/\\(['"\\])/g, "$1");
}

export function redactEmails(s: string): string {
  return s.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi, "[adresse masquée]");
}
