// A section's standing with the folder's patterns, at the top of its panel.

import { useEffect, useRef, useState } from 'preact/hooks';

import type { PatternInfo } from './types.ts';

/**
 * A section placed from a folder pattern: which one, whether it has moved on, and the moves.
 *
 * On a plain section it is one control — save this as a pattern — because that is the only thing
 * a plain section can do with patterns. On an instance it is the state and three verbs. "Update
 * available" is the one worth a colour: it is the reason the marker exists.
 */
export function PatternStrip({ info }: { info: PatternInfo }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  // Focused from an effect: the field is created on a click, after which `autofocus` has already
  // had its one chance. Keystrokes otherwise land on the button that has just been pressed.
  const field = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (naming) field.current?.focus();
  }, [naming]);

  const save = () => {
    if (name.trim()) info.onSave(name.trim());
    setNaming(false);
    setName('');
  };

  if (!info.instance) {
    return (
      <div class="pattern-strip plain">
        {naming ? (
          <form
            class="pattern-name"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <input
              ref={field}
              type="text"
              value={name}
              placeholder="Pattern name — e.g. Footer with links"
              aria-label="Pattern name"
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setNaming(false);
                if (e.key === 'Enter') {
                  e.preventDefault();
                  save();
                }
              }}
            />
            <button type="submit" class="btn" disabled={!name.trim()}>
              Save
            </button>
            <button type="button" class="link" onClick={() => setNaming(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button
            class="link"
            title="Save this section to the folder as a pattern: place it in other templates, and when it changes, they can take the change."
            onClick={() => setNaming(true)}
          >
            Save as pattern…
          </button>
        )}
      </div>
    );
  }

  return (
    <div class={`pattern-strip ${info.stale ? 'stale' : ''} ${info.missing ? 'missing' : ''}`}>
      <span class="pattern-strip-name" title="Placed from a folder pattern. The content is a copy; the marker is what lets updates arrive.">
        Pattern · <b>{info.name ?? 'missing'}</b>
        {info.stale && <i> · update available</i>}
        {info.missing && <i> · not in the folder</i>}
      </span>
      <span class="pattern-strip-actions">
        {info.stale && (
          <button class="link" title="Replace this section with the pattern's new version. Blocks with the same label keep their HubSpot field names." onClick={info.onApply}>
            Apply
          </button>
        )}
        {!info.missing && (
          <button class="link" title="Write this section's current contents to the pattern as a new version. Every other placement then shows an update." onClick={info.onPush}>
            Push changes
          </button>
        )}
        <button class="link" title="Keep the content as an ordinary section. Updates stop arriving." onClick={info.onDetach}>
          Detach
        </button>
      </span>
    </div>
  );
}
