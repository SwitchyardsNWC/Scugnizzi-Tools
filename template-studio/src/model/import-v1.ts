// Importing a v1 `.design.json`.
//
// v1's document is a flat list of blocks, each carrying its own background and padding. v2's tree
// is Section -> Row -> Column -> Block with the background on the section and the padding on the
// column. The mapping is one v1 block to one section holding a single full-width column, which is
// exactly what v1's own `section(cell(...))` produced — so nothing is invented and nothing is lost.
//
// **What is deliberately dropped:** the per-block size, line height and colour v1 stored. Those are
// design-system roles now (types.ts, the note above the block interfaces), so an imported design
// arrives set in the template's type scale rather than carrying sixteen unnamed numbers forward.
// Field names, labels, locks, content and layout all survive — those are the handoff.
//
// Field names are allocated here, once, in document order, and stored. From this point on nothing
// re-derives them from a label (learnings 1.10, see ids.ts). v1 allocated a name only when a block
// was editable, and this does the same, so an imported design keeps the field names its existing
// HubSpot emails are already bound to.

import { fieldName, sequentialIds } from './ids.ts';
import { bandedPreset, DEFAULT_DESIGN_SYSTEM, theme as themeTokens, type ColorRef, type DesignSystem } from './design-system.ts';
import { SCHEMA_VERSION } from './schema.ts';
import type { Align, Block, Column, Lock, Row, Section, Template } from './types.ts';

/** The v1 shapes, as loosely as they actually occur on disk. */
interface V1Block {
  id?: string;
  type: string;
  [key: string]: unknown;
}
interface V1Design {
  name?: string;
  label?: string;
  forceLight?: boolean;
  pageBg?: string;
  preview?: { company?: string; address?: string; city?: string; state?: string; zip?: string };
  blocks?: V1Block[];
}

const num = (value: unknown, fallback: number): number =>
  value === null || value === undefined || value === '' ? fallback : Math.max(0, Number(value) | 0);
const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const bool = (value: unknown, fallback = false): boolean => (typeof value === 'boolean' ? value : fallback);

/**
 * v1's literal hex, mapped onto a palette name where one matches.
 *
 * Stripes reference the palette in v2, so an imported design has to arrive naming colours rather
 * than repeating them — otherwise the palette cannot report what uses them and recolouring the
 * brand leaves the stripes behind. A hex with no match stays a literal, which `colorOf` still
 * resolves; it simply stops following the system, which is what an override means.
 */
function stripeRef(pick: unknown, custom: unknown, ds: DesignSystem): ColorRef {
  const hex = stripeColor(pick, custom);
  if (!hex) return null;
  const named = Object.entries(ds.colors).find(([, value]) => value.toLowerCase() === hex.toLowerCase());
  return named ? named[0] : hex;
}

/** v1 stored a palette choice plus a custom hex; `custom` means read the sibling field. */
function stripeColor(pick: unknown, custom: unknown): string {
  if (pick !== 'custom') return str(pick);
  let hex = str(custom).trim();
  if (hex && !hex.startsWith('#')) hex = `#${hex}`;
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex) ? hex.toLowerCase() : '';
}

function pickColor(pick: unknown, custom: unknown): string | null {
  if (!pick) return null;
  return stripeColor(pick, custom) || null;
}

export interface ImportResult {
  template: Template;
  /** Anything the import could not carry across. Shown rather than swallowed. */
  warnings: string[];
}

export function importV1(design: V1Design, ds: DesignSystem = DEFAULT_DESIGN_SYSTEM): ImportResult {
  const nextId = sequentialIds();
  const taken = new Set<string>();
  const warnings: string[] = [];
  const sections: Section[] = [];

  /**
   * Allocate a field name only when the block is editable, exactly as v1 did.
   *
   * `nameBase` exists because v1 derived a button's field name from "Button text" while labelling
   * it "Button text (blank to hide)" — so the name and the label come from different strings, and
   * an import that used the label for both would rename the field and orphan whatever the team has
   * already typed into it (learnings 1.10).
   */
  const lockFor = (editable: boolean, label: string, nameBase = label): Lock => ({
    editable,
    label,
    field: editable ? fieldName(nameBase, taken) : '',
  });

  const wrap = (block: Block, section: Omit<Section, 'id' | 'rows'>, column: Omit<Column, 'id' | 'blocks'>): void => {
    const col: Column = { id: nextId(), ...column, blocks: [block] };
    const row: Row = { id: nextId(), mobile: 'stack', columns: [col] };
    sections.push({ id: nextId(), ...section, rows: [row] });
  };

  // The top bar and the footer sit on the banded preset — navy, in this palette — and *name* it, so
  // they follow it when it is edited. They used to carry `theme: 'cream'` with the band overridden
  // to a literal navy, which the renderers ignored in favour of their own hard-coded preset. Once
  // the renderers read the section, that shape would have turned the footer cream on the first
  // palette edit, because `recolor` re-resolves a section from the preset it names.
  const dark = bandedPreset(ds);
  const onDark = themeTokens(ds, dark);
  const furniture = {
    theme: dark,
    bandColor: onDark.band,
    containerColor: onDark.container,
    textColor: onDark.text,
    linkColor: onDark.link,
  };

  for (const raw of design.blocks ?? []) {
    const themeName = str(raw['theme'], 'cream');
    const t = themeTokens(ds, themeName);
    const band = t.band;
    const container = t.container;
    const base = { theme: themeName, bandColor: band, containerColor: container, textColor: t.text, linkColor: t.link };
    // No side padding: every imported block follows Design › Page padding, which is what v1's
    // hard-coded 20 actually was. Writing a 20 here would detach each block from the gutter the
    // moment anybody moved it.
    const pad = (top: number, bottom: number) => ({
      padTop: num(raw['padTop'], top),
      padBottom: num(raw['padBottom'], bottom),
      align: str(raw['align'], 'left') as Align,
      span: 12,
    });

    switch (raw.type) {
      case 'topbar': {
        const label = str(raw['label'], 'Top bar tagline');
        wrap(
          {
            id: nextId(),
            type: 'topbar',
            lock: lockFor(bool(raw['editable'], true), label),
            text: str(raw['text']),
          },
          // The top bar draws its own band and carries the section's vertical padding itself.
          { ...furniture, padTop: num(raw['padTop'], 16), padBottom: num(raw['padBottom'], 12) },
          { ...pad(0, 0), align: 'center' },
        );
        break;
      }

      case 'stripes': {
        wrap(
          {
            id: nextId(),
            type: 'stripes',
            stripes: [
              { color: stripeRef(raw['c1'], raw['c1Custom'], ds), height: num(raw['h1'], 0) },
              { color: stripeRef(raw['c2'], raw['c2Custom'], ds), height: num(raw['h2'], 0) },
            ],
          },
          { ...base, bandColor: null, containerColor: null, padTop: 0, padBottom: 0 },
          pad(0, 0),
        );
        break;
      }

      case 'spacer': {
        wrap(
          { id: nextId(), type: 'spacer', height: num(raw['height'], 20) },
          { ...base, padTop: 0, padBottom: 0 },
          pad(0, 0),
        );
        break;
      }

      case 'image': {
        const editable = bool(raw['editable'], true);
        const label = str(raw['label'], 'Image');
        wrap(
          {
            id: nextId(),
            type: 'image',
            lock: lockFor(editable, label),
            mode: !editable ? 'static' : str(raw['hsMode'], 'module') === 'field' ? 'field' : 'module',
            src: str(raw['src']),
            alt: str(raw['alt']),
            href: str(raw['href']),
            width: num(raw['width'], 560),
            align: str(raw['align'], 'center') as Align,
            optional: bool(raw['optional'], true),
          },
          { ...base, padTop: 0, padBottom: 0 },
          pad(10, 10),
        );
        break;
      }

      case 'heading': {
        const editable = bool(raw['editable'], true);
        const label = str(raw['label'], 'Headline');
        wrap(
          {
            id: nextId(),
            type: 'heading',
            lock: lockFor(editable, label),
            text: str(raw['text']),
            level: str(raw['level'], 'h1') as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6',
            align: str(raw['align'], 'left') as Align,
          },
          { ...base, padTop: 0, padBottom: 0 },
          pad(10, 10),
        );
        break;
      }

      case 'richtext': {
        const editable = bool(raw['editable'], true);
        const label = str(raw['label'], 'Body');
        wrap(
          {
            id: nextId(),
            type: 'richtext',
            lock: lockFor(editable, label),
            html: str(raw['content']),
            align: str(raw['align'], 'left') as Align,
          },
          { ...base, padTop: 0, padBottom: 0 },
          // A text block's bottom padding defaults to 0; the last paragraph's margin supplies it.
          pad(10, 0),
        );
        break;
      }

      case 'button': {
        const editable = bool(raw['editable'], true);
        const label = str(raw['label'], 'Button');
        const style = str(raw['style'], 'auto');
        wrap(
          {
            id: nextId(),
            type: 'button',
            // v1 labelled these "<name> text (blank to hide)" and "<name> link". The parenthetical
            // is the only place the team is told that clearing the label removes the button.
            lock: lockFor(editable, `${label} text (blank to hide)`, `${label} text`),
            link: lockFor(editable, `${label} link`),
            text: str(raw['text']),
            href: str(raw['href']),
            style: style === 'auto' ? t.button : style === 'white' ? 'secondary' : 'primary',
            align: str(raw['align'], 'center') as Align | 'full',
          },
          { ...base, padTop: 0, padBottom: 0 },
          pad(10, 10),
        );
        break;
      }

      case 'legal': {
        wrap(
          {
            id: nextId(),
            type: 'legal',
            logoSrc: str(raw['logoSrc']),
            logoWidth: num(raw['logoWidth'], 180),
            note: str(raw['note']),
            noteLock: lockFor(bool(raw['noteEditable'], false), 'Legal note'),
          },
          {
            ...furniture,
            padTop: num(raw['padTop'], 30),
            padBottom: num(raw['padBottom'], 10),
            domId: 'section-legal',
          },
          // Right-aligned, which is the Switchyards footer. The column's alignment is what the
          // footer renders now, so this is a setting rather than a description.
          { ...pad(0, 0), align: 'right' },
        );
        break;
      }

      default:
        // Footer variants and the city-links block are not built yet. Naming them is better than
        // dropping them silently — the designer sees exactly what did not come across.
        warnings.push(`Block type "${raw.type}" is not supported yet and was left out of the import.`);
    }
  }

  const p = design.preview ?? {};
  const template: Template = {
    schema: SCHEMA_VERSION,
    id: nextId(),
    name: str(design.name, 'Imported template'),
    hubspotLabel: str(design.label, str(design.name, 'Email template')),
    pageBackground: str(design.pageBg, ds.pageBackground),
    forceLight: bool(design.forceLight, true),
    preview: {
      company: str(p.company, 'COMPANY'),
      address: str(p.address, ''),
      city: str(p.city, ''),
      state: str(p.state, ''),
      zip: str(p.zip, ''),
    },
    sections,
  };

  return { template, warnings };
}
