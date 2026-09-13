// The intermediate tree the compiler emits, before anything becomes a string.
//
// Why a tree rather than v1's string concatenation (architecture.md §2):
//
//  1. The invariant that satisfies learnings 1.4, 1.5 and 2.11 at once — declaration, then
//     conditional, then markup, with no declaration ever inside a conditional — becomes a
//     structural check ("no Decl may have an If ancestor") that string formatting cannot defeat.
//  2. "One render path" becomes literally one path. Blocks emit this tree knowing nothing about
//     preview versus HubL; the serializer is what differs. v1 kept the two in one function with
//     `if (ctx.mode !== 'hubl')` at every branch, which is two paths sharing a body.
//  3. The colour registry becomes a walk over a finished tree instead of a side effect during
//     concatenation, so it cannot miss a colour or register one twice (learnings 2.6).

/**
 * An attribute value that is a field reference rather than a literal — `href="{{ widget_data.x }}"`.
 * It has to be a node rather than a pre-built string so that preview mode can substitute the
 * default instead of printing HubL into the canvas, and so the linter can see the reference.
 */
export interface AttrPrint {
  k: 'attrPrint';
  path: string;
  fallback: string;
}

export const attrPrint = (path: string, fallback: string): AttrPrint => ({ k: 'attrPrint', path, fallback });

/** An array concatenates: a literal prefix plus an interpolated tail, e.g. a Maps URL. */
export type AttrValue = string | number | null | undefined | AttrPrint | AttrValue[];
export type Attrs = Record<string, AttrValue>;

/** Colours this element asserts, collected by the registry so dark mode can re-assert them. */
export interface ElementColors {
  bg?: string | null;
  text?: string | null;
  link?: string | null;
}

export type FieldKind = 'text' | 'rich_text' | 'module';

/** A HubSpot field declaration. In preview mode it emits nothing; it only carries defaults. */
export interface Field {
  name: string;
  kind: FieldKind;
  label: string;
  /** Default for a text field. */
  value?: string;
  /** Default for a rich text field. */
  html?: string;
  /** For kind 'module': the `path=` and any extra parameters, in declaration order. */
  modulePath?: string;
  moduleParams?: Array<[string, string]>;
  /**
   * Whether this field counts as filled in when nobody has touched it. Derived from the default for
   * text and rich text; a module has to say, because only the block knows which of its parameters
   * decides presence. Drives which branch the preview takes before anyone picks a preview state.
   */
  presentByDefault?: boolean;
  /**
   * export_to_template_context. Effectively always true — it is what lets the template place the
   * value inside its own markup (learnings 1.3) — but a stock module rendered in place would not
   * set it, so the flag stays explicit rather than assumed.
   */
  exported: boolean;
}

/** A condition. Structured rather than a string so preview mode can evaluate it and the linter read it. */
export type Test =
  /** `widget_data.<field>.value|trim` — a text field the team left blank (learnings 1.10, 2.11). */
  | { k: 'textFilled'; field: string }
  /** Truthiness of an arbitrary exported path, e.g. `widget_data.hero.img.src`. */
  | { k: 'path'; path: string; field: string };

export type IRNode =
  | { k: 'el'; tag: string; attrs?: Attrs; colors?: ElementColors; children?: IRNode[]; void?: boolean }
  /** Escaped on serialize. */
  | { k: 'text'; value: string }
  /** Trusted markup: sanitised rich text, MSO conditional comments, the document shell. */
  | { k: 'raw'; value: string }
  | { k: 'decl'; field: Field }
  /** `{{ path }}` in HubL; `fallback` is what preview renders. */
  | { k: 'print'; path: string; fallback: string; escape?: boolean }
  | { k: 'if'; test: Test; children: IRNode[] }
  /**
   * Wrap the children in `tag` only when `test` holds — an image that becomes a link once the team
   * sets one. As HubL this is `{% if %}<a>{% endif %}…{% if %}</a>{% endif %}`, which is not
   * well-formed text; as a node it stays a proper subtree, so the balanced-tag and
   * declaration-placement checks in lint.ts still see through it. The serializer owns the
   * asymmetry, which is the only place that can do it safely.
   */
  | { k: 'wrapIf'; test: Test; tag: string; attrs: Attrs; children: IRNode[] }
  /**
   * Two renderings of one thing, one per mode. The freeform block draws its recipe live on the
   * canvas and ships a picture; both are the block's one tree, and the serializer picks. The
   * `print` node's fallback is the same idea for a value; this is it for a subtree. Not for
   * anything a `print` or an `if` could express — those stay honest HubL.
   */
  | { k: 'mode'; preview: IRNode; hubl: IRNode }
  | { k: 'frag'; children: IRNode[] };

// --- builders ---------------------------------------------------------------------------------

export const el = (
  tag: string,
  attrs: Attrs | null,
  children?: IRNode[] | IRNode | string,
  colors?: ElementColors,
): IRNode => ({
  k: 'el',
  tag,
  ...(attrs ? { attrs } : {}),
  ...(colors ? { colors } : {}),
  children: normalise(children),
});

export const voidEl = (tag: string, attrs: Attrs, colors?: ElementColors): IRNode => ({
  k: 'el',
  tag,
  attrs,
  ...(colors ? { colors } : {}),
  void: true,
});

export const text = (value: string): IRNode => ({ k: 'text', value });
export const raw = (value: string): IRNode => ({ k: 'raw', value });
export const frag = (children: IRNode[] | IRNode | string): IRNode => ({ k: 'frag', children: normalise(children) });
export const decl = (field: Field): IRNode => ({ k: 'decl', field });
export const print = (path: string, fallback: string, escape = true): IRNode => ({ k: 'print', path, fallback, escape });
export const when = (test: Test, children: IRNode[] | IRNode | string): IRNode => ({
  k: 'if',
  test,
  children: normalise(children),
});

export const wrapWhen = (
  test: Test,
  tag: string,
  attrs: Attrs,
  children: IRNode[] | IRNode | string,
): IRNode => ({ k: 'wrapIf', test, tag, attrs, children: normalise(children) });

/** Nothing. Used where a block renders conditionally at compile time rather than at send time. */
export const nothing: IRNode = { k: 'frag', children: [] };

function normalise(children?: IRNode[] | IRNode | string): IRNode[] {
  if (children === undefined || children === null) return [];
  if (typeof children === 'string') return [text(children)];
  return Array.isArray(children) ? children.filter(Boolean) : [children];
}

// --- traversal --------------------------------------------------------------------------------

export function childrenOf(node: IRNode): IRNode[] {
  switch (node.k) {
    case 'el':
    case 'frag':
    case 'if':
    case 'wrapIf':
      return node.children ?? [];
    case 'mode':
      // Both, so every check sees both renderings.
      return [node.preview, node.hubl];
    default:
      return [];
  }
}

/** One subtree for the canvas, another for the file. See the `mode` node. */
export const byMode = (preview: IRNode, hubl: IRNode): IRNode => ({ k: 'mode', preview, hubl });

/** Depth-first, document order, parents before children. `path` is the ancestor chain. */
export function walk(root: IRNode, visit: (node: IRNode, ancestors: IRNode[]) => void): void {
  const go = (node: IRNode, ancestors: IRNode[]) => {
    visit(node, ancestors);
    const next = [...ancestors, node];
    for (const child of childrenOf(node)) go(child, next);
  };
  go(root, []);
}

/** Every field declaration, in document order. Order is the HubSpot Contents panel order (1.4). */
export function declarations(root: IRNode): Field[] {
  const out: Field[] = [];
  walk(root, (node) => {
    if (node.k === 'decl') out.push(node.field);
  });
  return out;
}
