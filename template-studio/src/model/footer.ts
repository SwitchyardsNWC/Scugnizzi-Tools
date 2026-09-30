// One footer, five types.
//
// Jared, 2026-09-30: "make just one footer block, you drop than choose the type." The palette used to offer five
// footer cards and a sixth under Fixed, which were one block — the legal footer — in five arrangements
// (compile/blocks/legal.ts). Now there is one card, it lands as the masthead, and the type is chosen on the footer
// itself: from the menu on its name on the canvas, or from Type in the inspector.
//
// A type is more than `layout`. The Switchyards footers own the red rules either side of their band, sit on a
// preset of their own (the letterhead on cream, the rest on navy), and start from their own logo, note and mark.
// So choosing one rebuilds the footer — its band and the rules that belong to it — from that type, and carries
// over what somebody set on the old one: the social addresses, the switches, and any words or picture that are
// not simply the old type's defaults. The note's HubSpot field keeps its name, since an email may already be
// bound to it (learnings 1.10). Pure.

import { createSection } from './catalog.ts';
import { cloneSection, designSystemOf, freshIds, siteOf, takenFieldNames } from './edit.ts';
import { sequentialIds } from './ids.ts';
import { footerSections } from './switchyards.ts';
import { FOOTER_TYPES, footerTypeOf } from './footer-types.ts';
import type { DesignSystem } from './design-system.ts';
import type { LegalBlock, LegalLayout, Section, Template } from './types.ts';

export { DEFAULT_FOOTER, FOOTER_TYPES, footerTypeName, footerTypeOf, type FooterType } from './footer-types.ts';

/** A footer of one type, on a design system, with ids of its own. Clone it before it goes into a template. */
export function makeFooter(type: LegalLayout, ds: DesignSystem): Section[] {
  if (type === 'classic') return [createSection('legal', { id: sequentialIds(), taken: new Set<string>() }, ds)];
  return footerSections(type, ds);
}

/**
 * One of the rules a Switchyards footer draws above or below its band: a section holding one stripes block and
 * nothing else, running to the window's edge as a footer's rules do. The header's rule stops at the email's width,
 * so it is never mistaken for one.
 */
function isFooterRule(section: Section | undefined): boolean {
  if (!section || !section.bleed || section.pattern) return false;
  const row = section.rows.length === 1 ? section.rows[0] : undefined;
  const column = row && row.columns.length === 1 ? row.columns[0] : undefined;
  return Boolean(column && column.blocks.length === 1 && column.blocks[0]!.type === 'stripes');
}

/** The sections a footer is made of, by index: its band, and the rule on either side of it that is its own. */
export function footerExtent(template: Template, sectionId: string): { from: number; to: number } | null {
  const at = template.sections.findIndex((s) => s.id === sectionId);
  if (at < 0) return null;
  return {
    from: isFooterRule(template.sections[at - 1]) ? at - 1 : at,
    to: isFooterRule(template.sections[at + 1]) ? at + 1 : at,
  };
}

/** The settings a footer carries from one type to the next, when they are not the old type's defaults. */
const CARRIED = ['logoSrc', 'logoWidth', 'note', 'mark', 'instagram', 'youtube', 'linkedin', 'socialIcons', 'socialsFirst', 'hidePreferences'] as const;

/** Blank, absent and off are the same thing for a footer setting. */
const settled = (value: unknown): unknown => (value === undefined || value === null || value === false || value === '' ? '' : value);

const legalIn = (sections: Section[]): { section: Section; block: LegalBlock } | null => {
  for (const section of sections) {
    for (const row of section.rows) {
      for (const column of row.columns) {
        for (const block of column.blocks) if (block.type === 'legal') return { section, block };
      }
    }
  }
  return null;
};

/**
 * The footer holding `blockId`, rebuilt as `type`. Returns the template unchanged, with the same block id, when
 * the block is not a footer or is already that type.
 */
export function setFooterType(template: Template, blockId: string, type: LegalLayout): { template: Template; blockId: string; sectionId: string } {
  const unchanged = { template, blockId, sectionId: '' };
  const site = siteOf(template, blockId);
  const old = site?.column.blocks[site.index];
  if (!site || old?.type !== 'legal') return unchanged;
  unchanged.sectionId = site.section.id;
  const was = footerTypeOf(old);
  if (was === type || !FOOTER_TYPES.some((t) => t.id === type)) return unchanged;
  const extent = footerExtent(template, site.section.id);
  if (!extent) return unchanged;

  const ds = designSystemOf(template);
  const before = legalIn(makeFooter(was, ds));

  // The new footer's fields are allocated against every name in the template except the old footer's own, which
  // is going and whose note keeps its name.
  const own = new Set([old.noteLock.field].filter(Boolean));
  const taken = new Set([...takenFieldNames(template)].filter((f) => !own.has(f)));
  const nextId = freshIds(template);
  const made = makeFooter(type, ds).map((s) => cloneSection(s, nextId, taken));
  const after = legalIn(made);
  if (!after) return unchanged;

  const block: LegalBlock = { ...after.block, noteLock: old.noteLock };
  const loose = block as unknown as Record<string, unknown>;
  const was_ = old as unknown as Record<string, unknown>;
  const defaults = (before?.block ?? {}) as unknown as Record<string, unknown>;
  for (const key of CARRIED) {
    if (settled(was_[key]) === settled(defaults[key])) continue;
    if (was_[key] === undefined) delete loose[key];
    else loose[key] = was_[key];
  }
  // Full width follows the old band when somebody changed it. The band only: the rules keep running to the edge,
  // which is also what lets the next change of type find them.
  const band: Section = {
    ...after.section,
    rows: after.section.rows.map((row) => ({
      ...row,
      columns: row.columns.map((column) => ({ ...column, blocks: column.blocks.map((b) => (b.type === 'legal' ? block : b)) })),
    })),
  };
  if (settled(site.section.bleed) !== settled(before?.section.bleed)) {
    if (site.section.bleed) band.bleed = true;
    else delete band.bleed;
  }
  const sections = made.map((section) => (section.id === band.id ? band : section));

  const next = [...template.sections];
  next.splice(extent.from, extent.to - extent.from + 1, ...sections);
  return { template: { ...template, sections: next }, blockId: block.id, sectionId: after.section.id };
}
