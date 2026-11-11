// The HubSpot desk's logic: its way to HubSpot (desk/hubspot.ts) and its drift check (desk/compare.ts).
//
// *2026-11-11.* Jared: "Create an artifact of the template studio to run in Claude that works directly with hubspot
// to manage templates." Asked about writes: drafts, each confirmed.
//
// Defended: every runtime failure maps to the one thing that fixes it, never one catch-all; the template list pages
// to the end; a draft goes out only as the exact operation the confirmation showed, with the confirmation, uncached;
// HubSpot's copy matches its own design, and a one-word edit in Design Manager shows as one line; a design comes
// from a file's comment or from attached files, folder system and all; a replacement names the fields it would
// orphan.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { completeDesignSystem, type DesignSystem } from '../src/model/design-system.ts';
import { materialiseFolderSystem } from '../src/model/edit.ts';
import { localSources, planPackage } from '../src/model/export-package.ts';
import { withoutDesign } from '../src/compile/embed.ts';
import { migrate } from '../src/model/schema.ts';
import type { Template } from '../src/model/types.ts';
import { buildFile, compareWithBuild, designFromFiles, designInside, fieldChanges, foldDiff, lineDiff, packLike } from '../src/desk/compare.ts';
import { DEFAULT_DESIGN_SYSTEM } from '../src/model/design-system.ts';
import { createDraft, draftOperation, draftProblems, explain, listFromAddresses, listTemplates, payloadOf, pollDraft, SERVER, TOOL, type DraftRequest, type McpLike } from '../src/desk/hubspot.ts';

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const read = (p: string) => readFileSync(at(p), 'utf8');
const shipped: Record<string, DesignSystem> = {
  switchyards: completeDesignSystem(JSON.parse(read('design-systems/switchyards.system.json'))),
  card: completeDesignSystem(JSON.parse(read('design-systems/card.system.json'))),
};
const opened = (file: string): Template => materialiseFolderSystem(migrate(JSON.parse(read(`templates/${file}`))), shipped).template;

/** A connector that answers from a script and remembers every call. */
function fake(answer: (op: Record<string, unknown>) => unknown) {
  const calls: Array<{ server: string; tool: string; input: Record<string, unknown>; options: unknown }> = [];
  const mcp: McpLike = {
    async callTool(server, tool, input, options) {
      calls.push({ server, tool, input: input as Record<string, unknown>, options });
      const op = (input as { operation: Record<string, unknown> }).operation;
      const out = answer(op);
      if (out instanceof Error || (out && typeof out === 'object' && 'code' in (out as object))) throw out;
      return { payload: out };
    },
  };
  return { mcp, calls };
}

describe('the way to HubSpot', () => {
  it('maps each failure to what fixes it', () => {
    const kinds = ['not_granted', 'server_not_connected', 'needs_reauth', 'selection_required', 'not_in_manifest', 'approval_required', 'blocked_by_policy', 'server_unavailable', 'something_new'].map((code) => explain({ code }).kind);
    expect(kinds).toEqual(['no-runtime', 'add-connector', 'reconnect', 'choose-connector', 'not-allowed', 'needs-approval', 'blocked', 'busy', 'other']);
    expect(new Set(kinds.slice(0, 8)).size).toBe(8);
  });

  it('tells a missing HubSpot permission from any other refusal, and keeps HubSpot’s words', () => {
    const scope = explain({ code: 'tool_error', message: "This tool needs permissions that the HubSpot connection doesn't have: settings.users.teams.read" });
    expect(scope.kind).toBe('scope');
    expect(scope.detail).toContain('settings.users.teams.read');
    const refused = explain({ code: 'tool_error', message: '{"message":"Template not found"}' });
    expect(refused).toMatchObject({ kind: 'refused', detail: 'Template not found' });
  });

  it('marks a failure retryable only when the runtime did', () => {
    expect(explain({ code: 'server_unavailable', retryable: true }).retryable).toBe(true);
    expect(explain({ code: 'server_unavailable' }).retryable).toBe(false);
  });

  it('reads the payload however the runtime delivers it', () => {
    expect(payloadOf({ payload: { a: 1 } })).toEqual({ a: 1 });
    expect(payloadOf({ content: [{ type: 'text', text: '{"a":2}' }] })).toEqual({ a: 2 });
    expect(payloadOf({ content: [{ type: 'text', text: 'not json' }] })).toEqual({});
  });

  it('lists every coded template, a page at a time, on the HubSpot connector', async () => {
    const all = Array.from({ length: 230 }, (_, i) => ({ templateId: i, path: `Email design/t${i}.html`, label: `t${i}.html` }));
    const { mcp, calls } = fake((op) => {
      const offset = op['offset'] as number;
      const limit = op['limit'] as number;
      return { templates: all.slice(offset, offset + limit), hasMore: offset + limit < all.length };
    });
    const got = await listTemplates(mcp);
    expect(got).toHaveLength(230);
    expect(calls.map((c) => c.input['operation'])).toEqual([0, 100, 200].map((offset) => ({ _type: 'LIST_TEMPLATES', emailTemplateType: 'CODED', limit: 100, offset })));
    expect(calls.every((c) => c.server === SERVER && c.tool === TOOL)).toBe(true);
  });

  it('takes the from addresses in either shape, and fails with the scope it lacks', async () => {
    expect(await listFromAddresses(fake(() => ({ fromAddresses: [{ email: 'a@b.co', name: 'A' }, 'c@d.co', { email: 'nope' }] })).mcp)).toEqual([
      { email: 'a@b.co', name: 'A' },
      { email: 'c@d.co', name: '' },
    ]);
    const { mcp } = fake(() => ({ code: 'tool_error', message: 'needs permissions: crm.objects.owners.read' }));
    await expect(listFromAddresses(mcp)).rejects.toMatchObject({ code: 'tool_error' });
  });
});

describe('a draft email', () => {
  const req: DraftRequest = {
    name: ' 2026-11 · Members ',
    subject: 'What’s new',
    previewText: '',
    fromName: 'Switchyards',
    replyToEmail: 'hello@example.com',
    subscriptionTypeId: 11,
    emailType: 'BATCH',
    templatePath: 'Email design/Basic Template.html',
  };

  it('names everything missing before it can be asked for', () => {
    expect(draftProblems(req)).toEqual([]);
    const empty = draftProblems({ ...req, name: ' ', subject: '', fromName: '', replyToEmail: 'not an address', subscriptionTypeId: 0, templatePath: '' });
    expect(empty).toHaveLength(6);
  });

  it('goes out as the exact operation the confirmation shows, confirmed and uncached', async () => {
    const { mcp, calls } = fake(() => ({ status: 'CREATION_PENDING', marketingEmailId: 777, readinessWarnings: ['No recipients yet'] }));
    const out = await createDraft(mcp, req);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.input).toEqual({ operation: draftOperation(req), confirmationStatus: 'CONFIRMED' });
    expect(calls[0]!.options).toEqual({ cache: false });
    expect(draftOperation(req)).toEqual({ _type: 'CREATE', name: '2026-11 · Members', subject: 'What’s new', fromName: 'Switchyards', replyToEmail: 'hello@example.com', subscriptionTypeId: 11, emailType: 'BATCH', templatePath: 'Email design/Basic Template.html' });
    expect(out).toMatchObject({ pending: true, contentId: 777, warnings: ['No recipients yet'] });
  });

  it('carries preview text only when there is some', () => {
    expect(draftOperation({ ...req, previewText: '  A line ' })['previewText']).toBe('A line');
    expect('previewText' in draftOperation(req)).toBe(false);
  });

  it('polls until HubSpot has made it', async () => {
    const { mcp } = fake(() => ({ marketingEmailObjectId: 888 }));
    expect(await pollDraft(mcp, 777)).toMatchObject({ pending: false, objectId: 888, contentId: 777 });
  });
});

describe('the drift check', () => {
  const date = '2026-11-05';
  const exported = (t: Template, embedDesign = true) => compile(t, { mode: 'hubl', date, embedDesign, by: '0.10.0' }).html;

  it('finds HubSpot’s copy the same as its own design, for every fixture', () => {
    for (const file of ['standard-email.template.json', 'card-email.template.json', 'baseline.template.json']) {
      const source = exported(opened(file));
      const inside = designInside(source);
      if (!inside || !inside.ok) throw new Error(`no design in ${file}`);
      expect(compareWithBuild(source, inside.design, '2026-12-01')).toMatchObject({ same: true, date });
    }
  });

  it('shows a word changed in Design Manager as the one line it is on', () => {
    const source = exported(opened('standard-email.template.json'));
    const edited = source.replace('Switchyards</p>', 'The Switchyards team</p>');
    expect(edited).not.toBe(source);
    const inside = designInside(edited);
    if (!inside || !inside.ok) throw new Error('no design');
    const result = compareWithBuild(edited, inside.design, date);
    expect(result).toMatchObject({ same: false, removed: 1, added: 1 });
    expect(result.diff?.find((d) => d.k === 'del')?.text).toContain('The Switchyards team');
  });

  it('matches an older export to the design attached for it, its folder system included', () => {
    const t = opened('card-email.template.json');
    const old = exported(t, false);
    expect(designInside(old)).toBeNull();
    const files = [{ name: 'card-email.template.json', text: read('templates/card-email.template.json') }];
    const got = designFromFiles(files, shipped);
    if (!got.ok) throw new Error(got.reason);
    expect(compareWithBuild(old, got.design, date).same).toBe(true);
    // Without the card system the same file compiles against the defaults, says so, and differs.
    const bare = designFromFiles(files, {});
    if (!bare.ok) throw new Error(bare.reason);
    expect(bare.design.warnings.join(' ')).toContain('card');
    expect(compareWithBuild(old, bare.design, date).same).toBe(false);
    // An attached system wins over the shipped one of the same name.
    const attached = designFromFiles([...files, { name: 'card.system.json', text: read('design-systems/card.system.json') }], {});
    if (!attached.ok) throw new Error(attached.reason);
    expect(compareWithBuild(old, attached.design, date).same).toBe(true);
  });

  it('sees through the packed export, whose pictures point at HubSpot-hosted copies', () => {
    const t = structuredClone(opened('baseline.template.json'));
    const image = t.sections.flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks))).find((b) => b.type === 'image');
    if (!image || image.type !== 'image') throw new Error('baseline has an image');
    image.src = 'photos/hero.png';
    // What Export writes when the folder has the picture: the template pointing at the copy packed beside it.
    const packed = planPackage(exported(t)).html;
    expect(packed).toContain("get_asset_url('./images/hero.png')");
    const inside = designInside(packed);
    if (!inside || !inside.ok) throw new Error('no design');
    expect(compareWithBuild(packed, inside.design, date)).toMatchObject({ same: true, packed: true });
    // And what Copy writes, which leaves the name as it is.
    expect(compareWithBuild(exported(t), inside.design, date)).toMatchObject({ same: true, packed: false });
  });

  it('refuses files that are not a design, and says which', () => {
    expect(designFromFiles([{ name: 'x.json', text: '{nope' }], shipped)).toMatchObject({ ok: false });
    expect(designFromFiles([{ name: 'x.json', text: '{"hello":1}' }], shipped)).toMatchObject({ ok: false });
    expect(designFromFiles([{ name: 'card.system.json', text: read('design-systems/card.system.json') }], shipped)).toMatchObject({ ok: false, reason: expect.stringContaining('No template') });
  });

  it('reads version one’s designs too', () => {
    const got = designFromFiles([{ name: 'v1.design.json', text: read('reference/v1-standard-email.design.json') }], shipped);
    expect(got.ok).toBe(true);
  });

  it('builds the replacement with the design inside, and names the fields it would orphan', () => {
    const t = opened('standard-email.template.json');
    const source = exported(t, false);
    const files = [{ name: 's.template.json', text: read('templates/standard-email.template.json') }];
    const got = designFromFiles(files, shipped);
    if (!got.ok) throw new Error(got.reason);
    const file = buildFile(got.design, { date: '2026-11-11', by: '0.10.0' });
    expect(designInside(file)).toMatchObject({ ok: true });
    expect(fieldChanges(source, file)).toEqual({ lost: [], changed: [], added: [] });
    const renamed = source.replace(/"button_link"/g, '"cta_link"').replace(/widget_data\.button_link\./g, 'widget_data.cta_link.');
    expect(fieldChanges(renamed, file)).toEqual({ lost: ['cta_link'], changed: [], added: ['button_link'] });
  });

  it('diffs by line and folds the long unchanged runs', () => {
    const a = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const b = a.replace('line 10', 'line ten');
    const diff = lineDiff(a, b)!;
    expect(diff.filter((d) => d.k !== 'same')).toEqual([
      { k: 'del', text: 'line 10' },
      { k: 'add', text: 'line ten' },
    ]);
    const folded = foldDiff(diff);
    expect(folded[0]).toEqual({ k: 'gap', count: 8 });
    expect(folded.at(-1)).toEqual({ k: 'gap', count: 7 });
    expect(lineDiff('a', 'b', 0)).toBeNull();
  });

  it('names a field that keeps its name but changes kind, which loses its content too', () => {
    const before = `{% linked_image "hero" label="Hero", src="", alt="", width="560", export_to_template_context=True %}{{ unsubscribe_link }}`;
    const after = `{% module "hero" path="@hubspot/image_email", label="Hero", img={ "src": "", "alt": "", "width": 560 }, export_to_template_context=True %}`;
    expect(fieldChanges(before, after)).toEqual({ lost: [], changed: ['hero'], added: [] });
  });

  it('packs the replacement as HubSpot’s copy was packed, only the pictures it shipped', () => {
    const t = structuredClone(opened('baseline.template.json'));
    const images = t.sections.flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks))).filter((b) => b.type === 'image');
    if (images.length < 2 || images[0]!.type !== 'image' || images[1]!.type !== 'image') throw new Error('baseline has two images');
    images[0]!.src = 'photos/hero.png';
    images[1]!.src = 'photos/team.png';
    // The folder had hero.png and not team.png, so Export packed one and left the other a name.
    const portal = planPackage(exported(t), (src) => src === 'photos/hero.png').html;
    const inside = designInside(portal);
    if (!inside || !inside.ok) throw new Error('no design');
    expect(compareWithBuild(portal, inside.design, date)).toMatchObject({ same: true, packed: true });
    const replacement = packLike(buildFile(inside.design, { date: '2026-11-11', by: '0.10.0' }), portal);
    expect(replacement).toContain("get_asset_url('./images/hero.png')");
    // Outside the design comment, which keeps the folder's own names, only the unshipped picture is still a name.
    expect(localSources(withoutDesign(replacement))).toEqual(['photos/team.png']);
  });

  it('refuses two templates at once, and warns when it compares against its own copy of a folder system', () => {
    const two = designFromFiles(
      [
        { name: 'a.template.json', text: read('templates/card-email.template.json') },
        { name: 'b.template.json', text: read('templates/standard-email.template.json') },
      ],
      shipped,
    );
    expect(two).toMatchObject({ ok: false, reason: expect.stringContaining('one template at a time') });
    const one = designFromFiles([{ name: 'card-email.template.json', text: read('templates/card-email.template.json') }], shipped);
    expect(one.ok && one.design.warnings.join(' ')).toContain('card.system.json');
  });

  it('diffs a long file with one edit, and gives no counts it cannot stand behind', () => {
    const long = Array.from({ length: 6000 }, (_, i) => `line ${i}`).join('\n');
    const diff = lineDiff(long, long.replace('line 3000', 'line three thousand'));
    expect(diff?.filter((d) => d.k !== 'same')).toHaveLength(2);
    const t = opened('standard-email.template.json');
    const inside = designInside(exported(t));
    if (!inside || !inside.ok) throw new Error('no design');
    const scrambled = Array.from({ length: 3000 }, (_, i) => `noise ${i}`).join('\n');
    const result = compareWithBuild(scrambled, inside.design, date);
    expect(result.same).toBe(false);
    expect(result.diff).toBeNull();
    expect(Number.isNaN(result.removed)).toBe(true);
  });

  it('refuses a design inside that parses but no longer compiles', () => {
    const source = exported(opened('standard-email.template.json'));
    const stub = source.replace(/\n\{"by"[^\n]*\n#\}/, '\n{"format":1,"template":{"name":"x"}}\n#}');
    expect(stub).not.toBe(source);
    expect(designInside(stub)).toMatchObject({ ok: false });
  });

  it('reopens a design in the key order it compiled with, so its dark-mode rules come out in the same order', () => {
    const t = structuredClone(opened('baseline.template.json'));
    const ds = structuredClone(DEFAULT_DESIGN_SYSTEM);
    ds.type['h1'] = { ...ds.type['h1']!, color: '#d10000' };
    ds.type['body'] = { ...ds.type['body']!, color: '#011272' };
    t.ds = ds;
    const source = exported(t);
    const inside = designInside(source);
    if (!inside || !inside.ok) throw new Error('no design');
    expect(compareWithBuild(source, inside.design, date).same).toBe(true);
  });
});
