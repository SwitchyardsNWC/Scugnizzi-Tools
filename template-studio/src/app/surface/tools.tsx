// The dock: every tool, its key, its help and its glyph.

import type { JSX } from 'preact';

import type { Tool } from './types.ts';

export const glyph = (...children: JSX.Element[]) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const TOOLS: Array<{ tool: Tool; label: string; key: string; help: string; icon: () => JSX.Element }> = [
  { tool: 'select', label: 'Select', key: 'V', help: 'Pick, move, resize and rotate.', icon: () => glyph(<path key="a" d="M6 3.5l12.5 7.2-5.6 1.4-2.6 5.4z" />) },
  {
    tool: 'hand',
    label: 'Hand',
    key: 'H',
    help: 'Drag to look around. Holding Space does the same with any tool.',
    icon: () =>
      glyph(
        <path key="a" d="M8.5 12.5V6.8a1.4 1.4 0 012.8 0v4.7" />,
        <path key="b" d="M11.3 11.2V5.4a1.4 1.4 0 012.8 0v5.8" />,
        <path key="c" d="M14.1 11.2V7a1.4 1.4 0 012.8 0v6.6a6 6 0 01-6 6h-.6a5.8 5.8 0 01-4.6-2.3l-2.3-3a1.4 1.4 0 012.1-1.8l1.7 1.7" />,
      ),
  },
  { tool: 'sticky', label: 'Sticky note', key: 'S', help: 'Click to drop a note, then type.', icon: () => glyph(<path key="a" d="M5 4.5h14v9.8L14.3 19.5H5z" />, <path key="b" d="M14 19.3v-5h5" />) },
  { tool: 'rect', label: 'Box', key: 'R', help: 'Drag out a box. Shift for a square.', icon: () => glyph(<rect key="a" x="4" y="6" width="16" height="12" rx="2.5" />) },
  { tool: 'ellipse', label: 'Ellipse', key: 'O', help: 'Drag out an ellipse. Shift for a circle.', icon: () => glyph(<ellipse key="a" cx="12" cy="12" rx="8.2" ry="6.2" />) },
  { tool: 'line', label: 'Line', key: 'L', help: 'Drag from one end to the other.', icon: () => glyph(<path key="a" d="M5 19L19 5" />) },
  {
    tool: 'pen',
    label: 'Draw',
    key: 'P',
    help: 'Draw freehand with a pen, marker, highlighter or brush — pick one in the tray.',
    icon: () => glyph(<path key="a" d="M4.5 19.5l1-4L15.8 5.2a2 2 0 012.8 0l.2.2a2 2 0 010 2.8L8.5 18.5z" />, <path key="b" d="M13.5 7.5l3 3" />),
  },
  {
    tool: 'eraser',
    label: 'Eraser',
    key: 'X',
    help: 'Rub out strokes. Cross a stroke in the middle and it becomes two.',
    icon: () =>
      glyph(
        <path key="a" d="M4.8 14.9l8.9-8.9a2 2 0 012.8 0l2.5 2.5a2 2 0 010 2.8L11.9 19.5H9.4z" />,
        <path key="b" d="M9 10.7l5.3 5.3" />,
        <path key="c" d="M12.5 19.5h7" />,
      ),
  },
  { tool: 'text', label: 'Text', key: 'T', help: 'Click to place words in the heading role.', icon: () => glyph(<path key="a" d="M6 6.5h12M12 6.5v12M9.5 18.5h5" />) },
  {
    tool: 'stamp',
    label: 'Stamp',
    key: 'E',
    help: 'Brand marks. Pick one from the tray and click to stamp, as many as you like.',
    icon: () => glyph(<circle key="a" cx="12" cy="9" r="4.6" />, <path key="b" d="M9.5 13.2L9 16.5h6l-.5-3.3" />, <path key="c" d="M6 19.5h12" />),
  },
];
