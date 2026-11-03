/** French formatting helpers. */

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "Europe/Paris" });
const dayMonthFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
const numFmt = new Intl.NumberFormat("fr-FR");

export const formatDate = (iso: string) => dateFmt.format(new Date(iso)).replace(/^1 /, "1er ");
export const formatMonth = (iso: string) => monthFmt.format(new Date(iso));
export const formatDayMonth = (d: Date) => dayMonthFmt.format(d).replace(/^1 /, "1er ");
export const formatNumber = (n: number) => numFmt.format(n);
export const year = (iso: string) => iso.slice(0, 4);

export function plural(n: number, one: string, many: string): string {
  return `${formatNumber(n)} ${n > 1 ? many : one}`;
}

/** "Les grands moments" → "les grands moments" etc. are kept; used for <title>. */
export function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
}

/** Plain-text summary of an HTML fragment, cut at a word, for meta descriptions. */
export function summary(htmlFragment: string, max = 155): string {
  const text = stripTags(htmlFragment.replace(/<br\s*\/?>|<\/p>/g, " "))
    .replace(/&#39;|&#x27;/g, "’").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6)).replace(/[\s,;:.!?—–-]+$/, "") + "…";
}

/** Today in Paris, for "Ce jour-là". */
export function parisToday(now = new Date()): { day: number; month: number; date: Date } {
  const parts = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", timeZone: "Europe/Paris" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { day: get("day"), month: get("month"), date: now };
}

/** Stable pseudo-random pick for a given key (e.g. today's date). */
export function seeded(key: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return Math.abs(h) % Math.max(1, n);
}

/** Colour hue derived from a name, for forum monograms. */
export function hue(name: string): number {
  return seeded(name.toLowerCase(), 360);
}
