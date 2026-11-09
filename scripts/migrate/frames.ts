/**
 * The frames baked into the old images (white border, grey drop shadow), as
 * measured by scripts/detect-frames.ts. When an image is shown, they are
 * clipped away (clip-path), so every picture sits directly on the page, on
 * the light theme as on the dark one. The files are not modified.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Inset = [top: number, right: number, bottom: number, left: number];
let frames: Record<string, Inset> | null = null;
function all(): Record<string, Inset> {
  const file = join(import.meta.dir, "frames.json");
  return (frames ??= existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {});
}

const pct = (n: number, of: number) => `${+((n / of) * 100).toFixed(2)}%`;

/** "inset(…)" for an image of /media (percentages: independent of the size shown), or null. */
export function frameClip(url: string, width: number | null | undefined, height: number | null | undefined): string | null {
  const name = /^\/media\/([^/?#]+)$/.exec(url)?.[1];
  const f = name ? all()[name] : undefined;
  if (!f || !width || !height) return null;
  const [t, r, b, l] = f;
  return `inset(${pct(t, height)} ${pct(r, width)} ${pct(b, height)} ${pct(l, width)})`;
}

/** Clip the frame of every /media image of an HTML fragment (its width/height attributes are the file's). */
export function clipFrames(html: string, size: (url: string) => { width?: number; height?: number } | undefined): string {
  return html.replace(/<img\b[^>]*>/g, (tag) => {
    if (/\sstyle="/.test(tag)) return tag;
    const src = /\ssrc="([^"]+)"/.exec(tag)?.[1];
    const s = src ? size(src) : undefined;
    const clip = src && s ? frameClip(src, s.width, s.height) : null;
    return clip ? tag.replace(/<img\b/, `<img style="clip-path:${clip}"`) : tag;
  });
}
