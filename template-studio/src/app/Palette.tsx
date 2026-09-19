import { useRef } from 'preact/hooks';

import { CATALOG, SINGLETON } from '../model/catalog.ts';
import { SY_BLOCKS } from '../model/switchyards.ts';
import { allBlocks } from '../model/edit.ts';
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
/** Below this, the pointer has not moved enough to mean a drag, so it is still a click. */
const DRAG_THRESHOLD = 4;

export type PaletteKind = BlockType | 'columns' | `pattern:${string}` | `sy:${string}`;
/** What the drop plumbing can carry: a palette card, or a picture from the Assets panel (place-picture.ts). */
export type DragKind = PaletteKind | `asset:${string}`;

/** What the palette shows for a folder pattern: its name, and what it holds. */
export interface PatternCard {
  id: string;
  name: string;
  summary: string;
}

export const isPatternKind = (kind: PaletteKind): kind is `pattern:${string}` => kind.startsWith('pattern:');
export const patternIdOf = (kind: `pattern:${string}`): string => kind.slice('pattern:'.length);
/** One of the Switchyards email system's blocks (model/switchyards.ts), placed like a pattern: as sections at the end. */
export const isSyKind = (kind: PaletteKind): kind is `sy:${string}` => kind.startsWith('sy:');
export const syIdOf = (kind: `sy:${string}`): string => kind.slice('sy:'.length);
/** A picture from the Assets panel on its way to the email, by its name in `assets/`. */
export const isAssetKind = (kind: DragKind): kind is `asset:${string}` => kind.startsWith('asset:');
export const assetKind = (name: string): `asset:${string}` => `asset:${name}`;
export const assetNameOf = (kind: `asset:${string}`): string => kind.slice('asset:'.length);

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
  if (isSyKind(kind)) {
    const found = SY_BLOCKS.find((b) => b.id === syIdOf(kind));
    return found ? { name: found.name, summary: found.summary } : { name: 'Block', summary: 'A Switchyards block.' };
  }
  return CATALOG[kind];
};

const GROUPS: Array<{ name: string; types: PaletteKind[]; help?: string }> = [
  {
    name: 'Switchyards',
    types: SY_BLOCKS.map((b) => `sy:${b.id}` as const),
    help: 'The Switchyards email system’s blocks, made from the plain blocks below on this template’s design system. Headings, paragraphs, buttons and the divider are the plain blocks: the system’s type and colours are in Design.',
  },
  { name: 'Content', types: ['heading', 'richtext', 'image', 'brand', 'button', 'freeform'] },
  { name: 'Layout', types: ['columns', 'divider', 'stripes', 'spacer', 'dndarea'] },
  {
    name: 'Fixed',
    types: ['topbar', 'legal'],
    help: 'Full-bleed furniture. These draw their own band, so they cannot sit in a column.',
  },
];


export interface PaletteProps {
  editor: Editor;
  dragging: PaletteKind | null;
  onDrag(kind: PaletteKind, x: number, y: number): void;
  onDrop(): void;
  /** Sections saved to the folder, offered like blocks. */
  patterns: PatternCard[];
  /** A click on a pattern card: place it at the end. */
  onPlacePattern(id: string): void;
  /** A click on one of the Switchyards blocks: place its sections at the end. */
  onPlaceSyBlock(id: string): void;
  /** A block was added by clicking a card, for the recent-blocks list. */
  onUsed?(kind: PaletteKind): void;
}

export function Palette({ editor, dragging, onDrag, onDrop, patterns, onPlacePattern, onPlaceSyBlock, onUsed }: PaletteProps) {
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
      <p class="hint palette-hint">{dragging ? 'Drop it where it goes.' : 'Drag onto the email, or click to add at the end.'}</p>
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
                onPlaceSyBlock={onPlaceSyBlock}
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
  onPlaceSyBlock,
  onUsed,
}: {
  type: PaletteKind;
  editor: Editor;
  active: boolean;
  onDrag(kind: PaletteKind, x: number, y: number): void;
  onDrop(): void;
  patterns: PatternCard[];
  onPlacePattern(id: string): void;
  onPlaceSyBlock(id: string): void;
  onUsed?(kind: PaletteKind): void;
}) {
  const spec = describe(type, patterns);
  // The same glyph the layer tree uses, so a card and the row it becomes read as one thing.
  const Glyph = glyphFor(type);

  // A block a template may hold only one of, which already has one. HubSpot rejects a second drag
  // and drop area at upload, so the card is spent rather than merely inadvisable — greyed out here,
  // and caught by lint for a second that arrives through a paste or an imported file.
  const spent =
    !isPatternKind(type) &&
    !isSyKind(type) &&
    type !== 'columns' &&
    SINGLETON.includes(type) &&
    allBlocks(editor.template).some((b) => b.type === type);

  // A press that moves is a drag onto the email; a press that does not is a click, which adds at the end.
  const origin = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const add = () => {
    if (isPatternKind(type)) onPlacePattern(patternIdOf(type));
    else if (isSyKind(type)) onPlaceSyBlock(syIdOf(type));
    else if (type === 'columns') editor.addColumns(editor.template.sections.length);
    else {
      editor.add(type, null);
      onUsed?.(type);
    }
  };
  // Pointer capture is what makes this work over the canvas at all: the preview is an iframe, and without capture
  // its document swallows every `pointermove` the moment the pointer crosses into it. Captured, the events keep
  // arriving in this document, with coordinates the preview can convert.
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || spent) return;
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
    if (from?.dragging) onDrop();
    else if (from) add();
  };
  // A finger that the browser takes for a scroll, or a pen lifted off the edge: the drag is let go, not dropped.
  const onPointerCancel = (event: PointerEvent) => {
    const from = origin.current;
    release(event.currentTarget as HTMLElement, event.pointerId);
    origin.current = null;
    if (from?.dragging) onDrop();
  };

  return (
    <button
      class={`block-card ${active ? 'lifted' : ''}`}
      title={spent ? `${spec.name}: this template already has one, and HubSpot allows only one.` : spec.summary}
      disabled={spent}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
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
