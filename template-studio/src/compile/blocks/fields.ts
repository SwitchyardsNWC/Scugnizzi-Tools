// The three-step shape every editable block follows, and the one rule that forces it.
//
// Three learnings pull in different directions:
//
//   1.4  panel order follows source order, so declarations must sit next to their markup
//   1.5  a tag inside a conditional that is false never registers, so declarations must sit
//        outside conditionals
//   2.11 blank content must collapse the whole block, so conditionals must wrap the markup
//
// Exactly one arrangement satisfies all three, and it is the same one every time:
//
//        declaration  ->  conditional  ->  markup
//
// `textContent` below is the only sanctioned way to build it, and lint.ts rejects any tree where a
// declaration ended up inside a conditional. Twenty block types is too many to hold by convention.

import { attrPrint, decl, frag, print, raw, text, when, type AttrValue, type Field, type IRNode, type Test } from '../ir.ts';
import { statedMargins } from '../friendly.ts';
import type { Lock } from '../../model/types.ts';

/**
 * A block split into the three pieces a row needs in order to place it.
 *
 * `markup` is everything that goes *inside* the section container — the block's own padded cell.
 * Splitting it out is what lets the same block render alone in a full-width section and inside a
 * column of a multi-column row without two code paths: the row decides the wrapper, the block
 * decides its contents, and neither knows about the other.
 *
 * Where `collapse` goes is the block's business and is not uniform: a heading wraps its whole
 * section, because the section carries the padding that has to disappear with it; a button wraps
 * only the padded cell, because its section carries none. Inside a column both wrap the markup,
 * which is the same thing.
 */
export interface BlockParts {
  declaration: IRNode;
  markup: IRNode;
  collapse: (inner: IRNode) => IRNode;
  /**
   * The same block as one row of a *stacked* column — a column holding more than one block.
   *
   * The column's outer cell carries the gutter, the box and `hs_padded` once for the whole stack;
   * what each block contributes is its content in a cell of its own with only the space *below* it,
   * which is the gap to the next block. Its own cell rather than bare content, because a
   * left-aligned button table with nothing around it floats, and the heading after it wraps beside
   * it in Outlook and Gmail both.
   */
  row: (padding: string) => IRNode;
}

export interface Content {
  /** Emit this before anything that reads the value. Empty when the content is locked. */
  declaration: IRNode;
  /** Reads the value: `{{ widget_data.x.value }}` in HubL, the default in preview. */
  value: IRNode;
  /** The same value, usable inside an attribute. */
  attr: AttrValue;
  /** Wraps markup so it disappears when there is nothing to show (learnings 2.11). */
  collapse: (inner: IRNode) => IRNode;
  /** Absent when the content is locked — a locked value is not a HubSpot field. */
  field?: Field;
}

/**
 * A single-line piece of copy, editable or not.
 *
 * When editable, `export_to_template_context` is what makes it work at all: declaring the tag
 * plainly would render it where it stands and leave us no control over the surrounding markup
 * (learnings 1.3). When locked, the template renders the value directly so that re-uploading the
 * template fixes every future send (learnings 1.7).
 */
export function textContent(lock: Lock, value: string): Content {
  if (!lock.editable) {
    return {
      declaration: frag([]),
      value: text(value),
      attr: value,
      collapse: (inner) => (value.trim() === '' ? frag([]) : inner),
    };
  }
  const field: Field = { name: lock.field, kind: 'text', label: lock.label, value, exported: true };
  const path = `widget_data.${lock.field}.value`;
  const test: Test = { k: 'textFilled', field: lock.field };
  return {
    declaration: decl(field),
    value: print(path, value),
    attr: attrPrint(path, value),
    collapse: (inner) => when(test, inner),
    field,
  };
}

/**
 * Rich text.
 *
 * `export_to_template_context` works on `rich_text` — **verified 2026-09-11** (learnings 1.14) —
 * which v1 never tried. Exporting means the tag renders nothing in place and publishes the team's
 * markup to `widget_data.<n>.html`, so the template can put its own section, background and padding
 * around it. That is the real win; v1's in-place tag could only ever sit where it was declared.
 */
export function richContent(lock: Lock, html: string, paragraphMargin = 16): Content {
  if (!lock.editable) {
    // Locked markup renders straight into the output, so the compiler owns it — including the
    // paragraph margins HubSpot would otherwise inject over (learnings 1.9). An *editable* block's
    // html is a field default instead: copied into the email once and then re-serialised by
    // HubSpot's editor, where the inlined `.sy-rich p` rule is what covers it.
    return {
      declaration: frag([]),
      value: raw(statedMargins(html, paragraphMargin)),
      attr: '',
      collapse: (inner) => (html.trim() === '' ? frag([]) : inner),
    };
  }

  const field: Field = { name: lock.field, kind: 'rich_text', label: lock.label, html, exported: true };
  const path = `widget_data.${lock.field}.html`;
  return {
    declaration: decl(field),
    // Not escaped: the value is the team's markup, and escaping it would print the tags.
    value: print(path, html, false),
    attr: '',
    // Plain truthiness on `.html` is the shape the probe actually proved. It collapses a field that
    // is genuinely empty. It does NOT collapse one the team cleared in the editor, because HubSpot
    // leaves `<p>&nbsp;</p>` behind — stripping that needs a filter chain nothing has verified yet,
    // so it is on the list for the next send rather than guessed at here.
    collapse: (inner) => when({ k: 'path', path, field: lock.field }, inner),
    field,
  };
}
