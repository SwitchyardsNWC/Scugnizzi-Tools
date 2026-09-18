// The export package (model/export-package.ts).
//
// Defended: a local picture is one that is neither a URL, inline data nor HubL; the package finds each local
// picture once, names its copy safely and apart from the others, points the template at the copy with
// `get_asset_url` and leaves hosted pictures alone; a picture the folder cannot supply is left as it was and
// reported; and the README carries the CLI line and every picture.

import { describe, expect, it } from 'vitest';

import { assetUrl, isRemoteSrc, localSources, packageReadme, packagedName, planPackage } from '../src/model/export-package.ts';

const html = [
  '<img src="photos/Hero Shot.PNG" width="600">',
  '<img alt="logo" src="https://cdn.example.com/logo.png">',
  '<img src="rendered/lede.png">',
  '<img src="photos/Hero Shot.PNG">',
  '<img src="{{ module.image.src }}">',
  '<img src="data:image/gif;base64,R0lGOD">',
  '<img src="">',
].join('\n');

describe('the export package', () => {
  it('knows a remote source from a local one', () => {
    expect(isRemoteSrc('https://a.b/c.png')).toBe(true);
    expect(isRemoteSrc('//a.b/c.png')).toBe(true);
    expect(isRemoteSrc('data:image/png;base64,x')).toBe(true);
    expect(isRemoteSrc('{{ get_asset_url("./x.png") }}')).toBe(true);
    expect(isRemoteSrc('{% if x %}')).toBe(true);
    expect(isRemoteSrc('photos/hero.png')).toBe(false);
  });

  it('finds each local picture once, in order', () => {
    expect(localSources(html)).toEqual(['photos/Hero Shot.PNG', 'rendered/lede.png']);
  });

  it('names copies safely and keeps them apart', () => {
    expect(packagedName('photos/Hero Shot.PNG')).toBe('hero-shot.png');
    expect(packagedName('a/b/c/x.jpeg', ['x.jpeg'])).toBe('x-2.jpeg');
    expect(packagedName('a/b/c/x.jpeg', ['x.jpeg', 'x-2.jpeg'])).toBe('x-3.jpeg');
    expect(packagedName('???')).toBe('picture');
    expect(assetUrl('hero.png')).toBe("{{ get_asset_url('./images/hero.png') }}");
  });

  it('points the template at the copies and leaves hosted pictures alone', () => {
    const plan = planPackage(html);
    expect(plan.pictures).toEqual([
      { src: 'photos/Hero Shot.PNG', file: 'hero-shot.png' },
      { src: 'rendered/lede.png', file: 'lede.png' },
    ]);
    expect(plan.left).toEqual([]);
    expect(plan.html).toContain(`<img src="{{ get_asset_url('./images/hero-shot.png') }}" width="600">`);
    expect(plan.html).toContain(`<img src="{{ get_asset_url('./images/lede.png') }}">`);
    expect(plan.html).toContain('<img alt="logo" src="https://cdn.example.com/logo.png">');
    expect(plan.html).toContain('<img src="{{ module.image.src }}">');
    expect(plan.html).not.toContain('photos/Hero Shot.PNG');
  });

  it('packs the default picture of a HubSpot module too, as an expression', () => {
    const tag = `{% module "image" path="@hubspot/image_email", label="Image", img={ "src": "photos/test.png", "alt": "test", "width": 560 }, export_to_template_context=True %}`;
    const page = `<div>${tag}</div><img src="photos/test.png">`;
    expect(localSources(page)).toEqual(['photos/test.png']);
    const plan = planPackage(page);
    expect(plan.pictures).toEqual([{ src: 'photos/test.png', file: 'test.png' }]);
    expect(plan.html).toContain(`img={ "src": get_asset_url('./images/test.png'), "alt": "test", "width": 560 }`);
    expect(plan.html).toContain(`<img src="{{ get_asset_url('./images/test.png') }}">`);
    expect(planPackage(`{% module "x" path="@hubspot/image_email", img={ "src": "https://cdn.test/a.png" } %}`).pictures).toEqual([]);
  });

  it('leaves a picture the folder cannot supply as it was, and says which', () => {
    const plan = planPackage(html, (src) => src.startsWith('rendered/'));
    expect(plan.pictures).toEqual([{ src: 'rendered/lede.png', file: 'lede.png' }]);
    expect(plan.left).toEqual(['photos/Hero Shot.PNG']);
    expect(plan.html).toContain('<img src="photos/Hero Shot.PNG" width="600">');
  });

  it('writes a README with the CLI line and every picture', () => {
    const readme = packageReadme({
      name: 'Spring launch',
      slug: 'spring-launch',
      templateFile: 'spring-launch.html',
      pictures: [{ src: 'photos/hero.png', file: 'hero.png' }],
      exportedAt: new Date('2026-09-18T12:00:00Z'),
    });
    expect(readme).toContain('# Spring launch');
    expect(readme).toContain('hs upload spring-launch @hubspot/emails/spring-launch');
    expect(readme).toContain('| `photos/hero.png` | `images/hero.png` |');
    expect(readme).toContain('2026-09-18');
    expect(readme).toContain('1 picture it shows');
  });
});
