// Shared top banner for every mini tool: a 32px paper strip with a link back to the dashboard.
// Include right after <body>:  <script src="../tool-banner.js" data-tool="Tool name"></script>
// It sets --tool-banner (32px) on :root so a tool can size itself with calc(100vh - var(--tool-banner, 0px)).
(function () {
  const s = document.currentScript, name = (s && s.dataset.tool) || document.title, home = (s && s.dataset.home) || '../index.html';
  // Always dark, matching the dashboard.
  const t = { bg: '#151515', ink: '#f2f2f0', muted: '#9a9c99', line: '#3a3a38', hover: '#222222' };
  const style = document.createElement('style');
  style.textContent = `
    :root{--tool-banner:32px}
    #tool-banner{box-sizing:border-box;height:32px;flex:0 0 32px;display:flex;align-items:center;gap:16px;padding:0 16px;
      background:${t.bg};border-bottom:1px solid ${t.line};font:13px/1.25 "HelveticaNeue","Helvetica Neue",Helvetica,Arial,sans-serif;letter-spacing:.143px;color:${t.ink};
      -webkit-font-smoothing:antialiased;position:relative;z-index:50}
    #tool-banner a{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 8px;margin-left:-8px;color:${t.muted};text-decoration:none;transition:color 120ms linear,background-color 120ms linear}
    #tool-banner a:hover{color:${t.ink};background:${t.hover}}
    #tool-banner a .arr{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif}
    #tool-banner .name{margin-left:auto;color:${t.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #tool-banner .name::after{content:"_";color:${t.muted}}
    #tool-banner a:focus-visible{outline:1px solid ${t.ink};outline-offset:-3px}`;
  document.head.appendChild(style);
  const el = document.createElement('div'); el.id = 'tool-banner';
  el.innerHTML = `<a href="${home}"><span class="arr">←</span><span>Scuggnizzi tools</span></a><span class="name"></span>`;
  el.querySelector('.name').textContent = name.toLowerCase();
  document.body.prepend(el);
})();
