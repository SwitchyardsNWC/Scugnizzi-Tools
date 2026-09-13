// Drives v1's compiler headlessly. The builder is one IIFE in one <script>, so the export hook is
// injected just before the IIFE closes, and the DOM is a permissive proxy the compiler never touches.
import fs from 'node:fs';
import vm from 'node:vm';

// Relative to this file, so the tool runs from any checkout of the repo.
const reference = (name) => new URL(`../reference/${name}`, import.meta.url);
const REF = reference('v1-template-builder.html');
const src = fs.readFileSync(REF, 'utf8');
let js = src.slice(src.indexOf('<script>') + 8, src.indexOf('</script>'));

const HOOK = `__export({ generate: generate, normalizeDesign: normalizeDesign, starterDesign: starterDesign,
  load: function (d) { state = normalizeDesign(d); } });\n`;
const boot = '/* ============================== boot ';
js = js.slice(0, js.indexOf(boot)) + HOOK + js.slice(js.indexOf(boot));

const stub = () => new Proxy(function () {}, {
  get: (t, k) => k === Symbol.toPrimitive ? () => '' : k === 'length' ? 0 : k === 'toString' ? () => '' : stub(),
  set: () => true, apply: () => stub(), construct: () => stub(),
});
let api = null;
vm.runInContext(js, vm.createContext({
  console, document: stub(), window: stub(), navigator: { userAgent: 'node' }, location: { href: '' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  setTimeout: () => 0, clearTimeout: () => {}, ResizeObserver: function () { return { observe() {}, disconnect() {} }; },
  Blob: function () {}, URL: { createObjectURL: () => '' },
  __export: a => { api = a; },
}));

const which = process.argv[2] || 'fixture';
api.load(which === 'starter'
  ? api.starterDesign()
  : JSON.parse(fs.readFileSync(process.argv[3] ||
      reference('v1-standard-email.design.json'), 'utf8')));
const out = api.generate('hubl');
fs.writeFileSync(`regen-${which}.html`, out);
console.log(`regen-${which}.html  ${out.length} bytes`);
