import { useEffect, useRef, useState } from 'preact/hooks';

import { CATALOG, GROUP_GROUPS, type Control, type Group } from '../model/catalog.ts';
import { COLUMN_BLOCKS } from '../compile/blocks/index.ts';
import { colorOf, type ColorRef } from '../model/design-system.ts';
import type { BlockType } from '../model/types.ts';
import { backToText, designSystemOf, isStack, RATIOS, readValue, resolve, shareSpans, hubspotFields } from '../model/edit.ts';
import { addLayer, groupOfKey, groupRuns, isRendered, membersOf, paintGroup, removeGroup, removeLayer, reorderLayer, ungroupLayers, updateLayer, updateMembers, type LayerKind } from '../model/freeform.ts';
import { MARKS } from '../model/marks.ts';
import { canvasTypeOf } from '../model/design-system.ts';
import type { FreeformLayer } from '../model/types.ts';
import type { DndColumn, DndModule, DndSection, Lock } from '../model/types.ts';
import { newDndColumn, newDndModule, newDndSection } from '../model/dnd.ts';
import { STOCK_MODULES, stockModule } from '../model/modules.ts';
import { EMAIL_BODY } from '../model/ids.ts';
import type { Editor } from './useEditor.ts';
import { Dial } from './Dial.tsx';
import { nameOf, PresetSlot } from './ColorSlot.tsx';
import { LinkedIcon } from './icons.tsx';

// The inspector, generated from the catalog.
//
// Its job is drill-down: a designer selecting a block sees the one thing they came for — Content —
// and finds Appearance, Spacing, Background and the HubSpot lock underneath it, in that order,
// because that is the order they stop caring. Nothing is hidden behind a menu and nothing is
// flattened into a wall of forty controls.
//
// Every control carries a one-line explanation on hover. Jared asked for that explicitly, and it is
// the difference between a designer guessing what "Optional in HubSpot" means and knowing.

const WIDE = new Set(['text', 'textarea', 'html', 'url', 'lock', 'stripes', 'columns', 'dnd']);

/** What the folder's pattern says about the selected section, and what can be done about it. */
export interface PatternInfo {
  /** Null when the section is not placed from a pattern. */
  name: string | null;
  instance: boolean;
  stale: boolean;
  missing: boolean;
  onApply(): void;
  onDetach(): void;
  onPush(): void;
  onSave(name: string): void;
}

export interface InspectorProps {
  editor: Editor;
  patternInfo?: PatternInfo;
  /** More than one block is selected. The panel is about the run, not about any one of them. */
  multi?: { count: number; onDelete(): void; onGroup?(): void };
  /**
   * The Spacing panel is being worked — the pointer is over it, or a dial in it has focus — so
   * the canvas can draw the numbers being changed. See Preview's `spacing`.
   */
  onSpacingHot?(hot: boolean): void;
  /** The freeform surface's editing state, which the canvas shares: the picked layer, and the pen. */
  freeform?: FreeformUi;
  /**
   * Draws the selected block as a picture of itself. Lives in the app because it needs the canvas
   * — the picture is made from what the preview is actually showing, not from a second guess at
   * what the compiler would emit.
   */
  onRasterise?(blockId: string): void;
  /** Whether one is being drawn right now, so the button can say so. */
  rasterising?: boolean;
}

export interface FreeformUi {
  layer: string | null;
  onSelectLayer(layerId: string | null): void;
  drawing: boolean;
  onDrawing(on: boolean): void;
  /** The surface is open as a workspace; `onEnter` opens it. */
  open?: boolean;
  onEnter?(blockId: string): void;
  /** The Freeform app's frame, which this block can follow (model/freeform-link.ts). */
  app?: FreeformAppUi;
}

export interface FreeformAppUi {
  frames: Array<{ key: string; name: string; width: number; height: number; layers: number; printed: boolean; thumb: string }>;
  /** The frame this block follows, or null. */
  linkedKey: string | null;
  /** Linked to a frame the Freeform app no longer has. */
  missing: boolean;
  /** Linked, and already showing the frame as it is now. */
  current: boolean;
  /** The block's printed picture, when it has effects: its frame's card then shows what the email shows. */
  print?: string;
  onLink(key: string): void;
  onUnlink(): void;
  /** Opens the Freeform app, on the given frame or the one this block follows. */
  onOpen(key?: string): void;
}

export function Inspector({ editor, onRasterise, rasterising, patternInfo, multi, onSpacingHot, freeform }: InspectorProps) {
  const { template, selection } = editor;
  const found = resolve(template, selection);

  if (selection.kind === 'template' || !found.section) return <NothingSelected />;
  if (multi && multi.count > 1) return <MultiPanel count={multi.count} onDelete={multi.onDelete} {...(multi.onGroup ? { onGroup: multi.onGroup } : {})} />;

  const row = found.section.rows[0];
  const split = (row?.columns.length ?? 0) > 1;
  const grouped = isStack(found.section);
  // Selecting the columns themselves — from the outline, or by clicking the gap between them —
  // shows the row's own settings. They belong to the row, not to whichever block sits inside it.
  if (split && (selection.kind === 'section' || !found.block)) {
    return <ColumnsPanel editor={editor} {...(patternInfo ? { patternInfo } : {})} />;
  }
  // The same for a group: its box, its spacing and its band are the column's and the section's,
  // and selecting the group is how you reach them without going through one of its blocks.
  if (grouped && (selection.kind === 'section' || !found.block)) {
    return <StackPanel editor={editor} {...(patternInfo ? { patternInfo } : {})} {...(onSpacingHot ? { onSpacingHot } : {})} />;
  }

  const block = found.block ?? row?.columns[0]?.blocks[0];
  if (!block) return <p class="empty pad">This section has no block in it.</p>;
  const spec = CATALOG[block.type];

  return (
    <div class="inspector">
      {patternInfo && <PatternStrip info={patternInfo} />}
      {/* The template used to be the root of this trail, and clicking it was the only way back to
          the settings for the whole email. Those live on the left now — the name in Files, the
          page in Design — so the trail is what it says it is: where this block sits. */}
      <nav class="crumbs">
        {/* The row is in the trail when there is one, so a block inside columns says so and gives
            you a way back up to them. A group likewise. */}
        {(split || grouped) && (
          <>
            <button
              class="link"
              title={grouped ? 'The group this block is in: its box, its spacing, its background.' : 'The row of columns this block is in.'}
              onClick={() => editor.select({ kind: 'section', sectionId: found.section!.id })}
            >
              {grouped ? 'Group' : 'Columns'}
            </button>
            <span aria-hidden="true">›</span>
          </>
        )}
        <b>{spec.name}</b>
      </nav>
      <p class="summary">{spec.summary}</p>

      {/* A freeform block's canvas details show only inside the canvas, and its email settings only outside it. */}
      {spec.groups.filter((group) => !group.when || (group.when === 'canvas') === Boolean(freeform?.open)).map((group) => (
        <GroupPanel
          key={`${block.id}-${group.name}`}
          group={group}
          editor={editor}
          {...(onRasterise ? { onRasterise } : {})}
          {...(rasterising ? { rasterising } : {})}
          {...(onSpacingHot ? { onSpacingHot } : {})}
          {...(freeform ? { freeform } : {})}
        />
      ))}

      <FieldFooter editor={editor} />
    </div>
  );
}

function GroupPanel({
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

function ControlField({
  control,
  editor,
  onRasterise,
  rasterising,
  freeform,
}: {
  control: Control;
  editor: Editor;
  onRasterise?(id: string): void;
  rasterising?: boolean;
  freeform?: FreeformUi;
}) {
  const value = readValue(editor.template, editor.selection, control.path);
  const set = (next: unknown) => editor.set(control.path, next);
  const wide = WIDE.has(control.kind);

  if (control.kind === 'lock') return <LockField control={control} editor={editor} />;
  if (control.kind === 'layers') return <LayersField editor={editor} {...(freeform ? { freeform } : {})} />;
  if (control.kind === 'render-picture') return <RenderPictureField editor={editor} {...(onRasterise ? { onRasterise } : {})} busy={Boolean(rasterising)} />;
  if (control.kind === 'stripes') return <StripesField control={control} editor={editor} />;
  if (control.kind === 'dnd') return <DndField control={control} editor={editor} />;
  if (control.kind === 'columns') return <ColumnsField editor={editor} />;
  if (control.kind === 'preset') return <PresetField control={control} editor={editor} />;
  if (control.kind === 'variant') return <VariantField control={control} editor={editor} />;
  if (control.kind === 'border') return <BorderField control={control} editor={editor} />;
  // A palette colour by name — the same slot the design panel uses, so the list cannot go stale
  // (learnings 3.48). `zero` names what an empty reference falls back to.
  if (control.kind === 'palette') {
    return (
      <div class="field wide">
        <PresetSlot
          ds={designSystemOf(editor.template)}
          label={control.label}
          value={(value as ColorRef) ?? null}
          onChange={(v: ColorRef) => set(v)}
          help={control.help ?? ''}
          allowNone
          {...(control.zero ? { noneLabel: control.zero } : {})}
        />
      </div>
    );
  }
  if (control.kind === 'rasterise') {
    return <RasteriseField editor={editor} {...(onRasterise ? { onRasterise } : {})} busy={Boolean(rasterising)} />;
  }

  if (control.kind === 'toggle') {
    return (
      <label class="field toggle" title={control.help}>
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => set((e.target as HTMLInputElement).checked)} />
        <span>{control.label}</span>
      </label>
    );
  }

  // A number that follows a design-system token until you give it one of its own.
  //
  // One row, not three: a checkbox plus a dial plus a label would be more interface than the
  // decision deserves, and it would sit in the panel looking complicated for every block that
  // never departs from the page. Dragging takes the value over; the chain hands it back. The dial
  // reads the inherited number while it is following, so the thing you are about to change is the
  // thing you can see.
  if (control.kind === 'inherit-number') {
    const own = typeof value === 'number' ? value : null;
    const following = own === null;
    const ds = designSystemOf(editor.template);
    // Which token the dial follows is the path's business: the sides follow the gutter, the gap
    // between blocks follows its own.
    const token = control.path === 'column.gap' ? { value: ds.blockGap, name: 'Design › Between blocks' } : { value: ds.pagePadding, name: 'Design › Page padding' };
    const inherited = token.value;
    return (
      <div class={`field wide inherit ${following ? 'following' : ''}`}>
        <Dial
          label={control.label}
          value={following ? inherited : own}
          onChange={set}
          min={control.min ?? 0}
          max={control.max ?? 100}
          step={control.step ?? 1}
          {...(control.suffix ? { suffix: control.suffix } : {})}
          {...(control.zero ? { zero: control.zero } : {})}
          {...(control.help ? { title: control.help } : {})}
        />
        <button
          class={`chain ${following ? 'on' : ''}`}
          aria-pressed={following}
          aria-label={`${control.label}: follow ${token.name}`}
          title={
            following
              ? `Following ${token.name}. Click to give this block its own.`
              : `This block has its own. Click to hand it back to ${token.name}.`
          }
          onClick={() => set(following ? inherited : null)}
        >
          <LinkedIcon />
        </button>
      </div>
    );
  }

  if (control.kind === 'number') {
    // Full width rather than half: the dial's whole affordance is a bar you can see the value in,
    // and half a pane leaves no room for the name, the number and a readable fill.
    return (
      <div class="field wide">
        <Dial
          label={control.label}
          value={Number(value) || 0}
          onChange={set}
          min={control.min ?? 0}
          max={control.max ?? 100}
          step={control.step ?? 1}
          {...(control.suffix ? { suffix: control.suffix } : {})}
          {...(control.zero ? { zero: control.zero } : {})}
          {...(control.help ? { title: control.help } : {})}
        />
      </div>
    );
  }

  return (
    <div class={`field ${wide ? 'wide' : ''}`} title={control.help}>
      <label>{control.label}</label>
      {renderInput(control, value, set)}
    </div>
  );
}

function renderInput(control: Control, value: unknown, set: (v: unknown) => void) {
  switch (control.kind) {
    case 'number':
      return (
        <div class="with-suffix">
          <input
            type="number"
            value={value === 0 && control.zero ? '' : String(value ?? '')}
            placeholder={control.zero ?? ''}
            min={control.min}
            max={control.max}
            step={control.step ?? 1}
            onInput={(e) => {
              const raw = (e.target as HTMLInputElement).value;
              set(raw === '' ? 0 : Number(raw));
            }}
          />
          {control.suffix && <span>{control.suffix}</span>}
        </div>
      );

    case 'select':
    case 'color':
      return (
        <select value={String(value ?? '')} onChange={(e) => set((e.target as HTMLSelectElement).value || null)}>
          {(control.options ?? []).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      );

    case 'textarea':
    case 'html':
      return (
        <textarea
          rows={control.kind === 'html' ? 6 : 3}
          spellcheck={control.kind !== 'html'}
          value={String(value ?? '')}
          onInput={(e) => set((e.target as HTMLTextAreaElement).value)}
        />
      );

    default:
      return (
        <input
          type="text"
          value={String(value ?? '')}
          placeholder={control.placeholder ?? ''}
          spellcheck={control.kind !== 'url'}
          onInput={(e) => set((e.target as HTMLInputElement).value)}
        />
      );
  }
}

/** The HubSpot lock: one switch, one label, and the field name it is bound to. */
function LockField({ control, editor }: { control: Control; editor: Editor }) {
  const lock = readValue(editor.template, editor.selection, control.path) as Lock | undefined;
  if (!lock) return null;
  const block = readValue(editor.template, editor.selection, 'block') as { type?: string } | undefined;
  const canBeBody = lock.editable && block?.type === 'richtext' && lock.field !== EMAIL_BODY && !hubspotFields(editor.template).some((f) => f.field === EMAIL_BODY);

  return (
    <div class="field wide lockbox">
      <label class="toggle" title={control.help}>
        <input
          type="checkbox"
          checked={lock.editable}
          onChange={(e) => editor.set(`${control.path}.editable`, (e.target as HTMLInputElement).checked)}
        />
        <span>
          The team can edit <b>{control.label.toLowerCase()}</b> in HubSpot
        </span>
      </label>

      {lock.editable ? (
        <>
          <label class="sub">What the team sees</label>
          <input
            type="text"
            value={lock.label}
            onInput={(e) => editor.set(`${control.path}.label`, (e.target as HTMLInputElement).value)}
          />
          {/* The name is shown because it is a contract: existing emails are bound to it, and it
              deliberately does not follow the label (learnings 1.10). Why it matters is on hover. */}
          <p class="fieldname">
            <code title="Fixed once created. Renaming the label above cannot orphan what the team has already typed into this field.">
              {lock.field}
            </code>
            {canBeBody && (
              // The one rename offered, because HubSpot asks for it by name: without a module called email_body the
              // template warns at upload and cannot be used for blog and RSS emails. Free only before the template is
              // uploaded; after, every email built from it is bound to the old name (learnings 1.10), which is why
              // the title says so.
              <button
                class="link"
                title={`Name this field ${EMAIL_BODY}, HubSpot's name for the main body. Do it before the template is uploaded: emails already built from it are bound to “${lock.field}”.`}
                onClick={() => editor.set(`${control.path}.field`, EMAIL_BODY)}
              >
                Name it {EMAIL_BODY}
              </button>
            )}
          </p>
        </>
      ) : (
        <p class="hint" title="The template renders this, so re-uploading it corrects every future send at once.">
          Locked.
        </p>
      )}
    </div>
  );
}

/**
 * The drag and drop area's default content: sections, the columns in each, and the HubSpot modules
 * in those.
 *
 * Deliberately plainer than the rest of the inspector. Everywhere else a designer is arranging the
 * email itself and the controls should feel like design; here they are writing a *starting point*
 * that the team will immediately rearrange, so a compact list of rows with add and remove is
 * honest about how much this is worth fussing over. Nothing here has a colour picker or a dial
 * beyond padding, because HubSpot styles what goes inside and our tokens do not reach it.
 */
function DndField({ control, editor }: { control: Control; editor: Editor }) {
  const sections = (readValue(editor.template, editor.selection, control.path) as DndSection[]) ?? [];
  const write = (next: DndSection[]) => editor.set(control.path, next);

  const patchSection = (si: number, patch: Partial<DndSection>) =>
    write(sections.map((s, i) => (i === si ? { ...s, ...patch } : s)));

  const patchColumn = (si: number, ci: number, patch: Partial<DndColumn>) =>
    patchSection(si, { columns: sections[si]!.columns.map((c, i) => (i === ci ? { ...c, ...patch } : c)) });

  const setModules = (si: number, ci: number, modules: DndModule[]) => patchColumn(si, ci, { modules });

  return (
    <div class="field wide dnd-field">
      {sections.map((section, si) => (
        <div class="dnd-section" key={section.id}>
          <div class="dnd-section-head">
            <span class="dnd-label">Section {si + 1}</span>
            <div class="dnd-actions">
              <button
                type="button"
                title="Split this section into two columns, or put it back to one."
                onClick={() =>
                  patchSection(si, {
                    columns:
                      section.columns.length > 1
                        ? [{ ...section.columns[0]!, width: 12, modules: section.columns.flatMap((c) => c.modules) }]
                        : [{ ...section.columns[0]!, width: 6 }, newDndColumn(6)],
                  })
                }
              >
                {section.columns.length > 1 ? 'One column' : 'Two columns'}
              </button>
              <button
                type="button"
                title="Remove this section from the default content."
                onClick={() => write(sections.filter((_, i) => i !== si))}
              >
                Remove
              </button>
            </div>
          </div>

          <div class="dnd-pads">
            <Dial label="Above" value={section.padTop} onChange={(padTop) => patchSection(si, { padTop })} min={0} max={120} suffix="px" />
            <Dial label="Below" value={section.padBottom} onChange={(padBottom) => patchSection(si, { padBottom })} min={0} max={120} suffix="px" />
          </div>

          {section.columns.map((column, ci) => (
            <div class="dnd-column" key={column.id}>
              {section.columns.length > 1 && <span class="dnd-label">Column {ci + 1}</span>}
              {column.modules.map((mod, mi) => (
                <div class="dnd-module" key={mod.id}>
                  <select
                    value={mod.path}
                    title="Which HubSpot module the team starts with here."
                    onChange={(e) =>
                      setModules(
                        si,
                        ci,
                        column.modules.map((m, i) => (i === mi ? { ...m, path: (e.target as HTMLSelectElement).value } : m)),
                      )
                    }
                  >
                    {STOCK_MODULES.map((m) => (
                      <option key={m.path} value={m.path}>
                        {m.name}
                      </option>
                    ))}
                    {!stockModule(mod.path) && <option value={mod.path}>{mod.path}</option>}
                  </select>
                  <input
                    type="text"
                    value={mod.label}
                    placeholder="Label"
                    title="What the team reads against this module in HubSpot."
                    onInput={(e) =>
                      setModules(
                        si,
                        ci,
                        column.modules.map((m, i) => (i === mi ? { ...m, label: (e.target as HTMLInputElement).value } : m)),
                      )
                    }
                  />
                  <button
                    type="button"
                    class="dnd-remove"
                    title="Remove this module."
                    onClick={() => setModules(si, ci, column.modules.filter((_, i) => i !== mi))}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                class="dnd-add"
                onClick={() => setModules(si, ci, [...column.modules, newDndModule('@hubspot/email_body', 'Body')])}
              >
                Add a module
              </button>
            </div>
          ))}
        </div>
      ))}

      <button type="button" class="dnd-add" onClick={() => write([...sections, newDndSection()])}>
        Add a section
      </button>
      <p class="hint">
        The team can change all of this. HubSpot styles what goes inside, so the design system, the
        phone rules and the dark-mode layers stop at the edge of this region.
      </p>
    </div>
  );
}

function StripesField({ control, editor }: { control: Control; editor: Editor }) {
  const stripes = (readValue(editor.template, editor.selection, control.path) as Array<{ color: ColorRef; height: number }>) ?? [];
  // The palette, not a list written here. It was a hard-coded five, which meant a stripe could not
  // use a colour somebody added and the palette could not see the stripes using its colours.
  const ds = designSystemOf(editor.template);
  const update = (index: number, patch: Partial<{ color: ColorRef; height: number }>) =>
    editor.set(control.path, stripes.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  return (
    <div class="field wide">
      {stripes.map((stripe, i) => {
        const resolved = colorOf(ds, stripe.color);
        return (
        <div class="stripe-row" key={i}>
          <span
            class={`swatch ${resolved ? '' : 'none'}`}
            style={resolved ? { background: resolved } : undefined}
            aria-hidden="true"
          />
          <select
            value={typeof stripe.color === 'string' ? stripe.color : ''}
            onChange={(e) => update(i, { color: (e.target as HTMLSelectElement).value || null })}
          >
            <option value="">None</option>
            {Object.keys(ds.colors).map((key) => (
              <option key={key} value={key}>
                {key === 'offwhite' ? 'Off-white' : key[0]!.toUpperCase() + key.slice(1)}
              </option>
            ))}
            {typeof stripe.color === 'string' && stripe.color.startsWith('#') && (
              <option value={stripe.color}>Literal {stripe.color}</option>
            )}
          </select>
          <div class="stripe-height">
            <Dial
              label="Thickness"
              value={stripe.height}
              onChange={(height) => update(i, { height })}
              min={0}
              max={40}
              suffix="px"
              title="Drag sideways to change. Zero drops this stripe."
            />
          </div>
        </div>
        );
      })}
    </div>
  );
}

/** Template-level settings: the things that belong to the file rather than to any one block. */
/**
 * The right pane when nothing is selected.
 *
 * It used to hold the template's settings — its two names, the page background, force light — and
 * that was the last thing in the app contradicting the rule the rest of it now follows: the left
 * rail is what is true of the whole template, the right pane is what is selected. Those settings
 * are global, so they went left. The name is in Files, which is the panel that lists templates;
 * the page is in Design › Page / layout, which is the panel about the page.
 *
 * What is left is an empty state, and an empty state that names the thing to do is worth more than
 * a panel of controls that happened to have nowhere else to live.
 */
/** The kinds a layer can be added as, in the order the buttons show them. */
const LAYER_KINDS: Array<{ kind: LayerKind; label: string; help: string }> = [
  { kind: 'text', label: 'Text', help: 'Words in a type role from the design system. Wraps at its width.' },
  { kind: 'image', label: 'Image', help: 'A picture from the folder’s assets — a file name from Assets — or a hosted URL.' },
  { kind: 'rect', label: 'Rectangle', help: 'A box: fill, outline, corner radius.' },
  { kind: 'ellipse', label: 'Ellipse', help: 'A circle when its width and height match.' },
  { kind: 'line', label: 'Line', help: 'From one point to another.' },
  { kind: 'sticky', label: 'Note', help: 'A sticky note with words on it.' },
  { kind: 'mark', label: 'Stamp', help: 'A brand mark, in any colour.' },
];

const LAYER_NAMES: Record<FreeformLayer['kind'], string> = { text: 'Text', image: 'Image', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', path: 'Stroke', sticky: 'Note', mark: 'Stamp' };

/** A compact number: label on the left, the field on the right, for a layer's geometry. */
function Num({ label, value, onChange, min, max }: { label: string; value: number; onChange(v: number): void; min?: number; max?: number }) {
  return (
    <label class="layer-num" title={label}>
      <span>{label}</span>
      <input
        type="number"
        value={Math.round(value)}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number((e.target as HTMLInputElement).value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}

/**
 * The freeform block in the panel.
 *
 * On the email it is a way in and a line of facts. The layers are the canvas's business, and a list
 * of them beside the email was detail about a place you were not in (learnings 3.68). Inside the
 * canvas it is the whole stack, with drawings gathered into groups and the picked layer's numbers.
 */
function LayersField({ editor, freeform }: { editor: Editor; freeform?: FreeformUi }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const block = resolve(editor.template, editor.selection).block;
  if (!block || block.type !== 'freeform') return null;
  const ds = designSystemOf(editor.template);

  if (!freeform?.open) {
    const n = block.layers.length;
    const app = freeform?.app;
    const linked = Boolean(app?.linkedKey);
    return (
      <div class="field wide canvas-entry">
        {linked ? (
          <button class="btn wide canvas-open" title="This block follows the frame in the Freeform app. Edit it there and the email updates." onClick={() => app?.onOpen()}>
            Edit in Freeform ↗
          </button>
        ) : (
          <button
            class="btn wide canvas-open"
            title="Zoom into the canvas to draw, drop pictures in, stamp and type. Double-clicking the block does the same."
            onClick={() => freeform?.onEnter?.(block.id)}
          >
            Open canvas
          </button>
        )}
        <span class="canvas-facts">
          {n} {n === 1 ? 'layer' : 'layers'} · {block.width} × {block.height}
          {block.effects?.length ? ' · Riso print' : ''}
        </span>

        {app && (
          <div class="canvas-link">
            <div class="canvas-link-head">
              <b>Freeform frames</b>
              {linked && (
                <span class={`canvas-link-badge ${app.missing || !app.current ? 'stale' : ''}`}>{app.missing ? 'Frame deleted' : app.current ? 'Linked · up to date' : 'Linked · updating'}</span>
              )}
            </div>
            {app.frames.length === 0 ? (
              <p class="hint">Nothing in the Freeform app yet. Draw a frame there and it shows up here to link.</p>
            ) : (
              <>
                <p class="hint">
                  {!linked
                    ? 'Pick a frame. This block takes its drawing and follows it from then on.'
                    : app.missing
                      ? 'The frame this block followed is gone from the Freeform app. The drawing stays: pick another frame, or unlink.'
                      : 'The highlighted frame is the one this block follows. Pick another to follow it instead.'}
                </p>
                <div class="canvas-frames">
                  {app.frames.map((f) => {
                    const on = f.key === app.linkedKey;
                    return (
                      <button
                        key={f.key}
                        class={`canvas-frame ${on ? 'on' : ''}`}
                        title={on ? `${f.name}: this block follows it. Opens it in the Freeform app.` : `Follow ${f.name}. It replaces this block's drawing; Undo brings the old one back.`}
                        onClick={() => (on ? app.onOpen(f.key) : app.onLink(f.key))}
                      >
                        <span class="canvas-frame-thumb">{on && app.print ? <img src={app.print} alt="" draggable={false} /> : <span dangerouslySetInnerHTML={{ __html: f.thumb }} />}</span>
                        <span class="canvas-frame-name">{f.name}</span>
                        <span class="canvas-frame-facts">
                          {f.width} × {f.height}
                          {f.printed ? ' · Riso' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {linked && (
              <button class="btn wide" title="Stop following the frame. The drawing stays, to edit in this block's own canvas." onClick={app.onUnlink}>
                Unlink
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const key = freeform.layer;
  const group = groupOfKey(key);
  const members = group ? membersOf(block, group) : [];
  const picked = key && !group ? (block.layers.find((l) => l.id === key) ?? null) : null;
  const coalesce = (id: string) => `layer:${block.id}:${id}`;
  const patch = (fields: Record<string, unknown>) => {
    if (!picked) return;
    editor.commit('Layer', updateLayer(editor.template, block.id, picked.id, fields), { coalesce: coalesce(picked.id) });
  };
  const add = (kind: LayerKind) => {
    const next = addLayer(editor.template, block.id, kind);
    const added = next.sections.flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks))).find((b) => b.id === block.id);
    editor.commit('Add layer', next);
    const last = added && added.type === 'freeform' ? added.layers[added.layers.length - 1] : undefined;
    freeform.onSelectLayer(last?.id ?? null);
  };
  const roles = Object.keys(ds.type);
  const looks = canvasTypeOf(ds);
  const nameOfLayer = (l: FreeformLayer) =>
    l.kind === 'text' || l.kind === 'sticky'
      ? l.text.trim().slice(0, 24) || LAYER_NAMES[l.kind]
      : l.kind === 'mark'
        ? (MARKS.find((m) => m.key === l.mark)?.name ?? 'Stamp')
        : LAYER_NAMES[l.kind];
  const strokeOf = (l: FreeformLayer | undefined) => (l && (l.kind === 'path' || l.kind === 'line') ? l : undefined);
  const firstStroke = strokeOf(members.find((m) => m.kind === 'path' || m.kind === 'line'));

  const row = (l: FreeformLayer, grouped: boolean) => {
    const index = block.layers.findIndex((x) => x.id === l.id);
    return (
      <li key={l.id} class={picked?.id === l.id ? 'on' : ''}>
        <button class="layer-row" title={`${LAYER_NAMES[l.kind]}. Click to pick it; drag it on the canvas.`} onClick={() => freeform.onSelectLayer(picked?.id === l.id ? null : l.id)}>
          <span class="layer-kind">{LAYER_NAMES[l.kind]}</span>
          <span class="layer-name">{nameOfLayer(l)}</span>
        </button>
        <span class="layer-actions">
          {!grouped && (
            <>
              <button disabled={index === block.layers.length - 1} title="Bring forward" aria-label="Bring forward" onClick={() => editor.commit('Reorder layer', reorderLayer(editor.template, block.id, l.id, 1))}>
                ↑
              </button>
              <button disabled={index === 0} title="Send back" aria-label="Send back" onClick={() => editor.commit('Reorder layer', reorderLayer(editor.template, block.id, l.id, -1))}>
                ↓
              </button>
            </>
          )}
          <button
            class="danger"
            title="Remove this layer."
            aria-label="Remove"
            onClick={() => {
              editor.commit('Remove layer', removeLayer(editor.template, block.id, l.id));
              if (picked?.id === l.id) freeform.onSelectLayer(null);
            }}
          >
            ✕
          </button>
        </span>
      </li>
    );
  };

  return (
    <div class="field wide layers">
      <div class="layer-add">
        {LAYER_KINDS.map((k) => (
          <button key={k.kind} class="btn" title={k.help} onClick={() => add(k.kind)}>
            {k.label}
          </button>
        ))}
      </div>

      <ul class="layer-list">
        {[...groupRuns(block.layers)].reverse().map((item) =>
          item.kind === 'layer' ? (
            row(item.layer, false)
          ) : (
            <li key={`group-${item.id}`} class={`layer-group ${group === item.id ? 'on' : ''}`}>
              <div class="layer-group-head">
                <button
                  class="layer-fold"
                  aria-expanded={Boolean(openGroups[item.id])}
                  aria-label={openGroups[item.id] ? 'Fold the drawing' : 'Show its strokes'}
                  onClick={() => setOpenGroups((o) => ({ ...o, [item.id]: !o[item.id] }))}
                >
                  {openGroups[item.id] ? '▾' : '▸'}
                </button>
                <button
                  class="layer-row"
                  title="Strokes drawn in one go, grouped as they were drawn. They move, resize, colour and delete together."
                  onClick={() => freeform.onSelectLayer(group === item.id ? null : `group:${item.id}`)}
                >
                  <span class="layer-kind">Group</span>
                  <span class="layer-name">Drawing · {item.layers.length} strokes</span>
                </button>
                <span class="layer-actions">
                  <button
                    title="Ungroup: every stroke its own layer again."
                    aria-label="Ungroup"
                    onClick={() => {
                      editor.commit('Ungroup drawing', ungroupLayers(editor.template, block.id, item.id));
                      if (group === item.id) freeform.onSelectLayer(null);
                    }}
                  >
                    ⊟
                  </button>
                  <button
                    class="danger"
                    title="Remove the whole drawing."
                    aria-label="Remove drawing"
                    onClick={() => {
                      editor.commit('Remove drawing', removeGroup(editor.template, block.id, item.id));
                      if (group === item.id) freeform.onSelectLayer(null);
                    }}
                  >
                    ✕
                  </button>
                </span>
              </div>
              {openGroups[item.id] && <ul class="layer-list nested">{[...item.layers].reverse().map((l) => row(l, true))}</ul>}
            </li>
          ),
        )}
        {block.layers.length === 0 && <li class="col-empty">nothing on the canvas yet</li>}
      </ul>

      {group && members.length > 0 && (
        <div class="layer-fields">
          <div class="layer-grid">
            <Num
              label="Weight"
              value={firstStroke?.strokeWidth ?? 3}
              min={1}
              max={40}
              onChange={(v) =>
                editor.commit('Drawing weight', updateMembers(editor.template, block.id, group, (l) => (l.kind === 'path' || l.kind === 'line' ? { ...l, strokeWidth: v } : l)), {
                  coalesce: coalesce(`group:${group}`),
                })
              }
            />
          </div>
          <PresetSlot ds={ds} label="Colour" value={firstStroke?.stroke ?? null} onChange={(v) => editor.commit('Drawing colour', paintGroup(editor.template, block.id, group, v))} help="Every stroke in the drawing, together." allowNone noneLabel="Ink" />
        </div>
      )}

      {picked && (
        <div class="layer-fields">
          {(picked.kind === 'text' || picked.kind === 'sticky') && (
            <textarea rows={3} value={picked.text} title="The words. A new line is a new line." onInput={(e) => patch({ text: (e.target as HTMLTextAreaElement).value })} />
          )}
          {picked.kind === 'text' && (
            <>
              <div class="layer-grid">
                <label class="layer-num wide" title="A playful style from Design › Canvas type, or a role from Design › Type.">
                  <span>Style</span>
                  <select
                    value={picked.look ? `look:${picked.look}` : picked.role}
                    onChange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      patch(v.startsWith('look:') ? { look: v.slice(5) } : { role: v, look: undefined });
                    }}
                  >
                    <optgroup label="Canvas type">
                      {Object.entries(looks).map(([k, style]) => (
                        <option key={k} value={`look:${k}`}>
                          {style.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Email type">
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>
                <label class="layer-num" title="Where the lines sit inside the layer's width.">
                  <span>Align</span>
                  <select value={picked.align} onChange={(e) => patch({ align: (e.target as HTMLSelectElement).value })}>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </label>
                <Num label="Width" value={picked.width} min={10} onChange={(v) => patch({ width: v })} />
                <Num label="X" value={picked.x} onChange={(v) => patch({ x: v })} />
                <Num label="Y" value={picked.y} onChange={(v) => patch({ y: v })} />
              </div>
              <PresetSlot ds={ds} label="Colour" value={picked.color} onChange={(v) => patch({ color: v })} help="Named from the palette. Left alone it is the style's own colour." allowNone noneLabel="Style" />
            </>
          )}
          {picked.kind === 'sticky' && (
            <div class="layer-grid">
              <Num label="X" value={picked.x} onChange={(v) => patch({ x: v })} />
              <Num label="Y" value={picked.y} onChange={(v) => patch({ y: v })} />
              <Num label="Width" value={picked.width} min={20} onChange={(v) => patch({ width: v })} />
              <Num label="Height" value={picked.height} min={20} onChange={(v) => patch({ height: v })} />
            </div>
          )}
          {picked.kind === 'mark' && (
            <>
              <div class="layer-grid">
                <label class="layer-num wide" title="Which brand mark.">
                  <span>Mark</span>
                  <select value={picked.mark} onChange={(e) => patch({ mark: (e.target as HTMLSelectElement).value })}>
                    {MARKS.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Num label="X" value={picked.x} onChange={(v) => patch({ x: v })} />
                <Num label="Y" value={picked.y} onChange={(v) => patch({ y: v })} />
                <Num label="Width" value={picked.width} min={8} onChange={(v) => patch({ width: v })} />
                <Num label="Height" value={picked.height} min={8} onChange={(v) => patch({ height: v })} />
              </div>
              <PresetSlot ds={ds} label="Colour" value={picked.color} onChange={(v) => patch({ color: v })} help="Named from the palette. Left alone it is the ink." allowNone noneLabel="Ink" />
            </>
          )}
          {picked.kind === 'image' && (
            <>
              <input type="text" value={picked.src} placeholder="hero.jpg, or https://…" title="A file name from Assets, or a hosted URL. A remote picture cannot be drawn into the render; use a file from the folder." onInput={(e) => patch({ src: (e.target as HTMLInputElement).value })} />
              <div class="layer-grid">
                <Num label="X" value={picked.x} onChange={(v) => patch({ x: v })} />
                <Num label="Y" value={picked.y} onChange={(v) => patch({ y: v })} />
                <Num label="Width" value={picked.width} min={1} onChange={(v) => patch({ width: v })} />
                <Num label="Height" value={picked.height} min={1} onChange={(v) => patch({ height: v })} />
                <Num label="Opacity %" value={picked.opacity * 100} min={0} max={100} onChange={(v) => patch({ opacity: Math.max(0, Math.min(100, v)) / 100 })} />
              </div>
            </>
          )}
          {(picked.kind === 'rect' || picked.kind === 'ellipse') && (
            <>
              <div class="layer-grid">
                <Num label="X" value={picked.x} onChange={(v) => patch({ x: v })} />
                <Num label="Y" value={picked.y} onChange={(v) => patch({ y: v })} />
                <Num label="Width" value={picked.width} min={1} onChange={(v) => patch({ width: v })} />
                <Num label="Height" value={picked.height} min={1} onChange={(v) => patch({ height: v })} />
                <Num label="Outline" value={picked.strokeWidth} min={0} max={40} onChange={(v) => patch({ strokeWidth: v })} />
                {picked.kind === 'rect' && <Num label="Radius" value={picked.radius} min={0} max={200} onChange={(v) => patch({ radius: v })} />}
              </div>
              <PresetSlot ds={ds} label="Fill" value={picked.fill} onChange={(v) => patch({ fill: v })} help="Named from the palette." allowNone noneLabel="None" />
              <PresetSlot ds={ds} label="Outline" value={picked.stroke} onChange={(v) => patch({ stroke: v })} help="Named from the palette. A shape with no fill and no outline gets one in the ink colour, so it can be seen." allowNone noneLabel="None" />
            </>
          )}
          {(picked.kind === 'line' || picked.kind === 'path') && (
            <>
              <div class="layer-grid">
                {picked.kind === 'line' && (
                  <>
                    <Num label="X1" value={picked.x1} onChange={(v) => patch({ x1: v })} />
                    <Num label="Y1" value={picked.y1} onChange={(v) => patch({ y1: v })} />
                    <Num label="X2" value={picked.x2} onChange={(v) => patch({ x2: v })} />
                    <Num label="Y2" value={picked.y2} onChange={(v) => patch({ y2: v })} />
                  </>
                )}
                <Num label="Weight" value={picked.strokeWidth} min={1} max={40} onChange={(v) => patch({ strokeWidth: v })} />
              </div>
              <PresetSlot ds={ds} label="Colour" value={picked.stroke} onChange={(v) => patch({ stroke: v })} help="Named from the palette." allowNone noneLabel="Ink" />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Rendering the surface to its picture, and where the picture lives. Three states, each said in
 * the button and its hover: never rendered, rendered from what is there now, or rendered from
 * something older — the last being the one that ships the wrong drawing if nobody looks.
 */
function RenderPictureField({ editor, onRasterise, busy }: { editor: Editor; onRasterise?(id: string): void; busy: boolean }) {
  const block = resolve(editor.template, editor.selection).block;
  if (!block || (block.type !== 'freeform' && block.type !== 'brand')) return null;
  const current = isRendered(block);
  const state = !block.src ? 'never' : current ? 'current' : 'stale';
  return (
    <div class="field wide rasterise">
      <button
        class={`btn wide ${state === 'stale' ? 'attention' : ''}`}
        disabled={busy || !onRasterise}
        title={
          state === 'never'
            ? 'Draws the surface at twice its size and saves the PNG under assets/rendered. The email carries the picture; nothing ships until it is rendered.'
            : state === 'current'
              ? 'The picture matches the recipe. Render again after a change, or when a picture from the folder has changed.'
              : 'The surface has changed since this picture was drawn. Render again, or the email carries the old drawing.'
        }
        onClick={() => onRasterise?.(block.id)}
      >
        {busy ? 'Drawing…' : state === 'never' ? 'Render picture' : state === 'current' ? 'Rendered · render again' : 'Changed · render again'}
      </button>
      <input
        type="text"
        value={block.src}
        placeholder="Rendered file, or the hosted URL once uploaded"
        title="Where the picture is. A file under assets/rendered straight after rendering; upload that PNG to HubSpot Files and paste the URL here before exporting."
        onInput={(e) => editor.set('block.src', (e.target as HTMLInputElement).value)}
      />
    </div>
  );
}

function NothingSelected() {
  return (
    <div class="inspector">
      <p class="summary empty-pane">
        Nothing selected. Click a block on the canvas, or pick one from Layers, and its content and
        spacing appear here.
        <br />
        <br />
        Settings for the whole email are on the left: its name in <b>Files</b>, and its type,
        colour and page in <b>Design</b>.
      </p>
    </div>
  );
}

/** The background picker, listed from the template's own presets rather than from a fixed set. */
function PresetField({ control, editor }: { control: Control; editor: Editor }) {
  const ds = designSystemOf(editor.template);
  const value = String(readValue(editor.template, editor.selection, control.path) ?? '');
  return (
    <div class="field" title={control.help}>
      <label>{control.label}</label>
      <select value={value} onChange={(e) => editor.set(control.path, (e.target as HTMLSelectElement).value)}>
        {Object.keys(ds.themes).map((key) => (
          <option key={key} value={key}>
            {key === 'offwhite' ? 'Off-white' : key[0]!.toUpperCase() + key.slice(1)}
          </option>
        ))}
        {/* A section still naming a preset that no longer exists keeps the colours it last resolved,
            so it renders fine and is simply outside the system — shown, rather than silently
            reassigned to something nobody picked. */}
        {value && !ds.themes[value] && <option value={value}>{value} (missing)</option>}
      </select>
    </div>
  );
}

/**
 * More than one block is selected. There is nothing to edit about a run; what there is to do with
 * one is move it, copy it and delete it, and the keys do those.
 */
function MultiPanel({ count, onDelete, onGroup }: { count: number; onDelete(): void; onGroup?(): void }) {
  return (
    <div class="inspector">
      <nav class="crumbs">
        <b>{count} blocks</b>
      </nav>
      <p class="summary">
        Selected together. <kbd>⌥↑</kbd> <kbd>⌥↓</kbd> move the run, <kbd>⌘C</kbd> copies it, <kbd>⌫</kbd> deletes it. Shift-click or{' '}
        <kbd>⇧↑</kbd> <kbd>⇧↓</kbd> to change what is in it.
      </p>
      <div class="controls">
        {onGroup && (
          <div class="field wide">
            <button
              class="btn wide"
              title="Put these blocks in one column: one box, one gutter, one band behind them, with the space between them from Design › Between blocks. ⌘G does the same; ⇧⌘G undoes it."
              onClick={onGroup}
            >
              Group into one column
            </button>
          </div>
        )}
        <div class="field wide">
          <button class="btn wide" title="Delete every selected block. It happens straight away and offers Undo." onClick={onDelete}>
            Delete {count} blocks
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A group — one column holding several blocks — selected as itself.
 *
 * What there is to set on it is the column's and the section's: the box around all of the blocks,
 * the space around and between them, the band behind. The panels are the same ones a block shows
 * for those things, because they edit the same nodes; what is different is that here they are
 * plainly the group's, with no block in the trail to suggest otherwise.
 */
function StackPanel({ editor, patternInfo, onSpacingHot }: { editor: Editor; patternInfo?: PatternInfo; onSpacingHot?(hot: boolean): void }) {
  const found = resolve(editor.template, editor.selection);
  const section = found.section;
  const column = found.column;
  if (!section || !column) return null;
  const kinds = column.blocks.map((b) => CATALOG[b.type].name.toLowerCase());

  return (
    <div class="inspector">
      {patternInfo && <PatternStrip info={patternInfo} />}
      <nav class="crumbs">
        <b>Group</b>
      </nav>
      <p class="summary" title="Drop a block onto the middle of any of them to add to the group; its top or bottom edge for a section of its own.">
        {column.blocks.length} blocks in one column: {kinds.join(', ')}.
      </p>

      {GROUP_GROUPS.map((group) => (
        <GroupPanel key={`${section.id}-${group.name}`} group={group} editor={editor} {...(onSpacingHot ? { onSpacingHot } : {})} />
      ))}

      <div class="controls">
        <div class="field wide">
          <button
            class="btn wide"
            title="One section per block again. The page keeps its look — each piece takes the gap that was under it — and only the structure changes. ⇧⌘G."
            onClick={() => editor.ungroup(section.id)}
          >
            Ungroup
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A section placed from a folder pattern: which one, whether it has moved on, and the moves.
 *
 * On a plain section it is one control — save this as a pattern — because that is the only thing
 * a plain section can do with patterns. On an instance it is the state and three verbs. "Update
 * available" is the one worth a colour: it is the reason the marker exists.
 */
function PatternStrip({ info }: { info: PatternInfo }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  // Focused from an effect: the field is created on a click, after which `autofocus` has already
  // had its one chance. Keystrokes otherwise land on the button that has just been pressed.
  const field = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (naming) field.current?.focus();
  }, [naming]);

  const save = () => {
    if (name.trim()) info.onSave(name.trim());
    setNaming(false);
    setName('');
  };

  if (!info.instance) {
    return (
      <div class="pattern-strip plain">
        {naming ? (
          <form
            class="pattern-name"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <input
              ref={field}
              type="text"
              value={name}
              placeholder="Pattern name — e.g. Footer with links"
              aria-label="Pattern name"
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setNaming(false);
                if (e.key === 'Enter') {
                  e.preventDefault();
                  save();
                }
              }}
            />
            <button type="submit" class="btn" disabled={!name.trim()}>
              Save
            </button>
            <button type="button" class="link" onClick={() => setNaming(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button
            class="link"
            title="Save this section to the folder as a pattern: place it in other templates, and when it changes, they can take the change."
            onClick={() => setNaming(true)}
          >
            Save as pattern…
          </button>
        )}
      </div>
    );
  }

  return (
    <div class={`pattern-strip ${info.stale ? 'stale' : ''} ${info.missing ? 'missing' : ''}`}>
      <span class="pattern-strip-name" title="Placed from a folder pattern. The content is a copy; the marker is what lets updates arrive.">
        Pattern · <b>{info.name ?? 'missing'}</b>
        {info.stale && <i> · update available</i>}
        {info.missing && <i> · not in the folder</i>}
      </span>
      <span class="pattern-strip-actions">
        {info.stale && (
          <button class="link" title="Replace this section with the pattern's new version. Blocks with the same label keep their HubSpot field names." onClick={info.onApply}>
            Apply
          </button>
        )}
        {!info.missing && (
          <button class="link" title="Write this section's current contents to the pattern as a new version. Every other placement then shows an update." onClick={info.onPush}>
            Push changes
          </button>
        )}
        <button class="link" title="Keep the content as an ordinary section. Updates stop arriving." onClick={info.onDetach}>
          Detach
        </button>
      </span>
    </div>
  );
}

/** The whole panel for a row of columns, which is a thing you select rather than a block setting. */
function ColumnsPanel({ editor, patternInfo }: { editor: Editor; patternInfo?: PatternInfo }) {
  const found = resolve(editor.template, editor.selection);
  const row = found.row;
  if (!row) return null;

  const ds = designSystemOf(editor.template);
  return (
    <div class="inspector">
      {patternInfo && <PatternStrip info={patternInfo} />}
      {/* No template root in the trail — the block panel lost its own for the same reason: what is
          true of the whole email lives on the left now, and a crumb that deselects is not a way up. */}
      <nav class="crumbs">
        <b>Columns</b>
      </nav>
      <p class="summary" title="Drop blocks into them from the Blocks tab, or drag one in from elsewhere in the email.">
        {row.columns.length} columns side by side.
      </p>

      <section class="panel open">
        <div class="panel-head static">Layout</div>
        <div class="panel-body">
          <ColumnsField editor={editor} />
        </div>
      </section>

      <section class="panel open">
        <div class="panel-head static" title="A preset moves the band, the container, the text colour and the link colour together.">
          Background
        </div>
        <div class="panel-body">
          <div class="controls">
            <div class="field">
              <label>Background</label>
              {/* The template's own presets, not the shipped ones. This read `DEFAULT_DESIGN_SYSTEM`
                  — the fifth copy of a list that lives elsewhere (learnings 3.48): a preset added in
                  Design never appeared here, and one renamed there broke the picker. */}
              <select
                value={found.section?.theme ?? ''}
                onChange={(e) => editor.set('section.theme', (e.target as HTMLSelectElement).value)}
              >
                {Object.keys(ds.themes).map((key) => (
                  <option key={key} value={key}>
                    {nameOf(key)}
                  </option>
                ))}
                {found.section?.theme && !ds.themes[found.section.theme] && (
                  <option value={found.section.theme}>{found.section.theme} (missing)</option>
                )}
              </select>
            </div>
          </div>
        </div>
      </section>

      <p class="inspector-foot" title="Deleting the columns deletes what is in them. Everything here is one undo step.">
        Deleting the columns deletes what is in them.
      </p>
    </div>
  );
}

/**
 * Count, ratio, phone behaviour, and what is in each column.
 *
 * That order because it is the order the decisions are made in. The ratios are a short list rather
 * than sliders summing to twelve: a designer wants a half, a third or a quarter, and the ones in
 * between are mostly a way to end up with a 5/7 split nobody chose.
 */
function ColumnsField({ editor }: { editor: Editor }) {
  const found = resolve(editor.template, editor.selection);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const row = found.row;
  const block = found.block;
  const section = found.section;
  if (!row || !section) return null;

  const spans = row.columns.map((c) => c.span);
  const count = row.columns.length;
  const current = spans.join('-');
  const here = block ? row.columns.findIndex((c) => c.blocks.some((b) => b.id === block.id)) : -1;

  return (
    <div class="field wide columnsbox">
      <div class="seg" role="group" aria-label="Number of columns">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            class={`seg-btn ${count === n ? 'on' : ''}`}
            aria-pressed={count === n}
            title={
              n === 1
                ? 'One full-width column, which is what every block starts as.'
                : `${n} columns side by side, stacking on phones unless you say otherwise.`
            }
            onClick={() => editor.setColumns(row.id, RATIOS[n]![0]!)}
          >
            {n}
          </button>
        ))}
      </div>

      {count > 1 && (
        <>
          <label class="sub">Ratio</label>
          {/* Each column's share, typed. The others give or take in proportion so the row still
              adds up; the divider on the canvas does the same by dragging. */}
          <div class="ratio-inputs" title="Each column's share of the row. Change one and the others adjust to keep the total. The divider between columns on the canvas does the same by dragging.">
            {spans.map((s, i) => (
              <span key={row.columns[i]!.id} class="ratio-input">
                <input
                  type="number"
                  min={10}
                  max={100 - 10 * (count - 1)}
                  value={Math.round((s / (spans.reduce((a, b) => a + b, 0) || 1)) * 100)}
                  aria-label={`Column ${i + 1} share`}
                  onChange={(e) => {
                    const v = Number((e.target as HTMLInputElement).value);
                    if (Number.isFinite(v)) editor.resizeColumns(row.id, shareSpans(spans, i, v));
                  }}
                />
                <span>%</span>
              </span>
            ))}
          </div>
          <div class="ratios">
            {(RATIOS[count] ?? []).map((option) => (
              <button
                key={option.join('-')}
                class={`ratio ${option.join('-') === current ? 'on' : ''}`}
                title={option.map((n) => `${Math.round((n / 12) * 100)}%`).join(' · ')}
                onClick={() => editor.setColumns(row.id, option)}
              >
                {option.map((n, i) => (
                  <span key={i} style={{ flexGrow: n }} />
                ))}
              </button>
            ))}
          </div>

          <label class="sub">On phones</label>
          <select
            value={row.mobile}
            title="Side by side is right for two small things — a pair of logos, two short buttons. Anything with a paragraph in it wants to stack."
            onChange={(e) => editor.set('row.mobile', (e.target as HTMLSelectElement).value)}
          >
            <option value="stack">Stack, full width each</option>
            <option value="side-by-side">Stay side by side</option>
          </select>

          <label class="sub">Columns</label>
          <ul class="collist">
            {row.columns.map((column, i) => (
              <li key={column.id} class={here === i ? 'on' : ''}>
                <div class="collist-row">
                  <span class="collist-n">{i + 1}</span>
                  <span class="collist-what">
                    {column.blocks.length === 0
                      ? 'empty'
                      : column.blocks.length === 1
                        ? '1 block'
                        : `${column.blocks.length} blocks`}
                  </span>
                  <label class="toggle mini" title="Drop this column below the phone breakpoint. The others take the full width.">
                    <input
                      type="checkbox"
                      checked={Boolean(column.hideOnPhone)}
                      onChange={(e) =>
                        editor.commit(
                          'Hide on phones',
                          setColumnFlag(editor, column.id, (e.target as HTMLInputElement).checked),
                        )
                      }
                    />
                    <span>Hide on phones</span>
                  </label>
                  <button
                    class="link tiny"
                    aria-expanded={addingTo === column.id}
                    title={`Add a block to column ${i + 1}.`}
                    onClick={() => setAddingTo((v) => (v === column.id ? null : column.id))}
                  >
                    {addingTo === column.id ? 'close' : '+ block'}
                  </button>
                  {block && here !== i && (
                    <button
                      class="link tiny"
                      title={`Move the selected block into column ${i + 1}.`}
                      onClick={() => editor.moveToColumn(block.id, i)}
                    >
                      move here
                    </button>
                  )}
                </div>
                {addingTo === column.id && (
                  <div class="colmenu">
                    {/* Only the blocks that can live in a column. The top bar, the stripes and the
                        legal footer each draw their own full-width band, so they are not offered
                        here and the compiler refuses them too. */}
                    {COLUMN_BLOCKS.map((type: BlockType) => (
                      <button
                        key={type}
                        title={CATALOG[type].summary}
                        onClick={() => {
                          editor.addToColumn(section.id, column.id, type);
                          setAddingTo(null);
                        }}
                      >
                        {CATALOG[type].name}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** A column flag, by column id rather than by selection — the row edits columns it is not in. */
function setColumnFlag(editor: Editor, columnId: string, hideOnPhone: boolean) {
  return {
    ...editor.template,
    sections: editor.template.sections.map((s) => ({
      ...s,
      rows: s.rows.map((r) => ({
        ...r,
        columns: r.columns.map((c) => (c.id === columnId ? { ...c, hideOnPhone } : c)),
      })),
    })),
  };
}

/** Everything the team will see in HubSpot, in the order the Contents panel lists it. */
/** The button variants, read from the design system so the list cannot go stale. */
function VariantField({ control, editor }: { control: Control; editor: Editor }) {
  const ds = designSystemOf(editor.template);
  const value = String(readValue(editor.template, editor.selection, control.path) ?? '');
  return (
    <div class="field" title={control.help}>
      <label>{control.label}</label>
      <select value={value} onChange={(e) => editor.set(control.path, (e.target as HTMLSelectElement).value)}>
        {Object.keys(ds.buttons).map((key) => (
          <option key={key} value={key}>
            {key[0]!.toUpperCase() + key.slice(1)}
          </option>
        ))}
        {value && !ds.buttons[value] && <option value={value}>{value} (missing)</option>}
      </select>
    </div>
  );
}

/**
 * A box around the block.
 *
 * One dial until it has a width, then four controls. A box is a thing most blocks do not have, and
 * four rows of settings for it on every block is four rows of nothing — the panel should cost what
 * the decision costs.
 *
 * The colour is a palette reference rather than a picker, which is the rule the whole app runs on:
 * the block decides *whether* there is a box and how big, and the design system decides what colour
 * anything in this email is.
 */
function BorderField({ control, editor }: { control: Control; editor: Editor }) {
  const ds = designSystemOf(editor.template);
  const read = (path: string) => readValue(editor.template, editor.selection, path);
  const width = Number(read('column.borderWidth')) || 0;

  return (
    <>
      <div class="field wide">
        <Dial
          label={control.label}
          value={width}
          onChange={(v) => editor.set('column.borderWidth', v)}
          min={0}
          max={12}
          suffix="px"
          zero="None"
          {...(control.help ? { title: control.help } : {})}
        />
      </div>
      {width > 0 && (
        <>
          <div class="field wide">
            <Dial
              label="Corner"
              value={Number(read('column.borderRadius')) || 0}
              onChange={(v) => editor.set('column.borderRadius', v)}
              min={0}
              max={28}
              suffix="px"
              zero="Square"
              title="Rounded corners. Outlook squares them off and keeps the line, so they should look deliberate rather than load-bearing."
            />
          </div>
          <div class="field wide">
            <Dial
              label="Inset"
              value={Number(read('column.borderPad')) || 0}
              onChange={(v) => editor.set('column.borderPad', v)}
              min={0}
              max={48}
              suffix="px"
              zero="None"
              title="The gap between the line and what is inside it. The page gutter stays outside the box, so this is the box's own breathing room."
            />
          </div>
          <PresetSlot
            ds={ds}
            label="Border"
            value={(read('column.borderColor') as ColorRef) ?? null}
            onChange={(v: ColorRef) => editor.set('column.borderColor', v)}
            help="Named from the palette, so recolouring the brand moves every box with it. Left alone it follows the body colour, which is what the copy inside the box is already set in."
            allowNone
            noneLabel="Body colour"
          />
        </>
      )}
    </>
  );
}

/**
 * Render as image, and the way back.
 *
 * Two states rather than two controls: on a heading or a paragraph it offers to draw one, and on
 * the image that came out of that it offers to draw it again or put the words back. An image
 * nobody converted renders nothing at all, which is why this is safe to list in the image
 * catalog — the block does not grow a button it has no use for.
 *
 * The consequences are stated here rather than only in the tooltip. Jared's standing rule is that
 * explanation belongs on the hover and not in the panel, and this is the exception the rule wants:
 * it is one line, it names the thing you cannot undo by looking at the canvas, and it appears only
 * once you are on a block where it is true.
 */
function RasteriseField({
  editor,
  onRasterise,
  busy,
}: {
  editor: Editor;
  onRasterise?(id: string): void;
  busy: boolean;
}) {
  const block = resolve(editor.template, editor.selection).block;
  if (!block || !onRasterise) return null;

  if (block.type === 'image') {
    if (!block.wasText) return null;
    return (
      <div class="field wide rasterise">
        <div class="row-actions-inline">
          <button class="btn wide" disabled={busy} onClick={() => onRasterise(block.id)} title="Draw it again from the words it was made from — after a type change, a colour change or a width change.">
            {busy ? 'Drawing…' : 'Re-render'}
          </button>
          <button
            class="btn wide"
            title="Put the words back, exactly as they were. The HubSpot field comes back with its original name, so anything the team typed into it before is still theirs."
            onClick={() => editor.commit('Back to text', backToText(editor.template, block.id))}
          >
            Back to text
          </button>
        </div>
        <p class="hint">A picture of text. It cannot reflow or invert, and readers with images off get the alt text.</p>
      </div>
    );
  }

  if (block.type !== 'heading' && block.type !== 'richtext') return null;

  return (
    <div class="field wide rasterise">
      <button
        class="btn wide"
        disabled={busy}
        title="Draws this block exactly as the canvas shows it and puts the picture in its place. Word rounds line heights, drops letter spacing and substitutes fonts; a picture does none of that."
        onClick={() => onRasterise(block.id)}
      >
        {busy ? 'Drawing…' : 'Render as image'}
      </button>
      <p class="hint">
        {block.lock.editable
          ? 'Renders the same in every client. The team loses the ability to edit it in HubSpot — this field leaves the template.'
          : 'Renders the same in every client. It stops being text, so it cannot reflow or invert.'}
      </p>
    </div>
  );
}

function FieldFooter({ editor }: { editor: Editor }) {
  const { template, selection } = editor;
  const found = resolve(template, selection);
  const block = found.block;
  if (!block) return null;

  // The area has no locks and is the most editable thing in the template, so the usual sentence
  // would be exactly backwards. It gets its own.
  if (block.type === 'dndarea') {
    return (
      <p class="inspector-foot">
        In HubSpot the team builds this region themselves: they add, move and delete modules inside
        it. Everything else in the template stays locked.
      </p>
    );
  }

  const locks: Lock[] = [];
  if ('lock' in block) locks.push(block.lock);
  if (block.type === 'button') locks.push(block.link);
  if (block.type === 'legal') locks.push(block.noteLock);
  const open = locks.filter((l) => l.editable);

  return (
    <p class="inspector-foot">
      {open.length === 0
        ? 'Nothing here is editable in HubSpot. The template renders all of it.'
        : `In HubSpot the team sees: ${open.map((l) => l.label).join(', ')}.`}
    </p>
  );
}
