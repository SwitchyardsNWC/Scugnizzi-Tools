// The row of tools above the canvas: how the email is being looked at.

import type { branchVariables } from '../compile/branches.ts';
import type { Branch } from '../compile/serialize.ts';
import { BranchIcon, DesktopIcon, EyeIcon, InboxIcon, MoonIcon, PhoneIcon } from './icons.tsx';

export type Device = 'desktop' | 'phone';

/** Wide enough to show the page background either side of the 600px column, which is a setting. */
export const WIDTHS: Record<Device, number> = { desktop: 680, phone: 375 };

export function CanvasTools({
  device,
  onDevice,
  inbox,
  onInbox,
  dark,
  onDark,
  forceLight,
  presenting,
  onPresenting,
  variables,
  branch,
  showBranches,
  onShowBranches,
  onOverride,
  showKeys,
  onShowKeys,
}: {
  device: Device;
  onDevice(device: Device): void;
  inbox: boolean;
  onInbox(): void;
  dark: boolean;
  onDark(): void;
  /** The template holds its own colours under a dark client (Design › Page). */
  forceLight: boolean;
  presenting: boolean;
  onPresenting(): void;
  /** The optional fields, each a switch the canvas can show one combination of. */
  variables: ReturnType<typeof branchVariables>;
  branch: Branch;
  showBranches: boolean;
  onShowBranches(): void;
  onOverride(key: string, on: boolean): void;
  showKeys: boolean;
  onShowKeys(): void;
}) {
  return (
    <div class="tools">
      {/* Two glyphs rather than two words. This is the control the eye comes back to most,
          it sits at the head of a row of named buttons, and a screen and a handset are the
          two most recognisable shapes in the set — the words were doing nothing the shapes
          do not. The names live on the hover and in the label, where a screen reader gets
          them either way. */}
      <div class="group seg-icons" role="group" aria-label="Preview width">
        {(['desktop', 'phone'] as const).map((d) => (
          <button
            key={d}
            class={`btn icon-btn ${device === d ? 'on' : ''}`}
            aria-pressed={device === d}
            aria-label={d === 'desktop' ? 'Desktop' : 'Phone'}
            title={
              d === 'desktop'
                ? 'Desktop — the full column, with the page background either side.'
                : 'Phone — 375px, where the email runs edge to edge.'
            }
            onClick={() => onDevice(d)}
          >
            {d === 'desktop' ? <DesktopIcon /> : <PhoneIcon />}
          </button>
        ))}
        <button
          class={`btn icon-btn ${inbox ? 'on' : ''}`}
          aria-pressed={inbox}
          aria-label="Inbox"
          title="Inbox — the email inside a message, with a sender, a subject line and the gutter a mail app draws around every message. That gutter is the one thing no email can remove (learnings 2.4), and it is where the page background shows."
          onClick={onInbox}
        >
          <InboxIcon />
        </button>
      </div>

      {/* The same treatment as the three beside it: a glyph, with the explanation on hover —
          and the explanation changes with the state, which is where the two-line note that
          used to sit under this row went. A row of tools should read as tools. */}
      <button
        class={`btn icon-btn ${dark ? 'on' : ''}`}
        aria-pressed={dark}
        aria-label="Dark override"
        title={
          !dark
            ? 'Dark override — applies your prefers-color-scheme layer unconditionally. Your own dark rules, not what Gmail’s apps will do; nothing can show that.'
            : forceLight
              ? 'Dark override on. The email is holding its own colours — that is what Force light is for. If nothing changed, it is working.'
              : 'Dark override on. No force-light layer, so a dark client will restyle this freely. Turn Force light on in Design › Page to hold the colours.'
        }
        onClick={onDark}
      >
        <MoonIcon />
      </button>
      <button
        class={`btn icon-btn ${presenting ? 'on' : ''}`}
        aria-pressed={presenting}
        aria-label="Preview"
        title={presenting ? 'Preview on: the email as it is, nothing else. Esc or click to bring the tools back.' : 'Preview — hide every control and see the email as it is. Esc brings them back.'}
        onClick={onPresenting}
      >
        <EyeIcon />
      </button>

      <span class="grow" />

      {variables.length > 0 && (
        <div class="popover-host">
          <button
            class={`btn icon-text count ${showBranches ? 'on' : ''}`}
            aria-expanded={showBranches}
            aria-label="Preview state"
            onClick={onShowBranches}
            title={`Preview state — ${Object.values(branch).filter(Boolean).length} of ${variables.length} optional fields filled in. In HubSpot this template is a program, not a document: each switch is a field the team may leave empty, and the canvas can only show one combination at a time.`}
          >
            <BranchIcon />
            {Object.values(branch).filter(Boolean).length}/{variables.length}
          </button>
          {showBranches && (
            <div class="popover right">
              <p class="hint" title="The canvas can only show one of them, so this is where you walk the rest.">
                {2 ** variables.length} possible emails.
              </p>
              {variables.map((v) => (
                <label class="switch" key={v.key}>
                  <input type="checkbox" checked={branch[v.key] ?? false} onChange={(e) => onOverride(v.key, (e.target as HTMLInputElement).checked)} />
                  <span>{v.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        class={`btn icon-btn help ${showKeys ? 'on' : ''}`}
        aria-label="Keyboard shortcuts"
        title="How the canvas works: click to select, double-click to edit, / to format or add a block, drag to reorder. Opens the full list of shortcuts."
        onClick={onShowKeys}
      >
        ?
      </button>
    </div>
  );
}
