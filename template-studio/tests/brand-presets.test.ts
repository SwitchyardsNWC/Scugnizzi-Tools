// Brand presets: added, renamed, copied, deleted, and saved back from a tweaked text layer.
// Defended: keys and names never collide; deleting the last preset leaves none rather than the shipped ones;
// saving a tweak folds it into the preset and clears it from the layer, so the picture does not change.

import { describe, expect, it } from 'vitest';

import { freeformSvg } from '../src/compile/freeform.ts';
import { addPreset, duplicatePreset, freshLabel, hasTweaks, presetUses, removePreset, savePresetFromLayer, updatePreset, withPresets } from '../src/model/brand-presets.ts';
import { canvasTypeOf, DEFAULT_CANVAS_TYPE } from '../src/model/design-system.ts';
import { designSystemOf } from '../src/model/edit.ts';
import { SCHEMA_VERSION } from '../src/model/schema.ts';
import type { FreeformBlock, FreeformLayer, Template } from '../src/model/types.ts';

type Text = Extract<FreeformLayer, { kind: 'text' }>;
const text = (extra: Partial<Text> = {}): Text => ({ kind: 'text', id: 't1', text: 'Open house', role: 'h2', color: null, x: 0, y: 0, width: 300, align: 'left', look: 'retro', ...extra });
const block = (layers: FreeformLayer[]): FreeformBlock => ({ id: 'f', type: 'freeform', width: 560, height: 280, background: null, layers } as unknown as FreeformBlock);
const tpl = (layers: FreeformLayer[]): Template =>
  ({
    schema: SCHEMA_VERSION,
    id: 't',
    name: 'T',
    hubspotLabel: 'T',
    pageBackground: '#fff',
    forceLight: true,
    preview: { company: 'C', address: 'A', city: 'C', state: 'S', zip: 'Z' },
    sections: [{ id: 's', theme: 'cream', bandColor: null, containerColor: null, textColor: null, linkColor: null, padTop: 0, padBottom: 0, rows: [{ id: 'r', mobile: 'stack', columns: [{ id: 'c', span: 12, padTop: 0, padBottom: 0, align: 'left', blocks: [block(layers)] }] }] }],
  }) as unknown as Template;
const layerOf = (t: Template) => (t.sections[0]!.rows[0]!.columns[0]!.blocks[0] as FreeformBlock).layers[0] as Text;
const presetsOf = (t: Template) => canvasTypeOf(designSystemOf(t));

describe('brand presets', () => {
  it('adds under a fresh name and key', () => {
    const { presets, key } = addPreset(DEFAULT_CANVAS_TYPE, { ...DEFAULT_CANVAS_TYPE.marker!, label: 'Letterhead' });
    expect(key).toBe('letterhead-2');
    expect(presets[key]!.label).toBe('Letterhead 2');
    expect(freshLabel(presets, 'letterhead')).toBe('letterhead 3');
  });

  it('copies right after the original', () => {
    const { presets, key } = duplicatePreset(DEFAULT_CANVAS_TYPE, 'outline');
    const keys = Object.keys(presets);
    expect(keys[keys.indexOf('outline') + 1]).toBe(key);
    expect(presets[key]!.label).toBe('Display serif copy');
    expect(presets[key]).not.toBe(DEFAULT_CANVAS_TYPE.outline);
  });

  it('switches a part off by leaving it out of the file', () => {
    const next = updatePreset(DEFAULT_CANVAS_TYPE, 'arc', { curve: undefined });
    expect('curve' in next.arc!).toBe(false);
  });

  it('deletes down to none, and words in a deleted preset set plain', () => {
    let t = tpl([text()]);
    expect(presetUses(t, 'retro')).toBe(1);
    let presets = presetsOf(t);
    for (const k of Object.keys(presets)) presets = removePreset(presets, k);
    t = withPresets(t, presets);
    expect(presetsOf(t)).toEqual({});
    expect(freeformSvg(block([text()]), designSystemOf(t))).not.toContain('text-transform:uppercase');
  });

  it('saves a tweak into its preset without changing the picture', () => {
    const tweaked = text({ size: 64, letterSpacing: 2 });
    const t = tpl([tweaked]);
    expect(hasTweaks(tweaked)).toBe(true);
    const before = freeformSvg(block([tweaked]), designSystemOf(t));
    const saved = savePresetFromLayer(t, 'f', tweaked, 'update')!;
    const layer = layerOf(saved.template);
    expect(hasTweaks(layer)).toBe(false);
    expect(presetsOf(saved.template).retro!.size).toBe(64);
    expect(freeformSvg(block([layer]), designSystemOf(saved.template))).toBe(before);
  });

  it('saves a tweak as a new preset and moves the layer onto it', () => {
    const t = tpl([text({ size: 50 })]);
    const saved = savePresetFromLayer(t, 'f', layerOf(t), 'new', 'Event headline')!;
    expect(saved.key).toBe('event-headline');
    expect(layerOf(saved.template).look).toBe('event-headline');
    expect(presetsOf(saved.template).retro!.size).toBe(DEFAULT_CANVAS_TYPE.retro!.size);
    expect(presetsOf(saved.template)['event-headline']).toMatchObject({ label: 'Event headline', size: 50, color: DEFAULT_CANVAS_TYPE.retro!.color, uppercase: true });
  });

  it('makes a preset from plain words, and refuses to update one they do not have', () => {
    const plain = text({ look: undefined, size: 40 });
    const t = tpl([plain]);
    expect(savePresetFromLayer(t, 'f', plain, 'update')).toBeNull();
    const saved = savePresetFromLayer(t, 'f', plain, 'new', 'Big plain')!;
    expect(presetsOf(saved.template)['big-plain']).toMatchObject({ size: 40, color: null });
    expect(presetsOf(saved.template)['big-plain']!.stroke).toBeUndefined();
  });
});
