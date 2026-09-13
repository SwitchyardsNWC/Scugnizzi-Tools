import { colorOf, type ColorRef, type DesignSystem } from '../model/design-system.ts';

// The colour control, and the naming that goes with it.
//
// Shared because two panels need the same one: the design system's own slots — a button's fill, an
// image's frame, the page's border — and a block's box in the inspector. One copy, because two
// copies of a picker are two lists that drift apart, which is the shape of most of the bugs in
// this app's history (learnings 3.34).

/** Prettier than the key, for the keys this project ships. Anything else is title-cased. */
export const NICE: Record<string, string> = {
  offwhite: 'Off-white',
  topbar: 'Top bar',
  body: 'Body',
  h1: 'H1',
  h2: 'H2',
  h3: 'H3',
  h4: 'H4',
  h5: 'H5',
  h6: 'H6',
};

// `nameOf`, not `label` — `PresetSlot` takes a prop by that name and shadowing it here is the
// kind of bug that compiles in a language without types.
export const nameOf = (key: string): string => NICE[key] ?? key[0]!.toUpperCase() + key.slice(1);


/**
 * One slot of a preset, as a role rather than a colour.
 *
 * Picking from the palette is the whole point — a preset that stored `#d10000` would duplicate the
 * palette and drift from it. A literal that got in some other way is still shown, and labelled as a
 * literal, so an override is visible rather than silently outside the system.
 */
export function PresetSlot({
  ds,
  label,
  value,
  onChange,
  help,
  allowNone,
  noneLabel,
}: {
  ds: DesignSystem;
  label: string;
  value: ColorRef;
  onChange(v: ColorRef): void;
  help: string;
  allowNone?: boolean;
  /** What "unset" means here. "None" is right for a fill; a box that falls back to the body
   *  colour should say that instead, or the picker reads as off while a line is on screen. */
  noneLabel?: string;
}) {
  const literal = typeof value === 'string' && value.startsWith('#');
  const resolved = colorOf(ds, value);

  return (
    <div class="preset-slot" title={help}>
      <span
        class={`swatch ${resolved ? '' : 'none'}`}
        style={resolved ? { background: resolved } : undefined}
        aria-hidden="true"
      />
      <span class="preset-label">{label}</span>
      <select
        value={value ?? ''}
        aria-label={`${label} colour`}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value || null)}
      >
        {allowNone && <option value="">{noneLabel ?? 'None'}</option>}
        {Object.keys(ds.colors).map((key) => (
          <option key={key} value={key}>
            {nameOf(key)}
          </option>
        ))}
        {literal && <option value={value!}>Literal {value}</option>}
      </select>
    </div>
  );
}

