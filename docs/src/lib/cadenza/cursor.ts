// Cadenza — the cursor. It lives in `@laticent/ltt` since LTT step 2, so the word lookup has one
// home (2026-09-24-lattice-timing-track.md §5). Re-exported here so every existing importer
// keeps working unchanged.

export type { Active, Cursor } from '@laticent/ltt';
export { makeCursor } from '@laticent/ltt';
