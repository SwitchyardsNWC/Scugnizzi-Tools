// What the app tells the inspector about the selection, beyond the document itself.



/** What the folder's pattern says about the selected section, and what can be done about it. */
export interface PatternInfo {
  /** Null when the section is not placed from a pattern. */
  name: string | null;
  instance: boolean;
  stale: boolean;
  missing: boolean;
  onApply(): void;
  onDetach(): void;
  onPush(): void;
  onSave(name: string): void;
}

export interface FreeformUi {
  layer: string | null;
  onSelectLayer(layerId: string | null): void;
  drawing: boolean;
  onDrawing(on: boolean): void;
  /** The surface is open as a workspace; `onEnter` opens it. */
  open?: boolean;
  onEnter?(blockId: string): void;
  /** The Freeform app's frame, which this block can follow (model/freeform-link.ts). */
  app?: FreeformAppUi;
}

export interface FreeformAppUi {
  frames: Array<{ key: string; name: string; width: number; height: number; layers: number; printed: boolean; thumb: string }>;
  /** The frame this block follows, or null. */
  linkedKey: string | null;
  /** Linked to a frame the Freeform app no longer has. */
  missing: boolean;
  /** Linked, and already showing the frame as it is now. */
  current: boolean;
  /** The block's printed picture, when it has effects: its frame's card then shows what the email shows. */
  print?: string;
  onLink(key: string): void;
  onUnlink(): void;
  /** Opens the Freeform app, on the given frame or the one this block follows. */
  onOpen(key?: string): void;
}
