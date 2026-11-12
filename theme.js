// Light or dark, one pick for the whole suite. Load it in <head>, before any stylesheet paints:
//   <script src="../theme.js"></script>
//
// The pick lives in localStorage under `scuggnizzi.theme`, the key Template Studio already uses (src/app/theme.ts), so
// choosing light in a tool turns Template Studio light too, and the other way round. Nothing stored means each page's
// own default: dark here, because pictures and canvases read best on it; Template Studio follows the system. The
// Enkel tokens flip on `data-theme` on <html>; this only sets that attribute, and the browser's theme colour with it.
// Every open tab hears a change through the storage event, so the dashboard and a tool beside it never disagree.
(function () {
  var KEY = 'scuggnizzi.theme', EVENT = 'scuggnizzi-theme', root = document.documentElement;
  // The page colour each theme paints first: Enkel's --surface-paper.
  var PAPER = { light: '#ffffff', dark: '#151515' };
  function stored() { try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null; } catch (e) { return null; } }
  function apply(t) {
    root.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', PAPER[t]);
  }
  var fallback = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  apply(stored() || fallback);

  function get() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  function set(t) {
    t = t === 'light' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, t); } catch (e) { /* storage blocked: the pick holds for this page */ }
    apply(t);
    window.dispatchEvent(new Event(EVENT));
  }
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY && e.key !== null) return;
    apply(stored() || fallback);
    window.dispatchEvent(new Event(EVENT));
  });
  // The meta tag may come after this script in <head>; set it again once it exists.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { apply(get()); });

  window.ScugnizziTheme = {
    get: get,
    set: set,
    toggle: function () { set(get() === 'dark' ? 'light' : 'dark'); },
    /** Calls fn whenever the theme changes, in this tab or another. Returns a function that stops it. */
    onChange: function (fn) { var h = function () { fn(get()); }; window.addEventListener(EVENT, h); return function () { window.removeEventListener(EVENT, h); }; },
  };
})();
