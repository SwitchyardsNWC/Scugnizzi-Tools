// The footer's social icons, as pictures an email client can fetch.
//
// Jared, 2026-09-29: "make an option to use icons for the social media instead of text", with his own artwork.
//
// Pictures and not SVG, because Gmail strips SVG from a message and Outlook on Windows never drew it. PNG and not
// webp, because the webp the artwork arrived in is unreadable to most mail clients. And an absolute address, because
// an email has no page to resolve a relative one against. The repo is what the site publishes (.github/workflows/
// static.yml uploads all of it), so a file committed under `email-assets/` has a stable public URL — the same
// arrangement the rest of the tools already rely on for everything they serve.
//
// Pure. The compiler reads the addresses; the preview maps them onto whatever copy of the site it is running from.

import type { SocialName } from './types.ts';

/** Where the site publishes `email-assets/social/`. Baked into every email that uses an icon, so it never changes. */
export const SOCIAL_ICON_BASE = 'https://switchyardsnwc.github.io/Scugnizzi-Tools/email-assets/social/';

/** The same folder, as a path from the site's root, for the preview to find its own copy of. */
export const SOCIAL_ICON_PATH = 'email-assets/social/';

/**
 * Two sets of the same artwork, for the two kinds of band a footer sits on.
 *
 * Off-white on the dark bands, navy on the light one. Picked from the footer's own text colour rather than from the
 * layout, so an imported design system whose masthead happens to be cream still gets icons it can be read on.
 */
export type IconTone = 'offwhite' | 'navy';

/**
 * Drawn at 20px tall, the height of the footer's small type with its leading. The files are four times that, so they
 * stay sharp on a phone's screen, and small enough — under 2 KB each — that three of them cost less than one line
 * of the footer's own markup.
 */
export const SOCIAL_ICON_HEIGHT = 20;

/** Each network's picture, at its drawn size. YouTube's artwork is wider than tall, so its width is its own. */
export const SOCIAL_ICONS: Record<SocialName, { file: string; width: number }> = {
  Instagram: { file: 'instagram', width: 20 },
  YouTube: { file: 'youtube', width: 23 },
  LinkedIn: { file: 'linkedin', width: 20 },
};

/** The address of one icon in one tone. */
export const socialIconUrl = (name: SocialName, tone: IconTone): string => `${SOCIAL_ICON_BASE}${SOCIAL_ICONS[name].file}-${tone}.png`;

/**
 * Whether a colour is light enough that dark icons would be the ones to read on it.
 *
 * Relative luminance in sRGB, the WCAG definition, against the midpoint. A footer's text colour is what is asked:
 * light text means a dark band, which means the off-white icons. Anything that is not a six- or three-digit hex reads
 * as dark, which is the band every footer but the letterhead sits on.
 */
export function isLightColour(colour: string): boolean {
  const hex = colour.trim().replace(/^#/, '');
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return false;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

/** The tone of icon to draw on a footer whose words are this colour. */
export const iconToneFor = (textColour: string): IconTone => (isLightColour(textColour) ? 'offwhite' : 'navy');
