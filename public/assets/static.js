/*
 * Static export only (GitHub Pages): what the Bun server does at request time,
 * done in the browser instead.
 *   - full-text search (/recherche) and header suggestions, from JSON indexes;
 *   - /hasard, a random song;
 *   - 404 page: old PostNuke URLs (modules.php?…, chansons/x.html…) → new page.
 * The data files are written by scripts/export.ts; their URLs are set on <html>.
 */
(() => {
  const root = document.documentElement;
  const base = root.dataset.base || "";
  const $ = (s, el = document) => el.querySelector(s);

  // --- Text folding: lowercase, no accents, SAME LENGTH as the input, so that
  // positions found in the folded text are valid in the original.
  const foldCache = new Map();
  const fold = (s) => {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c < "\u0080") { out += c.toLowerCase(); continue; }
      let f = foldCache.get(c);
      if (f === undefined) {
        f = c.normalize("NFD")[0].toLowerCase()[0];
        if (f.length !== 1) f = c;
        foldCache.set(c, f);
      }
      out += f;
    }
    return out;
  };
  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const terms = (q) => [...new Set(fold(q).split(/[^\p{L}\p{N}]+/u).filter(Boolean))].slice(0, 8);
  // A term matches at the start of a word (like the server's FTS5 prefix query)
  const termRe = (t) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(t)}`, "gu");
  const count = (re, s) => { re.lastIndex = 0; let n = 0; while (re.exec(s)) n++; return n; };

  const loadJson = (() => {
    const cache = new Map();
    return (url) => {
      if (!cache.has(url)) cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(url); return r.json(); }));
      return cache.get(url);
    };
  })();

  // --- Suggestions (header search box): titles only, small file --------------
  let titles;
  const KIND_ORDER = ["chanson", "article", "poeme", "lettre", "document", "chronologie", "agenda", "forum"];
  window.__suggest = async (q) => {
    titles ??= loadJson(root.dataset.searchTitles).then((rows) => rows.map(([kind, url, title]) => ({ kind, url: base + url, title, folded: fold(title) })));
    const list = await titles;
    const ts = terms(q);
    if (!ts.length) return [];
    const res = ts.map(termRe);
    const fq = fold(q.trim());
    return list
      .filter((d) => res.every((re) => { re.lastIndex = 0; return re.test(d.folded); }))
      .map((d) => ({ d, score: (d.folded.startsWith(fq) ? 0 : 1) * 10 + KIND_ORDER.indexOf(d.kind) + d.title.length / 1000 }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 8)
      .map(({ d }) => ({ kind: d.kind, url: d.url, title: d.title }));
  };

  // --- Full-text search page -------------------------------------------------
  const results = $("[data-search-results]");
  if (results) {
    const LABELS = { article: "Articles", chanson: "Chansons", poeme: "Poèmes", lettre: "Lettres", document: "Documents", forum: "Forum", agenda: "Agenda", chronologie: "Chronologie" };
    const MAX = 60;
    const params = new URL(location.href).searchParams;
    const q = (params.get("q") || "").trim().slice(0, 120);
    const kind = params.get("type") || "";
    const input = $("#q-page");
    if (q) {
      input.value = q;
      document.title = `Recherche : ${q} · Charles Trenet`;
      $("main h1").textContent = `« ${q} »`;
      results.innerHTML = '<p class="muted" aria-live="polite">Recherche en cours…</p>';
      loadJson(root.dataset.searchIndex).then((rows) => render(search(rows, q)), () => {
        results.innerHTML = '<p class="empty">La recherche n’a pas pu être chargée. Réessayez dans un instant.</p>';
      });
    }

    function prepare(rows) {
      if (rows.prepared) return rows.prepared;
      const docs = rows.map(([kind, url, title, body, meta]) => ({ kind, url, title, body, meta, ft: fold(title), fb: fold(body) }));
      const avg = docs.reduce((a, d) => a + d.body.length, 0) / docs.length;
      return (rows.prepared = { docs, avg });
    }

    // BM25-like ranking, title matches weigh 8× (same weights as the server)
    function search(rows, q) {
      const { docs, avg } = prepare(rows);
      const ts = terms(q);
      const res = ts.map(termRe);
      const hits = [];
      if (!ts.length) return { hits, res };
      for (const d of docs) {
        const tf = [];
        let ok = true;
        for (const re of res) {
          const t = count(re, d.ft), b = count(re, d.fb);
          if (!t && !b) { ok = false; break; }
          tf.push([t, b]);
        }
        if (ok) hits.push({ d, tf });
      }
      const n = docs.length;
      const idf = res.map((_, i) => {
        const df = hits.length ? hits.filter((h) => h.tf[i][0] + h.tf[i][1] > 0).length : 0;
        return Math.log(1 + (n - df + 0.5) / (df + 0.5));
      });
      const norm = (len) => 1.2 * (0.25 + 0.75 * len / avg);
      for (const h of hits) {
        h.score = h.tf.reduce((s, [t, b], i) => s + idf[i] * (8 * t / (t + 1) + (b * 2.2) / (b + norm(h.d.body.length))), 0);
      }
      // The page whose title IS the query comes first ("douce france" → the song)
      const fq = ts.join(" ");
      for (const h of hits) if (h.d.ft.split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(" ") === fq) h.score += 1000;
      hits.sort((a, b) => b.score - a.score);
      return { hits, res };
    }

    function mark(text, folded, res) {
      const ranges = [];
      for (const re of res) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(folded))) {
          // extend to the end of the word, like FTS5's highlight()
          let end = m.index + m[0].length;
          while (end < folded.length && /[\p{L}\p{N}]/u.test(folded[end])) end++;
          ranges.push([m.index, end]);
        }
      }
      ranges.sort((a, b) => a[0] - b[0]);
      let out = "", at = 0;
      for (const [s, e] of ranges) {
        if (s < at) continue;
        out += escapeHtml(text.slice(at, s)) + "<mark>" + escapeHtml(text.slice(s, e)) + "</mark>";
        at = e;
      }
      return out + escapeHtml(text.slice(at));
    }

    function snippet(d, res) {
      let first = -1;
      for (const re of res) {
        re.lastIndex = 0;
        const m = re.exec(d.fb);
        if (m && (first < 0 || m.index < first)) first = m.index;
      }
      if (first < 0) first = 0;
      // ~28 words, starting a few words before the first match
      let start = first;
      for (let words = 0; start > 0 && words < 8; start--) if (/\s/.test(d.body[start - 1]) && !/\s/.test(d.body[start])) words++;
      let end = first;
      for (let words = 0; end < d.body.length && words < 20; end++) if (/\s/.test(d.body[end]) && !/\s/.test(d.body[end - 1] ?? "")) words++;
      const text = d.body.slice(start, end), folded = d.fb.slice(start, end);
      return (start > 0 ? "…" : "") + mark(text, folded, res).replace(/\s+/g, " ").trim() + (end < d.body.length ? "…" : "");
    }

    function render({ hits, res }) {
      if (!hits.length) {
        results.innerHTML = `<p class="empty">Aucun résultat pour « ${escapeHtml(q)} ». Essayez un autre mot, ou parcourez <a href="${base}/chansons">le catalogue des chansons</a>.</p>`;
        return;
      }
      const counts = new Map();
      for (const h of hits) counts.set(h.d.kind, (counts.get(h.d.kind) || 0) + 1);
      const sorted = [...counts].sort((a, b) => b[1] - a[1]);
      const current = counts.has(kind) ? kind : "";
      const tab = (k, label, n) => `<a href="${base}/recherche?q=${encodeURIComponent(q)}${k ? `&amp;type=${k}` : ""}"${k === current ? ' aria-current="true"' : ""}>${label} <span>${n}</span></a>`;
      const shown = hits.filter((h) => !current || h.d.kind === current).slice(0, MAX);
      results.innerHTML =
        `<nav class="segmented tabs" aria-label="Filtrer les résultats">${tab("", "Tout", hits.length)}${sorted.map(([k, n]) => tab(k, LABELS[k] || k, n)).join("")}</nav>` +
        `<ol class="results">${shown.map(({ d }) => `<li><p class="result-kind">${(LABELS[d.kind] || d.kind).replace(/s$/, "")}${d.meta ? ` · ${escapeHtml(d.meta)}` : ""}</p><a class="result-title" href="${base}${escapeHtml(d.url)}">${mark(d.title, d.ft, res)}</a><p class="result-snippet">${snippet(d, res)}</p></li>`).join("")}</ol>` +
        (shown.length >= MAX ? '<p class="muted">Seuls les 60 premiers résultats sont affichés : précisez votre recherche.</p>' : "");
    }
  }

  // --- /hasard -------------------------------------------------------------------
  const random = $("[data-random]");
  if (random) {
    const links = [...random.querySelectorAll("ul a")];
    if (links.length) location.replace(links[Math.floor(Math.random() * links.length)].href);
  }

  // --- 404: old URLs → new pages -------------------------------------------------
  const notFound = $("[data-not-found]");
  if (notFound) {
    const path = location.pathname.startsWith(base) ? location.pathname.slice(base.length) || "/" : location.pathname;
    const code = $("[data-path]", notFound);
    if (code) { try { code.textContent = decodeURI(path) + location.search; } catch { code.textContent = path; } }
    resolve(path, location.search, location.hash).then((to) => {
      if (to && to !== path + location.search) location.replace(base + to);
    }, () => {});
  }

  async function resolve(path, search, hash) {
    if (path.length > 1 && path.endsWith("/")) return path.replace(/\/+$/, "") + search + hash;
    const [data, { resolveLegacyUrl }] = await Promise.all([loadJson(root.dataset.legacy), import(root.dataset.legacyJs)]);
    const lookup = {
      article: (id) => data.articles[id] ?? null,
      text: (file) => data.texts[file.toLowerCase()] ?? null,
      thread: (id) => data.threads[id] ?? null,
      forum: (id) => (data.forums[id] ? `/forum/${data.forums[id]}` : null),
      topic: (id) => (data.topics[id] ? `/themes/${data.topics[id]}` : null),
      media: (p) => data.media[p.toLowerCase()] ?? null,
    };
    // New-style URLs with an outdated slug: /articles/12, /forum/sujet/34-x
    let m = /^\/articles\/(\d+)(?:-[\w-]*)?$/.exec(path);
    if (m) return lookup.article(Number(m[1]));
    m = /^\/forum\/sujet\/(\d+)(?:-[\w-]*)?(\/page\/\d+)?$/.exec(path);
    if (m) return lookup.thread(Number(m[1])) && lookup.thread(Number(m[1])) + (m[2] ?? "");
    return resolveLegacyUrl(path + search + hash, lookup);
  }
})();
