import { Assets } from './Assets.tsx';
import { DesignPanel } from './DesignPanel.tsx';
import { Outline } from './Outline.tsx';
import { Palette, type PaletteKind, type PatternCard } from './Palette.tsx';
import type { DesignSystem } from '../model/design-system.ts';
import { Templates, type Starter } from './Templates.tsx';
import { RailAssets, RailBlocks, RailDesign, RailLayers, RailTemplates } from './icons.tsx';
import type { AssetFile, TemplateFile } from '../workspace/workspace.ts';
import type { Editor } from './useEditor.ts';

// The left pane: a rail of destinations, and one panel at a time.
//
// Each one answers a different question — what can I add, what do I have, what is in this email,
// what pictures are around, what rules does the whole thing follow. They used to be two, with the
// file list wedged above the layer tree, which meant opening a folder pushed the structure you were
// reading down the pane.
//
// Design sits under a short rule, because it is a different kind of destination: the four above it
// are *contents*, and Design is the rules the contents are drawn with. Under the rule, not at the
// foot of the rail — it was pinned to the bottom first, and a button four hundred pixels from the
// other four reads as missing rather than as set apart.
//
// It also used to live in the right pane, where it replaced the inspector — so tuning H1 hid the
// heading you were tuning it for. On this side both are visible at once, which is the whole reason
// for the move.

export type Tab = 'blocks' | 'templates' | 'layers' | 'assets' | 'design';

export interface SidebarProps {
  editor: Editor;
  tab: Tab;
  onTab(tab: Tab): void;
  /** Leaving Design goes back where you were, which only the app knows. */
  onCloseDesign(): void;
  dragging: PaletteKind | null;
  onPaletteDrag(kind: PaletteKind, x: number, y: number): void;
  onPaletteDrop(): void;
  files: TemplateFile[];
  assets: AssetFile[];
  /** While a freeform surface is open: a picture from the panel, dropped on it or clicked into its middle. */
  onDropAsset?(asset: AssetFile, at: { x: number; y: number } | null): void;
  starters: Starter[];
  onNew(starter: Starter): void;
  onDuplicate(): void;
  /** The folder's patterns, for the palette and the layer tree. */
  patterns: PatternCard[];
  onPlacePattern(id: string): void;
  onPlaceSyBlock(id: string): void;
  patternOf(sectionId: string): 'current' | 'stale' | 'missing' | null;
  onUsed(kind: PaletteKind): void;
  also: string[];
  /** The folder's design systems, and what the design panel can do with them. */
  systems: Record<string, DesignSystem>;
  folderOpen: boolean;
  onFollowSystem(name: string): void;
  onSaveSystemAs(name: string): void;
  onDetachSystem(): void;
  workspaceLabel?: string;
  writable: boolean;
  /** A folder Chrome opened without edit access. Files says so and offers the one click that asks. */
  viewOnly: boolean;
  onAllowEditing(): void;
  /** Whether this browser can open a whole folder. Chrome can; Safari picks files by hand. */
  folders: boolean;
  onChooseFiles(files: File[]): void;
  device: 'desktop' | 'phone';
  onDevice(device: 'desktop' | 'phone'): void;
  onOpenFile(file: TemplateFile): void;
  /**
   * Removes a file from the folder; absent when the folder cannot be written. Passed through to the Files panel,
   * which shows the × only when it is here. App.tsx handed this in from the start and this list left it out, so
   * the panel never saw it and nothing in Template Studio could delete a file (Jared: "I need a way to delete
   * email files from the template studio files system"). A spread prop on JSX is not checked for excess, which
   * is how it went unnoticed.
   */
  onDelete?(file: TemplateFile): void;
  onOpenFolder(): void;
}

const TABS: Array<{ id: Tab; label: string; icon: typeof RailBlocks; title: string }> = [
  { id: 'blocks', label: 'Blocks', icon: RailBlocks, title: 'Everything you can add. Drag one onto the email.' },
  { id: 'templates', label: 'Files', icon: RailTemplates, title: 'The templates in the folder everyone shares.' },
  { id: 'layers', label: 'Layers', icon: RailLayers, title: 'The structure of this email, top to bottom.' },
  { id: 'assets', label: 'Assets', icon: RailAssets, title: 'Images in the folder’s assets directory.' },
];

const DESIGN: (typeof TABS)[number] = {
  id: 'design',
  label: 'Design',
  icon: RailDesign,
  title: 'Type, colour and layout for the whole template. Change one and the canvas follows.',
};

export function Sidebar(props: SidebarProps) {
  // Picking a block up is a statement about what you are doing; switching the panel out from under
  // the pointer mid-drag is not.
  const shown = props.dragging ? 'blocks' : props.tab;
  const label = props.workspaceLabel ?? null;

  const button = ({ id, label: name, icon: Icon, title }: (typeof TABS)[number]) => (
    <button
      key={id}
      class={`rail-btn ${shown === id ? 'on' : ''}`}
      role="tab"
      aria-selected={shown === id}
      title={title}
      onClick={() => props.onTab(id)}
    >
      <Icon />
      <span>{name}</span>
      {id === 'assets' && props.assets.length > 0 && <i class="rail-count">{props.assets.length}</i>}
      {id === 'templates' && props.files.length > 0 && <i class="rail-count">{props.files.length}</i>}
    </button>
  );

  return (
    // The pane widens for Design. Its dials and swatch rows were drawn for a 320px body and the
    // other four panels are lists, which are happy narrow — so the pane follows the panel rather
    // than every panel living at the widest one's width.
    <aside class={`pane left ${shown === 'design' ? 'wide' : ''}`}>
      <nav class="rail" role="tablist" aria-label="Sidebar">
        {TABS.map(button)}
        <span class="rail-gap" />
        {button(DESIGN)}
      </nav>

      <div class="pane-body">
        {shown === 'blocks' && (
          <Palette
            editor={props.editor}
            dragging={props.dragging}
            onDrag={props.onPaletteDrag}
            onDrop={props.onPaletteDrop}
            patterns={props.patterns}
            onPlacePattern={props.onPlacePattern}
            onPlaceSyBlock={props.onPlaceSyBlock}
            onUsed={props.onUsed}
          />
        )}
        {shown === 'templates' && (
          <Templates
            editor={props.editor}
            files={props.files}
            label={label}
            writable={props.writable}
            viewOnly={props.viewOnly}
            onAllowEditing={props.onAllowEditing}
            folders={props.folders}
            starters={props.starters}
            onNew={props.onNew}
            onDuplicate={props.onDuplicate}
            onOpen={props.onOpenFile}
            {...(props.onDelete ? { onDelete: props.onDelete } : {})}
            onOpenFolder={props.onOpenFolder}
            onChooseFiles={props.onChooseFiles}
          />
        )}
        {shown === 'layers' && <Outline editor={props.editor} patternOf={props.patternOf} also={props.also} />}
        {shown === 'assets' && (
          <Assets editor={props.editor} assets={props.assets} folder={label} onOpenFolder={props.onOpenFolder} {...(props.onDropAsset ? { onDropAsset: props.onDropAsset } : {})} />
        )}
        {shown === 'design' && (
          <DesignPanel
            editor={props.editor}
            onClose={props.onCloseDesign}
            device={props.device}
            onDevice={props.onDevice}
            systems={props.systems}
            folderOpen={props.folderOpen}
            onFollow={props.onFollowSystem}
            onSaveAs={props.onSaveSystemAs}
            onDetach={props.onDetachSystem}
          />
        )}
      </div>
    </aside>
  );
}
