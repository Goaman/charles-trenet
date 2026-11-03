/**
 * "Sa vie de 1913 à 2001": the biography timeline (chansons/ligne1.html), a
 * 3-column table — events | year(s) | related articles.
 */
import { join } from "node:path";
import { cleanHtml, type CleanOptions } from "./clean-html.ts";
import { readLegacy } from "./songs.ts";
import { collapseWs, stripTags } from "./text.ts";

export interface TimelineEntry {
  startYear: number;
  endYear: number | null;
  /** Clean HTML: one <p> per event. */
  eventsHtml: string;
  related: { title: string; href: string }[];
}

export function parseTimeline(legacyRoot: string, opts: CleanOptions): TimelineEntry[] {
  const html = readLegacy(join(legacyRoot, "chansons", "ligne1.html"));
  const out: TimelineEntry[] = [];
  for (const row of html.split(/<tr\b[^>]*>/i).slice(1)) {
    const cells = row.split(/<td\b[^>]*>/i).slice(1).map((c) => c.replace(/<\/td>[\s\S]*$/i, ""));
    if (cells.length < 3) continue;
    const years = [...stripTags(cells[1]!).matchAll(/\b(1[89]\d\d|20\d\d)\b/g)].map((m) => Number(m[1]));
    if (!years.length) continue;
    // Each event is its own <div>/<p>/<font><b> block: separate them with paragraph breaks.
    const eventsSrc = cells[0]!.replace(/<\/(div|p)>/gi, "<br><br>").replace(/<(div|p)\b[^>]*>/gi, "");
    const eventsHtml = cleanHtml(eventsSrc, { ...opts, paragraphs: true })
      .replace(/<\/?strong>/g, "");
    const related: TimelineEntry["related"] = [];
    for (const m of cells[2]!.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const href = opts.resolveLink(m[1]!);
      const title = collapseWs(stripTags(m[2]!));
      if (href && title) related.push({ title, href });
    }
    const prev = out.at(-1);
    if (prev && !stripTags(eventsHtml) && !related.length) continue;
    out.push({
      startYear: Math.min(...years),
      endYear: years.length > 1 ? Math.max(...years) : null,
      eventsHtml,
      related,
    });
  }
  return out;
}
