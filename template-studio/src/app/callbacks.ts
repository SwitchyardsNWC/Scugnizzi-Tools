// The two callbacks the app hands to every hook that can say something or fail.

/** Shows a toast for a few seconds, with an Undo button when one is given. */
export type Notify = (message: string, undo?: () => void) => void;

/**
 * A failed write from any path. A write Chrome refused lands in the banner that can fix it (one
 * click asks for edit access); anything else lands in the error bar with the fallback wording.
 */
export type Failed = (cause: unknown, fallback: string) => void;
