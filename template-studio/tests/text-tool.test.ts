// The text tool: a layer's own weight, italic and case over its type role, drawn the same on a straight line and a curve.

import { describe, expect, it } from 'vitest';

import { freeformSvg } from '../src/compile/freeform.ts';
import { hasTweaks } from '../src/model/brand-presets.ts';
import { textStyleOf } from '../src/model/canvas-text.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../src/model/design-system.ts';
import type { FreeformBlock, FreeformLayer } from '../src/model/types.ts';

type Text = Extract<FreeformLayer, { kind: 'text' }>;
const ds = DEFAULT_DESIGN_SYSTEM;
const text = (extra: Partial<Text> = {}): Text => ({ kind: 'text', id: 't', text: 'open house tonight', role: 'body', color: null, x: 0, y: 0, width: 300, align: 'left', ...extra });
const svg = (l: Text) => freeformSvg({ id: 'f', type: 'freeform', width: 400, height: 200, background: null, layers: [l] } as unknown as FreeformBlock, ds);

describe('the text tool', () => {
  it('sets weight, italic and case over the role, and counts them as the layer’s own', () => {
    const plain = textStyleOf(text(), ds);
    const set = textStyleOf(text({ weight: 'bold', italic: true, textCase: 'upper' }), ds);
    expect(set).toMatchObject({ weight: 'bold', italic: true, textCase: 'upper', uppercase: true });
    expect(plain.textCase).toBe('none');
    expect(hasTweaks(text({ textCase: 'lower' }))).toBe(true);
    expect(hasTweaks(text())).toBe(false);
  });

  it('draws each case', () => {
    expect(svg(text({ textCase: 'upper' }))).toContain('text-transform:uppercase');
    expect(svg(text({ textCase: 'lower' }))).toContain('text-transform:lowercase');
    expect(svg(text({ textCase: 'title' }))).toContain('text-transform:capitalize');
    expect(svg(text({ weight: 'bold', italic: true }))).toMatch(/font-weight:bold;\s*font-style:italic/);
  });

  it('leaves text without settings drawn exactly as before', () => {
    expect(svg(text())).not.toContain('text-transform');
  });
});
