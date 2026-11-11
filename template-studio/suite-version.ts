// The suite's version for the build and the tests, read from the one place it is written: version.js at the
// top of the repository.

import { readFileSync } from 'node:fs';

const SUITE_VERSION = /SCUGNIZZI_VERSION\s*=\s*'([^']+)'/.exec(readFileSync(new URL('../version.js', import.meta.url), 'utf8'))?.[1] ?? '0.0.0';

export const suiteDefine = { __SCUGNIZZI_VERSION__: JSON.stringify(SUITE_VERSION) };
