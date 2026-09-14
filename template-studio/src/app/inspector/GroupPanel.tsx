// One collapsible group of controls: Content, Appearance, Spacing, Background, the lock.

import { useState } from 'preact/hooks';

import type { Group } from '../../model/catalog.ts';
import { resolve } from '../../model/edit.ts';
import type { Editor } from '../useEditor.ts';
import { ControlField } from './fields.tsx';
import type { FreeformUi } from './types.ts';

export function GroupPanel({
  group,
  editor,
  onRasterise,
  rasterising,
  onSpacingHot,
  freeform,
}: {
  group: Group;
  editor: Editor;
  onRasterise?(id: string): void;
  rasterising?: boolean;
  onSpacingHot?(hot: boolean): void;
  freeform?: FreeformUi;
}) {
  const [open, setOpen] = useState(Boolean(group.open));
  const found = resolve(editor.template, editor.selection);
  const inStack = (found.column?.blocks.length ?? 0) > 1;
  // A control that only means something in a group stays out of the panel otherwise — a dial
  // wired to nothing is worse than no dial.
  const controls = group.controls.filter((c) => !c.when || (c.when === 'stack' && inStack) || (c.when === 'canvas' && Boolean(freeform?.open)));
  // The Spacing panel drives the overlay on the canvas: while the pointer is over it or a dial in
  // it has focus, the numbers being changed are drawn on the block they belong to.
  const live = group.name === 'Spacing' && onSpacingHot;
  const hot = live
    ? {
        onPointerEnter: () => onSpacingHot(true),
        onPointerLeave: () => onSpacingHot(false),
        onFocusIn: () => onSpacingHot(true),
        onFocusOut: (e: FocusEvent) => {
          const next = e.relatedTarget as Node | null;
          if (!next || !(e.currentTarget as HTMLElement).contains(next)) onSpacingHot(false);
        },
      }
    : {};
  return (
    <section class={`panel ${open ? 'open' : ''}`}>
      {/* The group's explanation is on the header rather than under it. Jared asked for tooltips
          over visible descriptions: a paragraph in every panel pushes the controls down the pane
          and is read once. */}
      <button class="panel-head" aria-expanded={open} title={group.help} onClick={() => setOpen((v) => !v)}>
        <span class="caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        {group.name}
      </button>
      {open && (
        <div class="panel-body" {...hot}>
          <div class="controls">
            {controls.map((control) => (
              <ControlField
                key={control.path}
                control={control}
                editor={editor}
                {...(freeform ? { freeform } : {})}
                {...(onRasterise ? { onRasterise } : {})}
                {...(rasterising ? { rasterising } : {})}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
