import { CATALOG } from '../model/catalog.ts';
import { hubspotFields } from '../model/edit.ts';
import type { Editor } from './useEditor.ts';

// The editability view: everything the team will see in HubSpot, in the order they will see it.
//
// This is where a designer checks their work against the only interface the marketing team ever
// gets — a list of labels in a panel. Labels are that interface in its entirety (learnings 1.10),
// and they are much easier to judge as a list than one at a time in an inspector, which is the
// whole reason this view exists separately.
//
// Renaming happens here, inline. The field name underneath never moves, because renaming it would
// orphan whatever the team has already typed into the old one — the row shows both so the
// difference is visible rather than something you have to know.

export function Editability({ editor }: { editor: Editor }) {
  const fields = hubspotFields(editor.template);

  if (fields.length === 0) {
    return (
      <p class="empty">
        Nothing in this template is editable in HubSpot. The team would create an email from it and find
        no fields at all — which is right for a template that never changes, and a mistake otherwise.
      </p>
    );
  }

  return (
    <>
      <p class="hint" title="This is the Contents panel the team will see, in this order. Click a row to jump to its block.">
        In this order. Click a row to jump to its block.
      </p>
      <ol class="fieldlist">
        {fields.map((entry, i) => (
          <li key={entry.field}>
            <span class="fieldlist-n">{String(i + 1).padStart(2, '0')}</span>
            <input
              type="text"
              value={entry.label}
              aria-label={`Label for ${entry.field}`}
              onFocus={() => editor.select({ kind: 'block', sectionId: entry.sectionId, blockId: entry.blockId })}
              onInput={(e) =>
                // `setAt`, not select-then-set: `set` writes to whatever was selected at its last
                // render, which here would be the previous row.
                editor.setAt(
                  { kind: 'block', sectionId: entry.sectionId, blockId: entry.blockId },
                  `${entry.path}.label`,
                  (e.target as HTMLInputElement).value,
                )
              }
            />
            <code title="The HubSpot field name. Fixed once created — renaming the label never touches it.">
              {entry.field}
            </code>
            <button
              class="link"
              onClick={() => editor.select({ kind: 'block', sectionId: entry.sectionId, blockId: entry.blockId })}
            >
              {CATALOG[entry.blockType as keyof typeof CATALOG].name}
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}
