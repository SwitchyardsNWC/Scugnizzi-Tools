// Schema version and the migration chain.
//
// This exists in the first commit on purpose. v1 accumulated six migrations in three weeks —
// footers gaining locks, friendly markup becoming HTML, stripe fields splitting into colour and
// thickness pairs, image blocks gaining a mode and an optional flag (learnings 3.6). Every one of
// those would have destroyed saved work without a migration, and adding the mechanism after the
// fact means the first version of every document is unversioned and unfixable.
//
// Adding a migration: bump SCHEMA_VERSION, append one entry to MIGRATIONS keyed by the version it
// upgrades *from*, and add a test that feeds it a real document from the old shape.

import type { Template } from './types.ts';

export const SCHEMA_VERSION = 6;

/** A migration takes a document at version `from` and returns it at `from + 1`. */
type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, Migration> = {
  // 0 -> 1: documents written before the schema field existed. Nothing to change structurally;
  // this entry exists so that an unversioned file is still recognised and stamped rather than
  // rejected, and so the chain has a worked example from day one.
  0: (doc) => ({ ...doc, schema: 1 }),

  // 1 -> 2: per-block size, line height and colour became design-system roles (2026-09-11). The
  // compiler stopped reading them the moment the types lost them, so a document carrying them is
  // not broken — it is just carrying dead weight into every diff of a file three people sync. This
  // strips them on open, so the next save is clean.
  1: (doc) => ({ ...doc, sections: strip(doc['sections']) }),

  // 2 -> 3: the button variants were named for the colour they happened to be — `red` and `white` —
  // which stopped being true the moment either could be recoloured (2026-09-11). They are `primary`
  // and `secondary` now, and the token inside them called `edge` is called `border`, because that is
  // what it is.
  //
  // Three places hold a reference: the block, the design system's own map, and each background
  // preset's choice of which variant to reach for. Missing one leaves a button that silently falls
  // back to primary.
  2: (doc) => ({ ...doc, sections: renameVariants(doc['sections']), ds: renameInSystem(doc['ds']) }),

  // 3 -> 4: stripes held a literal hex while every other colour in the system was a name
  // (2026-09-11). That made them invisible to the palette — the standard email paints three stripes
  // in the bright red, and the panel reported that colour as used by nothing and offered to delete
  // it. A hex that matches a palette entry becomes its name; one that does not stays a literal,
  // which still resolves and simply stops following the system.
  3: (doc) => ({ ...doc, sections: nameStripeColors(doc['sections'], doc['ds']) }),

  // 4 -> 5: the page gained a frame and a margin (2026-09-11). A document that has opened the
  // design panel carries a *whole* copy of the system — `setValue` materialises it rather than
  // storing a patch, so that no reader needs a merge step — which is exactly why a new token needs
  // a migration: an older copy has no key for it, and `border:${undefined}px` is a frame nobody
  // asked for drawn in a colour that does not exist.
  //
  // The values written here are the shipped ones spelled out, and they are all "off": a template
  // saved before this step compiles to the same bytes after it.
  // Most documents have no `ds` at all — they compile against the shipped values — and those are
  // left exactly as they are rather than gaining a key that would make them read as tuned.
  4: (doc) => (doc['ds'] ? { ...doc, ds: withPageFrame(doc['ds']) } : doc),

  // 5 -> 6: every column carried `padLeft: 20` and `padRight: 20`, and nothing had ever read them
  // (2026-09-11). The compiler took both sides from `pagePadding`. Now that a column *can* set its
  // own, a stored 20 would silently detach every block in every existing document from the page
  // gutter — the global would stop moving them, which is the one thing a global is for.
  //
  // So they are stripped rather than kept: absent means "follow the page", which is what those
  // documents have always actually done. A column that wants its own side padding gets it from
  // here on by being given one.
  5: (doc) => ({ ...doc, sections: dropDeadSides(doc['sections']) }),
};

function dropDeadSides(sections: unknown): unknown {
  if (!Array.isArray(sections)) return sections;
  return sections.map((section: Record<string, unknown>) => ({
    ...section,
    rows: (Array.isArray(section['rows']) ? section['rows'] : []).map((row: Record<string, unknown>) => ({
      ...row,
      columns: (Array.isArray(row['columns']) ? row['columns'] : []).map((column: Record<string, unknown>) => {
        const next = { ...column };
        delete next['padLeft'];
        delete next['padRight'];
        return next;
      }),
    })),
  }));
}

function withPageFrame(ds: unknown): unknown {
  if (ds === null || typeof ds !== 'object') return ds;
  const system = ds as Record<string, unknown>;
  return {
    ...system,
    pageBorderWidth: typeof system['pageBorderWidth'] === 'number' ? system['pageBorderWidth'] : 0,
    pageBorderColor: 'pageBorderColor' in system ? system['pageBorderColor'] : 'navy',
    pageMargin: typeof system['pageMargin'] === 'number' ? system['pageMargin'] : 0,
  };
}

function nameStripeColors(sections: unknown, ds: unknown): unknown {
  const palette = (ds as { colors?: Record<string, string> } | undefined)?.colors ?? DEFAULT_COLORS;
  const byHex = new Map(Object.entries(palette).map(([name, hex]) => [String(hex).toLowerCase(), name]));
  return mapBlocks(sections, (block) => {
    if (block['type'] !== 'stripes' || !Array.isArray(block['stripes'])) return block;
    return {
      ...block,
      stripes: block['stripes'].map((stripe: Record<string, unknown>) => {
        const colour = stripe['color'];
        if (typeof colour !== 'string' || !colour.startsWith('#')) return stripe;
        return { ...stripe, color: byHex.get(colour.toLowerCase()) ?? colour };
      }),
    };
  });
}

/**
 * The shipped palette, spelled out rather than imported.
 *
 * A migration has to keep describing the world as it was when it was written. Reading today's
 * defaults would mean this step changes behaviour every time somebody edits the design system —
 * and a migration that is not deterministic is not a migration.
 */
const DEFAULT_COLORS: Record<string, string> = {
  navy: '#011272',
  red: '#d10000',
  redBright: '#d20000',
  cream: '#f7f6f3',
  offwhite: '#fcfff5',
  white: '#ffffff',
};

const VARIANT: Record<string, string> = { red: 'primary', white: 'secondary' };

function renameVariants(sections: unknown): unknown {
  return mapBlocks(sections, (block) =>
    block['type'] === 'button' && typeof block['style'] === 'string' && VARIANT[block['style']]
      ? { ...block, style: VARIANT[block['style']] }
      : block,
  );
}

function renameInSystem(ds: unknown): unknown {
  if (ds === null || typeof ds !== 'object') return ds;
  const system = { ...(ds as Record<string, unknown>) };

  const buttons = system['buttons'];
  if (buttons && typeof buttons === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(buttons as Record<string, unknown>)) {
      const tokens = value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : value;
      if (tokens && typeof tokens === 'object' && 'edge' in tokens) {
        (tokens as Record<string, unknown>)['border'] = (tokens as Record<string, unknown>)['edge'];
        delete (tokens as Record<string, unknown>)['edge'];
      }
      next[VARIANT[key] ?? key] = tokens;
    }
    system['buttons'] = next;
  }

  const themes = system['themes'];
  if (themes && typeof themes === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(themes as Record<string, unknown>)) {
      const theme = value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : value;
      if (theme && typeof theme === 'object') {
        const picked = (theme as Record<string, unknown>)['button'];
        if (typeof picked === 'string' && VARIANT[picked]) (theme as Record<string, unknown>)['button'] = VARIANT[picked];
      }
      next[key] = theme;
    }
    system['themes'] = next;
  }

  return system;
}

const DEAD = ['size', 'mobileSize', 'lineHeight', 'color'];

/** Section → Row → Column → Block, applying `fn` to each block. Every migration below walks this. */
function mapBlocks(sections: unknown, fn: (block: Record<string, unknown>) => Record<string, unknown>): unknown {
  if (!Array.isArray(sections)) return sections;
  return sections.map((section: Record<string, unknown>) => ({
    ...section,
    rows: (Array.isArray(section['rows']) ? section['rows'] : []).map((row: Record<string, unknown>) => ({
      ...row,
      columns: (Array.isArray(row['columns']) ? row['columns'] : []).map((column: Record<string, unknown>) => ({
        ...column,
        blocks: (Array.isArray(column['blocks']) ? column['blocks'] : []).map(fn),
      })),
    })),
  }));
}

/** Drops the properties that moved to the design system. */
function strip(sections: unknown): unknown {
  const styled = new Set(['heading', 'richtext', 'button', 'topbar']);
  return mapBlocks(sections, (block) => {
    if (!styled.has(String(block['type']))) return block;
    const next = { ...block };
    for (const key of DEAD) delete next[key];
    return next;
  });
}

export class MigrationError extends Error {
  /** Written out rather than declared as a constructor parameter property, so that the compiler
   *  runs under plain `node --experimental-strip-types` with no build step at all. */
  found: number;

  constructor(message: string, found: number) {
    super(message);
    this.name = 'MigrationError';
    this.found = found;
  }
}

/**
 * Brings a parsed document up to SCHEMA_VERSION. Throws rather than guessing when the document is
 * newer than this build — that means a teammate on the synced folder is running a newer Template
 * Studio, and silently downgrading their file is how you lose their work.
 */
export function migrate(input: unknown): Template {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new MigrationError('Not a template document.', -1);
  }
  let doc = input as Record<string, unknown>;
  const raw = doc['schema'];
  let version = typeof raw === 'number' && Number.isInteger(raw) ? raw : 0;

  if (version > SCHEMA_VERSION) {
    throw new MigrationError(
      `This template was written by a newer version of Template Studio (schema ${version}, this build reads ${SCHEMA_VERSION}). ` +
        `Update before opening it, so your copy does not overwrite theirs.`,
      version,
    );
  }

  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      throw new MigrationError(`No migration from schema ${version} to ${version + 1}.`, version);
    }
    doc = step(doc);
    version += 1;
    doc['schema'] = version;
  }
  return doc as unknown as Template;
}
