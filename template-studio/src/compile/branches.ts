// Branch enumeration.
//
// In HubL mode the compiled output is a program, not a document: `{% if widget_data.hero.img.src %}`
// wraps a whole section, and its truth value is only known inside HubSpot. A template with n
// optional fields therefore describes 2^n possible emails, and the canvas can only ever show one of
// them (architecture.md §1).
//
// Two things depend on this module. The editor uses it to offer the designer a set of toggles so
// they can walk the branches deliberately instead of only seeing the everything-filled-in case. The
// validator uses it to check *every* branch rather than the one on screen — otherwise the tool
// produces exactly the failure Jared named as the worst outcome: something broken, silently.

import { walk, type IRNode } from './ir.ts';
import { declarations } from './ir.ts';
import { fieldPresentByDefault, type Branch } from './serialize.ts';

export interface BranchVariable {
  /** The key in a Branch. Usually a field name; `site_settings.*` for HubSpot's own settings. */
  key: string;
  /** What to call it in the editor's preview strip. */
  label: string;
  presentByDefault: boolean;
}

/** Every condition the output actually tests, deduplicated, in document order. */
export function branchVariables(tree: IRNode): BranchVariable[] {
  const fields = new Map(declarations(tree).map((f) => [f.name, f]));
  const seen = new Map<string, BranchVariable>();

  walk(tree, (node) => {
    if (node.k !== 'if' && node.k !== 'wrapIf') return;
    const key = node.test.field;
    if (seen.has(key)) return;
    const field = fields.get(key);
    seen.set(key, {
      key,
      label: field ? field.label : humanise(key),
      presentByDefault: field ? fieldPresentByDefault(field) : false,
    });
  });

  return [...seen.values()];
}

export function defaultsOf(variables: BranchVariable[]): Branch {
  const branch: Branch = {};
  for (const v of variables) branch[v.key] = v.presentByDefault;
  return branch;
}

/**
 * Every combination, capped. Beyond the cap the enumeration stops being a proof and starts being a
 * bill, so the validator takes the corners — all-empty and all-filled — plus one variable flipped
 * at a time, which is where the real breakage lives (a gap left by a collapsed block, a section
 * that loses its background when the block inside it disappears).
 */
export function enumerateBranches(variables: BranchVariable[], cap = 64): Branch[] {
  if (variables.length === 0) return [{}];

  if (2 ** variables.length <= cap) {
    const out: Branch[] = [];
    for (let mask = 0; mask < 2 ** variables.length; mask += 1) {
      const branch: Branch = {};
      variables.forEach((v, i) => {
        branch[v.key] = Boolean(mask & (1 << i));
      });
      out.push(branch);
    }
    return out;
  }

  const all = (value: boolean): Branch => Object.fromEntries(variables.map((v) => [v.key, value]));
  const out: Branch[] = [all(false), all(true)];
  for (const v of variables) {
    out.push({ ...all(true), [v.key]: false }, { ...all(false), [v.key]: true });
  }
  return out;
}

function humanise(key: string): string {
  const leaf = key.split('.').pop() ?? key;
  return leaf
    .replace(/_+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}
