// Documents on the board: Google Docs, Sheets and Slides, and links to them.
//
// Google Drive for desktop keeps a Google-native file in a synced folder as a small file of its own,
// `Brief.gdoc`, `Budget.gsheet`, `Deck.gslides`, holding the document's address. A project folder on a
// synced drive therefore already carries every document the team put beside its emails and frames, and
// the board reads those files and shows each as a card that opens the document in Google. A document
// that lives elsewhere is added as a link file of the board's own, `docs/<name>.link.json`.
//
// Pure. No Google sign-in and no API: that is a later step (docs/projects.md, "Google Docs, Sheets and
// Slides"), and this is the part of it that costs nothing.

export type DocKind = 'doc' | 'sheet' | 'slides' | 'drawing' | 'form' | 'link';

export interface DocLink {
  kind: DocKind;
  /** The file's name without its extension, or the name the link file gives. */
  name: string;
  url: string;
  /** Google's id for the document, when the address carries one. */
  id: string | null;
}

/** The files Drive for desktop writes for Google-native documents, by what each opens. */
const DRIVE_EXTS: Array<[string, DocKind]> = [
  ['.gdoc', 'doc'],
  ['.gsheet', 'sheet'],
  ['.gslides', 'slides'],
  ['.gdraw', 'drawing'],
  ['.gform', 'form'],
];

/** The board's own link file: a name, an address, and what kind of thing is at it. */
export const LINK_EXT = '.link.json';
/** Where link files are written, and one of the folders documents are looked for in. */
export const DOCS_DIR = 'docs';

export const DOC_KIND_NAMES: Record<DocKind, string> = {
  doc: 'Google Doc',
  sheet: 'Google Sheet',
  slides: 'Google Slides',
  drawing: 'Google Drawing',
  form: 'Google Form',
  link: 'Link',
};

/** Where each kind opens, for the card. */
export const DOC_OPENS_IN: Record<DocKind, string> = {
  doc: 'Google Docs',
  sheet: 'Google Sheets',
  slides: 'Google Slides',
  drawing: 'Google Drawings',
  form: 'Google Forms',
  link: 'the browser',
};

const driveKindOf = (fileName: string): DocKind | null => {
  const lower = fileName.toLowerCase();
  return DRIVE_EXTS.find(([ext]) => lower.endsWith(ext))?.[1] ?? null;
};

export const isLinkFile = (fileName: string): boolean => fileName.toLowerCase().endsWith(LINK_EXT);

/** Whether a file is one the board shows as a document. */
export const isDocFile = (fileName: string): boolean => !fileName.startsWith('.') && (driveKindOf(fileName) !== null || isLinkFile(fileName));

/** `Spring brief.gdoc` → `Spring brief`; `spring-brief.link.json` → `spring brief`. */
export function docDisplayName(fileName: string): string {
  const drive = DRIVE_EXTS.find(([ext]) => fileName.toLowerCase().endsWith(ext));
  if (drive) return fileName.slice(0, -drive[0].length);
  if (isLinkFile(fileName)) return fileName.slice(0, -LINK_EXT.length).replace(/[-_]+/g, ' ');
  return fileName;
}

/** What a Google address opens: the product is in the path. Anything else is a plain link. */
export function docKindOfUrl(url: string): DocKind {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'link';
  }
  if (!/(^|\.)google\.com$/.test(u.hostname)) return 'link';
  const path = u.pathname;
  if (u.hostname === 'docs.google.com') {
    if (path.startsWith('/document/')) return 'doc';
    if (path.startsWith('/spreadsheets/')) return 'sheet';
    if (path.startsWith('/presentation/')) return 'slides';
    if (path.startsWith('/drawings/')) return 'drawing';
    if (path.startsWith('/forms/')) return 'form';
  }
  return 'link';
}

/** Google's document id from its address: the segment after `/d/`, or an `id` parameter. */
export function docIdOf(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const m = u.pathname.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  if (m) return m[1]!;
  const id = u.searchParams.get('id');
  return id && /^[A-Za-z0-9_-]{10,}$/.test(id) ? id : null;
}

const isWebAddress = (value: unknown): value is string => typeof value === 'string' && /^https?:\/\//i.test(value) && value.length < 4000;

/**
 * A document file's contents, read as a link. Drive's files carry `url` and `doc_id`; the board's own carry
 * `url`, `name` and `kind`. Anything without a usable address is nothing, so a half-synced file is skipped
 * rather than shown as a card that opens nowhere.
 */
export function readDocLink(raw: string, fileName: string): DocLink | null {
  type Raw = { url?: unknown; doc_id?: unknown; name?: unknown; kind?: unknown };
  let value: Raw | null = null;
  try {
    value = raw ? (JSON.parse(raw) as Raw) : null;
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const drive = driveKindOf(fileName);
  let url = isWebAddress(value.url) ? value.url : null;
  if (!url && drive && typeof value.doc_id === 'string' && /^[A-Za-z0-9_-]{10,}$/.test(value.doc_id)) {
    const product = { doc: 'document', sheet: 'spreadsheets', slides: 'presentation', drawing: 'drawings', form: 'forms', link: 'file' }[drive];
    url = `https://docs.google.com/${product}/d/${value.doc_id}/edit`;
  }
  if (!url) return null;
  const kinds: DocKind[] = ['doc', 'sheet', 'slides', 'drawing', 'form', 'link'];
  const kind = drive ?? (typeof value.kind === 'string' && (kinds as string[]).includes(value.kind) ? (value.kind as DocKind) : docKindOfUrl(url));
  const given = typeof value.name === 'string' ? value.name.trim().slice(0, 80) : '';
  return { kind, name: (drive ? '' : given) || docDisplayName(fileName), url, id: docIdOf(url) };
}

/** The board's link file for an address. The kind is worked out from the address unless given. */
export function docLinkJson(link: { url: string; name: string; kind?: DocKind }, now = Date.now()): string {
  const kind = link.kind ?? docKindOfUrl(link.url);
  return `${JSON.stringify({ version: 1, kind, name: link.name.trim().slice(0, 80), url: link.url.trim(), addedAt: now }, null, 2)}\n`;
}

/** `Spring brief` → `spring-brief.link.json`, or `spring-brief-2.link.json` when that is taken. */
export function docLinkFileName(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((t) => t.toLowerCase()));
  const slug =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'link';
  let file = slug + LINK_EXT;
  for (let n = 2; used.has(file.toLowerCase()); n += 1) file = `${slug}-${n}${LINK_EXT}`;
  return file;
}
