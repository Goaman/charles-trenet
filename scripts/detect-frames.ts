#!/usr/bin/env bun
/**
 * Find the frames baked into the edges of the images: the white border and
 * the grey drop shadow the old site drew into its pictures. They disappear on
 * the light theme (multiply blend) but show as a pale edge on the dark one.
 *
 *   bun scripts/detect-frames.ts [public/media]     (needs ImageMagick)
 *
 * Writes scripts/migrate/frames.json: { "name.jpg": [top, right, bottom, left] }
 * in pixels. The migration reads it (offline, deterministic) and clips these
 * edges when the image is shown; the files themselves are left untouched.
 */
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "public/media";
const OUT = join(import.meta.dir, "migrate/frames.json");
/** A frame is at most this thick, and at most 6 % of the side. */
const MAX = 14;

type Line = { mean: number; sd: number; chroma: number };
/** Light, even and colourless: a white border or a grey shadow, not a photo's edge or a coloured band. */
const frameLike = (l: Line) => l.mean > 0.55 && l.sd < 0.07 && l.chroma < 0.06;

const out: Record<string, [number, number, number, number]> = {};
for (const name of readdirSync(dir).filter((n) => /\.(jpe?g|png|gif)$/i.test(n)).sort()) {
  const p = Bun.spawnSync(["magick", `${join(dir, name)}[0]`, "-alpha", "remove", "-colorspace", "sRGB", "-depth", "8", "-format", "%w %h\n", "-write", "info:-", "rgb:-"]);
  const buf = p.stdout;
  const nl = buf.indexOf(10);
  if (nl < 0) continue;
  const [w, h] = new TextDecoder().decode(buf.subarray(0, nl)).split(" ").map(Number) as [number, number];
  const px = buf.subarray(nl + 1);
  if (px.length < w * h * 3 || w < 40 || h < 40) continue;

  const line = (row: boolean, i: number): Line => {
    const n = row ? w : h;
    let s = 0, s2 = 0, c = 0;
    for (let k = 0; k < n; k++) {
      const o = 3 * (row ? i * w + k : k * w + i);
      const r = px[o]! / 255, g = px[o + 1]! / 255, b = px[o + 2]! / 255;
      const v = 0.299 * r + 0.587 * g + 0.114 * b;
      s += v;
      s2 += v * v;
      c += Math.max(r, g, b) - Math.min(r, g, b);
    }
    const mean = s / n;
    return { mean, sd: Math.sqrt(Math.max(0, s2 / n - mean * mean)), chroma: c / n };
  };
  /** Thickness of the frame on one side: 0 if none, or if the even band goes on (then it is the picture). */
  const walk = (row: boolean, from: number, step: number, side: number) => {
    const max = Math.min(MAX, Math.floor(side * 0.06));
    let k = 0;
    while (k < max && frameLike(line(row, from + step * k))) k++;
    if (k === 0 || k === max) return 0;
    return k + 1; // and the soft line where the frame meets the picture
  };
  const inset: [number, number, number, number] = [walk(true, 0, 1, h), walk(false, w - 1, -1, w), walk(true, h - 1, -1, h), walk(false, 0, 1, w)];
  if (inset.some((x) => x > 0)) out[name] = inset;
}
writeFileSync(OUT, JSON.stringify(out, null, 0).replace(/\],"/g, '],\n"') + "\n");
console.log(`${Object.keys(out).length} images with a frame → ${OUT}`);
