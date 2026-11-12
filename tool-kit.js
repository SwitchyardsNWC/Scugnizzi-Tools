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
//   ToolKit.flush()                      // record a pending change now: before a structural edit, so it undoes alone
//   ToolKit.register('mod+s', 'Download PNG', fn, { group: 'Export' })
//   ToolKit.saveAux(name, value) / ToolKit.loadAux(name)   // bigger blobs kept beside the state
//   ToolKit.ask({ title, body, ok, danger }) // a confirm on the system's sheet; resolves true or false
//
// Standard keys everywhere: ⌘Z undo · ⇧⌘Z redo · ? shortcuts · Esc close · ⌥⌘R reset tool.
// Single-key shortcuts pause while you type in a text field; ⌘ combinations still work.
// Space and Enter on a button reached with the keyboard press that button, not the tool's shortcut.
(function () {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  const MOD = isMac ? '⌘' : 'Ctrl';
  const shortcuts = new Map(), order = [];
  let cfg = null, hist = [], idx = -1, applying = false, timer = 0, storeKey = null;

  // ---- storage ----
  // The storage prefix keeps its original spelling on purpose: renaming it would wipe every tool's saved state.
  const key = n => `scuggnizzi.${cfg ? cfg.tool : 'x'}.${n}`;
  function save(snap) { if (!storeKey) return; try { localStorage.setItem(storeKey, `{"v":${cfg.version || 1},"state":${snap}}`); } catch (e) {} }
  function load() { if (!storeKey) return null; try { const o = JSON.parse(localStorage.getItem(storeKey) || 'null'); return o && o.v === (cfg.version || 1) ? o.state : null; } catch (e) { return null; } }
  function saveAux(name, value) { try { if (value == null) localStorage.removeItem(key(name)); else localStorage.setItem(key(name), typeof value === 'string' ? value : JSON.stringify(value)); return true; } catch (e) { return false; } }
  function loadAux(name, json) { try { const v = localStorage.getItem(key(name)); return v == null ? null : (json ? JSON.parse(v) : v); } catch (e) { return null; } }

  // ---- history ----
  function snapshot() { return JSON.stringify(cfg.getState()); }
  let pending = false;
  function record() {
    const s = snapshot();
    if (hist[idx] === s) return;
    hist = hist.slice(0, idx + 1); hist.push(s); if (hist.length > 100) hist.shift();
    idx = hist.length - 1; save(s); updateButtons();
  }
  function commit() {
    if (!cfg || !cfg.getState || applying) return;
    clearTimeout(timer); pending = true;
    timer = setTimeout(() => { pending = false; record(); }, 350);
  }
  // A change still inside its debounce is recorded before undo or redo steps, so ⌘Z straight after a delete brings
  // the part back instead of saying there is nothing to undo, and never takes two steps at once.
  function flush() { if (!pending) return; clearTimeout(timer); pending = false; record(); }
  function apply(s) { applying = true; try { cfg.setState(JSON.parse(s)); } finally { applying = false; } save(s); updateButtons(); }
  function undo() { flush(); if (idx <= 0) return toast('Nothing to undo'); idx--; apply(hist[idx]); toast('Undo'); }
  function redo() { flush(); if (idx >= hist.length - 1) return toast('Nothing to redo'); idx++; apply(hist[idx]); toast('Redo'); }
  // Asks on the system's own sheet rather than the browser's grey box, then clears. Returns a promise of whether it did.
  async function reset() {
    if (!cfg) return false;
    if (!(await ask({ title: 'Reset this tool?', body: 'Every setting goes back to its default, and the work saved in this browser is cleared.', ok: 'Reset tool', danger: true }))) return false;
    try { for (const k of Object.keys(localStorage)) if (k.startsWith(`scuggnizzi.${cfg.tool}.`)) localStorage.removeItem(k); } catch (e) {}
    if (cfg.onReset) cfg.onReset();
    if (cfg.defaults && cfg.setState) { const s = JSON.stringify(cfg.defaults()); hist = [s]; idx = 0; apply(s); }
    toast('Reset to defaults');
    return true;
  }

  // ---- ask: a confirm on the system's sheet ----
  // ToolKit.ask({ title, body, ok, cancel, danger }) resolves true or false. Enter confirms, Esc cancels, focus starts on
  // Cancel when the action is destructive so a stray Enter cannot clear work.
  let askEl = null;
  function ask(o) {
    ensureUI();
    return new Promise(resolve => {
      if (askEl) askEl.remove();
      askEl = document.createElement('div'); askEl.id = 'tk-ask'; askEl.setAttribute('role', 'alertdialog'); askEl.setAttribute('aria-modal', 'true');
      askEl.innerHTML = `<div class="sheet"><h2></h2><p class="sub"></p><div class="foot"><span></span><button data-a="no" type="button"></button><button data-a="yes" type="button"></button></div></div>`;
      askEl.querySelector('h2').textContent = o.title || 'Are you sure?';
      askEl.querySelector('.sub').textContent = o.body || '';
      const yes = askEl.querySelector('[data-a=yes]'), no = askEl.querySelector('[data-a=no]');
      yes.textContent = o.ok || 'OK'; no.textContent = o.cancel || 'Cancel';
      yes.className = o.danger ? 'danger' : 'primary';
      askEl.setAttribute('aria-label', askEl.querySelector('h2').textContent);
      const back = document.activeElement;
      const done = v => { document.removeEventListener('keydown', key, true); askEl.remove(); askEl = null; if (back && back.focus) back.focus(); resolve(v); };
      const key = e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
        else if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === yes ? no : yes).focus(); }
      };
      document.addEventListener('keydown', key, true);
      yes.addEventListener('click', () => done(true)); no.addEventListener('click', () => done(false));
      askEl.addEventListener('pointerdown', e => { if (e.target === askEl) done(false); });
      document.body.appendChild(askEl);
      (o.danger ? no : yes).focus();
    });
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
  // A button, link or section header reached with the keyboard keeps Space and Enter: they press it. Clicked with the
  // mouse it has no visible focus, so the tool's own Space or Enter still works straight after a click.
  function activates(t) {
    if (!t || !t.matches) return false;
    if (!t.matches('button, summary, a[href], [role="button"], [role="radio"], [role="tab"], [role="switch"], [tabindex]:not([tabindex="-1"])')) return false;
    try { return t.matches(':focus-visible'); } catch (e) { return true; }
  }
  document.addEventListener('keydown', e => {
    const combo = fromEvent(e), s = shortcuts.get(combo); if (!s) return;
    const t = e.target, mod = combo.startsWith('mod');
    if (!s.opts.always) {
      if (inTextField(t) && (!mod || NATIVE.has(combo))) return;             // typing: leave the field alone
      if (inControl(t) && !mod && NAV.has(combo.split('+').pop())) return;    // sliders and selects keep their arrow keys
      if ((combo === 'space' || combo === 'enter') && activates(t)) return;    // a focused button presses
    }
    e.preventDefault(); s.fn(e);
  });

  // ---- UI: banner buttons, help overlay, toast ----
  // Drawn in Enkel's tokens, so the sheet, the toast and the GIF preview flip with the page. The fallbacks are the dark
  // values, for a page without the Enkel stylesheet. No shadows and no radius on the sheets: a hairline and the scrim.
  const v = (token, dark) => `var(--${token},${dark})`;
  const SANS = v('font-helveticaneue', '"Helvetica Neue",Helvetica,Arial,sans-serif'), MONO = v('font-mono-detail', 'ui-monospace,Menlo,monospace');
  const css = `
    #tk-ctl{display:inline-flex;gap:4px}
    #tk-ctl button{box-sizing:border-box;width:24px;height:24px;min-height:0;padding:0;display:inline-grid;place-items:center;border:1px solid transparent;border-radius:4px;background:transparent;
      color:${v('text-muted', '#9a9c99')};font:13px/1 ${SANS};cursor:pointer;transition:color 120ms linear,background-color 120ms linear,border-color 120ms linear}
    #tk-ctl button:hover{color:${v('text-primary', '#f2f2f0')};border-color:${v('border-control', '#454543')};background:transparent}
    #tk-ctl button:disabled{color:${v('text-faint', '#5e605d')};border-color:transparent;cursor:default}
    #tk-ctl button:focus-visible{outline:1px solid ${v('focus-ring', '#f2f2f0')};outline-offset:1px}
    #tk-help,#tk-gif,#tk-ask{position:fixed;inset:0;z-index:1000;background:${v('surface-scrim', 'rgba(0,0,0,.6)')};display:flex;align-items:center;justify-content:center;padding:16px}
    #tk-help[hidden],#tk-gif[hidden]{display:none}
    #tk-help .sheet,#tk-gif .sheet,#tk-ask .sheet{box-sizing:border-box;background:${v('surface-card', '#1a1a1a')};color:${v('text-primary', '#f2f2f0')};border:1px solid ${v('border-hairline', '#3a3a38')};
      font:13px/1.35 ${SANS};letter-spacing:.143px;-webkit-font-smoothing:antialiased}
    #tk-help .sheet{width:min(560px,100%);max-height:85vh;overflow:auto;padding:20px 24px 24px;scrollbar-width:thin}
    #tk-ask .sheet{width:min(420px,100%);padding:20px 24px 20px}
    #tk-ask h2{margin:0 0 8px;font-size:18px;line-height:1.2;font-weight:400;letter-spacing:.198px}
    #tk-ask .sub{margin:0;font-size:13px;line-height:1.45;color:${v('text-secondary', '#cfcfcc')};max-width:none}
    #tk-ask .foot{display:flex;gap:8px;align-items:center;margin-top:20px}
    #tk-ask .foot span{flex:1}
    #tk-help h2{margin:0 0 4px;font-size:18px;line-height:1.2;font-weight:400;letter-spacing:.198px}
    #tk-help .sub{margin:0 0 8px;font-size:13px;color:${v('text-muted', '#9a9c99')};max-width:none}
    #tk-help h3{margin:20px 0 4px;font-size:11px;line-height:1.2;font-weight:400;letter-spacing:.3px;text-transform:uppercase;color:${v('text-muted', '#9a9c99')}}
    #tk-help .row{display:flex;align-items:center;gap:12px;min-height:32px;margin:0;padding:4px 0;border-top:1px solid ${v('border-muted', '#242423')};font-size:13px}
    #tk-help .row span{flex:1;color:${v('text-secondary', '#cfcfcc')}}
    #tk-help kbd{display:inline-block;box-sizing:border-box;min-width:22px;height:22px;padding:5px 6px 1px;font:12px/14px ${MONO};letter-spacing:0;text-align:center;
      color:${v('text-primary', '#f2f2f0')};background:${v('surface-sunken', '#0e0e0e')};border:1px solid ${v('border-card', '#2a2a29')};border-radius:4px}
    #tk-help .foot{display:flex;gap:8px;align-items:center;margin-top:20px;padding-top:12px;border-top:1px solid ${v('border-hairline', '#3a3a38')};font-size:12px;color:${v('text-muted', '#9a9c99')}}
    #tk-help .foot span{flex:1}
    #tk-help .foot button,#tk-gif .btns button,#tk-ask .foot button{box-sizing:border-box;min-height:28px;padding:8px 12px 4px;border:1px solid ${v('border-control', '#454543')};border-radius:4px;background:transparent;
      color:${v('text-primary', '#f2f2f0')};font:13px/14px ${SANS};letter-spacing:.143px;cursor:pointer;transition:color 120ms linear,background-color 120ms linear,border-color 120ms linear}
    #tk-help .foot button:hover,#tk-gif .btns button:hover,#tk-ask .foot button:hover{background:${v('surface-row-hover', '#222222')}}
    #tk-ask .foot button.danger{border-color:${v('status-blocked', '#dc7a64')};color:${v('status-blocked', '#dc7a64')}}
    #tk-ask .foot button.primary{background:${v('action-primary', '#5a67a0')};border-color:${v('action-primary', '#5a67a0')};color:${v('action-primary-text', '#ffffff')}}
    #tk-ask .foot button.primary:hover{background:${v('action-primary-hover', '#6b78b3')};border-color:${v('action-primary-hover', '#6b78b3')}}
    #tk-help .foot button.danger:hover,#tk-ask .foot button.danger:hover{border-color:${v('status-blocked', '#dc7a64')};color:${v('status-blocked', '#dc7a64')};background:${v('status-blocked-soft', '#301b16')}}
    #tk-help button:focus-visible,#tk-gif button:focus-visible,#tk-ask button:focus-visible{outline:1px solid ${v('focus-ring', '#f2f2f0')};outline-offset:2px}
    #tk-gif .sheet{max-width:100%;padding:16px;display:flex;flex-direction:column;gap:12px;align-items:center}
    #tk-gif img{max-width:calc(100vw - 80px);max-height:70vh;display:block;background:${v('surface-sunken', '#0e0e0e')};box-shadow:0 0 0 1px ${v('border-card', '#2a2a29')}}
    #tk-gif .meta{color:${v('text-muted', '#9a9c99')};font:12px/1.4 ${MONO};letter-spacing:0}
    #tk-gif .btns{display:flex;gap:8px}
    #tk-gif .btns button.primary{background:${v('action-primary', '#5a67a0')};border-color:${v('action-primary', '#5a67a0')};color:${v('action-primary-text', '#ffffff')}}
    #tk-gif .btns button.primary:hover{background:${v('action-primary-hover', '#6b78b3')};border-color:${v('action-primary-hover', '#6b78b3')}}
    #tk-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:1001;box-sizing:border-box;max-width:calc(100vw - 32px);min-height:32px;padding:9px 12px 5px;
      background:${v('text-primary', '#f2f2f0')};color:${v('surface-paper', '#151515')};font:13px/16px ${SANS};letter-spacing:.143px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      opacity:0;transition:opacity 120ms linear;pointer-events:none}
    #tk-toast.on{opacity:1}`;
  let helpEl = null, toastEl = null, toastT = 0, btnUndo = null, btnRedo = null;
  function ensureUI() {
    if (helpEl) return;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    helpEl = document.createElement('div'); helpEl.id = 'tk-help'; helpEl.hidden = true; helpEl.setAttribute('role', 'dialog'); helpEl.setAttribute('aria-modal', 'true'); helpEl.setAttribute('aria-label', 'Shortcuts');
    helpEl.addEventListener('click', e => { if (e.target === helpEl) toggleHelp(false); });
    document.body.appendChild(helpEl);
    toastEl = document.createElement('div'); toastEl.id = 'tk-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl);
    const banner = document.getElementById('tool-banner');
    if (banner) {
      const ctl = document.createElement('span'); ctl.id = 'tk-ctl';
      ctl.innerHTML = `<button data-a="undo" title="Undo (${MOD}Z)">↶</button><button data-a="redo" title="Redo (⇧${MOD}Z)">↷</button><button data-a="help" title="Shortcuts (?)">?</button>`;
      ctl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; ({ undo, redo, help: () => toggleHelp() })[b.dataset.a](); });
      banner.appendChild(ctl);   // tool-banner.js sets where it sits
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
    let h = `<div class="sheet"><h2>Shortcuts</h2><p class="sub">${title} · the same keys work in every Scugnizzi tool.</p>`;
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
  window.ToolKit = { init, commit, flush, undo, redo, reset, ask, register, saveAux, loadAux, help: toggleHelp, toast, showGif, hideGif, get canUndo() { return idx > 0; }, get canRedo() { return idx < hist.length - 1; } };
})();
