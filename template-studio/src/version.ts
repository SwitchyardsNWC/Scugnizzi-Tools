// The Scugnizzi tools version, put in at build time from version.js at the top of the repository.

declare const __SCUGNIZZI_VERSION__: string;

export const SUITE_VERSION: string = typeof __SCUGNIZZI_VERSION__ === 'string' ? __SCUGNIZZI_VERSION__ : '0.0.0';
