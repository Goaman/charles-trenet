#!/usr/bin/env bun
/**
 * Serve the static export (dist/) the way GitHub Pages does, to check it
 * locally:   bun run export && bun run preview   → http://localhost:4000/charles-trenet/
 *
 * - the site lives under its base path (from data-base in dist/index.html);
 * - /a/b serves a/b.html, then a/b/index.html (after a redirect to /a/b/);
 * - anything else gets 404.html with a 404 status. No query-string routing.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";

const DIST = process.argv[2] ?? "dist";
const PORT = Number(process.env.PORT || 4000);
if (!existsSync(join(DIST, "index.html"))) throw new Error(`${DIST}/index.html not found: run \`bun run export\` first`);
const BASE = /data-base="([^"]*)"/.exec(readFileSync(join(DIST, "index.html"), "utf8"))?.[1] ?? "";

const isFile = (p: string) => existsSync(p) && statSync(p).isFile();

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    let path = decodeURIComponent(url.pathname);
    if (BASE && !path.startsWith(BASE + "/") && path !== BASE) {
      return path === "/" ? Response.redirect(`${BASE}/`, 302) : new Response("Not found", { status: 404 });
    }
    path = normalize(path.slice(BASE.length) || "/");
    if (path.includes("..")) return new Response("Bad request", { status: 400 });
    const abs = join(DIST, path);
    if (isFile(abs)) return new Response(Bun.file(abs));
    if (!path.endsWith("/") && isFile(abs + ".html")) return new Response(Bun.file(abs + ".html"));
    if (isFile(join(abs, "index.html"))) {
      if (!path.endsWith("/")) return Response.redirect(`${BASE}${path}/${url.search}`, 301);
      return new Response(Bun.file(join(abs, "index.html")));
    }
    return new Response(Bun.file(join(DIST, "404.html")), { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
});
console.log(`Static preview of ${DIST}/ — http://localhost:${PORT}${BASE}/`);
