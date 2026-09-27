import { lazyPanel } from './lazy-panel';

// The six Studio panels that load on first open, each behind a shell that looks like it
// (`panel-shells.tsx`). None of them is on screen when the Studio starts, and together they were
// ~130KB gz of its startup JavaScript (-17.8%). Share and Workspace are the last two holders of
// the narration / text-to-speech stack, so splitting both is what releases it. StudioShell warms
// them all once the Studio is idle (`warmPanels`), so a later open renders on its first frame.
// In a module of their own so a test can load them up front (`src/test/panels.ts`).
// See engineering/decisions/2026-09-26-studio-panel-lazy-loading.md.
export const sharePanel = lazyPanel('Share', () => import('./ShareSheet').then((m) => m.ShareSheet));
export const workspacePanel = lazyPanel('Workspace settings', () => import('./WorkspaceSheet').then((m) => m.WorkspaceSheet));
export const slideSettingsPanel = lazyPanel('Slide settings', () => import('./SlideContext').then((m) => m.SlideContextBody));
export const chatPanel = lazyPanel('Chat', () => import('./ArchitectChat').then((m) => m.ArchitectChat));
export const libraryPanel = lazyPanel('The Library', () => import('./Library').then((m) => m.Library));
export const lensesPanel = lazyPanel('Reader views', () => import('./LensesPanel').then((m) => m.LensesPanel));
/** In warm-up order: Share first, as the panel most likely wanted offline. */
export const STUDIO_PANELS = [sharePanel, workspacePanel, slideSettingsPanel, chatPanel, libraryPanel, lensesPanel];

/** Set by Fabricate's first open (`StudioShell.tsx`); read by the idle warm-up (`studio-warm.ts`). */
export const FABRICATE_USED_KEY = 'lattice-studio-fabricate-used';
