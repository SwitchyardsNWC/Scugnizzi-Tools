// Dark-mode simulation for the canvas.
//
// A browser will not let a page choose `prefers-color-scheme` for one iframe, so showing a designer
// what their dark override produces means rendering the override directly: lift the rules out of
// the `@media (prefers-color-scheme: dark)` block and re-assert them unconditionally.
//
// What this shows is **layer 2 of learnings 2.5** and only layer 2 — the block that clients
// applying their own dark styling will honour. It does not show Outlook's `[data-ogsc]` rewrite,
// and it certainly does not show what Gmail's apps do, because nothing can: they ignore all three
// layers and invert whatever they like. The toggle is labelled accordingly. A designer who reads
// this preview as "dark mode" rather than "my dark override" will be wrong about Gmail, which is
// the client Jared checks first, so the label matters as much as the transform.

const MEDIA = '@media (prefers-color-scheme: dark)';

/**
 * Returns the compiled email with its dark-mode rules applied unconditionally. Pure, and safe on
 * markup that has no dark block — it hands back the input unchanged.
 */
export function simulateDark(html: string): string {
  const rules = darkRules(html);
  if (!rules) return html;

  const injected = `<style type="text/css">\n/* Dark-mode simulation: the prefers-color-scheme layer, applied unconditionally. */\n${rules}\n</style>\n`;
  const head = html.indexOf('</head>');
  // No head is possible for a fragment; putting the style first still beats the body's own rules
  // on specificity ties, and every rule in the block carries !important anyway.
  return head === -1 ? injected + html : html.slice(0, head) + injected + html.slice(head);
}

/** The body of the dark media block, or '' when there is none. */
export function darkRules(html: string): string {
  const start = html.indexOf(MEDIA);
  if (start === -1) return '';
  const open = html.indexOf('{', start + MEDIA.length);
  if (open === -1) return '';

  let depth = 0;
  for (let i = open; i < html.length; i += 1) {
    const c = html[i];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return html.slice(open + 1, i).trim();
    }
  }
  return ''; // unbalanced; better to show light than to inject a broken stylesheet
}
