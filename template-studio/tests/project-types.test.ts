// Project types: what Create a project writes.
//
// Defended: every type has an id of its own; each plan writes exactly the files its type says, under the
// project's name; the starter email follows the design system written beside it and compiles; starter frames
// are frame files at their sizes, with keys and file names of their own; project.json carries the type; and a
// project's folder name is one every file system takes.

import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile/compile.ts';
import { completeDesignSystem } from '../src/model/design-system.ts';
import { materialiseFolderSystem } from '../src/model/edit.ts';
import { readFrameFile } from '../src/model/frame-file.ts';
import { FRAME_PREFIX } from '../src/model/frame-store.ts';
import { planProject, PROJECT_TYPES, projectFolderName, projectType, type ProjectPlan } from '../src/model/project-types.ts';
import { readProjectInfo } from '../src/model/project.ts';
import { migrate } from '../src/model/schema.ts';
import type { FreeformBlock } from '../src/model/types.ts';

const plan = (id: string, name = 'Spring launch'): ProjectPlan => {
  let n = 0;
  return planProject(projectType(id)!, name, { id: 'project:test', newId: () => `id${(n += 1)}`, now: 7 });
};
const text = (p: ProjectPlan, path: string) => p.files.find((f) => f.path === path)?.text ?? null;
const frames = (p: ProjectPlan) =>
  p.files
    .filter((f) => f.path.startsWith('frames/'))
    .map((f) => {
      const frame = readFrameFile(f.text)!;
      const block = frame.template.sections[0]!.rows[0]!.columns[0]!.blocks[0] as FreeformBlock;
      return { path: f.path, key: frame.key, name: frame.name, size: [block.width, block.height], label: block.layers[0] };
    });

describe('project types', () => {
  it('each have an id of their own, a name and a line about them', () => {
    expect(new Set(PROJECT_TYPES.map((t) => t.id)).size).toBe(PROJECT_TYPES.length);
    for (const t of PROJECT_TYPES) expect(t.name && t.blurb).toBeTruthy();
    expect(projectType('nope')).toBeNull();
  });

  it('make an email project: the design system, an email that follows it, and a hero frame', () => {
    const p = plan('email');
    expect(p.folder).toBe('Spring launch');
    expect(p.folders).toEqual(['templates', 'frames', 'assets', 'design-systems', 'exports']);
    expect(p.files.map((f) => f.path)).toEqual([
      'project.json',
      'README.md',
      'design-systems/switchyards.system.json',
      'templates/spring-launch.template.json',
      'frames/email-hero.frame.json',
    ]);
    expect(readProjectInfo(text(p, 'project.json'))).toEqual({ version: 1, id: 'project:test', name: 'Spring launch', createdAt: 7, type: 'email' });

    const template = migrate(JSON.parse(text(p, 'templates/spring-launch.template.json')!));
    expect(template).toMatchObject({ name: 'Spring launch', designSystem: 'switchyards' });
    const systems = { switchyards: completeDesignSystem(JSON.parse(text(p, 'design-systems/switchyards.system.json')!)) };
    const { template: followed, warning } = materialiseFolderSystem(template, systems);
    expect(warning).toBeUndefined();
    expect(compile(followed, { mode: 'hubl' }).bytes).toBeGreaterThan(0);

    expect(frames(p)).toEqual([
      { path: 'frames/email-hero.frame.json', key: `${FRAME_PREFIX}id1`, name: 'Email hero', size: [600, 300], label: expect.objectContaining({ kind: 'text', text: 'Email hero', size: 43 }) },
    ]);
  });

  it('make social and print projects of frames at their sizes, with no emails', () => {
    expect(frames(plan('social')).map((f) => [f.name, ...f.size])).toEqual([
      ['Square post', 1080, 1080],
      ['Portrait post', 1080, 1350],
      ['Story', 1080, 1920],
      ['Landscape post', 1200, 628],
    ]);
    expect(frames(plan('print')).map((f) => [f.name, ...f.size])).toEqual([
      ['Poster', 1200, 1600],
      ['Flyer', 850, 1100],
      ['Postcard', 900, 600],
    ]);
    for (const id of ['social', 'print']) expect(plan(id).files.some((f) => f.path.startsWith('templates/'))).toBe(false);
  });

  it('give a campaign’s frames keys and file names of their own', () => {
    const f = frames(plan('campaign'));
    expect(f).toHaveLength(4);
    expect(new Set(f.map((x) => x.key)).size).toBe(4);
    expect(new Set(f.map((x) => x.path)).size).toBe(4);
  });

  it('make a blank project of folders and a README that says what goes where', () => {
    const p = plan('blank');
    expect(p.files.map((f) => f.path)).toEqual(['project.json', 'README.md']);
    expect(text(p, 'README.md')).toContain('Spring launch is a blank project');
    expect(text(p, 'README.md')).toContain('| `frames/` | Freeform frames, one file each |');
    expect(text(plan('email'), 'README.md')).toContain('is an email project');
  });

  it('name the folder so every file system takes it', () => {
    expect(projectFolderName('Spring / launch: 2026')).toBe('Spring launch 2026');
    expect(projectFolderName('  ..hidden  ')).toBe('hidden');
    expect(projectFolderName('   ')).toBe('New project');
    expect(projectFolderName('x'.repeat(200))).toHaveLength(80);
  });

  it('keeps project.json’s type when it is read, and drops one that is not a name', () => {
    expect(readProjectInfo('{"version":1,"id":"a","name":"A","createdAt":1,"type":"social"}')?.type).toBe('social');
    expect(readProjectInfo('{"version":1,"id":"a","name":"A","createdAt":1,"type":3}')).not.toHaveProperty('type');
  });
});
