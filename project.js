// The open project, for the single-file tools. Load after tool-kit.js:  <script src="../project.js"></script>
//
// A project is one folder every tool on this site reads from and saves into (docs/projects.md). The project board
// and Template Studio open it and keep its handle in this site's IndexedDB; this finds the same handle, so a tool
// knows the project without asking for a folder. It never picks a folder itself: the board does that.
//
//   ScugnizziProject.ready                        settles once the project has been looked for
//   ScugnizziProject.status                       'loading' · 'unsupported' · 'none' · 'asking' · 'view-only' · 'ready'
//   ScugnizziProject.name, .info                  the project's name, and its project.json
//   ScugnizziProject.onChange(fn)                 called now and whenever any of that changes
//   ScugnizziProject.allow()                      the one click Chrome needs to open or edit it; call it from a click
//   ScugnizziProject.readFile(path)               a File, or null
//   ScugnizziProject.readJson(path)               parsed, or null
//   ScugnizziProject.writeFile(path, text|blob)   makes the folders on the way
//   ScugnizziProject.pictures()                   every picture under assets/: [{ path, name, size, modified, file }]
//   ScugnizziProject.freePath(folder, stem, ext)  `folder/stem.ext`, or `stem-2.ext` when that is taken
//   ScugnizziProject.saved(paths)                 tells the project board, so a new file shows up at once
//   ScugnizziProject.choosePicture({ svg, title }) a picker over the project's pictures; resolves to one, or null
//   ScugnizziProject.toast(message)
//   ScugnizziProject.boardUrl
//
// A tool that saves into the project writes its result into assets/ and a recipe in a folder of its own under the
// project's hidden .scug/ (ScugnizziProject.recipeFolder('riso') is '.scug/riso'): { version: 1, tool, output: 'assets/…',
// sources: ['assets/…'], settings, savedAt }. The board reads those to draw what was made from what
// (template-studio/src/model/tool-recipes.ts). Everything the tools need to run a project lives in .scug/, so the rest
// of the folder reads as work (template-studio/src/model/layout.ts).
(function () {
  const script = document.currentScript || [...document.scripts].find((s) => /project\.js(\?|$)/.test(s.src));
  const root = new URL('.', script ? script.src : location.href).href;
  const DB = 'template-studio', STORE = 'handles', CHANNEL = 'scuggnizzi.project';
  const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
  const listeners = new Set();
  let channel = null;
  try { channel = new BroadcastChannel(CHANNEL); } catch (e) { channel = null; }

  const P = { status: 'loading', dir: null, info: null, name: '', boardUrl: root + 'template-studio/dist/project.html' };

  function set(next) {
    Object.assign(P, next);
    for (const fn of listeners) { try { fn(P); } catch (e) { console.warn('ScugnizziProject listener', e); } }
  }
  P.onChange = function (fn) { listeners.add(fn); if (P.status !== 'loading') fn(P); return () => listeners.delete(fn); };

  // ---- the handle ----
  function recall() {
    return new Promise((resolve) => {
      try {
        const open = indexedDB.open(DB, 1);
        open.onupgradeneeded = () => open.result.createObjectStore(STORE);
        open.onerror = () => resolve(null);
        open.onsuccess = () => {
          try {
            const get = open.result.transaction(STORE).objectStore(STORE).get('workspace');
            get.onsuccess = () => resolve(get.result || null);
            get.onerror = () => resolve(null);
          } catch (e) { resolve(null); }
        };
      } catch (e) { resolve(null); }
    });
  }
  async function permission(dir, mode) {
    try { return dir.queryPermission ? await dir.queryPermission({ mode }) : 'granted'; } catch (e) { return 'denied'; }
  }
  async function settle() {
    if (typeof window.showDirectoryPicker !== 'function') return set({ status: 'unsupported', dir: null, info: null, name: '' });
    const dir = await recall();
    if (!dir) return set({ status: 'none', dir: null, info: null, name: '' });
    const status = (await permission(dir, 'readwrite')) === 'granted' ? 'ready' : (await permission(dir, 'read')) === 'granted' ? 'view-only' : 'asking';
    Object.assign(P, { dir, status });
    // In .scug/ since September 2026; at the top of the project before that, until the board opens it for editing.
    const info = status === 'asking' ? null : ((await P.readJson(`${META}/project.json`)) ?? (await P.readJson('project.json')));
    set({ dir, status, info: info && typeof info === 'object' ? info : null, name: (info && typeof info.name === 'string' && info.name) || dir.name });
  }
  P.ready = settle();
  if (channel) channel.onmessage = (e) => { if (e.data && (e.data.type === 'opened' || e.data.type === 'closed')) settle(); };

  P.allow = async function () {
    if (!P.dir) return false;
    let state = 'denied';
    try { state = await P.dir.requestPermission({ mode: 'readwrite' }); } catch (e) { state = 'denied'; }
    await settle();
    if (channel) { try { channel.postMessage({ type: 'opened' }); } catch (e) {} }
    return state === 'granted';
  };

  // ---- files ----
  const META = '.scug';
  P.META = META;
  /** Where a tool's recipes go: `.scug/riso`, `.scug/ink-bleed`. */
  P.recipeFolder = (tool) => `${META}/${tool}`;
  const parts = (path) => String(path).split('/').filter(Boolean);
  async function folderAt(names, create) {
    let at = P.dir;
    if (!at) return null;
    for (const name of names) {
      try { at = await at.getDirectoryHandle(name, { create: Boolean(create) }); } catch (e) { if (create) throw e; return null; }
    }
    return at;
  }
  P.readFile = async function (path) {
    if (P.status !== 'ready' && P.status !== 'view-only') return null;
    const names = parts(path), file = names.pop();
    try { const folder = await folderAt(names); return folder ? await (await folder.getFileHandle(file)).getFile() : null; } catch (e) { return null; }
  };
  P.readJson = async function (path) {
    const file = await P.readFile(path);
    if (!file) return null;
    try { return JSON.parse(await file.text()); } catch (e) { return null; }
  };
  P.writeFile = async function (path, data) {
    if (P.status !== 'ready') throw new Error(P.status === 'none' ? 'no project is open' : `Chrome is not allowing changes in ${P.name}`);
    const names = parts(path), file = names.pop();
    const folder = await folderAt(names, true);
    const handle = await folder.getFileHandle(file, { create: true });
    const out = await handle.createWritable();
    await out.write(data);
    await out.close();
  };
  P.pictures = async function () {
    const out = [];
    const assets = await folderAt(['assets']);
    if (!assets) return out;
    async function walk(folder, prefix, depth) {
      for await (const [name, entry] of folder.entries()) {
        if (name.startsWith('.')) continue;
        const path = prefix + name;
        if (entry.kind === 'directory') {
          // Not assets/rendered/: pictures Template Studio draws from an email's text.
          if (depth > 1 && !(prefix === 'assets/' && name === 'rendered')) await walk(entry, path + '/', depth - 1);
          continue;
        }
        if (!IMAGE.test(name)) continue;
        const file = await entry.getFile();
        out.push({ path, name, size: file.size, modified: file.lastModified, file });
      }
    }
    try { await walk(assets, 'assets/', 3); } catch (e) {}
    return out.sort((a, b) => a.path.localeCompare(b.path));
  };
  P.freePath = async function (folder, stem, ext) {
    const taken = new Set();
    const at = await folderAt(parts(folder));
    if (at) for await (const name of at.keys()) taken.add(name.toLowerCase());
    let name = stem + ext;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${stem}-${n}${ext}`;
    return `${parts(folder).join('/')}/${name}`;
  };
  P.saved = function (paths) {
    if (channel) { try { channel.postMessage({ type: 'saved', paths: [].concat(paths || []) }); } catch (e) {} }
  };

  // ---- what it looks like ----
  let styled = false;
  function style() {
    if (styled) return;
    styled = true;
    const css = document.createElement('style');
    css.textContent = `
      #tool-banner .sp-project{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;min-width:0}
      #tool-banner .sp-project[hidden]{display:none}
      #tool-banner .sp-project a{margin-left:0;height:24px;padding:0 6px;border-radius:4px;color:#f2f2f0;max-width:220px;overflow:hidden;text-overflow:ellipsis}
      #tool-banner .sp-project a.sp-muted{color:#9a9c99}
      #tool-banner .sp-dot{flex:none;width:7px;height:7px;border-radius:50%;background:#9a9c99}
      #tool-banner .sp-dot.ready{background:#3fb96b;box-shadow:0 0 0 3px rgba(63,185,107,.2)}
      #tool-banner .sp-dot.view-only,#tool-banner .sp-dot.asking{background:#e2a33b;box-shadow:0 0 0 3px rgba(226,163,59,.2)}
      #tool-banner .sp-project button{height:22px;padding:0 8px;border:1px solid #3a3a38;border-radius:4px;background:#222;color:#f2f2f0;font:inherit;font-size:12px;cursor:pointer}
      #tool-banner .sp-project button:hover{background:#2c2c2c}
      .sp-toast{position:fixed;left:50%;bottom:24px;z-index:1001;max-width:min(580px,calc(100vw - 32px));padding:9px 14px;transform:translateX(-50%);
        border-radius:8px;background:#e8e5df;color:#121213;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.45)}
      .sp-picker{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.55)}
      .sp-sheet{display:flex;flex-direction:column;width:min(720px,100%);max-height:min(640px,calc(100vh - 48px));background:#1b1b1d;border:1px solid #2c2c30;border-radius:10px;
        color:#e8e5df;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;box-shadow:0 30px 80px rgba(0,0,0,.5)}
      .sp-sheet header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #2c2c30}
      .sp-sheet header b{font-weight:600}
      .sp-x{background:none;border:0;color:#8f8c86;font-size:14px;cursor:pointer}
      .sp-x:hover{color:#e8e5df}
      .sp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;padding:14px;overflow:auto}
      .sp-pic{display:grid;gap:6px;padding:6px;background:#232326;border:1px solid #2c2c30;border-radius:8px;color:inherit;font:inherit;text-align:left;cursor:pointer}
      .sp-pic:hover,.sp-pic:focus-visible{border-color:#d9b36b;outline:none}
      .sp-thumb{display:grid;place-items:center;aspect-ratio:1;overflow:hidden;border-radius:5px;background:repeating-conic-gradient(#2a2a2d 0 25%,#232326 0 50%) 0 0/14px 14px}
      .sp-thumb img{max-width:100%;max-height:100%;object-fit:contain}
      .sp-name{overflow:hidden;font-size:11.5px;color:#8f8c86;white-space:nowrap;text-overflow:ellipsis}
      .sp-empty{grid-column:1/-1;margin:28px 0;text-align:center;color:#8f8c86}`;
    document.head.appendChild(css);
  }

  let toastEl = null, toastTimer = 0;
  P.toast = function (message) {
    style();
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'sp-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, Math.min(9000, 2600 + message.length * 35));
  };

  // The project in the tool banner: its name, and the one click Chrome may need.
  function mount() {
    const banner = document.getElementById('tool-banner');
    if (!banner || banner.querySelector('.sp-project')) return;
    style();
    const el = document.createElement('span');
    el.className = 'sp-project';
    el.hidden = true;
    banner.appendChild(el);
    P.onChange(() => {
      const s = P.status;
      el.hidden = s === 'loading' || s === 'unsupported';
      el.replaceChildren();
      const link = document.createElement('a');
      link.href = P.boardUrl;
      if (s === 'none') {
        link.textContent = 'No project';
        link.className = 'sp-muted';
        link.title = 'Open or create a project on the project board, and this tool can save into it.';
        el.append(link);
        return;
      }
      const dot = document.createElement('span');
      dot.className = `sp-dot ${s}`;
      link.textContent = P.name;
      link.title = s === 'ready' ? `${P.name}: saving into this project. Open the project board.` : `${P.name}: open the project board.`;
      el.append(dot, link);
      if (s === 'asking' || s === 'view-only') {
        const button = document.createElement('button');
        button.textContent = s === 'asking' ? 'Reopen' : 'Allow editing';
        button.title = s === 'asking' ? `Chrome needs one click to open ${P.name} again.` : `${P.name} is open view-only. One click asks Chrome for edit access.`;
        button.addEventListener('click', () => P.allow());
        el.append(button);
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

  // A picker over the project's pictures.
  P.choosePicture = function (options) {
    const opts = options || {};
    style();
    return new Promise((resolve) => {
      const back = document.createElement('div');
      back.className = 'sp-picker';
      back.innerHTML = '<div class="sp-sheet" role="dialog" aria-modal="true"><header><b></b><button class="sp-x" aria-label="Close">✕</button></header><div class="sp-grid"><p class="sp-empty">Reading the project…</p></div></div>';
      back.querySelector('b').textContent = opts.title || `From ${P.name}`;
      document.body.appendChild(back);
      const urls = [];
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } };
      function done(value) {
        for (const url of urls) URL.revokeObjectURL(url);
        back.remove();
        document.removeEventListener('keydown', onKey, true);
        resolve(value);
      }
      document.addEventListener('keydown', onKey, true);
      back.addEventListener('pointerdown', (e) => { if (e.target === back) done(null); });
      back.querySelector('.sp-x').addEventListener('click', () => done(null));
      const grid = back.querySelector('.sp-grid');
      const empty = (text) => { const p = document.createElement('p'); p.className = 'sp-empty'; p.textContent = text; grid.replaceChildren(p); };
      (async () => {
        if (P.status === 'asking') await P.allow();
        if (P.status !== 'ready' && P.status !== 'view-only') return empty(P.status === 'none' ? 'No project is open.' : `Chrome did not open ${P.name}.`);
        const all = (await P.pictures()).filter((p) => opts.svg == null || /\.svg$/i.test(p.path) === Boolean(opts.svg));
        if (!back.isConnected) return;
        if (!all.length) return empty(`No ${opts.svg ? 'SVG pictures' : 'pictures'} in ${P.name}’s assets folder yet.`);
        grid.replaceChildren();
        for (const pic of all) {
          const button = document.createElement('button');
          button.className = 'sp-pic';
          button.title = pic.path;
          button.innerHTML = '<span class="sp-thumb"><img alt=""></span><span class="sp-name"></span>';
          const url = URL.createObjectURL(pic.file);
          urls.push(url);
          button.querySelector('img').src = url;
          button.querySelector('.sp-name').textContent = pic.path.slice('assets/'.length);
          button.addEventListener('click', () => done(pic));
          grid.appendChild(button);
        }
        grid.querySelector('button').focus();
      })();
    });
  };

  window.ScugnizziProject = P;
})();
