// One control from the catalog, drawn: the dispatch on its kind, and the fields that are more than an input.

import type { Control } from '../../model/catalog.ts';
import { colorOf, type ColorRef } from '../../model/design-system.ts';
import { backToText, designSystemOf, readValue, resolve } from '../../model/edit.ts';
import { isRendered } from '../../model/freeform.ts';
import type { Lock } from '../../model/types.ts';
import { PresetSlot } from '../ColorSlot.tsx';
import { Dial } from '../Dial.tsx';
import { LinkedIcon } from '../icons.tsx';
import type { Editor } from '../useEditor.ts';
import { ColumnsField } from './Columns.tsx';
import { LayersField } from './LayersField.tsx';
import type { FreeformUi } from './types.ts';

const WIDE = new Set(['text', 'textarea', 'html', 'url', 'lock', 'stripes', 'columns']);

export function ControlField({
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

export function renderInput(control: Control, value: unknown, set: (v: unknown) => void) {
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
