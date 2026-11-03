/**
 * Legacy HTML → clean, semantic HTML.
 *
 * The PostNuke content is a decade of WYSIWYG soup: <font>, <center>, inline
 * colours, `onClick="window.open(...)"` pop-ups, Flash embeds, absolute links
 * to the old domain, `<br>`-separated paragraphs… This module keeps the
 * structure that matters (paragraphs, emphasis, lists, tables, images, links)
 * and drops everything else.
 */
import { decodeEntities, escapeHtml, fixNumericRefs, repairLegacyChars } from "./text.ts";

export interface ImageInfo {
  src: string;
  width?: number;
  height?: number;
}

export interface CleanOptions {
  /** Map a legacy href to its new URL. Return null to unwrap the link. */
  resolveLink: (href: string) => string | null;
  /** Map a legacy image src to a local media file. Return null to drop it. */
  resolveImage: (src: string) => ImageInfo | null;
  /** Remove images matching this predicate (site logos, decorative bullets…). */
  dropImage?: (src: string) => boolean;
  /** Turn runs of <br><br> into paragraphs (articles) or keep line breaks (lyrics). */
  paragraphs?: boolean;
}

const DROP = new Set([
  "script", "style", "head", "title", "meta", "link", "iframe", "object", "embed", "param",
  "applet", "form", "input", "select", "option", "textarea", "button", "noscript", "map",
  "area", "frameset", "frame", "bgsound", "audio", "video", "svg", "base",
]);
const KEEP = new Set([
  "p", "br", "b", "strong", "i", "em", "u", "s", "strike", "sup", "sub", "small", "big",
  "blockquote", "ul", "ol", "li", "a", "img", "h1", "h2", "h3", "h4", "h5", "h6", "table",
  "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "hr", "pre", "code", "q",
  "cite", "dl", "dt", "dd", "figure", "figcaption", "div",
]);
const ATTRS: Record<string, string[]> = {
  a: ["href", "id"],
  img: ["src", "alt", "width", "height"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
  figure: ["data-youtube"],
  ol: ["start"],
};
const RENAME: Record<string, string> = { b: "strong", i: "em", strike: "s", big: "strong", h1: "h2" };

export function youtubeId(url: string): string | null {
  const m =
    /youtu\.be\/([\w-]{11})/.exec(url) ??
    /youtube(?:-nocookie)?\.com\/(?:v\/|embed\/|watch\?(?:[^"'\s]*&)?v=)([\w-]{11})/.exec(url);
  return m ? m[1]! : null;
}

export function videoFigure(id: string, caption = ""): string {
  return `<figure data-youtube="${id}"><a href="https://www.youtube.com/watch?v=${id}">Voir la vidéo sur YouTube</a>${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}</figure>`;
}

/** Replace Flash/iframe video embeds by a placeholder figure (or nothing). */
function replaceEmbeds(html: string): string {
  const swap = (block: string) => {
    const id = youtubeId(block);
    return id ? `\n${videoFigure(id)}\n` : "";
  };
  return html
    .replace(/<object[\s\S]*?<\/object>/gi, swap)
    .replace(/<embed[^>]*>(?:\s*<\/embed>)?/gi, swap)
    .replace(/<iframe[\s\S]*?(?:<\/iframe>|\/>)/gi, swap);
}

function onclickUrl(onclick: string | null): string | null {
  if (!onclick) return null;
  const m = /window\.open\(\s*\\?['"]([^'"\\]+)/i.exec(onclick) ?? /location(?:\.href)?\s*=\s*['"]([^'"]+)/i.exec(onclick);
  return m ? m[1]! : null;
}

export function cleanHtml(input: string, opts: CleanOptions): string {
  let html = repairLegacyChars(fixNumericRefs(input))
    .replace(/\r\n?/g, "\n")
    // Unterminated comments ("<!-- keywords <center>") swallow markup: cut them at the next tag.
    .replace(/<!--((?:(?!-->)[^<])*)(?=<)/g, (m) => (m.includes("-->") ? m : ""))
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<x-claris[^>]*>/gi, "")
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1>/gi, "");
  html = replaceEmbeds(html);

  const rewriter = new HTMLRewriter()
    .on("*", {
      element(el) {
        const tag = el.tagName.toLowerCase();
        if (DROP.has(tag)) {
          el.remove();
          return;
        }
        if (!KEEP.has(tag)) {
          el.removeAndKeepContent();
          return;
        }
        const align = (el.getAttribute("align") ?? "").toLowerCase();
        const href = el.getAttribute("href");
        const onclick = el.getAttribute("onclick");
        const name = el.getAttribute("name");
        const src = el.getAttribute("src");
        const keep = ATTRS[tag] ?? [];
        for (const [attr] of [...el.attributes]) if (!keep.includes(attr.toLowerCase())) el.removeAttribute(attr);
        if (RENAME[tag]) el.tagName = RENAME[tag]!;

        if (tag === "a") {
          const target = onclickUrl(onclick) ?? (href && href !== "#" ? href.trim() : null);
          if (!target) {
            if (name) el.setAttribute("id", name);
            if (!name) el.removeAndKeepContent();
            el.removeAttribute("href");
            return;
          }
          const resolved = target.startsWith("#") ? target : opts.resolveLink(target);
          if (!resolved) {
            el.removeAndKeepContent();
            return;
          }
          el.setAttribute("href", resolved);
          if (/^https?:\/\//i.test(resolved)) el.setAttribute("rel", "noopener nofollow");
          if (youtubeId(resolved)) el.setAttribute("class", "video-link");
        } else if (tag === "img") {
          if (!src || opts.dropImage?.(src)) {
            el.remove();
            return;
          }
          const info = opts.resolveImage(src.trim());
          if (!info) {
            el.remove();
            return;
          }
          el.setAttribute("src", info.src);
          if (info.width && info.height) {
            el.setAttribute("width", String(info.width));
            el.setAttribute("height", String(info.height));
          } else {
            el.removeAttribute("width");
            el.removeAttribute("height");
          }
          if (!el.getAttribute("alt")) el.setAttribute("alt", "");
          el.setAttribute("loading", "lazy");
          el.setAttribute("decoding", "async");
          const small = (info.width ?? 999) < 260;
          if (align === "right" || align === "left") el.setAttribute("class", `float-${align}`);
          else if (small) el.setAttribute("class", "inline-img");
        } else if (tag === "div" || tag === "figure") {
          if (tag === "div") el.removeAndKeepContent();
        }
      },
    });

  html = rewriter.transform(html);
  return tidy(html, opts.paragraphs ?? true);
}

const BLOCK = /^<(p|div|table|ul|ol|dl|blockquote|h[1-6]|hr|figure|pre)\b/i;

/** Whitespace / <br> / empty-tag cleanup, and paragraph building. */
export function tidy(html: string, paragraphs: boolean): string {
  let h = html
    .replace(/<br\s*\/?>/gi, "<br>")
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    // <br> followed by newline is the same line break twice
    .replace(/<br>\n/g, "<br>")
    .replace(/\n/g, " ");

  // Remove empty inline elements (repeat for nesting).
  for (let i = 0; i < 4; i++) h = h.replace(/<(strong|em|u|s|small|sup|sub|a|q|cite|code)\b[^>]*>(\s|<br>)*<\/\1>/gi, (m) => (m.includes("<br>") ? "<br>" : " "));
  // Move line breaks out of inline formatting: <em>text<br><br></em> → <em>text</em><br><br>
  for (let i = 0; i < 3; i++) h = h.replace(/((?:\s*<br>)+)\s*(<\/(?:strong|em|u|s|small|a)>)/gi, "$2$1");

  if (paragraphs) {
    const chunks = h.split(/(?:\s*<br>\s*){2,}|\s*<\/?p\b[^>]*>\s*/i);
    h = chunks
      .map((c) => c.replace(/^(\s*<br>\s*)+|(\s*<br>\s*)+$/gi, "").trim())
      .filter((c) => c && !/^(\s|<br>)*$/.test(c))
      .map((c) => {
        // Split around block elements so they are not wrapped in <p>.
        const parts = c.split(/(<(?:table|ul|ol|dl|blockquote|h[1-6]|figure|pre)\b[\s\S]*?<\/(?:table|ul|ol|dl|blockquote|h[1-6]|figure|pre)>|<hr\s*\/?>)/i);
        return parts
          .map((p) => p.replace(/^(\s*<br>\s*)+|(\s*<br>\s*)+$/gi, "").trim())
          .filter(Boolean)
          .map((p) => (BLOCK.test(p) ? p : `<p>${p}</p>`))
          .join("\n");
      })
      .join("\n");
  }
  h = balance(h);
  for (let i = 0; i < 3; i++) h = h.replace(/<(strong|em|u|s|small|sup|sub|a|q|cite|code)\b[^>]*>\s*<\/\1>/gi, " ");
  return decodeSafeEntities(h)
    // Fragments of broken tags that leaked into the text: `ign="bottom" nosave>`
    .replace(/(^|>)([^<]*?)\s*\b[a-z-]+="[^"<>]*"(?:\s+[a-z-]+(?:="[^"<>]*")?)*\s*\/?>/gi, "$1$2")
    .replace(/<p>\s*(?:<br>\s*)*<\/p>/g, "")
    .replace(/<(td|th|li|dd)([^>]*)>\s*(?:<br>\s*)+/gi, "<$1$2>")
    .replace(/(?:\s*<br>)+\s*<\/(td|th|li|dd|blockquote|figcaption|h\d)>/gi, "</$1>")
    .replace(/ {2,}/g, " ")
    .replace(/ +<\/p>/g, "</p>")
    .replace(/<p> +/g, "<p>")
    .trim();
}

/** Turn entities into characters, except the ones that are HTML syntax. */
export function decodeSafeEntities(html: string): string {
  return html.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m) => {
    const c = decodeEntities(m);
    return c === m || c === "<" || c === ">" || c === "&" || c === '"' ? m : c;
  });
}

const VOID = new Set(["br", "img", "hr"]);
const INLINE = new Set(["a", "strong", "em", "u", "s", "small", "sup", "sub", "q", "cite", "code"]);

/**
 * Make the markup well-formed: close inline elements before block boundaries,
 * drop stray closing tags, close whatever is left open. Legacy content is full
 * of unclosed <a> and crossed tags that browsers would otherwise propagate.
 */
export function balance(html: string): string {
  const out: string[] = [];
  const stack: string[] = [];
  const closeUntil = (pred: (tag: string) => boolean) => {
    while (stack.length && pred(stack.at(-1)!)) out.push(`</${stack.pop()}>`);
  };
  for (const m of html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>|[^<]+|</gi)) {
    const [token, slash, rawTag] = m;
    if (!rawTag) {
      out.push(token === "<" ? "&lt;" : token);
      continue;
    }
    const tag = rawTag.toLowerCase();
    if (VOID.has(tag)) {
      if (!slash) out.push(token);
      continue;
    }
    if (!slash) {
      if (!INLINE.has(tag)) {
        closeUntil((t) => INLINE.has(t));
        if (stack.at(-1) === "p") out.push(`</${stack.pop()}>`);
      }
      if (tag === "a" && stack.includes("a")) closeUntil(() => stack.includes("a"));
      if ((tag === "li" && stack.at(-1) === "li") || ((tag === "td" || tag === "th") && /^t[dh]$/.test(stack.at(-1) ?? ""))) out.push(`</${stack.pop()}>`);
      if (tag === "tr") closeUntil((t) => t === "td" || t === "th" || t === "tr");
      stack.push(tag);
      out.push(token);
    } else if (stack.includes(tag)) {
      closeUntil((t) => t !== tag);
      out.push(`</${stack.pop()}>`);
    }
    // else: stray closing tag, dropped
  }
  closeUntil(() => true);
  return out.join("");
}

/** Last pass for any stored HTML fragment: well-formed, no empty elements. */
export function finalize(html: string): string {
  let h = balance(html);
  for (let i = 0; i < 3; i++) {
    h = h
      .replace(/<(strong|em|u|s|small|sup|sub|a|q|cite|code)\b[^>]*>\s*<\/\1>/gi, " ")
      .replace(/<p>\s*(?:<br>\s*)*<\/p>/g, "")
      .replace(/<p>(\s*<br>)+/g, "<p>")
      .replace(/(<br>\s*)+<\/p>/g, "</p>");
  }
  return h.replace(/\n{2,}/g, "\n").trim();
}
