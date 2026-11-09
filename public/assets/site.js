/* Progressive enhancements. The site works without any of this. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const root = document.documentElement;

  // Theme toggle: "le soleil a rendez-vous avec la lune"
  $$("[data-theme-toggle]").forEach((b) =>
    b.addEventListener("click", () => window.__setTheme(root.hasAttribute("data-dark") ? "light" : "dark")),
  );

  // Mobile menu
  const menuBtn = $("[data-menu-toggle]");
  const menu = $("#menu-mobile");
  menuBtn?.addEventListener("click", () => {
    const open = menuBtn.getAttribute("aria-expanded") !== "true";
    menuBtn.setAttribute("aria-expanded", String(open));
    menu.hidden = !open;
    if (open) $("input", menu)?.focus();
  });

  // "/" focuses the search box
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || /input|textarea|select/i.test(document.activeElement?.tagName ?? "")) return;
    const input = [$("#q-page"), $("[data-catalogue-filter] input[type=search]"), $("#q-top")].find((i) => i && i.offsetParent !== null);
    if (input) { e.preventDefault(); input.focus(); input.select(); }
  });

  // Typeahead on the header search
  const top = $("#q-top");
  if (top) {
    const list = document.createElement("ul");
    list.className = "typeahead";
    list.hidden = true;
    list.setAttribute("role", "listbox");
    top.parentElement.append(list);
    const LABEL = { article: "article", chanson: "chanson", poeme: "poème", lettre: "lettre", document: "document", forum: "forum", agenda: "agenda", chronologie: "année" };
    let timer, active = -1, ctrl;
    const render = (items) => {
      list.replaceChildren(...items.map((it, i) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = it.url; a.textContent = it.title; a.id = `ta-${i}`;
        const span = document.createElement("span"); span.textContent = LABEL[it.kind] ?? it.kind;
        a.append(span); li.append(a); return li;
      }));
      list.hidden = !items.length; active = -1;
    };
    top.addEventListener("input", () => {
      clearTimeout(timer);
      const q = top.value.trim();
      if (q.length < 2) return render([]);
      timer = setTimeout(async () => {
        ctrl?.abort(); ctrl = new AbortController();
        try {
          // Static export: suggestions come from a local index (static.js)
          render(window.__suggest ? await window.__suggest(q) : await (await fetch(`/api/recherche?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })).json());
        } catch {}
      }, 140);
    });
    top.addEventListener("keydown", (e) => {
      const links = $$("a", list);
      if (!links.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
        links.forEach((l, i) => l.setAttribute("aria-selected", String(i === active)));
      } else if (e.key === "Enter" && active >= 0) { e.preventDefault(); links[active].click(); }
      else if (e.key === "Escape") render([]);
    });
    top.addEventListener("blur", () => setTimeout(() => (list.hidden = true), 150));
  }

  // Song catalogue: live filtering + histogram
  const form = $("[data-catalogue-filter]");
  if (form) {
    const input = $("input[type=search]", form);
    const box = $("input[name=paroles]", form);
    const count = $("[data-count]", form);
    const empty = $("[data-empty]");
    const songs = $$("[data-catalogue] li.song");
    const groups = $$("[data-catalogue] .letter-group");
    const fold = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    const params = new URL(location.href).searchParams;
    let year = params.get("annee") || "";
    const apply = () => {
      const q = fold(input.value.trim());
      let n = 0;
      for (const li of songs) {
        const ok = (!q || li.dataset.title.includes(q)) && (!box.checked || li.dataset.lyrics === "1") && (!year || li.dataset.year === year);
        li.hidden = !ok; if (ok) n++;
      }
      for (const g of groups) g.hidden = !$$("li.song:not([hidden])", g).length;
      count.textContent = n; empty.hidden = n > 0;
      const reset = $("[data-reset-wrap]", form);
      if (reset) reset.hidden = !(q || box.checked || year);
      $$(".bar").forEach((b) => b.classList.toggle("is-selected", b.dataset.year === year));
      const url = new URL(location.href);
      for (const [k, v] of [["q", input.value.trim()], ["paroles", box.checked ? "1" : ""], ["annee", year]]) v ? url.searchParams.set(k, v) : url.searchParams.delete(k);
      history.replaceState(null, "", url);
    };
    form.addEventListener("submit", (e) => { e.preventDefault(); apply(); });
    input.addEventListener("input", apply);
    box.addEventListener("change", apply);
    $$(".bar").forEach((b) => b.addEventListener("click", (e) => {
      e.preventDefault();
      year = year === b.dataset.year ? "" : b.dataset.year;
      $("input[name=annee]", form)?.remove();
      apply();
    }));
    $("[data-reset]", form)?.addEventListener("click", (e) => { e.preventDefault(); input.value = ""; box.checked = false; year = ""; apply(); });
    // Filters given in the URL (always the case for the static export, where
    // the page is rendered unfiltered)
    if (!input.value && params.get("q")) input.value = params.get("q");
    if (params.get("paroles") === "1") box.checked = true;
    if (input.value || box.checked || year) apply();
  }

  // Lyrics tools
  const lyrics = $("[data-lyrics]");
  if (lyrics) {
    let size = Number(localStorage.getItem("lyrics-size") || 0);
    const setSize = () => (size ? lyrics.setAttribute("data-size", size) : lyrics.removeAttribute("data-size"));
    setSize();
    $("[data-lyrics-size]")?.addEventListener("click", () => { size = (size + 1) % 3; localStorage.setItem("lyrics-size", size); setSize(); });
    $("[data-print]")?.addEventListener("click", () => print());
    $("[data-copy-link]")?.addEventListener("click", async (e) => {
      try { await navigator.clipboard.writeText(location.href.split("#")[0]); e.currentTarget.setAttribute("data-done", ""); } catch {}
    });
  }

  // YouTube: load the (privacy-enhanced) player only when asked
  $$("figure[data-youtube] > a").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const id = a.parentElement.dataset.youtube;
      const f = document.createElement("iframe");
      f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`;
      f.title = "Vidéo YouTube";
      f.allow = "autoplay; encrypted-media; picture-in-picture";
      f.allowFullscreen = true;
      a.replaceWith(f);
    }),
  );

  // Lightbox for article images
  const zoomable = $$("[data-lightbox] img:not(.inline-img)");
  if (zoomable.length && window.HTMLDialogElement) {
    const dlg = document.createElement("dialog");
    dlg.className = "lightbox";
    dlg.innerHTML = '<button type="button" aria-label="Fermer">×</button><img alt="">';
    document.body.append(dlg);
    const big = $("img", dlg);
    dlg.addEventListener("click", () => dlg.close());
    zoomable.forEach((img) => {
      if (img.closest("a")) return;
      img.addEventListener("click", () => { big.src = img.currentSrc || img.src; big.alt = img.alt; big.style.clipPath = img.style.clipPath; dlg.showModal(); });
    });
  }

  // Timeline: highlight the current decade
  const decadeLinks = $$(".decades a");
  if (decadeLinks.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) {
        const d = en.target.dataset.decade;
        decadeLinks.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#decennie-${d}`));
      }
    }, { rootMargin: "-30% 0px -60% 0px" });
    $$(".tl-item[data-decade]").forEach((el) => io.observe(el));
  }
})();
