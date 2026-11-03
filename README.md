# charles-trenet.net

"Le portail des amis de Charles Trenet" (since 2001), rebuilt in 2026: Bun +
SQLite, zero runtime dependencies, no accounts, no admin, no forms. The forum is
kept as archives (it was replaced by the official Facebook page); everything else
is presented as a living site: articles show no publication date.

The home page title is `HERO_TITLE` in `src/views/home.ts`: change it from time to
time, to show that the portal is alive.

## Run

    bun install          # TypeScript types only (no runtime dependencies)
    bun start            # http://localhost:3000/
    bun dev              # same, with reload

Env: `PORT` (3000), `HOST` (0.0.0.0), `SITE_URL` (public URL used for canonical
links, RSS and sitemap; default `https://www.charles-trenet.net`), `DB_PATH`.

Docker:

    docker build -t charles-trenet . && docker run -p 3000:3000 charles-trenet

## Static version (GitHub Pages)

The site is published on GitHub Pages as plain HTML files:
**https://goaman.github.io/charles-trenet/**. The workflow
`.github/workflows/pages.yml` runs the tests, exports, and deploys on every push
to `master` and every night, because the home page has a song and a "ce jour-là"
entry that change daily.

    bun run export       # → dist/  (--site-url https://… --out dir)
    bun run preview      # serves dist/ like GitHub Pages: http://localhost:4000/charles-trenet/

The export renders every page with the same code as the server, by crawling from
the sitemap, and fails on any broken internal link. Where the server works at
request time, the static version does the job in the browser instead
(`public/assets/static.js`):

- **search**: a JSON index (≈1 MB gzipped), loaded only by the search page;
  suggestions use a titles-only index;
- **random song**: `/hasard`;
- **old URLs**: `404.html` resolves `modules.php?…`, `chansons/x.html`… with the
  same code as the server (`src/legacy.ts`, bundled) and redirects. The server
  sends real 301s; on GitHub Pages they are JavaScript redirects.

Server-side redirects become small `<meta refresh>` pages. With a custom domain,
pass `--site-url https://www.example.org`; links are then written without the
`/charles-trenet` prefix.

## What's in it

| Path | |
|---|---|
| `/articles` (`/articles/populaires`, `/articles/anciens`) | 151 articles by theme, series ("Les grands moments", "Sa route enchantée") and author, with the 302 original reader comments |
| `/chansons` | the 502-song catalogue (per-year histogram, instant filter); 308 with lyrics |
| `/textes` | poems, letters, documents, and songs outside the catalogue |
| `/chronologie` | his life 1913–2001, linked to the articles |
| `/forum` | the forum archives: 467 threads / 2,089 posts (2002–2021), read-only; pages are `…/page/2` |
| `/agenda`, `/liens`, `/a-propos` | events, the links that still work, the story of the portal |
| `/recherche` | accent-insensitive full-text search (SQLite FTS5) + type-ahead suggestions |
| `/flux.xml`, `/sitemap.xml` | articles RSS feed, sitemap |

Extras: daily song and "Ce jour-là" ephemeris on the home page, random song
(`/hasard`), "Évoquée dans" (articles citing a song), light/dark theme ("le soleil /
la lune"), print layout for lyrics, image lightbox, YouTube videos loaded only on
click (youtube-nocookie), schema.org structured data.

**Old URLs**: every PostNuke URL (`modules.php?name=News&…sid=N`, `article.php`,
`chansons/*.html`, `XForum…tid=N`, `backend.php`, images under `/dominic/`…) answers
with a 301 to its new page, so bookmarks and search rankings survive.

## Layout

    src/                 Bun server (no framework)
      mode.ts            server vs static export, CSP
      server.ts          entry point
      app.ts             routing, rendered-page cache, ETag, brotli/gzip, security headers (CSP)
      db.ts              every SQL query (database opened read-only)
      legacy.ts          old URL → new URL mapping (shared with the migration)
      views/             pages (html`` templates with automatic escaping)
    public/assets/       CSS, JS (progressive enhancement only), self-hosted fonts (Fraunces, Source Serif 4 — OFL)
    public/media/        the 1,169 images used by the content
    db/charles-trenet.sqlite   content database (generated, committed)
    scripts/migrate/     PostNuke/MySQL → SQLite migration (run once)
    scripts/export.ts    static export (GitHub Pages); scripts/preview.ts serves it locally
    .github/workflows/   GitHub Pages deployment
    test/                bun test

Content never changes at runtime: the DB is opened read-only and rendered pages
are kept in memory.

## The migration

`scripts/migrate/index.ts` reads the MySQL dump and the old site's files and writes
`db/charles-trenet.sqlite` + `public/media/`. It:

- parses the dump (Windows-1252) without a MySQL server;
- cleans the legacy HTML (`<font>`, `window.open` pop-ups, Flash, unclosed tags…)
  with `HTMLRewriter` and emits well-formed HTML;
- rewrites every internal link and image to the new URLs;
- rebuilds the song catalogue, lyrics (title, credits, publisher), timeline, and
  forum (BBCode → HTML, smilies → emoji);
- removes the links that lead nowhere any more (see below);
- repairs accents the old DB turned into `?` (vocabulary + character-bigram stats
  learned from the clean text), the Mac Roman / Windows-1252 mix in lyric pages,
  and titles typed in CAPITALS;
- **keeps no personal data**: no accounts, passwords, IP addresses, private
  messages, newsletter subscribers or logs; e-mail addresses in posts are masked.

The sources (the MySQL dump and the old PHP site) are not in this repository:
the dump holds personal data (member accounts, e-mail addresses, IPs). They are
kept, with the full history of the old site, in the **private** repository
`Goaman/charles-trenet-backup`. To re-run:

    git clone git@github.com:Goaman/charles-trenet-backup.git /tmp/ct-backup
    mkdir -p data legacy
    git -C /tmp/ct-backup show 5054c90:data/db_2026-11-03.sql > data/db_2026-11-03.sql
    git -C /tmp/ct-backup archive 3509505 site | tar -x -C legacy
    bun run migrate        # --dump, --legacy, --out, --media to change paths

The output is deterministic (same input → same database).

### New content

The discography and the two bibliographies are catalogues, one card per disc or
book (cover, title, references), written in `scripts/migrate/catalogs.ts`; the
long underlined passages of the old pages (track lists, back-cover blurbs) were
left out at the webmaster's request. To add a disc or a book, add a card there.

Other additions (*Les Rois fainéants*, agenda events) are in
`scripts/migrate/additions.ts`. Their images live in `content/media/` (copied to
`public/media/` by the migration). Then `bun run migrate`. An agenda event still
to come is shown open, with an « À venir » badge (as of the build).

### Dead links

`bun scripts/check-links.ts` checks online every site of the "Liens" page and every
link to a video (YouTube and Dailymotion through their APIs, Vimeo, INA,
Facebook…), and writes the dead ones to `scripts/migrate/dead-links.json`. The
migration reads that list: a dead site leaves the "Liens" page; a dead video
disappears with its embed and its thumbnail, a link in a sentence keeps its
words, and a forum message left empty is dropped. Verdicts a robot cannot reach
(sites that block robots, YouTube rate limits) are set by hand in the script.
Re-run it from time to time, then `bun run migrate`.

## Tests

    bun test               # migration (cleaning, accents, titles, BBCode), every page and redirect, static export
    bun run typecheck
