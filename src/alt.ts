/**
 * Text alternatives for the images of the content. The old site had none
 * (every <img> of the content has alt=""), but its file names are often
 * descriptive: "album-etoile-1961.jpg", "palais-congres-1989-3.jpg".
 *
 * A file name is used when every word in it is a word of the site's own
 * text; accents and capitals are restored from that text ("Album étoile
 * 1961", "Chirac Trenet"). Otherwise the image is described by the page it
 * illustrates.
 */
import { db } from "./db.ts";
import { escape } from "./html.ts";

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** folded word → most frequent spelling in the content */
let vocabulary: Map<string, string> | null = null;
function words(): Map<string, string> {
  if (vocabulary) return vocabulary;
  const counts = new Map<string, Map<string, number>>();
  for (const { title, body } of db.query<{ title: string; body: string }, []>("SELECT title, body FROM search").all()) {
    for (const [w] of `${title} ${body}`.matchAll(/\p{L}{2,}/gu)) {
      const key = fold(w);
      const forms = counts.get(key) ?? counts.set(key, new Map()).get(key)!;
      forms.set(w, (forms.get(w) ?? 0) + 1);
    }
  }
  vocabulary = new Map();
  for (const [key, forms] of counts) {
    let total = 0, best = "", bestN = 0, lower = 0;
    for (const [w, n] of forms) {
      total += n;
      if (w === w.toLowerCase()) lower += n;
      // compare lowercase forms first: "étoile" beats "etoile"
      if (n > bestN) [best, bestN] = [w, n];
    }
    if (total < 2) continue; // hapaxes are often typos
    // Keep a capital only for words that nearly always have one (names)
    const accented = [...forms].filter(([w]) => w.toLowerCase() !== fold(w)).sort((a, b) => b[1] - a[1])[0]?.[0];
    let form = lower / total > 0.2 ? best.toLowerCase() : best;
    if (accented && fold(accented) === key && forms.get(accented)! * 4 >= total) form = lower / total > 0.2 ? accented.toLowerCase() : accented;
    vocabulary.set(key, form);
  }
  return vocabulary;
}

const NOISE = new Set(["img", "dsc", "dscn", "dscf", "pict", "pic", "image", "photo", "scan", "vignette", "thumb", "mini", "copie", "web", "petite"]);
const SHORT = new Set(["de", "la", "le", "les", "du", "des", "au", "aux", "en", "et", "un", "une", "sur", "par", "a", "y", "vs"]);
const ELIDED = new Set(["j", "d", "l", "n", "m", "s", "t", "c", "qu"]);

/** A description from a media file name, or null if the name is not descriptive. */
export function describeFile(src: string): string | null {
  const name = decodeURIComponent(src.split("/").pop() ?? "").replace(/\.\w+$/, "");
  // "scene2" → "scene", "2"
  const tokens = name.split(/[-_\s.]+/).flatMap((t) => t.split(/(?<=\p{L}{3})(?=\d{1,2}$)/u)).filter(Boolean);
  while (tokens.length && /^\d{1,2}$/.test(tokens.at(-1)!)) tokens.pop(); // "-2", "-3": copies
  const vocab = words();
  const out: string[] = [];
  let known = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!.toLowerCase();
    if (NOISE.has(t)) continue;
    if (/^\d+$/.test(t)) { out.push(t); continue; }
    if (ELIDED.has(t) && i + 1 < tokens.length && /^[aeiouyh]/.test(fold(tokens[i + 1]!))) {
      const next = vocab.get(fold(tokens[i + 1]!));
      if (!next) return null;
      out.push(`${t}’${next}`);
      i++;
      known++;
      continue;
    }
    if (t.length < 3) {
      if (!SHORT.has(t)) return null;
      out.push(t === "a" ? "à" : t);
      continue;
    }
    const w = vocab.get(fold(t));
    if (!w) return null; // "cocteaublanc", "0m4zjjo5": not a description
    out.push(w);
    known++;
  }
  if (!known) return null;
  const s = out.join(" ");
  return s[0]!.toUpperCase() + s.slice(1);
}

/** Fill the empty alt="" of the content images of a page. */
export function describeImages(html: string, pageTitle: string): string {
  if (!html.includes('alt=""')) return html;
  return html.replace(/<img\b[^>]*>/g, (tag) => {
    if (!/\balt=""/.test(tag)) return tag;
    const src = /\bsrc="([^"]+)"/.exec(tag)?.[1] ?? "";
    if (!src.startsWith("/media/")) return tag;
    const alt = describeFile(src) ?? `Illustration : ${pageTitle}`;
    return tag.replace(/\balt=""/, `alt="${escape(alt)}"`);
  });
}
