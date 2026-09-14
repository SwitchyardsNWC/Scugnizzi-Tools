// What made a picture in a project: the recipe a tool writes beside what it saved.
//
// Jared: "Riso and ink bleed save into the project." They write their result into `assets/`, and a recipe into a
// folder of their own: `riso/<name>.riso.json`, `ink-bleed/<name>.ink-bleed.json`. A recipe names the pictures the
// result was made from and holds the settings, so the board can draw a line from the original to the result, and
// reopening the result in its tool brings the settings back. `project.js` at the site's root writes them; this
// reads them.
//
// Pure.

export type RecipeTool = 'riso' | 'ink-bleed';

export const RECIPE_TOOLS: Record<RecipeTool, { dir: string; ext: string; name: string; page: string }> = {
  riso: { dir: 'riso', ext: '.riso.json', name: 'Riso', page: 'riso/riso.html' },
  'ink-bleed': { dir: 'ink-bleed', ext: '.ink-bleed.json', name: 'Ink bleed', page: 'text bleed/ink-bleed.html' },
};

export interface ToolRecipe {
  tool: RecipeTool;
  /** The recipe's own path in the project. */
  path: string;
  /** The picture it made, by its name under `assets/`, the name the board's cards use. */
  output: string;
  /** The pictures it was made from, the same way. */
  sources: string[];
  savedAt: number;
}

/** `assets/photo.png` → `photo.png`. Null for a path outside `assets/`, or one that climbs out of it. */
export function assetPath(path: unknown): string | null {
  if (typeof path !== 'string' || !path.startsWith('assets/')) return null;
  const rest = path.slice('assets/'.length);
  if (!rest || rest.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  return rest;
}

export function readRecipe(text: string, path: string): ToolRecipe | null {
  let raw: Record<string, unknown> | null = null;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || raw['version'] !== 1) return null;
  const tool = raw['tool'];
  if (tool !== 'riso' && tool !== 'ink-bleed') return null;
  const output = assetPath(raw['output']);
  if (!output) return null;
  const listed = Array.isArray(raw['sources']) ? (raw['sources'] as unknown[]).map(assetPath) : [];
  const sources = [...new Set(listed.filter((s): s is string => s !== null && s !== output))];
  const savedAt = raw['savedAt'];
  return { tool, path, output, sources, savedAt: typeof savedAt === 'number' && Number.isFinite(savedAt) ? savedAt : 0 };
}

/** The latest recipe for each picture a recipe made. */
export function recipesByOutput(recipes: ToolRecipe[]): Map<string, ToolRecipe> {
  const out = new Map<string, ToolRecipe>();
  for (const recipe of recipes) {
    const have = out.get(recipe.output);
    if (!have || have.savedAt < recipe.savedAt) out.set(recipe.output, recipe);
  }
  return out;
}

/**
 * Where a picture opens: in the tool that made it, with its recipe; otherwise an SVG in Ink bleed as a stamp and any
 * other picture in Riso. `root` is the way from the page asking to the site's root.
 */
export function toolAddress(root: string, picture: string, recipe: ToolRecipe | undefined): string {
  if (recipe) return `${root}${encodeURI(RECIPE_TOOLS[recipe.tool].page)}?recipe=${encodeURIComponent(recipe.path)}`;
  const svg = /\.svg$/i.test(picture);
  const page = svg ? RECIPE_TOOLS['ink-bleed'].page : RECIPE_TOOLS.riso.page;
  return `${root}${encodeURI(page)}?${svg ? 'stamp' : 'picture'}=${encodeURIComponent(`assets/${picture}`)}`;
}
