/**
 * XForum messages: PHP-escaped plain text with a little BBCode and smilies.
 */
import { escapeHtml, redactEmails, stripSlashes } from "./text.ts";
import { videoFigure, youtubeId } from "./clean-html.ts";

const SMILIES: [RegExp, string][] = [
  [/:cool:/g, "😎"], [/:mad2?:/g, "😠"], [/:casstet:/g, "🤯"], [/:calim:/g, "🥺"],
  [/:angel:/g, "😇"], [/:heartpump:/g, "💓"], [/:hallucine:/g, "😵"], [/:present:/g, "🎁"],
  [/:yltype:/g, "🤓"], [/:red:/g, "😳"], [/:question:/g, "❓"], [/:exclam:/g, "❗"],
  [/:thumbup:/g, "👍"], [/:thumbdown:/g, "👎"],
  [/(^|\s)[:=]-?\)(?=\s|$|[.,!?])/g, "$1🙂"], [/(^|\s);-?\)(?=\s|$|[.,!?])/g, "$1😉"],
  [/(^|\s):-?D(?=\s|$|[.,!?])/g, "$1😄"], [/(^|\s):-?\((?=\s|$|[.,!?])/g, "$1🙁"],
  [/(^|\s):-?[pP](?=\s|$|[.,!?])/g, "$1😛"], [/(^|\s):-?[oO](?=\s|$|[.,!?])/g, "$1😮"],
];

export interface BbcodeOptions {
  resolveLink: (href: string) => string | null;
  resolveImage: (src: string) => { src: string; width?: number; height?: number } | null;
}

export function bbcodeToHtml(raw: string, opts: BbcodeOptions): string {
  let s = redactEmails(stripSlashes(raw).replace(/\r\n?/g, "\n"));
  // XForum appended "[Edité le 21/6/2002 par Dominic]" footers.
  s = s.replace(/\n*\[Edit[ée] le [^\]]*\]\s*$/i, "").trim();
  // A few posts contain raw HTML <a>/<img>/<br>: turn them into BBCode first.
  s = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a\s[^>]*href=["']?([^"'\s>]+)[^>]*>([\s\S]*?)<\/a>/gi, "[url=$1]$2[/url]")
    .replace(/<img\s[^>]*src=["']?([^"'\s>]+)[^>]*>/gi, "[img]$1[/img]");
  s = escapeHtml(s);

  const link = (href: string, label: string) => {
    const target = opts.resolveLink(href.replace(/&amp;/g, "&").trim());
    if (!target) return label;
    const ext = /^https?:/i.test(target);
    return `<a href="${escapeHtml(target)}"${ext ? ' rel="noopener nofollow ugc"' : ""}>${label}</a>`;
  };

  s = s
    .replace(/\[(b|i|u)\]([\s\S]*?)\[\/\1\]/gi, (_, t: string, inner: string) => {
      const tag = { b: "strong", i: "em", u: "u" }[t.toLowerCase()]!;
      return `<${tag}>${inner}</${tag}>`;
    })
    .replace(/\[size=[^\]]*\]([\s\S]*?)\[\/size\]/gi, "$1")
    .replace(/\[\/?(guillo|color|font|align|size)[^\]]*\]/gi, "")
    .replace(/\[img\]\s*([\s\S]*?)\s*\[\/img\]/gi, (_, src: string) => {
      const img = opts.resolveImage(src.replace(/&amp;/g, "&"));
      if (img) {
        const dims = img.width && img.height ? ` width="${img.width}" height="${img.height}"` : "";
        return `<img src="${img.src}" alt=""${dims} loading="lazy" decoding="async">`;
      }
      // External hot-linked images are long dead and would leak visitors' IPs.
      return /^https?:/i.test(src) ? `<a href="${src}" rel="noopener nofollow ugc" class="dead-image">[image externe]</a>` : "";
    })
    .replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_, href: string, label: string) => link(href, label))
    .replace(/\[url\]\s*([\s\S]*?)\s*\[\/url\]/gi, (_, href: string) => link(href, shorten(href)))
    // Bare URLs
    .replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)])/g, (_, pre: string, url: string) =>
      pre + link(url.startsWith("www.") ? `http://${url}` : url, shorten(url)));

  // Quotes (possibly nested): [quote] / [quote=Nom]
  for (let i = 0; i < 4; i++) {
    s = s.replace(/\[quote(?:=([^\]]*))?\]((?:(?!\[quote)[\s\S])*?)\[\/quote\]/gi, (_, who: string | undefined, inner: string) =>
      `\n<blockquote>${who ? `<cite>${who}</cite>` : ""}${inner.trim()}</blockquote>\n`);
  }
  s = s.replace(/\[\/?quote[^\]]*\]/gi, "");

  for (const [re, emoji] of SMILIES) s = s.replace(re, emoji);

  // Paragraphs
  const html = s
    .split(/\n\s*\n|(?=\n<blockquote>)|(?<=<\/blockquote>\n)/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.startsWith("<blockquote>") ? p.replace(/\n/g, "<br>") : `<p>${p.replace(/\n/g, "<br>")}</p>`))
    .join("\n");

  // Lone YouTube links become embeds after the post.
  const ids = [...new Set([...html.matchAll(/href="([^"]+)"/g)].map((m) => youtubeId(m[1]!)).filter(Boolean))] as string[];
  return html + ids.map((id) => "\n" + videoFigure(id)).join("");
}

function shorten(url: string): string {
  const u = url.replace(/^https?:\/\//, "").replace(/&amp;/g, "&");
  return escapeHtml(u.length > 60 ? u.slice(0, 57) + "…" : u).replace(/&amp;amp;/g, "&amp;");
}
