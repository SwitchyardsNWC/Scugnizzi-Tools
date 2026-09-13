// Tree -> string. The only place that knows the difference between the preview and the template.
//
// This is learnings 3.1 ("one render function, two modes") taken one step further. In v1 the mode
// flag reached into every block renderer; here a block emits one tree with no knowledge of mode at
// all, and the two outputs differ only in what this file does with `decl`, `print` and `if`. The
// canvas and the uploaded template cannot drift because there is only one thing to drift from.

import { childrenOf, declarations, type Attrs, type AttrValue, type Field, type IRNode, type Test } from './ir.ts';
import { esc, hublAttr, hublHtml, hublText, isBlank } from './escape.ts';

export type Mode = 'preview' | 'hubl';

/**
 * Which branches the preview takes: field name -> is it filled in.
 *
 * This exists because in HubL mode the output is a program, not a document — a template with n
 * optional fields describes 2^n possible emails and the canvas can only show one of them
 * (architecture.md §1). Making the choice explicit is what lets a designer walk the branches
 * deliberately instead of only ever seeing the everything-filled-in case.
 */
export type Branch = Record<string, boolean>;

export interface SerializeOptions {
  mode: Mode;
  branch?: Branch;
}

/** What the preview shows when nobody has chosen: whatever the defaults imply. */
export function defaultBranch(root: IRNode): Branch {
  const branch: Branch = {};
  for (const field of declarations(root)) branch[field.name] = fieldPresentByDefault(field);
  return branch;
}

export function fieldPresentByDefault(field: Field): boolean {
  if (field.kind === 'module') return field.presentByDefault ?? false;
  if (field.kind === 'rich_text') return !isBlank(field.html);
  return !isBlank(field.value);
}

export function serialize(root: IRNode, options: SerializeOptions): string {
  const branch = options.branch ?? defaultBranch(root);
  const out: string[] = [];
  emit(root, options.mode, branch, out);
  return out.join('');
}

function emit(node: IRNode, mode: Mode, branch: Branch, out: string[]): void {
  switch (node.k) {
    case 'text':
      out.push(esc(node.value));
      return;

    case 'raw':
      out.push(node.value);
      return;

    case 'frag':
      for (const child of childrenOf(node)) emit(child, mode, branch, out);
      return;

    case 'mode':
      emit(mode === 'hubl' ? node.hubl : node.preview, mode, branch, out);
      return;

    case 'el': {
      out.push(`<${node.tag}${attrsToString(node.attrs, mode)}>`);
      if (node.void) return;
      for (const child of childrenOf(node)) emit(child, mode, branch, out);
      out.push(`</${node.tag}>`);
      return;
    }

    case 'decl':
      // In HubL a declaration is the thing that makes the field exist, and its position in the file
      // is the panel order (learnings 1.4).
      if (mode === 'hubl') {
        out.push(declarationToHubl(node.field));
        return;
      }
      // In preview it usually emits nothing, because an exported field's value is printed
      // separately by a `print` node. The exception is a tag that is *not* exported: it renders
      // where it stands (learnings 1.3), so the preview has to render its default there too —
      // otherwise every rich text block comes out blank on the canvas.
      if (!node.field.exported && node.field.html !== undefined) out.push(node.field.html);
      return;

    case 'print':
      if (mode === 'hubl') out.push(`{{ ${node.path} }}`);
      else out.push(node.escape === false ? node.fallback : esc(node.fallback));
      return;

    case 'wrapIf': {
      // The one place an opening and closing tag are emitted independently. Keeping it here rather
      // than letting blocks build it out of raw strings is what lets the tree stay well-formed.
      const open = `<${node.tag}${attrsToString(node.attrs, mode)}>`;
      const close = `</${node.tag}>`;
      const wrapped = mode === 'hubl' || evaluate(node.test, branch);
      if (wrapped) out.push(mode === 'hubl' ? `{% if ${testToHubl(node.test)} %}${open}{% endif %}` : open);
      for (const child of childrenOf(node)) emit(child, mode, branch, out);
      if (wrapped) out.push(mode === 'hubl' ? `{% if ${testToHubl(node.test)} %}${close}{% endif %}` : close);
      return;
    }

    case 'if': {
      if (mode === 'hubl') {
        out.push(`{% if ${testToHubl(node.test)} %}`);
        for (const child of childrenOf(node)) emit(child, mode, branch, out);
        out.push('{% endif %}');
        return;
      }
      if (!evaluate(node.test, branch)) return;
      for (const child of childrenOf(node)) emit(child, mode, branch, out);
      return;
    }
  }
}

export function evaluate(test: Test, branch: Branch): boolean {
  return branch[test.field] ?? false;
}

export function testToHubl(test: Test): string {
  // `|trim` before testing, or whitespace counts as content (learnings 1.10).
  return test.k === 'textFilled' ? `widget_data.${test.field}.value|trim` : test.path;
}

function declarationToHubl(field: Field): string {
  const exported = field.exported ? ', export_to_template_context=True' : '';
  switch (field.kind) {
    case 'text':
      return `{% text "${field.name}" label="${hublAttr(field.label)}", value='${hublText(field.value ?? '')}'${exported} %}`;
    case 'rich_text':
      return `{% rich_text "${field.name}" label="${hublAttr(field.label)}", html='${hublHtml(field.html ?? '')}'${exported} %}`;
    case 'module': {
      const params = [`path="${hublAttr(field.modulePath ?? '')}"`, `label="${hublAttr(field.label)}"`];
      for (const [key, value] of field.moduleParams ?? []) params.push(`${key}=${value}`);
      return `{% module "${field.name}" ${params.join(', ')}${exported} %}`;
    }
  }
}

/**
 * Attribute values are raw text, escaped here — not pre-escaped by callers, which is how v1 did it
 * and why it had to keep four escapers straight at every call site. Only `&` and `"` are touched,
 * so a `{{ widget_data... }}` interpolation inside an attribute survives intact.
 */
function attrsToString(attrs: Attrs | undefined, mode: Mode): string {
  if (!attrs) return '';
  let out = '';
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    out += ` ${key}="${attrValue(value, mode)}"`;
  }
  return out;
}

function attrValue(value: AttrValue, mode: Mode): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((part) => attrValue(part, mode)).join('');
  if (typeof value === 'object' && value.k === 'attrPrint') {
    // A HubL interpolation contains no `&` or `"`, so it survives the escaping below untouched.
    return mode === 'hubl' ? `{{ ${value.path} }}` : escapeAttr(value.fallback);
  }
  return escapeAttr(String(value));
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
