// Frame sizes and starters for the Freeform app: the shapes a Switchyards graphic usually takes, and a few
// layouts to begin one from.
//
// Jared asked for "Email header, Instagram post and story, LinkedIn, in-club signage, each with a template".
// Sizes are in page pixels; the PNG export is twice that. Print sizes are at 100 pixels to the inch, so a
// poster exports at 200, which prints clean at the size named.
//
// Starters are plain layers in the type roles and the palette's first colours, nothing that has to be
// installed, so they open the same in every project. They scale with the frame: type is sized from the
// frame's short side, so a story and a post get the same proportions.

import type { DesignSystem } from './design-system.ts';
import type { FreeformLayer } from './types.ts';

export interface FrameSize {
  key: string;
  label: string;
  group: 'Email' | 'Social' | 'Print';
  width: number;
  height: number;
}

export const FRAME_SIZES: FrameSize[] = [
  { key: 'email-header', label: 'Email header', group: 'Email', width: 560, height: 280 },
  { key: 'email-hero', label: 'Email hero', group: 'Email', width: 560, height: 360 },
  { key: 'ig-post', label: 'Instagram post', group: 'Social', width: 1080, height: 1080 },
  { key: 'ig-portrait', label: 'Instagram portrait', group: 'Social', width: 1080, height: 1350 },
  { key: 'ig-story', label: 'Instagram story', group: 'Social', width: 1080, height: 1920 },
  { key: 'linkedin', label: 'LinkedIn post', group: 'Social', width: 1200, height: 627 },
  { key: 'letter', label: 'Letter flyer', group: 'Print', width: 850, height: 1100 },
  { key: 'poster', label: 'Poster 18 × 24', group: 'Print', width: 1800, height: 2400 },
  { key: 'tent', label: 'Table tent 4 × 6', group: 'Print', width: 400, height: 600 },
];

/** How large the Freeform app lets a page be. An email block keeps its own, smaller limit. */
export const FRAME_MAX = { width: 2400, height: 3600 };
export const EMAIL_MAX = { width: 700, height: 1200 };

/** The size a page matches, if it matches one. */
export const sizeOf = (width: number, height: number): FrameSize | undefined => FRAME_SIZES.find((s) => s.width === width && s.height === height);

export interface Starter {
  key: string;
  label: string;
  help: string;
  layers(width: number, height: number, ds: DesignSystem): FreeformLayer[];
}

const colours = (ds: DesignSystem) => {
  const names = Object.keys(ds.colors);
  return { ink: names[0] ?? null, accent: names[1] ?? names[0] ?? null };
};

/** A text layer at a size relative to the frame's short side, so it reads the same at any size. */
function words(id: string, text: string, role: string, x: number, y: number, width: number, size: number, extra: Partial<Extract<FreeformLayer, { kind: 'text' }>> = {}): FreeformLayer {
  return { kind: 'text', id, text, role, color: null, x: Math.round(x), y: Math.round(y), width: Math.round(width), align: 'left', size: Math.round(size), ...extra };
}

export const STARTERS: Starter[] = [
  { key: 'blank', label: 'Blank', help: 'An empty page.', layers: () => [] },
  {
    key: 'headline',
    label: 'Headline',
    help: 'A kicker, a large headline and a line of detail.',
    layers: (w, h, ds) => {
      const u = Math.min(w, h);
      const m = u * 0.08;
      const { accent } = colours(ds);
      return [
        words('l1', 'Switchyards', 'h2', m, m, w - m * 2, u * 0.035, { textCase: 'upper', letterSpacing: Math.round(u * 0.006), color: accent }),
        words('l2', 'A place to work, close to home', 'h1', m, h * 0.3, w - m * 2, u * 0.11, { lineHeight: 100 }),
        words('l3', 'Open to members, seven days a week', 'body', m, h - m - u * 0.05, w - m * 2, u * 0.035),
      ];
    },
  },
  {
    key: 'photo',
    label: 'Photo and caption',
    help: 'A picture frame across the top and a caption beneath it.',
    layers: (w, h) => {
      const u = Math.min(w, h);
      const m = u * 0.06;
      const photoH = h * 0.66;
      return [
        { kind: 'image', id: 'l1', src: '', x: 0, y: 0, width: w, height: Math.round(photoH), opacity: 1 },
        words('l2', 'Club name', 'h1', m, photoH + m, w - m * 2, u * 0.07),
        words('l3', 'Neighborhood, city', 'body', m, photoH + m + u * 0.1, w - m * 2, u * 0.035),
      ];
    },
  },
  {
    key: 'event',
    label: 'Event',
    help: 'A date block, a title and the details, for an event at a club.',
    layers: (w, h, ds) => {
      const u = Math.min(w, h);
      const m = u * 0.08;
      const { ink, accent } = colours(ds);
      const block = u * 0.28;
      return [
        { kind: 'rect', id: 'l1', x: Math.round(m), y: Math.round(m), width: Math.round(block), height: Math.round(block), fill: accent, stroke: null, strokeWidth: 0, radius: 0 },
        words('l2', 'NOV', 'h2', m, m + block * 0.12, block, u * 0.04, { align: 'center', color: '#ffffff', letterSpacing: Math.round(u * 0.004) }),
        words('l3', '14', 'h1', m, m + block * 0.32, block, u * 0.12, { align: 'center', color: '#ffffff', lineHeight: 100 }),
        words('l4', 'Members’ evening', 'h1', m, m * 2 + block, w - m * 2, u * 0.09, { lineHeight: 100, color: ink }),
        words('l5', '6 to 9 pm, at the club', 'body', m, h - m - u * 0.05, w - m * 2, u * 0.04),
      ];
    },
  },
];

export const starterOf = (key: string | undefined): Starter => STARTERS.find((s) => s.key === key) ?? STARTERS[0]!;
