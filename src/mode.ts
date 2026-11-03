/**
 * The site runs in two modes:
 * - server (default): `bun start`, SQLite queried per request;
 * - static export (`STATIC_EXPORT=1`, see scripts/export.ts): every page is
 *   rendered once to HTML for a static host (GitHub Pages). Search, the random
 *   song and old-URL redirects then run in the browser (public/assets/static.js).
 */
export const STATIC = process.env.STATIC_EXPORT === "1";

export const CSP =
  "default-src 'self'; img-src 'self' data:; style-src 'self'; style-src-attr 'unsafe-inline'; script-src 'self'; font-src 'self'; " +
  "frame-src https://www.youtube-nocookie.com; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

/** The same policy for a <meta> tag (which cannot carry frame-ancestors). */
export const CSP_META = CSP.replace(/;\s*frame-ancestors[^;]*/, "");
