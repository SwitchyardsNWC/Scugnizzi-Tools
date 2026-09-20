// A dial that can say "follow the other value" instead of holding one of its own.
//
// One row, not three: a checkbox plus a dial plus a label would be more interface than the decision deserves, and
// it would sit there looking complicated for every block that never departs. Dragging takes the value over; the
// chain hands it back. The dial reads the inherited number while it is following, so the thing you are about to
// change is the thing you can see.
//
// Written once here because two panels now need it and they must not drift: the Inspector's `inherit-number`
// control, where a column departs from the page gutter, and the Design panel's phone padding, where the phone
// departs from the desktop. The shape was the Inspector's first; this is the same code, lifted rather than
// copied, for the reason this codebase keeps rediscovering — a second copy is a second set of behaviours.

import { Dial } from './Dial.tsx';
import { LinkedIcon } from './icons.tsx';

export interface InheritDialProps {
  label: string;
  /** The value of its own, or null while it is following. */
  value: number | null;
  /** The number it follows, shown on the dial while `value` is null. */
  inherited: number;
  /** What it is following, for the chain's own words — "Design › Page padding". */
  inheritedName: string;
  onChange(next: number | null): void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  zero?: string;
  title?: string;
}

export function InheritDial({ label, value, inherited, inheritedName, onChange, min, max, step, suffix, zero, title }: InheritDialProps) {
  const following = value === null;
  return (
    <div class={`field wide inherit ${following ? 'following' : ''}`}>
      <Dial
        label={label}
        // While following, the dial shows the inherited number rather than nothing, so the first drag starts from
        // where the value actually is instead of from zero.
        value={following ? inherited : value}
        onChange={onChange}
        min={min ?? 0}
        max={max ?? 100}
        step={step ?? 1}
        {...(suffix ? { suffix } : {})}
        {...(zero ? { zero } : {})}
        {...(title ? { title } : {})}
      />
      <button
        class={`chain ${following ? 'on' : ''}`}
        aria-pressed={following}
        aria-label={`${label}: follow ${inheritedName}`}
        title={following ? `Following ${inheritedName}. Click to give this its own.` : `This has its own. Click to hand it back to ${inheritedName}.`}
        onClick={() => onChange(following ? inherited : null)}
      >
        <LinkedIcon />
      </button>
    </div>
  );
}
