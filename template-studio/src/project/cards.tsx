// The bodies of the board's cards: the whole email at its own width, a frame's drawing or print, a document's
// glyph. Moved out of Board.tsx as they were (learnings 3.78).

import { useMemo } from 'preact/hooks';
import { freeformSvg } from '../compile/freeform.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../model/design-system.ts';
import { DOC_KIND_NAMES, type DocKind } from '../model/docs.ts';
import type { AssetFile } from '../workspace/workspace.ts';
import { withLocalAssets, withoutMissingPictures } from '../app/local-assets.ts';
import { withPrints } from '../app/printed-preview.ts';
import { EMAIL_PAGE } from './board-helpers.ts';
import type { EmailItem, FrameItem, DocItem } from './files.ts';

// --- card bodies ------------------------------------------------------------------------------------------------

/**
 * How tall an email's document is: the bottom of everything in its body, plus the body's own padding and margin
 * below. Not the document's scroll height, which is never less than the iframe it is shown in, and would keep a
 * short email from ever coming down to its own length. Null when the document cannot be read or is empty.
 */
export function documentHeight(frame: HTMLIFrameElement): number | null {
  const doc = frame.contentDocument;
  if (!doc?.body) return null;
  const range = doc.createRange();
  range.selectNodeContents(doc.body);
  const style = doc.defaultView?.getComputedStyle(doc.body);
  const below = (parseFloat(style?.paddingBottom ?? '0') || 0) + (parseFloat(style?.marginBottom ?? '0') || 0);
  const height = Math.ceil(range.getBoundingClientRect().bottom + below);
  return height > 40 ? height : null;
}

/** The whole email, laid out at its own width and scaled to the card. Tells the board its height once it has one, and again when its fonts land. */
export function EmailBody({ item, assets, prints, live, width, height, onHeight }: { item: EmailItem; assets: AssetFile[]; prints: Record<string, { url: string }> | undefined; live: boolean; width: number; height: number; onHeight(px: number): void }) {
  // A page with effects shows its print in its drawing's place, as on Template Studio's canvas (printed-preview.ts).
  const html = useMemo(() => (item.html && live ? withLocalAssets(prints && item.template ? withPrints(item.html, item.template, prints) : item.html, assets) : ''), [item.html, item.template, prints, assets, live]);
  if (item.error) return <div class="pb-card-note">{item.error}</div>;
  if (!live) return <div class="pb-card-skeleton" />;
  const scale = width / EMAIL_PAGE;
  const measure = (frame: HTMLIFrameElement) => {
    const px = documentHeight(frame);
    if (px) onHeight(px);
  };
  return (
    <iframe
      class="pb-email-frame"
      title={item.name}
      srcdoc={html}
      sandbox="allow-same-origin"
      tabIndex={-1}
      style={{ width: EMAIL_PAGE, height: height / scale, transform: `scale(${scale})` }}
      onLoad={(e) => {
        const frame = e.currentTarget;
        measure(frame);
        void frame.contentDocument?.fonts?.ready.then(() => measure(frame));
      }}
    />
  );
}

export function FrameBody({ item, assets, print, width, height }: { item: FrameItem; assets: AssetFile[]; print: string | undefined; width: number; height: number }) {
  const page = item.frame?.page;
  const ds = item.template.ds ?? DEFAULT_DESIGN_SYSTEM;
  const svg = useMemo(() => (page && !print ? withoutMissingPictures(withLocalAssets(freeformSvg(page, ds), assets)) : ''), [page, ds, assets, print]);
  if (!page) return <div class="pb-card-note">This frame could not be drawn.</div>;
  const pad = 16;
  const fitZ = Math.min((width - pad * 2) / page.width, (height - pad * 2) / page.height);
  const w = Math.max(1, Math.round(page.width * fitZ));
  const h = Math.max(1, Math.round(page.height * fitZ));
  return (
    <div class="pb-frame-thumb">
      <div class="pb-frame-page" style={{ width: w, height: h, background: item.frame?.ground }}>
        {print ? <img src={print} alt="" draggable={false} /> : <span dangerouslySetInnerHTML={{ __html: svg }} />}
      </div>
    </div>
  );
}

/**
 * A document: what it is and where it opens, with a glyph for the kind. Not a preview: a Google document cannot
 * be drawn here without signing in to Google, and a card that says plainly what it is beats a blank one that
 * tried (docs/projects.md, "Google Docs, Sheets and Slides").
 */
export function DocBody({ item }: { item: DocItem }) {
  const kind = item.link.kind;
  let host = '';
  try {
    host = new URL(item.link.url).hostname.replace(/^www\./, '');
  } catch {
    host = '';
  }
  return (
    <div class="pb-doc">
      <span class={`pb-doc-glyph ${kind}`} aria-hidden="true">
        <DocGlyph kind={kind} />
      </span>
      <span class="pb-doc-text">
        <span class="pb-doc-kind">{DOC_KIND_NAMES[kind]}</span>
        <span class="pb-doc-host">{host}</span>
      </span>
    </div>
  );
}

export function DocGlyph({ kind }: { kind: DocKind }) {
  const common = { viewBox: '0 0 32 40', width: 32, height: 40, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.25 } as const;
  if (kind === 'sheet') {
    return (
      <svg {...common}>
        <rect x="1.5" y="1.5" width="29" height="37" />
        <path d="M1.5 12.5h29M1.5 20.5h29M1.5 28.5h29M11.5 12.5v25.5M21.5 12.5v25.5" />
      </svg>
    );
  }
  if (kind === 'slides') {
    return (
      <svg {...common}>
        <rect x="1.5" y="1.5" width="29" height="37" />
        <rect x="6.5" y="12.5" width="19" height="13" />
        <path d="M11.5 31.5h9" />
      </svg>
    );
  }
  if (kind === 'drawing') {
    return (
      <svg {...common}>
        <rect x="1.5" y="1.5" width="29" height="37" />
        <path d="M8 30l6-12 5 7 3-4 3 9z" />
      </svg>
    );
  }
  if (kind === 'form') {
    return (
      <svg {...common}>
        <rect x="1.5" y="1.5" width="29" height="37" />
        <rect x="7.5" y="10.5" width="4" height="4" />
        <rect x="7.5" y="19.5" width="4" height="4" />
        <rect x="7.5" y="28.5" width="4" height="4" />
        <path d="M15.5 12.5h9M15.5 21.5h9M15.5 30.5h9" />
      </svg>
    );
  }
  if (kind === 'link') {
    return (
      <svg {...common}>
        <rect x="1.5" y="1.5" width="29" height="37" />
        <path d="M13 24l6-6M11 20l-2.5 2.5a3.5 3.5 0 0 0 5 5L16 25M21 22l2.5-2.5a3.5 3.5 0 0 0-5-5L16 17" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="1.5" y="1.5" width="29" height="37" />
      <path d="M8.5 11.5h15M8.5 17.5h15M8.5 23.5h15M8.5 29.5h9" />
    </svg>
  );
}
