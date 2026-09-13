// The `.scug` launch file: what a project folder holds so Finder can open it in the installed app.
//
// Defended: a launch file reads back as written and carries the project's id; anything else reads as nothing;
// the file is named for the project in a way every file system takes; a plan writes it only when told the
// page to name; and the README says what the file is for.

import { describe, expect, it } from 'vitest';

import { planProject, projectType } from '../src/model/project-types.ts';
import { isLauncherFile, LAUNCHER_EXT, launcherFileName, launcherJson, newProjectInfo, readLauncher } from '../src/model/project.ts';

const info = newProjectInfo('Spring launch', 'project:abc', 7);

describe('the launch file', () => {
  it('round-trips the project id, name and page', () => {
    const text = launcherJson(info, 'https://example.test/project.html');
    expect(readLauncher(text)).toEqual({ version: 1, id: 'project:abc', name: 'Spring launch', open: 'https://example.test/project.html' });
    expect(text).toContain('Double-click this file');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('reads garbage, other JSON and an idless file as nothing', () => {
    expect(readLauncher(null)).toBeNull();
    expect(readLauncher('')).toBeNull();
    expect(readLauncher('{not json')).toBeNull();
    expect(readLauncher(JSON.stringify({ version: 1, id: 'project:abc', name: 'x' }))).toBeNull(); // a project.json
    expect(readLauncher(JSON.stringify({ scug: 1, name: 'x' }))).toBeNull();
    expect(readLauncher(JSON.stringify({ scug: 2, id: 'project:abc' }))).toBeNull();
  });

  it('fills in a name and page when the file has none', () => {
    expect(readLauncher(JSON.stringify({ scug: 1, id: 'project:abc' }))).toEqual({ version: 1, id: 'project:abc', name: 'Project', open: '' });
  });

  it('is named for the project, as a file name any file system takes', () => {
    expect(launcherFileName('Spring launch')).toBe('Spring launch.scug');
    expect(launcherFileName('  a/b:c*d?  ')).toBe('a b c d.scug');
    expect(launcherFileName('...')).toBe('Project.scug');
    expect(launcherFileName('x'.repeat(100)).length).toBe(80 + LAUNCHER_EXT.length);
    expect(isLauncherFile('Spring launch.scug')).toBe(true);
    expect(isLauncherFile('SPRING.SCUG')).toBe(true);
    expect(isLauncherFile('.hidden.scug')).toBe(false);
    expect(isLauncherFile('project.json')).toBe(false);
  });

  it('is written by a plan only when the page to open is given', () => {
    const without = planProject(projectType('blank')!, 'Spring launch', { id: 'project:t', newId: () => 'f', now: 7 });
    expect(without.files.some((f) => f.path.endsWith(LAUNCHER_EXT))).toBe(false);

    const withIt = planProject(projectType('blank')!, 'Spring launch', { id: 'project:t', newId: () => 'f', now: 7, launcherUrl: 'https://example.test/p.html' });
    const file = withIt.files.find((f) => f.path.endsWith(LAUNCHER_EXT));
    expect(file?.path).toBe('Spring launch.scug');
    expect(readLauncher(file!.text)).toMatchObject({ id: 'project:t', name: 'Spring launch', open: 'https://example.test/p.html' });
    expect(withIt.files.find((f) => f.path === 'README.md')!.text).toContain('Spring launch.scug');
  });
});
