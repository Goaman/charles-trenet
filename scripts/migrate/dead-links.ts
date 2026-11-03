/**
 * Links that lead nowhere any more: videos that were removed, sites that
 * disappeared. The list, dead-links.json, is written by scripts/check-links.ts
 * (which goes online); the migration only reads it, so it stays offline and
 * deterministic.
 *
 * In the content, a dead video disappears with what only existed to show it:
 * its embed, its thumbnail, a link whose text just says "the video". A dead
 * link inside a sentence keeps its words and loses the link.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Same URL, same key: entities decoded, no trailing junk ("…_blank", "<br>"). */
export function normalizeUrl(url: string): string {
  return url
    .replace(/&amp;/g, "&")
    .replace(/<br>$/i, "")
    .replace(/(youtu\.be\/[\w-]{11})_blank$/, "$1")
    .trim();
}

type VideoKey = { service: "youtube" | "dailymotion" | "vimeo" | "ina" | "facebook" | "other"; id: string | null };

export function videoKey(raw: string): VideoKey | null {
  const url = normalizeUrl(raw);
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|[a-z]{2}|m)\./, "");
  if (host === "youtu.be") return { service: "youtube", id: /^\/([\w-]{11})/.exec(u.pathname)?.[1] ?? null };
  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    const id = u.searchParams.get("v") ?? /\/(?:embed|v)\/([\w-]{11})/.exec(u.pathname)?.[1] ?? null;
    return { service: "youtube", id: id && /^[\w-]{11}$/.test(id) ? id : null };
  }
  if (host.endsWith("dailymotion.com")) return { service: "dailymotion", id: /\/video\/(x[0-9a-z]+)/.exec(u.pathname)?.[1] ?? null };
  if (host.endsWith("vimeo.com")) return /^\/(\d+)/.test(u.pathname) ? { service: "vimeo", id: /^\/(\d+)/.exec(u.pathname)![1]! } : null;
  if (host.endsWith("ina.fr")) return /video|lecteur|extraits/i.test(url) ? { service: "ina", id: null } : null;
  if (host.endsWith("facebook.com")) return /video/i.test(url) ? { service: "facebook", id: null } : null;
  if (/kewego|123video|wat\.tv|veoh|mediaplayer\.|france5\.fr.*video|plurielles\.fr.*video/i.test(url) || /\.(wmv|asx|ram|flv|mp4)$/i.test(u.pathname)) return { service: "other", id: null };
  return null;
}

export const isVideoUrl = (url: string) => videoKey(url) !== null;

type DeadList = Set<string> & { noEmbed?: Set<string> };
let deadSet: DeadList | null = null;
/** URLs listed as dead (normalized); .noEmbed: YouTube ids that only play on YouTube. */
export function deadLinks(file = join(import.meta.dir, "dead-links.json")): DeadList {
  if (deadSet) return deadSet;
  if (!existsSync(file)) return (deadSet = new Set());
  const data = JSON.parse(readFileSync(file, "utf8")) as { dead: Record<string, string>; no_embed?: string[] };
  deadSet = new Set(Object.keys(data.dead).map(normalizeUrl));
  deadSet.noEmbed = new Set(data.no_embed ?? []);
  return deadSet;
}

const deadYoutube = (dead: Set<string>, id: string) => dead.has(`https://www.youtube.com/watch?v=${id}`) || dead.has(`http://youtu.be/${id}`) || dead.has(`https://youtu.be/${id}`);

/** Is this URL a dead link? (Any address of a dead YouTube video counts.) */
export function isDead(url: string, dead = deadLinks()): boolean {
  const n = normalizeUrl(url);
  if (dead.has(n)) return true;
  const k = videoKey(n);
  return k?.service === "youtube" && !!k.id && deadYoutube(dead, k.id);
}

/** Text of a link that is only there to point at the video. */
const VIDEO_WORDS = /^(?:\s|&nbsp;|[«»"“”'’():.!…-])*(?:(?:cliquez|cliquer|voir|revoir|regarder|écouter|ecouter|ici|la|le|les|cette|une|en|vidéo|video|vidéos|videos|extrait|extraits|sur|youtube|dailymotion|lien|link|this|watch|là)\b(?:\s|&nbsp;|[«»"“”'’():.!…-])*)+$/i;

/** "youtu.be/abc", "www.facebook.com/home.php…": the address itself as text. */
const BARE_URL = /^(?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+(?:[/?#]\S*)?$/i;

/**
 * Remove the dead links of a cleaned HTML fragment (see the file comment).
 * Runs on the output of clean-html / bbcode, whose markup is regular.
 */
export function removeDeadLinks(html: string, dead: DeadList = deadLinks()): string {
  if (!dead.size) return html;
  let out = html.replace(/\n?<figure data-youtube="([\w-]{11})">[\s\S]*?<\/figure>\n?/g, (f, id: string) => {
    if (deadYoutube(dead, id)) return "\n";
    if (dead.noEmbed?.has(id)) return `\n<p><a href="https://www.youtube.com/watch?v=${id}" rel="noopener nofollow">Voir la vidéo sur YouTube</a></p>\n`;
    return f;
  });
  out = out.replace(/<a\b([^>]*?)\bhref="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g, (a, _b, href: string, _c, inner: string) => {
    if (!/^https?:/i.test(href) || !isDead(href, dead)) return a;
    // A thumbnail, a bare URL, or "voir la vidéo": nothing left to show
    const text = inner.replace(/<[^>]+>/g, "").trim();
    if (/<img\b/i.test(inner) || !text || VIDEO_WORDS.test(text) || BARE_URL.test(text)) return "";
    return inner;
  });
  // Paragraphs or captions emptied by the removal
  return out
    .replace(/<p>(?:\s|&nbsp;|<br>|[-–—:•·]|\(\s*\))*<\/p>\n?/g, "")
    .replace(/(?:<br>\s*){3,}/g, "<br><br>")
    .replace(/\n{3,}/g, "\n\n");
}
