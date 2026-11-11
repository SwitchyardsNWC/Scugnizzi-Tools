// The footer's look, as one set of fields in two places: Design › Footer, where it is set for every footer on the
// system, and a footer's own inspector, where each field follows the system until it is given a value of its own
// (model/footer-style.ts). One component, so the two lists cannot drift apart.
//
// In the inspector a number follows with the chain the gutters already use, a switch becomes Design / On / Off,
// and a colour left empty follows the system. `undefined` is "follow" there; `null` is a value only in the system,
// where it means "the text colour" or "Type › H3".

import { colorOf, typeOf, type ColorRef, type DesignSystem } from '../model/design-system.ts';
import { DENSITY, FOOTER_RANGES, systemFooterStyle, type FooterDensity, type FooterStyle } from '../model/footer-style.ts';
import { PresetSlot } from './ColorSlot.tsx';
import { Dial } from './Dial.tsx';
import { InheritDial } from './InheritDial.tsx';

type Key = keyof FooterStyle;

export interface FooterStyleFieldsProps {
  ds: DesignSystem;
  /** `system` edits Design › Footer; `footer` edits one footer's departures from it. */
  mode: 'system' | 'footer';
  /** The footer's own values, in `footer` mode. */
  own?: Partial<FooterStyle>;
  onSet(key: Key, value: unknown): void;
}

const HELP = {
  nameSize: 'The company name. Follows Type › H3 until it has a size of its own.',
  smallSize: 'The address, the note, the legal links and the social names. The line height follows it, 13 to 17.',
  markSize: 'The colophon mark. Follows the small type until it has a size of its own.',
  markCaps: 'Sets the mark in capitals without changing what was typed.',
  markTracking: 'Letter spacing on the mark. Capitals want about 1px; lower case wants none.',
  hairlines: 'The thin lines between the footer’s parts. The red rules above and below are stripes, and stay.',
  hairlineWidth: 'How heavy the hairlines are.',
  hairlineColor: 'Empty follows the footer’s text colour, so the same footer reads on navy and on cream.',
  density: 'The space between the parts: around the seals, the name, the notice and the colophon. The band’s own padding is in Spacing.',
  linkUnderline: 'Underlines Unsubscribe, Manage Preferences and the social names, so a link reads as a link without its colour. On the navy band links and text are the same cream.',
  linkColor: 'Empty follows the preset’s link colour.',
  iconSize: 'The social icons’ height. Each keeps its own proportions.',
} as const;

export function FooterStyleFields({ ds, mode, own = {}, onSet }: FooterStyleFieldsProps) {
  const sys = systemFooterStyle(ds);
  const h3 = typeOf(ds, 'h3').size;
  const footer = mode === 'footer';
  /** The value a field shows: the footer's own in the inspector, the system's in Design. */
  const ownNum = (key: Key): number | null => (typeof own[key] === 'number' ? (own[key] as number) : null);

  /** A number. In the inspector it follows the system's value until dragged. */
  const number = (key: 'smallSize' | 'markTracking' | 'hairlineWidth' | 'iconSize', label: string, step = 1) => {
    const range = FOOTER_RANGES[key];
    if (!footer) {
      return <Dial key={key} label={label} value={sys[key]} onChange={(v) => onSet(key, v)} min={range.min} max={range.max} step={step} suffix="px" title={HELP[key]} />;
    }
    return (
      <InheritDial
        key={key}
        label={label}
        value={ownNum(key)}
        inherited={sys[key]}
        inheritedName="Design › Footer"
        onChange={(v) => onSet(key, v ?? undefined)}
        min={range.min}
        max={range.max}
        step={step}
        suffix="px"
        title={HELP[key]}
      />
    );
  };

  /** A size that follows another size (the name follows H3, the mark follows the small type) until given one. */
  const following = (key: 'nameSize' | 'markSize', label: string, base: number, baseName: string) => {
    const range = FOOTER_RANGES[key];
    const systemValue = sys[key];
    return footer ? (
      <InheritDial
        key={key}
        label={label}
        value={ownNum(key)}
        inherited={systemValue ?? base}
        inheritedName="Design › Footer"
        onChange={(v) => onSet(key, v ?? undefined)}
        min={range.min}
        max={range.max}
        suffix="px"
        title={HELP[key]}
      />
    ) : (
      <InheritDial key={key} label={label} value={systemValue} inherited={base} inheritedName={baseName} onChange={(v) => onSet(key, v)} min={range.min} max={range.max} suffix="px" title={HELP[key]} />
    );
  };

  /** A switch. In the inspector, three ways: follow the system, on, off. */
  const toggle = (key: 'markCaps' | 'hairlines' | 'linkUnderline', label: string) => {
    if (!footer) {
      return (
        <label key={key} class="field toggle" title={HELP[key]}>
          <input type="checkbox" checked={sys[key]} onChange={(e) => onSet(key, (e.target as HTMLInputElement).checked)} />
          <span>{label}</span>
        </label>
      );
    }
    const value = typeof own[key] === 'boolean' ? (own[key] ? 'on' : 'off') : '';
    return (
      <div key={key} class="field wide" title={HELP[key]}>
        <label>{label}</label>
        <select value={value} onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value;
          onSet(key, v === '' ? undefined : v === 'on');
        }}>
          <option value="">Design ({sys[key] ? 'on' : 'off'})</option>
          <option value="on">On</option>
          <option value="off">Off</option>
        </select>
      </div>
    );
  };

  /** A palette colour. Empty follows the text or link colour in Design, and Design in the inspector. */
  const colour = (key: 'hairlineColor' | 'linkColor', label: string, empty: string) => {
    const value: ColorRef = footer ? ((own[key] as ColorRef | undefined) ?? null) : sys[key];
    const inherited = sys[key] ? (colorOf(ds, sys[key]) ? sys[key]! : empty) : empty;
    return (
      <div key={key} class="field wide">
        <PresetSlot
          ds={ds}
          label={label}
          value={value}
          onChange={(v: ColorRef) => onSet(key, footer ? (v ?? undefined) : v)}
          help={HELP[key]}
          allowNone
          noneLabel={footer ? `Design (${inherited})` : empty}
        />
      </div>
    );
  };

  const densityNow: FooterDensity | '' = footer ? ((own.density as FooterDensity | undefined) ?? '') : sys.density;
  const densityOptions: Array<[FooterDensity | '', string]> = [
    ...(footer ? ([['', `Design (${DENSITY[sys.density].name})`]] as Array<['', string]>) : []),
    ...(Object.entries(DENSITY) as Array<[FooterDensity, { name: string }]>).map(([id, d]) => [id, d.name] as [FooterDensity, string]),
  ];

  return (
    <div class="footer-style">
      <p class="footer-style-head">Type</p>
      {following('nameSize', 'Name', h3, 'Type › H3')}
      {number('smallSize', 'Small type')}
      {following('markSize', 'Mark', footer ? (ownNum('smallSize') ?? sys.smallSize) : sys.smallSize, 'Small type')}
      {toggle('markCaps', 'Mark in capitals')}
      {number('markTracking', 'Mark tracking', 0.5)}

      <p class="footer-style-head">Rules and spacing</p>
      {toggle('hairlines', 'Hairlines')}
      {number('hairlineWidth', 'Hairline weight')}
      {colour('hairlineColor', 'Hairline', 'Text colour')}
      <div class="field wide" title={HELP.density}>
        <label>Density</label>
        <div class="seg" role="radiogroup" aria-label="Density">
          {densityOptions.map(([id, name]) => (
            <button
              key={id || 'design'}
              class={`seg-btn ${densityNow === id ? 'on' : ''}`}
              role="radio"
              aria-checked={densityNow === id}
              onClick={() => onSet('density', id === '' ? undefined : id)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <p class="footer-style-head">Links</p>
      {toggle('linkUnderline', 'Underline links')}
      {colour('linkColor', 'Link', 'Preset link colour')}
      {number('iconSize', 'Icon size')}
    </div>
  );
}
