/**
 * Songs: the A–Z catalogue (chansons/index1..5.html) and the hand-made
 * lyric/text pages (chansons/*.html).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { collapseWs, decodeEntities, fold, repairLegacyChars, stripTags } from "./text.ts";

const cp1252 = new TextDecoder("windows-1252");
export const readLegacy = (path: string) => cp1252.decode(readFileSync(path));

export interface CatalogueEntry {
  /** Title as written in the catalogue, e.g. "Abbé à l'harmonium (l')". */
  sortTitle: string;
  /** Natural title, e.g. "L'abbé à l'harmonium". */
  title: string;
  year: number | null;
  publisher: string | null;
  unpublished: boolean;
  /** Blue entries: songs Trenet sang but neither wrote nor composed. */
  performedOnly: boolean;
  file: string | null;
  /** "Cadaquès (voir : Rêve d'Ajaccio)" → "Rêve d'Ajaccio" */
  seeAlso: string | null;
  letter: string;
  order: number;
}

const ARTICLE = /\s*\(\s*(l['’]|le|la|les|un|une)\s*\)\s*\)?\s*$/i;

export function naturalTitle(sortTitle: string): string {
  const m = ARTICLE.exec(sortTitle);
  if (!m) return sortTitle;
  const art = m[1]!.toLowerCase().replace("’", "'");
  const rest = sortTitle.slice(0, m.index).trim();
  const first = rest[0] ?? "";
  const body = first.toLowerCase() + rest.slice(1);
  const joined = art.endsWith("'") ? art + body : `${art} ${body}`;
  return joined[0]!.toUpperCase() + joined.slice(1);
}

export function parseCatalogue(legacyRoot: string): CatalogueEntry[] {
  const out: CatalogueEntry[] = [];
  let order = 0;
  for (const k of [1, 2, 3, 4, 5]) {
    const html = readLegacy(join(legacyRoot, "chansons", `index${k}.html`));
    for (const raw of html.split(/<li>/i).slice(1)) {
      const seg = raw.split(/<\/ul>|<h2|<blockquote|<\/li>/i)[0]!;
      const file = /chansons\/+([\w.-]+\.html)/i.exec(seg)?.[1] ?? null;
      const performedOnly = /color="#5eb6dd"/i.test(seg);
      let text = collapseWs(repairLegacyChars(stripTags(seg.replace(/<img[^>]*>/gi, ""))));
      text = text.replace(/\b(1[89]\d) (\d)\b/, "$1$2").replace(/^J ava\b/, "Java"); // source typos
      let seeAlso: string | null = null;
      const alias = /^(.*?)\s*\(?\s*voir\s*:\s*(.+?)\s*$/i.exec(text);
      if (alias) {
        text = alias[1]!.trim();
        seeAlso = alias[2]!.replace(/\)$/, "").replace(/\(([^)]*)$/, "($1)").trim();
      }
      const m =
        /^(.*?)\s*[-–]\s*((?:18|19|20)\d\d)\b\s*(.*)$/.exec(text) ??
        /^(.*?)\s+(?:\d{1,2}\s+)?((?:18|19|20)\d\d)\b\s*(.*)$/.exec(text);
      let sortTitle = (m ? m[1]! : text).replace(/\s+\)\s*$/, "").replace(/\)\s*\)$/, ")").trim();
      sortTitle = sortTitle.replace(/^["«\s]+|["»\s]+$/g, "").replace(/\s+-$/, "");
      if (!sortTitle) continue;
      const rest = m ? m[3]! : "";
      const unpublished = /non\s+[ée]dit/i.test(rest);
      const publisher = /©\s*([^©]+?)\s*$/.exec(rest)?.[1]?.replace(/\s+[a-z]$/, "").trim() || null;
      const title = naturalTitle(sortTitle);
      const letter = fold(sortTitle)[0]!.toUpperCase();
      out.push({
        sortTitle,
        title,
        year: m ? Number(m[2]) : null,
        publisher,
        unpublished,
        performedOnly,
        file,
        seeAlso,
        letter: /[A-Z]/.test(letter) ? letter : "#",
        order: order++,
      });
    }
  }
  return out;
}

export interface LegacyText {
  file: string;
  title: string;
  author: string;
  /** Raw HTML of the page body, still legacy. */
  html: string;
}

/** Files of chansons/ that are not lyric/text pages. */
const NOT_TEXTS = /^(index\d?|ligne1|inscription)\.html$/i;

export function listLegacyTexts(legacyRoot: string): LegacyText[] {
  const dir = join(legacyRoot, "chansons");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".html") && !NOT_TEXTS.test(f))
    .sort()
    .map((file) => {
      const html = readLegacy(join(dir, file));
      const rawTitle = collapseWs(repairLegacyChars(decodeEntities(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? file)));
      const m = /^(charles trenet|ch\. trenet|georges brassens|brassens|r[ée]f[ée]rences)\s*:\s*(.*)$/i.exec(rawTitle);
      let author = "Charles Trenet";
      let title = rawTitle;
      if (m) {
        title = m[2]!.trim();
        if (/brassens/i.test(m[1]!)) author = "Georges Brassens";
      }
      title = title.replace(/^./, (c) => c.toUpperCase());
      const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
      return { file, title, author, html: body };
    });
}

export interface ParsedLyrics {
  /** First line of the page when it looks like a heading (usually in capitals). */
  heading: string | null;
  credits: string | null;
  copyright: string | null;
  html: string;
}

/**
 * Split a cleaned lyric page into header (title, credits, copyright line) and
 * the text itself. Blocks are separated by "\n" (see tidy()).
 */
export function splitLyrics(clean: string, title: string): ParsedLyrics {
  const blocks = clean.split("\n").filter(Boolean);
  const credits: string[] = [];
  let copyright: string | null = null;
  let heading: string | null = null;
  const titleKey = fold(title).toLowerCase().replace(/[^a-z0-9]/g, "");
  let consumed = 0;
  for (let b = 0; b < Math.min(blocks.length, 4); b++) {
    const block = blocks[b]!;
    if (/^<(table|ul|ol|figure|h\d)/.test(block)) break;
    const inner = block.replace(/^<p>|<\/p>$/g, "");
    const lines = inner.split(/<br>/);
    let l = 0;
    for (; l < lines.length; l++) {
      const text = collapseWs(stripTags(lines[l]!));
      const key = fold(text).toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!text) continue;
      if (/<img/.test(lines[l]!)) break;
      const letters = text.replace(/[^\p{L}]/gu, "");
      if (!credits.length && text.length <= 80 && letters.length > 1 && letters.replace(/[^\p{Lu}]/gu, "").length / letters.length > 0.6) {
        if (!heading) heading = text;
        else if (fold(text).toLowerCase() !== fold(heading).toLowerCase()) {
          // A second title line: the song is also known under this name.
          credits.push(`« ${text[0]}${text.slice(1).toLowerCase()} »`);
        }
        continue;
      }
      if (key && (key === titleKey || (titleKey.length > 6 && (key.includes(titleKey) || titleKey.includes(key))) && text.length < title.length + 20)) continue;
      if (text.length < 140 && /(paroles|musique|texte|lyrics|words|adaptation|po[eè]me|lettre de|music)\b/i.test(text) && !/[.!?]$/.test(text.replace(/\.\.\.$/, ""))) {
        credits.push(text.replace(/\s*:\s*/, " : "));
        continue;
      }
      if (text.length < 60 && /(©|copyright|^\(?\s*(18|19|20)\d\d\s*\)?$|^-\s*(18|19|20)\d\d)/i.test(text)) {
        copyright = text.replace(/^©\s*-?\s*/, "").replace(/^-\s*/, "").trim();
        continue;
      }
      break;
    }
    if (l < lines.length) {
      const rest = lines.slice(l).join("<br>").trim();
      blocks[b] = rest ? (block.startsWith("<p>") ? `<p>${rest}</p>` : rest) : "";
      consumed = b;
      break;
    }
    blocks[b] = "";
    consumed = b + 1;
  }
  void consumed;
  return {
    heading,
    credits: credits.length ? credits.join(" — ") : null,
    copyright,
    html: blocks.filter(Boolean).join("\n"),
  };
}
