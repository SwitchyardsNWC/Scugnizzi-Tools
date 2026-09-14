// The three drawers under the canvas: what the team sees, the code, and the checks.

import type { Finding } from '../compile/lint.ts';
import { tidyTemplate } from '../model/tidy.ts';
import type { Notify } from './callbacks.ts';
import { Editability } from './Editability.tsx';
import { CopyIcon, TickIcon } from './icons.tsx';
import { kb } from './starters.ts';
import type { Editor } from './useEditor.ts';

export function FieldsDrawer({ editor, onClose }: { editor: Editor; onClose(): void }) {
  return (
    <div class="drawer">
      <div class="drawer-head">
        <b>What the team sees in HubSpot</b>
        <button class="link" onClick={onClose}>Close</button>
      </div>
      <Editability editor={editor} />
    </div>
  );
}

export function CodeDrawer({ html, bytes, copied, onCopy, onClose }: { html: string; bytes: number; copied: boolean; onCopy(): void; onClose(): void }) {
  return (
    <div class="drawer">
      <div class="drawer-head">
        <b>The coded template</b>
        <span class="muted">
          {kb(bytes)} · paste into Design Manager › new coded email template
        </span>
        <button
          class={`btn icon-text ${copied ? 'done' : ''}`}
          title="Copy the whole file. Paste it over everything in a new coded email template, save, then open it once so HubSpot validates the fields."
          onClick={onCopy}
        >
          {copied ? <TickIcon /> : <CopyIcon />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button class="link" onClick={onClose}>Close</button>
      </div>
      {/* Read-only rather than disabled: a disabled textarea cannot be selected, and
          select-all-then-copy is the fallback for a browser that refuses the clipboard. */}
      <textarea class="code" readOnly spellcheck={false} value={html} />
    </div>
  );
}

export function ChecksDrawer({ editor, findings, notify, onClose }: { editor: Editor; findings: Finding[]; notify: Notify; onClose(): void }) {
  const errors = findings.filter((f) => f.severity === 'error');
  return (
    <div class="drawer">
      <div class="drawer-head">
        <b>Checks</b>
        <span class="muted">
          {findings.length === 0 ? 'Nothing to fix.' : `${errors.length} to fix, ${findings.length - errors.length} to look at.`}
        </span>
        {findings.some((f) => f.rule === 'untidy-markup') && (
          // The one finding Checks can fix itself: markup the sanitiser would drop, taken
          // out of every block at once, as one undo step.
          <button
            class="btn"
            title="Remove the tags and attributes the template does not use from every block — empty paragraphs, pasted inline styles, stray wrappers. One undo step."
            onClick={() => {
              const before = editor.template;
              const count = findings.filter((f) => f.rule === 'untidy-markup').length;
              editor.commit('Clean up', tidyTemplate(before));
              notify(`Cleaned ${count === 1 ? 'one block' : `${count} blocks`}.`, () => editor.undo());
            }}
          >
            Clean up
          </button>
        )}
        <button class="link" onClick={onClose}>Close</button>
      </div>
      {findings.length === 0 ? (
        <p class="empty">
          Every rule a real send has taught us, and this template satisfies all of them.
        </p>
      ) : (
        <ul class="findings">
          {findings.map((f, i) => (
            <li key={`${f.rule}-${i}`} class={f.severity}>
              <code>{f.rule}</code>
              {f.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
