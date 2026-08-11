/**
 * The Playground split's STORAGE CONTRACT — the key, the panel ids, and the bucket derived
 * from them.
 *
 * WHY THIS IS ITS OWN MODULE, and not three consts in `PlaygroundApp.tsx` where the split is
 * rendered: `playground.astro`'s pre-paint seed has to read this format before React exists, and
 * it receives these values through `define:vars`. Importing them from `PlaygroundApp` would drag
 * React, CodeMirror and the whole island into that page's module graph for three strings. So the
 * format lives here, in a module whose only import is `split-storage` (which has no imports at
 * all), and BOTH sides depend on it: the app that writes, and the seed that reads.
 *
 * This is the same split the Studio made for the same reason (#1495, `preview-rect.ts`). It is
 * worth restating why that shape matters: before it, the Studio's seed restated the bucket string
 * by hand, and a rename inside the hook would not have thrown — it would have missed the lookup,
 * fallen back to the default, and drawn the split line up to ~300px from where the app was about
 * to put it.
 */
import { bucketFor, collapseKeyFor } from '../ui/split-storage';

/** `useResizableSplit`'s `storageKey` on the Playground surface. */
export const PG_SPLIT_KEY = 'lattice-docs-split-playground';

/**
 * Where the collapsed side is persisted (sessionStorage), DERIVED — never restated.
 *
 * The pre-paint seed needs it to know when NOT to spend the pixel clamp below: a collapsed
 * pane is on its way to a 28px rail, and a 320px minimum is the wrong prediction of it.
 */
export const PG_SPLIT_COLLAPSE_KEY = collapseKeyFor(PG_SPLIT_KEY);

/**
 * The split's panel ids — ONE declaration, used for the Panels themselves, for the storage
 * bucket, and by the pre-paint seed's CSS-var selectors.
 *
 * Ordered editor-then-preview to match the rendered order; `bucketFor` sorts, so the bucket does
 * not depend on that.
 */
export const PG_SPLIT_PANEL_IDS = ['pg-split-editor', 'pg-split-preview'] as const;

/** The stored bucket, DERIVED — never restated. */
export const PG_SPLIT_BUCKET = bucketFor(PG_SPLIT_PANEL_IDS);

/**
 * The panels' default shares, as the `<ResizablePanel defaultSize>` strings — percentages of the
 * pair. Declared here so the pre-paint CSS fallback and the rendered panels cannot disagree: a
 * newcomer's first paint has to match what hydration is about to produce, or the fix for a
 * returning visitor's jump would introduce one for everybody else.
 */
export const PG_SPLIT_DEFAULTS = { editor: 45, preview: 55 } as const;

/**
 * The panels' minimum widths in PIXELS — the `<ResizablePanel minSize>` values, and the
 * clamp the pre-paint seed has to apply to the saved share before spending it.
 *
 * WHY THE SEED NEEDS THEM (#1589). The saved layout is a pair of PERCENTAGES, and a share
 * that is comfortably above a pane's minimum at the window it was saved in can be below it
 * at a narrower one. The library clamps at hydration; the seed did not, so the two disagreed
 * — measured on the built site by dragging the real divider to a 25% preview at 1920 and
 * reloading at 1194: the pane painted 298.3px pre-paint and 320px after, and the divider
 * moved 22px in view. Worse, the instant-shell replay is gated on the preview wrap matching
 * the box its slide was measured in, so the pane changing size under it meant the shell
 * declined (or withdrew) and the visitor got no cached slide at all.
 *
 * Declared HERE for the same reason `PG_SPLIT_DEFAULTS` is: one number read by the panel
 * that enforces it and by the seed that has to predict it, so they cannot drift.
 */
export const PG_SPLIT_MIN = { editor: 280, preview: 320 } as const;
