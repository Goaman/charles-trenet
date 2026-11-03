/* Runs before first paint: pick the theme (stored choice, else the system's). */
(function () {
  var root = document.documentElement;
  root.classList.add("js");
  var stored = null;
  try { stored = localStorage.getItem("theme"); } catch (e) {}
  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  function apply() {
    var dark = stored ? stored === "dark" : mq.matches;
    if (dark) root.setAttribute("data-dark", ""); else root.removeAttribute("data-dark");
  }
  apply();
  mq.addEventListener && mq.addEventListener("change", function () { if (!stored) apply(); });
  window.__setTheme = function (t) { stored = t; try { localStorage.setItem("theme", t); } catch (e) {} apply(); };
})();
