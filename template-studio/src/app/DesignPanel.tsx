import { CANVAS_EFFECTS, canvasTypeOf, type CanvasEffect, type CanvasTextStyle } from '../model/design-system.ts';
import { canvasTypeSampleSvg } from '../compile/freeform.ts';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import {
  addColor,
  addFont,
  addPreset,
  colorUsage,
  fontUsage,
  presetUsage,
  removeFont,
  removePreset,
  renamePreset,
  designSystemOf,
  removeColor,
  renameColor,
  resetDesignSystem,
  resetPalette,
} from '../model/edit.ts';
import { colorOf, DEFAULT_DESIGN_SYSTEM, type DesignSystem, type TypeStyle } from '../model/design-system.ts';
import { nameOf, PresetSlot } from './ColorSlot.tsx';
import type { Editor } from './useEditor.ts';
import { Dial } from './Dial.tsx';

// The design system editor.
//
// This is the panel DialKit is actually for — "change one global and watch everything move" — and
// it only became possible this step, because until now the tokens were a type nobody read. The
// compiler hard-coded Helvetica, 38px and 600 while carrying a `DesignSystem` through every
// context. Wiring the dials up first and the compiler second would have produced a panel that
// looked like it worked.
//
// It writes through `editor.set`, which means every token change is an ordinary document edit: one
// undo step, coalesced while dragging, autosaved with everything else. That is the reason for not
// taking the dependency — DialKit owns its values, and here the document has to.
//
// Two honest limits, stated in the panel rather than only in the docs:
//
//   - The system belongs to **this template**, not to the folder. A shared `design-system.json`
//     that every template resolves against is the real thing and needs its own load, save and
//     conflict path (`types.ts`, `Template.ds`).
//   - A **section that names a preset follows it**; one whose colours were set by hand still names
//     the preset and so follows too. Detaching is what Patterns will add.

// Everything below reads the *keys* of the design system rather than a list written here.
//
// That is what makes an imported system work. A brand kit from Claude Design will not have five
// colours called navy, red, cream, offwhite and white, and it may carry type roles this project has
// never heard of — `display`, `eyebrow`, `caption`. A panel hard-coded to Switchyards' own names
// would show five rows and silently hide the rest, which is the worst of the options: the tokens
// would be in the document, reaching the output, and invisible in the interface.
//
// See docs/architecture.md, "Importing a design system", for the seam an importer plugs into.

/** What each of Switchyards' own colours is for. An imported palette simply has no note. */
const COLOR_NOTES: Record<string, string> = {
  navy: 'The dark band, the footer, and the colour body copy is set in.',
  red: 'Links, button outlines, rules and the quote bar all follow this.',
  cream: 'The page and the default container.',
  offwhite: 'The subtle band, and everything written on navy.',
  white: 'The white button fill.',
};

/** Roles first in the order a scale is read, then anything an import brought with it. */
function typeOrder(ds: DesignSystem): string[] {
  const known = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'topbar'];
  const rest = Object.keys(ds.type).filter((k) => !known.includes(k));
  return [...known.filter((k) => ds.type[k]), ...rest];
}

/** What the palette calls a hex, so a picker can say "Cream" rather than `#f7f6f3`. */
function hexName(ds: DesignSystem, hex: string): string {
  const key = Object.keys(ds.colors).find((k) => ds.colors[k]?.toLowerCase() === hex.toLowerCase());
  return key ? nameOf(key) : hex;
}

/** Which named stack a literal corresponds to, so "Default (Helvetica)" can say a name. */
function fontKeyOf(ds: DesignSystem, stack: string): string | null {
  return Object.keys(ds.fonts).find((k) => ds.fonts[k] === stack) ?? null;
}

export interface DesignPanelProps {
  editor: Editor;
  onClose(): void;
  /** Which set of values the panel edits, and which width the canvas shows. One switch for both. */
  device: 'desktop' | 'phone';
  onDevice(device: 'desktop' | 'phone'): void;
  /** The folder's systems, by name. Empty when the folder has none, or there is no folder. */
  systems: Record<string, DesignSystem>;
  folderOpen: boolean;
  onFollow(name: string): void;
  onSaveAs(name: string): void;
  onDetach(): void;
}

export function DesignPanel({ editor, onClose, device, onDevice, systems, folderOpen, onFollow, onSaveAs, onDetach }: DesignPanelProps) {
  const ds = designSystemOf(editor.template);
  const tuned = editor.template.ds !== undefined;
  const following = editor.template.designSystem ?? null;
  const phone = device === 'phone';

  return (
    <div class="inspector design">
      <nav class="crumbs">
        <b>Design system</b>
        <span class="grow" />
        <button class="link" onClick={onClose}>
          Close
        </button>
      </nav>

      {/* One switch for two things: which value a dial edits, and what the canvas is showing. They
          were separate — a phone size dial beside a desktop preview — which is a way to tune a
          number you cannot see. */}
      <div class="seg device-seg" role="group" aria-label="Editing">
        {(['desktop', 'phone'] as const).map((d) => (
          <button
            key={d}
            class={`seg-btn ${device === d ? 'on' : ''}`}
            aria-pressed={device === d}
            title={
              d === 'desktop'
                ? 'Values as they render above the breakpoint, with the canvas to match.'
                : 'Values below the breakpoint. The canvas switches to a phone so you are looking at what you are changing.'
            }
            onClick={() => onDevice(d)}
          >
            {d === 'desktop' ? 'Desktop' : 'Phone'}
          </button>
        ))}
      </div>

      {/* The page first: how wide the email is, what frames it and what sits outside it are the
          decisions every other value is set *against*. Choosing a 38px H1 before you have decided
          whether the email is 600px or 320px wide is choosing it twice. */}
      <PagePanel editor={editor} ds={ds} />

      {/* Then typography, together: a list and a quote are set in the same scale as the paragraph
          above them, and reaching past Colour and Buttons to adjust one was a walk between two
          halves of the same decision. */}
      <TypePanel editor={editor} ds={ds} phone={phone} />
      <RichTextPanel editor={editor} ds={ds} />
      {/* Playful type for the freeform canvas, its own category: it follows none of the email's rules. */}
      <CanvasTypePanel editor={editor} ds={ds} />
      <ColourPanel editor={editor} ds={ds} />
      {/* Directly under Colour, because a preset is a handful of colours with a name — reading one
          without the other is reading half of it. */}
      <PresetPanel editor={editor} ds={ds} />
      <ButtonPanel editor={editor} ds={ds} phone={phone} />
      <ImagePanel editor={editor} ds={ds} />

      <SystemFooter
        editor={editor}
        following={following}
        tuned={tuned}
        systems={systems}
        folderOpen={folderOpen}
        onFollow={onFollow}
        onSaveAs={onSaveAs}
        onDetach={onDetach}
      />
    </div>
  );
}

/**
 * Whose system this is: the folder's, this template's own, or the shipped values — and the moves
 * between them.
 *
 * The folder's is the one that matters. A template that follows `switchyards` holds no copy of
 * it; every edit above goes back to `design-systems/switchyards.system.json`, and every template
 * that names it moves together. That is the shared system the panel used to say was not built.
 */
function SystemFooter({
  editor,
  following,
  tuned,
  systems,
  folderOpen,
  onFollow,
  onSaveAs,
  onDetach,
}: {
  editor: Editor;
  following: string | null;
  tuned: boolean;
  systems: Record<string, DesignSystem>;
  folderOpen: boolean;
  onFollow(name: string): void;
  onSaveAs(name: string): void;
  onDetach(): void;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const field = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (naming) field.current?.focus();
  }, [naming]);
  const names = Object.keys(systems);
  const others = names.filter((n) => n !== following);
  const missing = following !== null && !systems[following];

  const reset = (
    <button class="link" onClick={() => editor.commit('Reset design system', resetDesignSystem(editor.template))}>
      Back to the shipped values
    </button>
  );

  const follow = others.length > 0 && (
    <select
      class="system-pick"
      value=""
      aria-label="Follow a folder design system"
      title="Follow one of the folder's systems. This template's sections re-resolve against it; the values above become that file's."
      onChange={(e) => {
        const picked = (e.target as HTMLSelectElement).value;
        if (picked) onFollow(picked);
      }}
    >
      <option value="">Follow a folder system…</option>
      {others.map((n) => (
        <option key={n} value={n}>
          {nameOf(n)}
        </option>
      ))}
    </select>
  );

  const saveAs = naming ? (
    <form
      class="system-save"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSaveAs(name.trim());
        setNaming(false);
        setName('');
      }}
    >
      <input
        ref={field}
        type="text"
        value={name}
        placeholder="Name — e.g. Switchyards"
        aria-label="Design system name"
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setNaming(false);
          if (e.key === 'Enter') {
            e.preventDefault();
            if (name.trim()) onSaveAs(name.trim());
            setNaming(false);
            setName('');
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
      class="btn wide"
      title={
        folderOpen
          ? 'Write these values to the folder as a system every template can follow. This template follows it from then on.'
          : 'Downloads the system as a file. Open a folder to keep systems with the templates that follow them.'
      }
      onClick={() => setNaming(true)}
    >
      Save to the folder as…
    </button>
  );

  return (
    <div class="inspector-foot system-foot">
      {following ? (
        <>
          <p>
            <b>{nameOf(following)}</b> — the folder’s system, in{' '}
            <code>design-systems/{following}.system.json</code>. Every template that names it moves with
            the values above.{missing && ' The folder does not have that file, so the shipped values are showing.'}
          </p>
          <div class="system-actions">
            {follow}
            <button
              class="link"
              title="Keep these values as this template's own copy and stop following the folder's file. Nothing moves on screen."
              onClick={onDetach}
            >
              Make this template’s own copy
            </button>
            {reset}
          </div>
        </>
      ) : tuned ? (
        <>
          <p>
            This system belongs to <b>{editor.template.name}</b> and travels in its file. Save it to the
            folder for other templates to follow.
          </p>
          <div class="system-actions">
            {saveAs}
            {follow}
            {reset}
          </div>
        </>
      ) : (
        <>
          <p>Untouched, so this template compiles against the values Switchyards already uses.</p>
          <div class="system-actions">
            {follow}
            {names.length === 0 && saveAs}
          </div>
        </>
      )}
    </div>
  );
}

function Panel({ name, help, open: initial, children }: { name: string; help?: string; open?: boolean; children: ComponentChildren }) {
  const [open, setOpen] = useState(Boolean(initial));
  return (
    <section class={`panel ${open ? 'open' : ''}`}>
      <button class="panel-head" aria-expanded={open} title={help} onClick={() => setOpen((v) => !v)}>
        <span class="caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        {name}
      </button>
      {open && (
        <div class="panel-body">
          {children}
        </div>
      )}
    </section>
  );
}

// --- type ------------------------------------------------------------------------------------------

function TypePanel({ editor, ds, phone }: { editor: Editor; ds: DesignSystem; phone: boolean }) {
  const order = typeOrder(ds);
  const [picked, setLevel] = useState<string>('h1');
  const level = ds.type[picked] ? picked : (order[0] ?? 'body');
  const t: TypeStyle = ds.type[level] ?? DEFAULT_DESIGN_SYSTEM.type['body']!;
  const set = (key: keyof TypeStyle, value: unknown) => editor.set(`ds.type.${level}.${key}`, value);

  return (
    <Panel
      name="Type"
      open
      help="The scale a heading renders at, and the rules HubSpot inlines onto whatever the team types in the rich text editor."
    >
      {/* The specimen doubles as the selector: pick the size you can see is wrong. */}
      <div class="specimen" role="radiogroup" aria-label="Type level">
        {order.map((name) => {
          const style = ds.type[name]!;
          // The specimen shows the width being edited, or the toggle is only half true.
          const shown = phone ? style.mobileSize : style.size;
          return (
            <button
              key={name}
              class={`spec-row ${level === name ? 'on' : ''}`}
              role="radio"
              aria-checked={level === name}
              onClick={() => setLevel(name)}
              title={`${style.size}px, ${style.lineHeight}% line height, ${style.mobileSize}px on phones`}
            >
              <span class="spec-tag">{nameOf(name)}</span>
              <span
                class="spec-sample"
                style={{
                  // Clamped so an h1 at 60px cannot push the panel around; the numbers beside it
                  // stay exact, which is what a specimen is for.
                  fontSize: `${Math.min(shown, 30)}px`,
                  fontWeight: style.weight,
                  textTransform: style.uppercase ? 'uppercase' : 'none',
                  letterSpacing: style.letterSpacing ?? 'normal',
                  fontFamily: (style.font && ds.fonts[style.font]) || ds.fontStack,
                  color: colorOf(ds, style.color ?? null) ?? undefined,
                }}
              >
                Switchyards
              </span>
              <span class="spec-size">{shown}</span>
            </button>
          );
        })}
      </div>

      <div class="dials">
        <Dial
          label="Size"
          value={phone ? t.mobileSize : t.size}
          onChange={(v) => set(phone ? 'mobileSize' : 'size', v)}
          min={8}
          max={72}
          suffix="px"
          title={
            phone
              ? 'Below the breakpoint. A headline that does not come down wraps to four lines on a phone.'
              : 'What this role renders at above the breakpoint.'
          }
        />
        <Dial
          label="Line height"
          value={t.lineHeight}
          onChange={(v) => set('lineHeight', v)}
          min={90}
          max={220}
          step={5}
          suffix="%"
          title="Reading text wants about 150%; headings want less. One value for both widths — a line height that changed on a phone would be a second number nobody is looking at."
        />
        <Dial
          label="Space after"
          value={t.marginBottom}
          onChange={(v) => set('marginBottom', v)}
          min={0}
          max={48}
          suffix="px"
          title="The margin below. HubSpot injects 1em onto every paragraph at send, so stating one is the only way to control it (learnings 1.9)."
        />
        <Dial
          label="Tracking"
          value={t.letterSpacing ?? 0}
          onChange={(v) => set('letterSpacing', v || undefined)}
          min={-6}
          max={6}
          // Halves. At 0.1 the dial landed on 0.30000000000000004 and on numbers nobody would
          // choose — tracking is a decision in half-pixels and whole ones, and a control that
          // offers more precision than the decision has is just a control that is hard to aim.
          step={0.5}
          suffix="px"
          zero="Normal"
          title="Letter spacing, in half-pixels. Small uppercase text is the one place it earns its keep; body copy almost never wants it."
        />
      </div>

      <div class="controls">
        <div class="field" title="Bold is a real weight in email; anything between is not, so the choice is two.">
          <label>Weight</label>
          <select value={t.weight} onChange={(e) => set('weight', (e.target as HTMLSelectElement).value)}>
            <option value="normal">Regular</option>
            <option value="bold">Bold</option>
          </select>
        </div>
        <label class="field toggle" title="Renders the role in capitals without changing what anybody typed, so the text stays readable in the editor and in the Contents panel.">
          <input type="checkbox" checked={Boolean(t.uppercase)} onChange={(e) => set('uppercase', (e.target as HTMLInputElement).checked || undefined)} />
          <span>Uppercase</span>
        </label>
      </div>

      {/* Per role. This is the difference between "the email is Helvetica" and a design: a Georgia
          H1 over Helvetica body copy is a decision a designer should be able to make here. */}
      <div class="controls">
        <div class="field" title="The stack this role renders in. Left on Default it follows the email's font below.">
          <label>Font</label>
          <select
            value={t.font ?? ''}
            onChange={(e) => set('font', (e.target as HTMLSelectElement).value || undefined)}
          >
            <option value="">Default ({nameOf(fontKeyOf(ds, ds.fontStack) ?? 'custom')})</option>
            {Object.keys(ds.fonts).map((key) => (
              <option key={key} value={key}>
                {nameOf(key)}
              </option>
            ))}
          </select>
        </div>
        <div
          class="field"
          title="Pins this role to a palette colour. Left on Follow the background it takes the section's text colour, which is what keeps a heading readable when it lands on the navy band."
        >
          <label>Colour</label>
          <select
            value={typeof t.color === 'string' ? t.color : ''}
            onChange={(e) => set('color', (e.target as HTMLSelectElement).value || undefined)}
          >
            <option value="">Follow the background</option>
            {Object.keys(ds.colors).map((key) => (
              <option key={key} value={key}>
                {nameOf(key)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div class="field wide" title="What every role falls back to, and what everything that is not a type role renders in. Email has no webfonts worth relying on, so these are the stacks already installed.">
        <label>The email’s font</label>
        <select value={ds.fontStack} onChange={(e) => editor.set('ds.fontStack', (e.target as HTMLSelectElement).value)}>
          {Object.entries(ds.fonts).map(([key, value]) => (
            <option key={key} value={value}>
              {nameOf(key)}
            </option>
          ))}
          {!Object.values(ds.fonts).includes(ds.fontStack) && <option value={ds.fontStack}>{ds.fontStack}</option>}
        </select>
      </div>

      <FontList editor={editor} ds={ds} />
    </Panel>
  );
}

/**
 * The stacks, and a way to add one.
 *
 * Seven shipped and that was the whole list: a template in a monospace face needed a stack the
 * system did not have, and nothing in the panel could give it one. A role names a stack rather
 * than holding it (learnings 3.12), so adding one is safe — `mono` can be tuned once and every role
 * that says it follows.
 *
 * Removing is refused while a role names it, and the tooltip says which. A role whose stack
 * resolves to nothing would fall back to the default silently, which is a change in a place nobody
 * is looking.
 */
function FontList({ editor, ds }: { editor: Editor; ds: DesignSystem }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [stack, setStack] = useState('');
  // Focused from an effect rather than with `autofocus`: the attribute only fires when the
  // element is created with the document, and this one is created on a click. Keystrokes then
  // landed wherever focus already was, which was the button that had just been pressed.
  const first = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (adding) first.current?.focus();
  }, [adding]);

  const commit = () => {
    if (!name.trim() || !stack.trim()) return;
    editor.commit('Add font', addFont(editor.template, name, stack));
    setAdding(false);
    setName('');
    setStack('');
  };

  return (
    <div class="font-list">
      {Object.entries(ds.fonts).map(([key, value]) => {
        const uses = fontUsage(ds, key);
        return (
          <div class="font-row" key={key} title={uses.length ? `Named by ${uses.join(', ')}.` : 'Named by no role yet.'}>
            <span class="font-name">{nameOf(key)}</span>
            <span class="font-stack">{value}</span>
            <button
              class="swatch-drop"
              disabled={uses.length > 0}
              aria-label={`Remove ${nameOf(key)}`}
              title={uses.length ? `${uses.join(', ')} use it. Point them at another font first.` : 'Remove. Nothing names it.'}
              onClick={() => editor.commit('Remove font', removeFont(editor.template, key))}
            >
              ✕
            </button>
          </div>
        );
      })}

      {adding ? (
        // A form, so Enter submits the way a browser already knows how to — and handled on keydown
        // as well, because implicit submission rides on the keypress a synthetic key event does not
        // always produce, and a form that submits from one keyboard and not another is a form
        // that looks broken.
        <form
          class="font-add"
          onSubmit={(e) => {
            e.preventDefault();
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setAdding(false);
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
        >
          <input
            ref={first}
            type="text"
            placeholder="Name — e.g. Mono"
            value={name}
            aria-label="Font name"
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
          <input
            type="text"
            placeholder="Stack — e.g. Menlo, Consolas, monospace"
            value={stack}
            spellcheck={false}
            aria-label="Font stack"
            title="Comma-separated, first choice first, ending in a generic family. Email has no webfonts worth relying on, so name faces that are installed."
            onInput={(e) => setStack((e.target as HTMLInputElement).value)}
          />
          <div class="row-actions-inline">
            <button type="submit" class="btn" disabled={!name.trim() || !stack.trim()}>
              Add
            </button>
            <button type="button" class="link" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div class="palette-actions">
          <button class="btn wide" title="A new stack any role can name — a monospace face, a serif, whatever the template is set in." onClick={() => setAdding(true)}>
            + Add a font
          </button>
        </div>
      )}
    </div>
  );
}

// --- colour ----------------------------------------------------------------------------------------

/**
 * One palette entry: a well, a name you can rewrite, a hex you can type, and a way to remove it.
 *
 * The name is editable because a palette a brand actually uses is not `red`, `cream`, `offwhite` —
 * it is whatever that brand calls them. Renaming carries every reference with it, which is the
 * whole operation: `colorOf` returns nothing for a name that no longer exists, so a preset left
 * pointing at the old one would quietly lose its background rather than fail.
 */
/**
 * One palette entry: a well, a name you can rewrite, a hex you can type, and a way to remove it.
 *
 * **Removing is a replace.** The first version refused while anything still named the colour, and
 * showed a count so you could see why — which Jared hit immediately, from both ends: in a real
 * palette everything is used, so nothing could ever be deleted, and a bare number beside a hex
 * meant nothing without hovering it. Both are the same mistake. Deleting a token things reference
 * *is* a replace operation, and the interface should ask the question rather than refuse and
 * explain.
 */
function Swatch({ editor, ds, name, help }: { editor: Editor; ds: DesignSystem; name: string; help?: string }) {
  const [label, setLabel] = useState(nameOf(name));
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const value = ds.colors[name] ?? '#000000';
  const uses = colorUsage(ds, name, editor.template);
  const others = Object.keys(ds.colors).filter((k) => k !== name);

  /**
   * Committed from the element's own value, not from state.
   *
   * The same stale-closure hazard as the scrub: a handler closes over the `label` from its own
   * render, and a blur arriving before the re-render that the keystroke scheduled would commit the
   * previous value — or, as here, no change at all.
   */
  const commit = (typed: string) => {
    setEditing(false);
    const next = typed.trim();
    if (next && next !== nameOf(name)) editor.commit('Rename colour', renameColor(editor.template, name, next));
    else setLabel(nameOf(name));
  };

  const drop = (replacement?: string) => {
    setRemoving(false);
    editor.commit('Remove colour', removeColor(editor.template, name, replacement));
  };

  if (removing) {
    return (
      <div class="swatch-remove">
        <p>
          <b>{nameOf(name)}</b> is used by {uses.join(', ')}. Point {uses.length === 1 ? 'it' : 'them'} at:
        </p>
        <div class="swatch-remove-row">
          <select
            aria-label={`Replace ${nameOf(name)} with`}
            onChange={(e) => drop((e.target as HTMLSelectElement).value)}
          >
            <option value="">Choose a colour…</option>
            {others.map((key) => (
              <option key={key} value={key}>
                {nameOf(key)}
              </option>
            ))}
          </select>
          <button class="link" onClick={() => setRemoving(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="swatch-row" title={help}>
      <input
        type="color"
        value={value}
        aria-label={nameOf(name)}
        onInput={(e) => editor.set(`ds.colors.${name}`, (e.target as HTMLInputElement).value)}
      />
      {editing ? (
        <input
          class="swatch-name-edit"
          type="text"
          value={label}
          autofocus
          aria-label={`Rename ${nameOf(name)}`}
          onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
          onBlur={(e) => commit((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setLabel(nameOf(name));
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          class="swatch-name"
          title="Rename. Every preset, type role, button and stripe pointing at this colour comes with it."
          onClick={() => {
            setLabel(nameOf(name));
            setEditing(true);
          }}
        >
          {nameOf(name)}
        </button>
      )}
      <input
        class="swatch-hex"
        type="text"
        spellcheck={false}
        value={value}
        aria-label={`${nameOf(name)} hex`}
        onInput={(e) => {
          const raw = (e.target as HTMLInputElement).value.trim();
          const hex = raw.startsWith('#') ? raw : `#${raw}`;
          // Only a complete hex is committed. Half-typed ones would repaint the canvas on every
          // keystroke with colours nobody asked for.
          if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) editor.set(`ds.colors.${name}`, hex.toLowerCase());
        }}
      />
      <button
        class="swatch-drop"
        disabled={others.length === 0}
        aria-label={`Remove ${nameOf(name)}`}
        title={
          uses.length === 0
            ? 'Remove. Nothing is using it.'
            : `Remove. ${uses.join(', ')} use it, so you will be asked what to point ${uses.length === 1 ? 'it' : 'them'} at.`
        }
        onClick={() => (uses.length === 0 ? drop() : setRemoving(true))}
      >
        ✕
      </button>
    </div>
  );
}

function ColourPanel({ editor, ds }: { editor: Editor; ds: DesignSystem }) {
  const keys = Object.keys(ds.colors);
  const brand = Object.keys(DEFAULT_DESIGN_SYSTEM.colors);
  const changed =
    keys.length !== brand.length || brand.some((k) => ds.colors[k] !== DEFAULT_DESIGN_SYSTEM.colors[k]);

  return (
    <Panel
      name="Colour"
      help={`The ${keys.length} colours the whole system is built from. Presets, type roles and buttons name them rather than repeating them.`}
    >
      {keys.map((key) => (
        <Swatch key={key} editor={editor} ds={ds} name={key} {...(COLOR_NOTES[key] ? { help: COLOR_NOTES[key]! } : {})} />
      ))}

      <div class="palette-actions">
        <button
          class="btn wide"
          title="A new colour, ready to be named and pointed at from a preset, a type role or a button."
          onClick={() => editor.commit('Add colour', addColor(editor.template, 'New', '#888888'))}
        >
          + Add a colour
        </button>
        {changed && (
          <button
            class="link"
            title="Navy, red, cream, off-white and white, at the values Switchyards ships. The type scale and everything else stays where it is."
            onClick={() => editor.commit('Reset palette', resetPalette(editor.template))}
          >
            Back to the brand palette
          </button>
        )}
      </div>
    </Panel>
  );
}

/**
 * The buttons.
 *
 * Every value here was a literal in v1's compiler and stayed one while v1's output was the gate —
 * moving any of them broke the byte diff. The two variants having different padding and different
 * sizes is itself a v1 artefact (the white one was drawn for a footer), and this panel is where
 * that gets fixed rather than worked around.
 */
function ButtonPanel({ editor, ds, phone }: { editor: Editor; ds: DesignSystem; phone: boolean }) {
  const names = Object.keys(ds.buttons);
  const [picked, setPicked] = useState<string>(names[0] ?? 'red');
  const style = ds.buttons[picked] ? picked : (names[0] ?? 'red');
  const t = ds.buttons[style] ?? DEFAULT_DESIGN_SYSTEM.buttons['red']!;
  const at = (key: string) => `ds.buttons.${style}.${key}`;

  return (
    <Panel
      name="Buttons"
      help="The two variants a block can pick. Red sits on light backgrounds, white on the navy band."
    >
      <div class="seg" role="group" aria-label="Button variant">
        {names.map((name) => (
          <button
            key={name}
            class={`seg-btn ${style === name ? 'on' : ''}`}
            aria-pressed={style === name}
            onClick={() => setPicked(name)}
          >
            {nameOf(name)}
          </button>
        ))}
      </div>

      {/* The real thing, at the real numbers, on the background it is drawn for. */}
      <div
        class="btn-specimen"
        style={{ background: colorOf(ds, style === 'white' ? 'navy' : 'cream') ?? '#fff' }}
      >
        <span
          style={{
            background: colorOf(ds, t.fill) ?? undefined,
            color: colorOf(ds, t.ink) ?? undefined,
            border: `${t.borderWidth}px solid ${colorOf(ds, t.border) ?? '#000'}`,
            borderRadius: `${t.radius}px`,
            padding: `${t.padY}px ${t.padX}px`,
            fontSize: `${t.size}px`,
            fontFamily: ds.fontStack,
          }}
        >
          Read more
        </span>
      </div>

      <div class="dials">
        <Dial
          label="Text size"
          value={phone ? t.mobileSize : t.size}
          onChange={(v) => editor.set(at(phone ? 'mobileSize' : 'size'), v)}
          min={phone ? 0 : 9}
          max={28}
          suffix="px"
          {...(phone ? { zero: 'Same' } : {})}
          title={
            phone
              ? 'Below the breakpoint. A long label wraps inside a narrow column, and a wrapped button reads as broken rather than small (learnings 2.10). Zero keeps the desktop size.'
              : 'Every button of this variant, above the breakpoint.'
          }
        />
        <Dial label="Corner" value={t.radius} onChange={(v) => editor.set(at('radius'), v)} min={0} max={30} suffix="px" title="Zero is a square button. 25 and above is a pill at these heights." />
        <Dial label="Padding ↕" value={t.padY} onChange={(v) => editor.set(at('padY'), v)} min={0} max={32} suffix="px" title="Also written into mso-padding-alt, which is the only padding Outlook reads." />
        <Dial label="Padding ↔" value={t.padX} onChange={(v) => editor.set(at('padX'), v)} min={0} max={48} suffix="px" />
        <Dial label="Border" value={t.borderWidth} onChange={(v) => editor.set(at('borderWidth'), v)} min={0} max={6} suffix="px" title="Zero for a solid button with no outline." />
      </div>

      <PresetSlot ds={ds} label="Fill" value={t.fill} onChange={(v) => editor.set(at('fill'), v)} help="The pill itself." />
      <PresetSlot ds={ds} label="Text" value={t.ink} onChange={(v) => editor.set(at('ink'), v)} help="The label." />
      <PresetSlot ds={ds} label="Border" value={t.border} onChange={(v) => editor.set(at('border'), v)} help="The outline, when it has one." />
    </Panel>
  );
}

/**
 * Lists, quotes and rules — the parts of an email nobody designs until somebody pastes one in.
 *
 * They were hard-coded numbers in the stylesheet, so a designer could set the whole type scale and
 * still have no say over what a bulleted list looked like. `templates/baseline.template.json` has
 * one of each, which is what makes these dials judgeable rather than guesswork.
 */
function RichTextPanel({ editor, ds }: { editor: Editor; ds: DesignSystem }) {
  const rt = ds.richText;
  const at = (key: string) => `ds.richText.${key}`;

  return (
    <Panel
      name="Lists & quotes"
      help="What the team's own formatting looks like: bulleted and numbered lists, block quotes, and the horizontal rule."
    >
      <div class="dials">
        <Dial
          label="List indent"
          value={rt.listIndent}
          onChange={(v) => editor.set(at('listIndent'), v)}
          min={0}
          max={60}
          suffix="px"
          title="How far a list sits in from the text beside it. A margin rather than padding — Outlook ignores padding on a list."
        />
        <Dial
          label="Between items"
          value={rt.listGap}
          onChange={(v) => editor.set(at('listGap'), v)}
          min={0}
          max={24}
          suffix="px"
          title="Space under each item. Zero makes a tight list; anything over about 8 reads as separate paragraphs."
        />
        <Dial
          label="Item line height"
          value={rt.listLineHeight}
          onChange={(v) => editor.set(at('listLineHeight'), v)}
          min={100}
          max={200}
          step={5}
          suffix="%"
          title="Usually tighter than reading text, because a list item is rarely more than two lines."
        />
        <Dial
          label="Quote bar"
          value={rt.quoteBar}
          onChange={(v) => editor.set(at('quoteBar'), v)}
          min={0}
          max={10}
          suffix="px"
          zero="None"
          title="The rule down the side of a block quote. Zero removes it and leaves the inset."
        />
        <Dial
          label="Quote inset"
          value={rt.quoteInset}
          onChange={(v) => editor.set(at('quoteInset'), v)}
          min={0}
          max={48}
          suffix="px"
          title="Space between that bar and the words."
        />
        <Dial
          label="Rule"
          value={rt.ruleWidth}
          onChange={(v) => editor.set(at('ruleWidth'), v)}
          min={1}
          max={10}
          suffix="px"
          title="The horizontal rule the team can drop between paragraphs."
        />
      </div>

      <PresetSlot ds={ds} label="Quote bar" value={rt.quoteColor} onChange={(v) => editor.set(at('quoteColor'), v)} help="The colour of the bar beside a quote." />
      <PresetSlot ds={ds} label="Rule" value={rt.ruleColor} onChange={(v) => editor.set(at('ruleColor'), v)} help="The colour of a horizontal rule." />

      <label class="field toggle" title="Quotes lean by default, which is the convention. Off suits a quote used as a callout rather than as speech.">
        <input
          type="checkbox"
          checked={rt.quoteItalic}
          onChange={(e) => editor.set(at('quoteItalic'), (e.target as HTMLInputElement).checked)}
        />
        <span>Quotes are italic</span>
      </label>
    </Panel>
  );
}

/**
 * The frame around every image, and what a new one starts at.
 *
 * The width of any *particular* image stays on the block — every image is a different shape, so
 * there is no role a width could belong to (types.ts). What is template-wide is the treatment.
 */
function ImagePanel({ editor, ds }: { editor: Editor; ds: DesignSystem }) {
  const img = ds.image;
  const at = (key: string) => `ds.image.${key}`;

  return (
    <Panel name="Images" help="The frame around every image, and the width a newly dropped one starts at.">
      <div class="dials">
        <Dial
          label="Corner"
          value={img.radius}
          onChange={(v) => editor.set(at('radius'), v)}
          min={0}
          max={40}
          suffix="px"
          zero="Square"
          title="Rounded corners. Every client honours this except Outlook, which squares them off — so it should look deliberate rather than load-bearing."
        />
        <Dial
          label="Border"
          value={img.borderWidth}
          onChange={(v) => editor.set(at('borderWidth'), v)}
          min={0}
          max={8}
          suffix="px"
          zero="None"
          title="A frame around every image. Outlook honours this one."
        />
        <Dial
          label="New image width"
          value={img.defaultWidth}
          onChange={(v) => editor.set(at('defaultWidth'), v)}
          min={40}
          max={ds.containerWidth}
          step={10}
          suffix="px"
          title="What a freshly dropped Image block starts at. Upload at twice this for retina; the width is never taken from the file (learnings 2.9)."
        />
      </div>

      <PresetSlot ds={ds} label="Border" value={img.borderColor} onChange={(v) => editor.set(at('borderColor'), v)} help="Only visible once the border has a width." />
    </Panel>
  );
}

function PresetPanel({ editor, ds }: { editor: Editor; ds: DesignSystem }) {
  const names = Object.keys(ds.themes);

  return (
    <Panel
      name="Background presets"
      help="A handful of colours with a name. A preset moves a section's band, container, text and link together, and names colours from the palette above rather than repeating them."
    >
      {names.map((name) => (
        <Preset key={name} editor={editor} ds={ds} name={name} only={names.length === 1} />
      ))}
      <div class="palette-actions">
        <button
          class="btn wide"
          title="A copy of the first preset, ready to be named and recoloured."
          onClick={() => editor.commit('Add preset', addPreset(editor.template, 'New', names[0]))}
        >
          + Add a preset
        </button>
      </div>
    </Panel>
  );
}

/**
 * One preset: a name you can rewrite, four slots, and a way to remove it.
 *
 * Removing is a replace, the same as a colour and for the same reason — a section whose `theme`
 * names nothing keeps the four colours it last resolved, so it does not break. It silently stops
 * following the system, which is worse than breaking because nothing says so.
 */
function Preset({ editor, ds, name, only }: { editor: Editor; ds: DesignSystem; name: string; only: boolean }) {
  const [label, setLabel] = useState(nameOf(name));
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const t = ds.themes[name];
  const used = presetUsage(editor.template, name);
  const others = Object.keys(ds.themes).filter((k) => k !== name);
  if (!t) return null;

  const commit = (typed: string) => {
    setEditing(false);
    const next = typed.trim();
    if (next && next !== nameOf(name)) editor.commit('Rename preset', renamePreset(editor.template, name, next));
    else setLabel(nameOf(name));
  };

  const drop = (replacement?: string) => {
    setRemoving(false);
    editor.commit('Remove preset', removePreset(editor.template, name, replacement));
  };

  return (
    <div class="preset">
      <div class="preset-head">
        {editing ? (
          <input
            class="swatch-name-edit"
            type="text"
            value={label}
            autofocus
            aria-label={`Rename ${nameOf(name)}`}
            onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
            onBlur={(e) => commit((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setLabel(nameOf(name));
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            class="swatch-name preset-title"
            title="Rename. Every section following this preset comes with it."
            onClick={() => {
              setLabel(nameOf(name));
              setEditing(true);
            }}
          >
            {nameOf(name)}
          </button>
        )}
        <span class="muted">{used === 0 ? 'not used here' : used === 1 ? '1 section' : `${used} sections`}</span>
        <button
          class="swatch-drop"
          disabled={only}
          aria-label={`Remove ${nameOf(name)}`}
          title={
            only
              ? 'The last preset stays. A template with none has no way to describe a background at all.'
              : used === 0
                ? 'Remove. No section is using it.'
                : `Remove. ${used} section${used === 1 ? '' : 's'} follow it, so you will be asked what to move ${used === 1 ? 'it' : 'them'} to.`
          }
          onClick={() => (used === 0 ? drop() : setRemoving(true))}
        >
          ✕
        </button>
      </div>

      {removing ? (
        <div class="swatch-remove">
          <p>
            <b>{nameOf(name)}</b> is used by {used} section{used === 1 ? '' : 's'}. Move {used === 1 ? 'it' : 'them'} to:
          </p>
          <div class="swatch-remove-row">
            <select aria-label={`Replace ${nameOf(name)} with`} onChange={(e) => drop((e.target as HTMLSelectElement).value)}>
              <option value="">Choose a preset…</option>
              {others.map((key) => (
                <option key={key} value={key}>
                  {nameOf(key)}
                </option>
              ))}
            </select>
            <button class="link" onClick={() => setRemoving(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <PresetSlot
            ds={ds}
            label="Band"
            value={t.band}
            onChange={(v) => editor.set(`ds.themes.${name}.band`, v)}
            help="The full-width strip behind the column. None lets the page background through, which is not the same as painting it white."
            allowNone
          />
          <PresetSlot
            ds={ds}
            label="Container"
            value={t.container}
            onChange={(v) => editor.set(`ds.themes.${name}.container`, v)}
            help="The column itself. None is transparent."
            allowNone
          />
          <PresetSlot ds={ds} label="Text" value={t.text} onChange={(v) => editor.set(`ds.themes.${name}.text`, v)} help="Body copy and headings in this section." />
          <PresetSlot ds={ds} label="Link" value={t.link} onChange={(v) => editor.set(`ds.themes.${name}.link`, v)} help="Links inside rich text." />
          <div class="preset-slot" title="Which button variant a block in this section reaches for by default.">
            <span class="swatch" aria-hidden="true" style={{ background: colorOf(ds, ds.buttons[t.button]?.fill ?? null) ?? undefined }} />
            <span class="preset-label">Button</span>
            <select
              value={t.button}
              aria-label="Button variant"
              onChange={(e) => editor.set(`ds.themes.${name}.button`, (e.target as HTMLSelectElement).value)}
            >
              {Object.keys(ds.buttons).map((key) => (
                <option key={key} value={key}>
                  {nameOf(key)}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  );
}


// --- the page ---------------------------------------------------------------------------------------

/**
 * Everything about the sheet the email is printed on: how wide it is, what frames it, what sits
 * outside it, and where the phone rules take over.
 *
 * First in the panel because it is the decision the rest are made against — a 38px H1 is a
 * different choice in a 600px email and a 320px one, and setting the type first means setting it
 * twice. It is also the one panel whose four values only make sense read together, which is why
 * they are four dials in one place rather than spread between here and the inspector.
 */
function PagePanel({ editor, ds }: { editor: Editor; ds: DesignSystem }) {
  return (
    <Panel
      name="Page / layout"
      help="The sheet the email sits on: its width, the gutter inside it, the frame around it, the space outside it, and where the phone rules take over. Columns inside a row are set on the row."
    >
      <div class="dials">
        <Dial
          label="Email width"
          value={ds.containerWidth}
          onChange={(v) => editor.set('ds.containerWidth', v)}
          min={260}
          max={760}
          step={10}
          suffix="px"
          title="The whole email body. 600px is the number every client agrees about, but narrow is a real design — a 300px receipt is a template, not a mistake."
        />
        <Dial
          label="Page padding"
          value={ds.pagePadding}
          onChange={(v) => editor.set('ds.pagePadding', v)}
          min={0}
          max={80}
          suffix="px"
          title="The gutter between the email's edge and its content, both sides. With the width above it is what sets the measure — the line length the copy actually gets."
        />
        <Dial
          label="Between blocks"
          value={ds.blockGap}
          onChange={(v) => editor.set('ds.blockGap', v)}
          min={0}
          max={60}
          suffix="px"
          zero="None"
          title="The space between blocks that share a column — a heading over its copy over its button, inside one card. A column can be given its own in the block's Spacing panel; a Spacer block replaces it on both sides."
        />
        <Dial
          label="Margin"
          value={ds.pageMargin}
          onChange={(v) => editor.set('ds.pageMargin', v)}
          min={0}
          max={60}
          suffix="px"
          zero="None"
          title="Space outside the email, on all four sides, with the page background showing through it. It gives up full bleed on phones — which is the point of a card or a receipt, and the reason it is off unless you ask."
        />
        <Dial
          label="Border"
          value={ds.pageBorderWidth}
          onChange={(v) => editor.set('ds.pageBorderWidth', v)}
          min={0}
          max={12}
          suffix="px"
          zero="None"
          title="A frame around the whole email — outside the top bar and the footer, because it is the email's edge and not a section's. It is drawn outside the width above, the way an image's border is, so the email is this much wider on each side."
        />
        <Dial
          label="Phone below"
          value={ds.mobileBreakpoint}
          onChange={(v) => editor.set('ds.mobileBreakpoint', v)}
          min={400}
          max={800}
          step={1}
          suffix="px"
          title="Where the phone rules take over. Both sides of the query move together."
        />
      </div>
      <PresetSlot
        ds={ds}
        label="Border"
        value={ds.pageBorderColor}
        onChange={(v) => editor.set('ds.pageBorderColor', v)}
        help="Only visible once the border has a width. Named from the palette, so recolouring the brand moves the frame with it."
      />

      {/* The two that used to be the right pane's "Page" panel.
          They belong here by the same rule that moved this whole panel to the left: they are true
          of the whole template rather than of a selection, and the right pane is the selection. It
          was also the last place in the app asking a page-wide question from a contextual pane —
          you had to deselect to answer it.
          These write `template.*` rather than `ds.*`, which is the one seam in this panel: the
          background is a per-template override of the system's own, so five templates on one
          design system can still sit on different paper. */}
      <div class="controls">
        <div class="field" title="What shows around the email body, and in the inset a phone mail app draws around every message — which no email can remove.">
          <label>Background</label>
          <select
            value={editor.template.pageBackground}
            onChange={(e) => editor.set('template.pageBackground', (e.target as HTMLSelectElement).value)}
          >
            {/* From the palette, never a list written here. Four hard-coded hexes is how the last
                four of these bugs looked: rename a colour and the picker keeps the old literal
                while everything that referenced it properly moves (learnings 3.34). */}
            <option value="">From the system — {hexName(ds, ds.pageBackground)}</option>
            {Object.entries(ds.colors).map(([key, hex]) => (
              <option key={key} value={hex}>
                {nameOf(key)}
              </option>
            ))}
          </select>
        </div>
        <label
          class="field toggle"
          title="Emits the three layers that keep the email on its own colours in dark mode. Gmail's apps ignore all of them."
        >
          <input
            type="checkbox"
            checked={editor.template.forceLight}
            onChange={(e) => editor.set('template.forceLight', (e.target as HTMLInputElement).checked)}
          />
          <span>Force light</span>
        </label>
      </div>

      {ds.containerWidth > DEFAULT_DESIGN_SYSTEM.containerWidth && (
        <p class="hint warn-hint" title="Outlook renders the body at a fixed width from a conditional table, so this moves there too — but past 600px some clients clip rather than scroll.">
          Wider than 600px is clipped by some clients rather than scrolled.
        </p>
      )}
    </Panel>
  );
}

// --- canvas type -----------------------------------------------------------------------------------

const AMOUNT_LABEL: Record<CanvasEffect, string> = { none: 'Amount', outline: 'Outline', shadow: 'Shadow', highlight: 'Highlight', sticker: 'Border', wobble: 'Wobble', arc: 'Bend' };

/**
 * Canvas type: playful text styles for the freeform canvas.
 *
 * Its own category because it follows none of the email's rules. It only ever ships as part of a
 * picture, so it can outline, shadow, highlight, sticker, wobble and bend (learnings 3.68). Each
 * chip is drawn by the canvas's own renderer, so the sample is exactly the picture.
 */
function CanvasTypePanel({ editor, ds }: { editor: Editor; ds: DesignSystem }) {
  const styles = canvasTypeOf(ds);
  const keys = Object.keys(styles);
  const [chosen, setChosen] = useState(keys[0] ?? '');
  const key = styles[chosen] ? chosen : (keys[0] ?? '');
  const style = styles[key];
  if (!style) return null;
  const set = (change: Partial<CanvasTextStyle>) => editor.set('ds.canvasType', { ...styles, [key]: { ...style, ...change } });
  const fonts = Object.keys(ds.fonts);

  return (
    <Panel
      name="Canvas type"
      help="Playful type for the freeform canvas. It ships inside a picture, so it can outline, shadow, highlight, sticker, wobble and bend. Pick a style on the canvas with the Text tool."
    >
      <div class="canvas-type-chips">
        {keys.map((k) => (
          <button key={k} class={`canvas-type-chip ${k === key ? 'on' : ''}`} aria-pressed={k === key} title={`${styles[k]!.label}. Click to tune it.`} onClick={() => setChosen(k)}>
            <span class="canvas-type-sample" dangerouslySetInnerHTML={{ __html: canvasTypeSampleSvg(ds, k, 'Play!') }} />
            <span class="canvas-type-name">{styles[k]!.label}</span>
          </button>
        ))}
      </div>
      <div class="controls">
        <div class="field" title="What the style does beyond the letters.">
          <label>Effect</label>
          <select value={style.effect} onChange={(e) => set({ effect: (e.target as HTMLSelectElement).value as CanvasEffect })}>
            {CANVAS_EFFECTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label>Font</label>
          <select
            value={style.font ?? ''}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              set({ font: v || undefined });
            }}
          >
            <option value="">The email’s font</option>
            {fonts.map((f) => (
              <option key={f} value={f}>
                {f[0]!.toUpperCase() + f.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label>Weight</label>
          <select value={style.weight} onChange={(e) => set({ weight: (e.target as HTMLSelectElement).value as 'normal' | 'bold' })}>
            <option value="normal">Regular</option>
            <option value="bold">Bold</option>
          </select>
        </div>
        <label class="field toggle">
          <input type="checkbox" checked={Boolean(style.uppercase)} onChange={(e) => set({ uppercase: (e.target as HTMLInputElement).checked })} />
          <span>Uppercase</span>
        </label>
        <label class="field toggle">
          <input type="checkbox" checked={Boolean(style.italic)} onChange={(e) => set({ italic: (e.target as HTMLInputElement).checked })} />
          <span>Italic</span>
        </label>
      </div>
      <div class="dials">
        <Dial label="Size" value={style.size} onChange={(v) => set({ size: v })} min={8} max={140} suffix="px" />
        <Dial label="Line height" value={style.lineHeight} onChange={(v) => set({ lineHeight: v })} min={70} max={200} suffix="%" />
        <Dial label="Tracking" value={style.letterSpacing ?? 0} onChange={(v) => set({ letterSpacing: v })} min={-4} max={20} step={0.5} suffix="px" zero="Normal" />
        {style.effect !== 'none' && <Dial label={AMOUNT_LABEL[style.effect]} value={style.amount} onChange={(v) => set({ amount: v })} min={0} max={100} suffix="%" />}
      </div>
      <PresetSlot ds={ds} label="Colour" value={style.color} onChange={(v: CanvasTextStyle['color']) => set({ color: v })} help="The letters. Left alone they take the ink." allowNone noneLabel="Ink" />
      {(style.effect === 'outline' || style.effect === 'shadow' || style.effect === 'highlight' || style.effect === 'sticker') && (
        <PresetSlot ds={ds} label="Effect colour" value={style.effectColor} onChange={(v: CanvasTextStyle['color']) => set({ effectColor: v })} help="The outline, the shadow, the highlight or the sticker's border." allowNone noneLabel="Auto" />
      )}
    </Panel>
  );
}

