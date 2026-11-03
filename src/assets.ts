/**
 * Static assets with content-hash versioning (?v=…), so they can be cached
 * forever by browsers.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const PUBLIC_DIR = join(import.meta.dir, "../public");
const ASSETS_DIR = join(PUBLIC_DIR, "assets");

const versions = new Map<string, string>();
function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs);
    else versions.set(relative(ASSETS_DIR, abs), Bun.hash(readFileSync(abs)).toString(36).slice(0, 8));
  }
}
walk(ASSETS_DIR);

export function assetUrl(path: string): string {
  const v = versions.get(path);
  return `/assets/${path}${v ? `?v=${v}` : ""}`;
}

/** A global version, used in ETags of rendered pages. */
export const BUILD_ID = Bun.hash([...versions.values()].join("")).toString(36);
