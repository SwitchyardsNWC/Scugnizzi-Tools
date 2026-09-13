import { useRef } from 'preact/hooks';

import { CATALOG } from '../model/catalog.ts';
import { glyphFor } from './icons.tsx';
import type { BlockType } from '../model/types.ts';
import type { Editor } from './useEditor.ts';
import { capture, release } from './pointer.ts';

// What you can add, as things you pick up.
//
// A list of cards rather than a menu of names, because the gesture is "take this and put it there"
// and a menu cannot express that. Each carries a grip so the card reads as liftable before anyone
// has tried; that is the whole job of the six dots.
//
// Grouped, because eight undifferentiated options is a list you read every time. The groups are the
// order a designer reaches for them: the things an email is made of, then the things between them,
// then the two that are fixed furniture.

/**
 * What the palette can hand you.
 *
 * `columns` is not a block and never becomes one — the document has no such thing, and it should
 * not: a Block is a leaf and a row of columns is structure. It is a palette entry that drops an
 * empty two-column row. That is the whole change: columns used to be something you *did* to a block
 * you already had, which asked a designer to know that a block they can see sits inside a row they
 * cannot. Now it is something you drop and then fill.
 */
export type PaletteKind = BlockType | 'columns' | `pattern:${string}`;

/** What the palette shows for a folder pattern: its name, and what it holds. */
export interface PatternCard {
  id: string;
  name: string;
  summary: string;
}

export const isPatternKind = (kind: PaletteKind): kind is `pattern:${string}` => kind.startsWith('pattern:');
export const patternIdOf = (kind: `pattern:${string}`): string => kind.slice('pattern:'.length);

const COLUMNS_CARD = {
  name: 'Columns',
  summary: 'Two columns side by side, empty. Drop blocks into them, and set the ratio afterwards.',
};

const describe = (kind: PaletteKind, patterns: PatternCard[]) => {
  if (kind === 'columns') return COLUMNS_CARD;
  if (isPatternKind(kind)) {
    const found = patterns.find((p) => p.id === patternIdOf(kind));
    return found ? { name: found.name, summary: found.summary } : { name: 'Pattern', summary: 'A section saved to the folder.' };
  }
  return CATALOG[kind];
};

const GROUPS: Array<{ name: string; types: PaletteKind[]; help?: string }> = [
  { name: 'Content', types: ['heading', 'richtext', 'image', 'brand', 'button', 'freeform'] },
  { name: 'Layout', types: ['columns', 'divider', 'stripes', 'spacer'] },
  {
    name: 'Fixed',
    types: ['topbar', 'legal'],
    help: 'Full-bleed furniture. These draw their own band, so they cannot sit in a column.',
  },
];

/** Below this, the pointer has not moved enough to mean a drag, so it is still a click. */
const DRAG_THRESHOLD = 4;

export interface PaletteProps {
  editor: Editor;
  dragging: PaletteKind | null;
  onDrag(kind: PaletteKind, x: number, y: number): void;
  onDrop(): void;
  /** Sections saved to the folder, offered like blocks. */
  patterns: PatternCard[];
  /** A click on a pattern card: place it at the end. */
  onPlacePattern(id: string): void;
  /** A block was added by clicking a card, for the recent-blocks list. */
  onUsed?(kind: PaletteKind): void;
}

export function Palette({ editor, dragging, onDrag, onDrop, patterns, onPlacePattern, onUsed }: PaletteProps) {
  // Patterns are a fourth group, after the fixed furniture: they are the folder's, not the app's,
  // and a folder without any simply has three groups.
  const groups = patterns.length
    ? [
        ...GROUPS,
        {
          name: 'Patterns',
          types: patterns.map((p) => `pattern:${p.id}` as PaletteKind),
          help: 'Sections saved to the folder. Placed as a copy that follows the pattern: when the pattern changes, the copy says so.',
        },
      ]
    : GROUPS;
  return (
    <div class="palette-pane">
      <p class="hint palette-hint">
        {dragging ? 'Drop it where it goes.' : 'Drag onto the email, or click to add at the end.'}
      </p>
      {groups.map((group) => (
        <section class="palette-group" key={group.name}>
          <h3 title={group.help}>{group.name}</h3>
          <div class="palette-list">
            {group.types.map((type) => (
              <Card
                key={type}
                type={type}
                editor={editor}
                active={dragging === type}
                onDrag={onDrag}
                onDrop={onDrop}
                patterns={patterns}
                onPlacePattern={onPlacePattern}
                {...(onUsed ? { onUsed } : {})}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Card({
  type,
  editor,
  active,
  onDrag,
  onDrop,
  patterns,
  onPlacePattern,
  onUsed,
}: {
  type: PaletteKind;
  editor: Editor;
  active: boolean;
  onDrag(kind: PaletteKind, x: number, y: number): void;
  onDrop(): void;
  patterns: PatternCard[];
  onPlacePattern(id: string): void;
  onUsed?(kind: PaletteKind): void;
}) {
  const spec = describe(type, patterns);
  // The same glyph the layer tree uses, so a card and the row it becomes read as one thing.
  const Glyph = glyphFor(type);
  const origin = useRef<{ x: number; y: number; dragging: boolean } | null>(null);

  // Pointer capture is what makes this work over the canvas at all: the preview is an iframe, and
  // without capture its document swallows every `pointermove` the moment the pointer crosses into
  // it. Captured, the events keep arriving in this document, with coordinates we can convert.
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    capture(event.currentTarget as HTMLElement, event.pointerId);
    origin.current = { x: event.clientX, y: event.clientY, dragging: false };
  };

  const onPointerMove = (event: PointerEvent) => {
    const from = origin.current;
    if (!from) return;
    if (!from.dragging) {
      if (Math.abs(event.clientX - from.x) < DRAG_THRESHOLD && Math.abs(event.clientY - from.y) < DRAG_THRESHOLD) return;
      from.dragging = true;
    }
    onDrag(type, event.clientX, event.clientY);
  };

  const onPointerUp = (event: PointerEvent) => {
    const from = origin.current;
    release(event.currentTarget as HTMLElement, event.pointerId);
    origin.current = null;
    // A press that never moved is a click, and a click appends — which is what you want when you
    // already know it goes at the bottom.
    if (from?.dragging) onDrop();
    else if (isPatternKind(type)) onPlacePattern(patternIdOf(type));
    else if (type === 'columns') editor.addColumns(editor.template.sections.length);
    else {
      editor.add(type, null);
      onUsed?.(type);
    }
  };

  return (
    <button
      class={`block-card ${active ? 'lifted' : ''}`}
      title={spec.summary}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <Glyph />
      <span class="block-card-name">{spec.name}</span>
      <Grip />
    </button>
  );
}

/** Six dots. The one piece of ornament that earns its place: it says "pick me up" without a word. */
function Grip() {
  return (
    <svg class="grip" viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">
      {[3, 8, 13].map((y) => (
        <g key={y}>
          <circle cx="2" cy={y} r="1.35" />
          <circle cx="8" cy={y} r="1.35" />
        </g>
      ))}
    </svg>
  );
}
