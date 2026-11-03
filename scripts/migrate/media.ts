/**
 * Media library: resolves legacy image references to files of the old site,
 * copies the ones actually used to `public/media/` under clean names and
 * records their dimensions.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { decodeEntities, fold, slugify } from "./text.ts";

/** File names are mostly UTF-8, but a few were uploaded as Latin-1 bytes. */
function decodeFileName(raw: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    return new TextDecoder("windows-1252").decode(raw);
  }
}

export interface MediaFile {
  /** Path relative to the legacy site root, e.g. "dominic/vian.gif". */
  legacyPath: string;
  /** Public URL, e.g. "/media/vian.gif". */
  url: string;
  width?: number;
  height?: number;
  bytes: number;
}

/** Read width/height from JPEG, PNG or GIF headers. */
export function imageSize(buf: Uint8Array): { width: number; height: number } | undefined {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (buf.length > 10 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1]!;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = dv.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7) };
      }
      i += 2 + len;
    }
  }
  return undefined;
}

const IMAGE_EXT = /\.(jpe?g|gif|png|bmp|webp)$/i;
const SEARCH_DIRS = ["dominic", "bases/dominic", "chansons", "", "gps", "dalilol", "css", "images", "img", "themes/PostNuke/images"];

export class MediaLibrary {
  private byKey = new Map<string, string[]>();
  private exact = new Set<string>();
  /** Decoded relative path -> raw on-disk path (some names are Latin-1 bytes). */
  private diskPath = new Map<string, Buffer>();
  private used = new Map<string, MediaFile>();
  private names = new Set<string>();
  readonly missing = new Map<string, number>();

  constructor(private legacyRoot: string, private outDir: string) {
    for (const dir of SEARCH_DIRS) {
      const abs = join(legacyRoot, dir);
      let entries: Buffer[] = [];
      try {
        entries = readdirSync(abs, { encoding: "buffer" });
      } catch {
        continue;
      }
      for (const raw of entries) {
        const f = decodeFileName(raw);
        const rel = (dir ? `${dir}/${f}` : f).normalize("NFC");
        const disk = Buffer.concat([Buffer.from(abs + "/"), raw]);
        if (!IMAGE_EXT.test(f) || !statSync(disk).isFile()) continue;
        this.exact.add(rel);
        this.diskPath.set(rel, disk);
        const key = MediaLibrary.key(f);
        const list = this.byKey.get(key) ?? [];
        list.push(rel);
        this.byKey.set(key, list);
      }
    }
  }

  private static key(name: string): string {
    return fold(name.normalize("NFC")).toLowerCase().replace(/\.jpeg$/, ".jpg").replace(/[^a-z0-9.]+/g, "");
  }

  /** Normalise a legacy src (absolute URL, relative path…) to a site-relative path. */
  static normalise(src: string, baseDir = ""): string | null {
    let s = decodeEntities(src.trim()).replace(/\\/g, "");
    s = s.replace(/^https?:\/\/(?:www\.)?charles-trenet\.(?:net|org)/i, "");
    if (/^[a-z]+:/i.test(s) || s.startsWith("//")) return null; // external image
    s = s.replace(/[?#].*$/, "");
    try {
      s = decodeURIComponent(s);
    } catch {
      /* keep as is */
    }
    if (!s.startsWith("/") && baseDir) s = `${baseDir}/${s}`;
    s = s.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
    // Some content links images relative to a module URL: keep the file name.
    if (s.includes(".php")) s = basename(s);
    return s.normalize("NFC");
  }

  /** Find the legacy file for a reference. */
  locate(src: string, baseDir = ""): string | null {
    const rel = MediaLibrary.normalise(src, baseDir);
    if (!rel || !IMAGE_EXT.test(rel)) return null;
    if (this.exact.has(rel)) return rel;
    const candidates = this.byKey.get(MediaLibrary.key(basename(rel)));
    if (!candidates?.length) return null;
    const dir = dirname(rel);
    return candidates.find((c) => dirname(c) === dir) ?? candidates[0]!;
  }

  /** Resolve a reference, copying the file on first use. */
  resolve(src: string, baseDir = ""): MediaFile | null {
    const rel = this.locate(src, baseDir);
    if (!rel) {
      const n = MediaLibrary.normalise(src, baseDir);
      if (n && IMAGE_EXT.test(n)) this.missing.set(n, (this.missing.get(n) ?? 0) + 1);
      return null;
    }
    const known = this.used.get(rel);
    if (known) return known;

    const abs = this.diskPath.get(rel) ?? join(this.legacyRoot, rel);
    const buf = readFileSync(abs);
    const ext = extname(rel).toLowerCase().replace(".jpeg", ".jpg");
    const base = slugify(basename(rel, extname(rel)), 70);
    let name = `${base}${ext}`;
    for (let i = 2; this.names.has(name); i++) name = `${base}-${i}${ext}`;
    this.names.add(name);
    mkdirSync(this.outDir, { recursive: true });
    copyFileSync(abs, join(this.outDir, name));
    const size = imageSize(buf);
    const file: MediaFile = { legacyPath: rel, url: `/media/${name}`, bytes: buf.length, ...size };
    this.used.set(rel, file);
    return file;
  }

  all(): MediaFile[] {
    return [...this.used.values()];
  }

  /** Every legacy image path (used or not) — for redirecting old hotlinks. */
  legacyPaths(): string[] {
    return [...this.exact];
  }

  relativeTo(abs: string): string {
    return relative(this.legacyRoot, abs);
  }
}
