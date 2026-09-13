// Shared kit for the mini tools: keyboard shortcuts, undo/redo, and local persistence.
// Load after tool-banner.js:  <script src="../tool-kit.js"></script>
//
//   ToolKit.init({
//     tool: 'ink-bleed',                 // storage namespace
//     version: 1,                        // bump to discard old saved state
//     getState: () => plainObject,       // JSON-safe snapshot of everything undo should cover
//     setState: obj => { ... },          // restore a snapshot and re-render
//     defaults: () => plainObject,       // fresh state for Reset
//     onReset: () => { ... },            // optional: clear anything kept outside the snapshot
//   });
//   ToolKit.commit()                     // call after any change (debounced, deduped, saved)
//   ToolKit.register('mod+s', 'Download PNG', fn, { group: 'Export' })
//   ToolKit.saveAux(name, value) / ToolKit.loadAux(name)   // bigger blobs kept beside the state
//
// Standard keys everywhere: ⌘Z undo · ⇧⌘Z redo · ? shortcuts · Esc close · ⌥⌘R reset tool.
// Single-key shortcuts pause while you type in a text field; ⌘ combinations still work.
(function () {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  const MOD = isMac ? '⌘' : 'Ctrl';
  const shortcuts = new Map(), order = [];
  let cfg = null, hist = [], idx = -1, applying = false, timer = 0, storeKey = null;

  // ---- storage ----
  const key = n => `scuggnizzi.${cfg ? cfg.tool : 'x'}.${n}`;
  function save(snap) { if (!storeKey) return; try { localStorage.setItem(storeKey, `{"v":${cfg.version || 1},"state":${snap}}`); } catch (e) {} }
  function load() { if (!storeKey) return null; try { const o = JSON.parse(localStorage.getItem(storeKey) || 'null'); return o && o.v === (cfg.version || 1) ? o.state : null; } catch (e) { return null; } }
  function saveAux(name, value) { try { if (value == null) localStorage.removeItem(key(name)); else localStorage.setItem(key(name), typeof value === 'string' ? value : JSON.stringify(value)); return true; } catch (e) { return false; } }
  function loadAux(name, json) { try { const v = localStorage.getItem(key(name)); return v == null ? null : (json ? JSON.parse(v) : v); } catch (e) { return null; } }

  // ---- history ----
  function snapshot() { return JSON.stringify(cfg.getState()); }
  function commit() {
    if (!cfg || !cfg.getState || applying) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const s = snapshot();
      if (hist[idx] === s) return;
      hist = hist.slice(0, idx + 1); hist.push(s); if (hist.length > 100) hist.shift();
      idx = hist.length - 1; save(s); updateButtons();
    }, 350);
  }
  function apply(s) { applying = true; try { cfg.setState(JSON.parse(s)); } finally { applying = false; } save(s); updateButtons(); }
  function undo() { clearTimeout(timer); if (idx <= 0) return toast('Nothing to undo'); idx--; apply(hist[idx]); toast('Undo'); }
  function redo() { clearTimeout(timer); if (idx >= hist.length - 1) return toast('Nothing to redo'); idx++; apply(hist[idx]); toast('Redo'); }
  function reset() {
    if (!cfg) return;
    if (!confirm('Reset this tool to its defaults? Saved work in this browser is cleared.')) return;
    try { for (const k of Object.keys(localStorage)) if (k.startsWith(`scuggnizzi.${cfg.tool}.`)) localStorage.removeItem(k); } catch (e) {}
    if (cfg.onReset) cfg.onReset();
    if (cfg.defaults && cfg.setState) { const s = JSON.stringify(cfg.defaults()); hist = [s]; idx = 0; apply(s); }
    toast('Reset to defaults');
  }

  // ---- shortcuts ----
  const NATIVE = new Set(['mod+z', 'mod+shift+z', 'mod+y', 'mod+a', 'mod+c', 'mod+v', 'mod+x']);
  const KEYMAP = { arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right', escape: 'esc', ' ': 'space', '+': '=', '_': '-' };
  function normalize(combo) {
    const p = combo.toLowerCase().split('+').filter(Boolean); const k = p.pop();
    return [p.includes('mod') && 'mod', p.includes('alt') && 'alt', p.includes('shift') && 'shift', KEYMAP[k] || k].filter(Boolean).join('+');
  }
  function fromEvent(e) {
    let k = e.key.toLowerCase(); if (e.shiftKey && k === '/') k = '?'; k = KEYMAP[k] || k;
    const symbol = k.length === 1 && !/[a-z0-9]/.test(k);          // '?' or '+' already carry their shift
    return [(e.metaKey || e.ctrlKey) && 'mod', e.altKey && 'alt', e.shiftKey && !symbol && 'shift', k].filter(Boolean).join('+');
  }
  function register(combo, label, fn, opts) {
    const c = normalize(combo); if (!shortcuts.has(c)) order.push(c);
    shortcuts.set(c, { label, fn, opts: opts || {} }); renderHelp();
  }
  function inTextField(t) { return !!t && (t.isContentEditable || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'color', 'file', 'button', 'submit'].includes(t.type))); }
  function inControl(t) { return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }
  const NAV = new Set(['up', 'down', 'left', 'right', 'space', 'enter', 'tab', 'home', 'end', 'pageup', 'pagedown']);
  document.addEventListener('keydown', e => {
    const combo = fromEvent(e), s = shortcuts.get(combo); if (!s) return;
    const t = e.target, mod = combo.startsWith('mod');
    if (!s.opts.always) {
      if (inTextField(t) && (!mod || NATIVE.has(combo))) return;             // typing: leave the field alone
      if (inControl(t) && !mod && NAV.has(combo.split('+').pop())) return;    // sliders and selects keep their arrow keys
    }
    e.preventDefault(); s.fn(e);
  });

  // ---- UI: banner buttons, help overlay, toast ----
  const css = `
    #tk-ctl{display:inline-flex;gap:4px;margin-left:auto;margin-right:12px}
    #tk-ctl button{box-sizing:border-box;height:22px;min-width:22px;padding:0 6px;border:1px solid #3a3a38;border-radius:4px;background:transparent;color:#9a9c99;
      font:12px/20px "HelveticaNeue","Helvetica Neue",Helvetica,Arial,sans-serif;cursor:pointer;transition:color 120ms linear,background-color 120ms linear}
    #tk-ctl button:hover{color:#f2f2f0;background:#222}
    #tk-ctl button:disabled{color:#5e605d;cursor:default;background:transparent}
    #tk-help{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center}
    #tk-help[hidden]{display:none}
    #tk-help .sheet{width:min(560px,calc(100vw - 32px));max-height:85vh;overflow:auto;background:#1a1a1a;color:#f2f2f0;border:1px solid #3a3a38;padding:20px 24px 24px;
      font:14px/1.3 "HelveticaNeue","Helvetica Neue",Helvetica,Arial,sans-serif;letter-spacing:.154px}
    #tk-help h2{margin:0 0 4px;font-size:18px;font-weight:400;letter-spacing:.198px}
    #tk-help .sub{margin:0 0 16px;font-size:13px;color:#9a9c99}
    #tk-help h3{margin:16px 0 6px;font-size:11px;font-weight:600;letter-spacing:.3px;text-transform:uppercase;color:#9a9c99}
    #tk-help .row{display:flex;align-items:center;gap:12px;padding:6px 0;border-top:1px solid #242423;font-size:13px}
    #tk-help .row span{flex:1;color:#cfcfcc}
    #tk-help kbd{font:12px/18px "IBM Plex Mono",ui-monospace,Menlo,monospace;color:#f2f2f0;border:1px solid #3a3a38;border-radius:4px;padding:0 6px;min-width:18px;text-align:center;background:#151515}
    #tk-help .foot{display:flex;gap:12px;align-items:center;margin-top:20px;padding-top:12px;border-top:1px solid #3a3a38;font-size:13px;color:#9a9c99}
    #tk-help .foot span{flex:1}
    #tk-help .foot button{height:28px;padding:7px 12px 3px;border:1px solid #3a3a38;border-radius:4px;background:transparent;color:#f2f2f0;font:13px/14px inherit;cursor:pointer}
    #tk-help .foot button:hover{background:#222}
    #tk-help .foot button.danger:hover{border-color:#b04a4a;color:#f0b0b0}
    #tk-gif{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center}
    #tk-gif[hidden]{display:none}
    #tk-gif .sheet{max-width:calc(100vw - 48px);background:#1a1a1a;border:1px solid #3a3a38;padding:16px;font:13px/1.3 "HelveticaNeue","Helvetica Neue",Helvetica,Arial,sans-serif;color:#f2f2f0;display:flex;flex-direction:column;gap:12px;align-items:center}
    #tk-gif img{max-width:calc(100vw - 80px);max-height:70vh;display:block;background:#0f0f10}
    #tk-gif .meta{color:#9a9c99;font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;font-size:12px}
    #tk-gif .btns{display:flex;gap:8px}
    #tk-gif .btns button{height:28px;padding:7px 12px 3px;border:1px solid #3a3a38;border-radius:4px;background:transparent;color:#f2f2f0;font:13px/14px inherit;cursor:pointer}
    #tk-gif .btns button:hover{background:#222}
    #tk-gif .btns button.primary{background:#d9b36b;color:#1a1408;border-color:#d9b36b;font-weight:600}
    #tk-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:1001;background:#1a1a1a;color:#f2f2f0;border:1px solid #3a3a38;padding:6px 12px;
      font:12px/1.3 "HelveticaNeue","Helvetica Neue",Helvetica,Arial,sans-serif;letter-spacing:.132px;opacity:0;transition:opacity 120ms linear;pointer-events:none}
    #tk-toast.on{opacity:1}`;
  let helpEl = null, toastEl = null, toastT = 0, btnUndo = null, btnRedo = null;
  function ensureUI() {
    if (helpEl) return;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    helpEl = document.createElement('div'); helpEl.id = 'tk-help'; helpEl.hidden = true;
    helpEl.addEventListener('click', e => { if (e.target === helpEl) toggleHelp(false); });
    document.body.appendChild(helpEl);
    toastEl = document.createElement('div'); toastEl.id = 'tk-toast'; document.body.appendChild(toastEl);
    const banner = document.getElementById('tool-banner');
    if (banner) {
      const ctl = document.createElement('span'); ctl.id = 'tk-ctl';
      ctl.innerHTML = `<button data-a="undo" title="Undo (${MOD}Z)">↶</button><button data-a="redo" title="Redo (⇧${MOD}Z)">↷</button><button data-a="help" title="Shortcuts (?)">?</button>`;
      ctl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; ({ undo, redo, help: () => toggleHelp() })[b.dataset.a](); });
      const name = banner.querySelector('.name'); banner.insertBefore(ctl, name); if (name) name.style.marginLeft = '0';
      btnUndo = ctl.querySelector('[data-a=undo]'); btnRedo = ctl.querySelector('[data-a=redo]');
    }
    renderHelp(); updateButtons();
  }
  function updateButtons() {
    const has = !!(cfg && cfg.getState);
    if (btnUndo) { btnUndo.hidden = !has; btnUndo.disabled = idx <= 0; }
    if (btnRedo) { btnRedo.hidden = !has; btnRedo.disabled = idx >= hist.length - 1; }
  }
  const pretty = combo => combo.split('+').map(p => ({ mod: MOD, alt: isMac ? '⌥' : 'Alt', shift: '⇧', up: '↑', down: '↓', left: '←', right: '→', backspace: '⌫', delete: '⌦', esc: 'Esc', space: 'Space', enter: '↩', '=': '+', '-': '−' }[p] || p.toUpperCase())).join(isMac ? '' : '+');
  function renderHelp() {
    if (!helpEl) return;
    const groups = new Map();
    for (const c of order) { const s = shortcuts.get(c), g = s.opts.group || 'Tool'; if (s.opts.hidden) continue; if (!groups.has(g)) groups.set(g, []); groups.get(g).push([c, s.label]); }
    const name = document.querySelector('#tool-banner .name'); const title = name ? name.textContent.replace(/_$/, '') : document.title;
    let h = `<div class="sheet"><h2>Shortcuts</h2><p class="sub">${title} · the same keys work in every Scuggnizzi tool.</p>`;
    for (const [g, rows] of groups) { h += `<h3>${g}</h3>`; for (const [c, l] of rows) h += `<div class="row"><span>${l}</span><kbd>${pretty(c)}</kbd></div>`; }
    h += `<div class="foot"><span>${cfg && cfg.getState ? 'Work is kept in this browser and comes back on reload.' : 'Nothing to save on this page.'}</span>`;
    if (cfg && cfg.getState) h += `<button class="danger" data-a="reset">Reset tool</button>`;
    h += `<button data-a="close">Close</button></div></div>`;
    helpEl.innerHTML = h;
    helpEl.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => b.dataset.a === 'reset' ? (toggleHelp(false), reset()) : toggleHelp(false)));
  }
  function toggleHelp(force) { ensureUI(); const open = force == null ? helpEl.hidden : force; if (open) renderHelp(); helpEl.hidden = !open; }
  // Loop an encoded GIF in an overlay, with a download button, so a tool can preview before saving.
  let gifEl = null, gifUrl = null;
  function showGif(opts) {
    ensureUI();
    if (!gifEl) {
      gifEl = document.createElement('div'); gifEl.id = 'tk-gif'; gifEl.hidden = true;
      gifEl.innerHTML = `<div class="sheet"><img alt="GIF preview"><div class="meta"></div><div class="btns"><button class="primary" data-a="dl">Download GIF</button><button data-a="close">Close</button></div></div>`;
      gifEl.addEventListener('click', e => { if (e.target === gifEl) hideGif(); });
      gifEl.querySelector('[data-a=close]').addEventListener('click', hideGif);
      document.body.appendChild(gifEl);
    }
    if (gifUrl) URL.revokeObjectURL(gifUrl);
    gifUrl = URL.createObjectURL(opts.blob);
    gifEl.querySelector('img').src = gifUrl;
    gifEl.querySelector('.meta').textContent = opts.note || '';
    gifEl.querySelector('[data-a=dl]').onclick = () => { const a = document.createElement('a'); a.href = gifUrl; a.download = opts.filename || 'animation.gif'; a.click(); };
    gifEl.hidden = false;
  }
  function hideGif() { if (gifEl) gifEl.hidden = true; }
  function toast(msg) { ensureUI(); toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 900); }

  // ---- init ----
  function init(options) {
    cfg = options || {};
    if (cfg.getState) storeKey = key('state');
    if (cfg.getState) {
      register('mod+z', 'Undo', undo, { group: 'Everywhere' });
      register('mod+shift+z', 'Redo', redo, { group: 'Everywhere' });
      register('mod+y', 'Redo', redo, { group: 'Everywhere', hidden: true });
    }
    register('?', 'Show shortcuts', () => toggleHelp(), { group: 'Everywhere' });
    register('esc', 'Close, or leave the field', () => { if (gifEl && !gifEl.hidden) hideGif(); else if (helpEl && !helpEl.hidden) toggleHelp(false); else if (document.activeElement) document.activeElement.blur(); }, { group: 'Everywhere', always: true });
    if (cfg.getState) register('mod+alt+r', 'Reset tool', reset, { group: 'Everywhere' });
    const go = () => {
      ensureUI();
      if (cfg.getState) {
        const saved = load();
        if (saved) { applying = true; try { cfg.setState(saved); } catch (e) { console.warn('ToolKit: saved state ignored', e); } applying = false; }
        hist = [snapshot()]; idx = 0; updateButtons();
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
  window.ToolKit = { init, commit, undo, redo, reset, register, saveAux, loadAux, help: toggleHelp, toast, showGif, hideGif, get canUndo() { return idx > 0; }, get canRedo() { return idx < hist.length - 1; } };
})();
