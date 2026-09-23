// Where a project keeps the tools' own files: one hidden folder, so the rest of the project reads as work.
//
// Jared: "the goal is to have someone that is just looking for a file in drive can easily navigate and make
// sense of the file structure to find what they need and running into a bunch of .json files could cause
// issues." So the top of a project holds what a person is looking for, pictures, documents and exports, and
// everything the tools need to run the project sits in `.scug/`: the project's name and board, the emails and
// frames as the tools save them, the design systems, the recipes, the pictures Template Studio renders from
// text. Finder hides a dot folder; Drive and Dropbox sync it like any other.
//
// Documents still name pictures by their path under `assets/` (`photos/hero.png`), and a rendered picture is
// still `rendered/lede.png` to every document that shows it: only where the file sits moved.
//
// Until September 2026 these sat at the top of the project. `project/folder.ts` moves them into `.scug/` the
// first time a project is opened for editing, and every reader looks in both places until then.

export const META_DIR = '.scug';

export const metaPath = (rel: string): string => `${META_DIR}/${rel}`;

/** The tools' folders inside `.scug/`. */
export const META = {
  templates: metaPath('templates'),
  frames: metaPath('frames'),
  systems: metaPath('design-systems'),
  patterns: metaPath('patterns'),
  rendered: metaPath('rendered'),
  /** The studio library: starters and project types a folder carries of its own (model/library.ts). */
  starters: metaPath('starters'),
  projectTypes: metaPath('project-types'),
  /** What a delete goes through, so it can be put back (model/trash.ts). Swept to its caps. */
  trash: metaPath('trash'),
} as const;

/** How a rendered picture is named in documents and in the assets list: under this prefix, wherever its file is. */
export const RENDERED_PREFIX = 'rendered';

/** The old layout's files at the top of a project, moved into `.scug/`. */
export const LEGACY_META_FILES = ['project.json', 'board.json'] as const;

/**
 * The old layout's folders at the top of a project, moved into `.scug/` under the same names when they look like
 * the tools' own: empty, or holding at least one file of the kind the tool writes.
 */
export const LEGACY_META_DIRS: ReadonlyArray<{ name: string; ext: string }> = [
  { name: 'templates', ext: '.json' },
  { name: 'frames', ext: '.frame.json' },
  { name: 'design-systems', ext: '.system.json' },
  { name: 'patterns', ext: '.pattern.json' },
  { name: 'riso', ext: '.riso.json' },
  { name: 'ink-bleed', ext: '.ink-bleed.json' },
];

/** The folders a person sees, and what each is for. */
export const VISIBLE_FOLDER_NOTES: Record<string, string> = {
  assets: 'pictures every tool can use; each folder in it is a group on the board',
  docs: 'briefs, copy and sheets: Google Docs in a synced folder, or links to them',
  exports: 'what ships: the HubSpot template files',
  [META_DIR]: 'the tools’ own files. The dot keeps it out of the way in Finder; ⌘⇧. shows it',
  [META.templates]: 'emails, as Template Studio saves them',
  [META.frames]: 'Freeform frames, one file each',
  [META.systems]: 'the colours and type emails follow',
  [META.patterns]: 'sections saved to place again',
  [META.rendered]: 'pictures drawn from an email’s text',
  [META.starters]: 'emails to start from, in this folder’s New menu',
  [META.projectTypes]: 'what Create a project makes, as this folder sets it',
  [META.trash]: 'what was deleted, until the project board sweeps it',
};
