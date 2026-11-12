// Shared top banner for every mini tool: a 32px paper strip with the way back to the dashboard, the tool's name, and on
// the right the project, undo and redo, shortcuts, light or dark, and the suite's version.
// Include right after <body>:  <script src="../tool-banner.js" data-tool="Tool name"></script>
// It sets --tool-banner (32px) on :root so a tool can size itself with calc(100vh - var(--tool-banner, 0px)).
//
// It is drawn in Enkel's tokens, so it flips with the page. A page that has not loaded the Enkel stylesheet still gets
// the dark values, through the fallbacks. Others add to it: tool-kit.js puts undo, redo and ? in it, project.js the
// project. CSS `order` sets where each sits, whatever order they arrive in.
(function () {
  const s = document.currentScript, name = (s && s.dataset.tool) || document.title, home = (s && s.dataset.home) || '../index.html';
  const v = (token, dark) => `var(--${token},${dark})`;
  const style = document.createElement('style');
  style.textContent = `
    :root{--tool-banner:32px}
    #tool-banner{box-sizing:border-box;height:32px;flex:0 0 32px;display:flex;align-items:center;gap:12px;padding:1px 12px 0 8px;position:relative;z-index:50;
      background:${v('surface-paper', '#151515')};border-bottom:1px solid ${v('border-hairline', '#3a3a38')};color:${v('text-primary', '#f2f2f0')};
      font:13px/1.25 ${v('font-helveticaneue', '"Helvetica Neue",Helvetica,Arial,sans-serif')};letter-spacing:.143px;-webkit-font-smoothing:antialiased;white-space:nowrap}
    #tool-banner *{box-sizing:border-box}
    #tool-banner .tb-crumb{order:0;display:flex;align-items:center;gap:8px;min-width:0}
    /* Every word in the bar sits on one baseline (20, measured): the boxes stay centred and the words take the 4px
       optical nudge inside them, as the Light/Dark words do. */
    #tool-banner .tb-home{display:inline-flex;align-items:center;gap:6px;height:24px;padding:4px 6px 0;border-radius:4px;color:${v('text-muted', '#9a9c99')};text-decoration:none;
      transition:color 120ms linear,background-color 120ms linear}
    #tool-banner .tb-home:hover{color:${v('text-primary', '#f2f2f0')};background:${v('surface-row-hover', '#222222')}}
    #tool-banner .tb-sep{padding-top:4px;color:${v('text-faint', '#5e605d')}}
    #tool-banner .name{min-width:0;padding-top:4px;overflow:hidden;text-overflow:ellipsis;color:${v('text-primary', '#f2f2f0')}}
    #tool-banner .name::after{content:"_"}
    #tool-banner .tb-grow{order:1;flex:1;min-width:8px}
    #tool-banner .sp-project{order:2}
    #tk-ctl{order:3}
    #tool-banner .tb-theme{order:4;display:inline-flex;gap:2px;padding:2px;height:24px;border:1px solid ${v('border-card', '#2a2a29')};border-radius:4px;background:${v('surface-sunken', '#0e0e0e')}}
    #tool-banner .tb-theme button{height:18px;min-height:0;padding:3px 8px 1px;border:0;border-radius:2px;background:transparent;color:${v('text-muted', '#9a9c99')};
      font:inherit;font-size:12px;line-height:14px;letter-spacing:.132px;cursor:pointer;transition:color 120ms linear,background-color 120ms linear}
    #tool-banner .tb-theme button:hover{color:${v('text-primary', '#f2f2f0')}}
    #tool-banner .tb-theme button[aria-checked="true"]{background:${v('text-primary', '#f2f2f0')};color:${v('surface-paper', '#151515')};cursor:default}
    #tool-banner .ver{order:5;padding-top:2px;color:${v('text-muted', '#9a9c99')};font-family:${v('font-mono-detail', 'ui-monospace,Menlo,monospace')};font-size:11px;letter-spacing:0;text-decoration:none;transition:color 120ms linear}
    #tool-banner .ver:hover{color:${v('text-primary', '#f2f2f0')}}
    #tool-banner a:focus-visible,#tool-banner button:focus-visible{outline:1px solid ${v('focus-ring', '#f2f2f0')};outline-offset:1px}
    @media (max-width:640px){#tool-banner .tb-home .tb-label,#tool-banner .ver{display:none}}`;
  document.head.appendChild(style);

  const el = document.createElement('div'); el.id = 'tool-banner';
  el.innerHTML = `<nav class="tb-crumb" aria-label="Breadcrumb"><a class="tb-home" href="${home}" title="Back to the dashboard"><span aria-hidden="true">←</span><span class="tb-label">Scugnizzi tools</span></a><span class="tb-sep" aria-hidden="true">›</span><span class="name" aria-current="page"></span></nav><span class="tb-grow"></span>`;
  el.querySelector('.name').textContent = name.toLowerCase();
  document.body.prepend(el);

  // Light or dark: theme.js keeps the pick; this is the switch for it. A page that forgot theme.js in its <head> gets
  // it here, a frame late.
  const theme = document.createElement('span'); theme.className = 'tb-theme'; theme.setAttribute('role', 'radiogroup'); theme.setAttribute('aria-label', 'Colour mode');
  theme.innerHTML = '<button type="button" role="radio" data-t="light">Light</button><button type="button" role="radio" data-t="dark">Dark</button>';
  el.appendChild(theme);
  // A radio group: one Tab stop on the picked mode, the arrows move the pick (tool-kit leaves them to a focused radio).
  const paint = () => { const t = window.ScugnizziTheme ? window.ScugnizziTheme.get() : 'dark'; theme.querySelectorAll('button').forEach(b => { const on = b.dataset.t === t; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }); };
  theme.addEventListener('click', e => { const b = e.target.closest('button'); if (b && window.ScugnizziTheme) window.ScugnizziTheme.set(b.dataset.t); });
  theme.addEventListener('keydown', e => {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!step || e.altKey || e.ctrlKey || e.metaKey || !window.ScugnizziTheme) return;
    e.preventDefault();
    const bs = [...theme.querySelectorAll('button')], next = bs[(bs.indexOf(document.activeElement) + step + bs.length) % bs.length];
    window.ScugnizziTheme.set(next.dataset.t); next.focus();
  });
  const wire = () => { paint(); window.ScugnizziTheme.onChange(paint); };
  const base = new URL(home, location.href);
  if (window.ScugnizziTheme) wire();
  else { const t = document.createElement('script'); t.src = new URL('theme.js', base).href; t.onload = wire; document.head.appendChild(t); paint(); }

  // The suite's version, from version.js beside the dashboard (the one place it is written).
  const ver = document.createElement('a'); ver.className = 'ver'; ver.href = new URL('CHANGELOG.md', base).href; ver.title = 'What changed, newest first';
  el.appendChild(ver);
  const show = () => { if (window.SCUGNIZZI_VERSION) ver.textContent = 'v' + window.SCUGNIZZI_VERSION; };
  if (window.SCUGNIZZI_VERSION) show();
  else {
    const vs = document.createElement('script');
    vs.src = new URL('version.js', base).href;
    vs.onload = show;
    document.head.appendChild(vs);
  }
})();
