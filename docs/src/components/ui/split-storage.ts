/**
 * The resizable split's STORAGE FORMAT — the two derivations that turn a split's identity into
 * the strings it persists under.
 *
 * WHY THIS IS ITS OWN MODULE, and not two exports on `use-resizable-split.ts` where the hook
 * that owns the behavior lives (#1495):
 *
 * The pre-paint shell in `studio.astro` has to READ this format before React exists, so its
 * geometry contract (`components/studio/preview-rect.ts`) needs these derivations at BUILD
 * time. That file is deliberately dependency-free — a plain constants module, which is exactly
 * why an Astro page can import it and hand its values into an inline script through
 * `define:vars`. Importing the hook to get two string helpers would drag React and
 * `react-resizable-panels` into that page's module graph for nothing.
 *
 * So the format lives here, in a module with no imports at all, and BOTH sides depend on it:
 * the hook that writes, and the seed that reads. Before this, the seed restated the format by
 * hand — the bucket string and the `-collapsed` suffix as literals — and a refactor inside the
 * hook would not have thrown. It would have missed the lookup, fallen back to
 * `defaultPreviewFrac`, and drawn the split line up to ~300px from where the app was about to
 * put it: a silent geometry regression caught only by a nightly matrix, if anyone read it.
 */

/**
 * The persistence bucket for a layout: its panel-id set, sorted and comma-joined.
 *
 * Derived from the panels ACTUALLY present rather than a hand-maintained key, so a saved layout
 * can never be applied to a different panel set — the worst case of a forgotten config is "no
 * restore", never "wrong widths".
 *
 * Takes the ids themselves (not a layout object) so a caller that knows its panels statically —
 * the pre-paint seed — can derive the same bucket without having a layout in hand.
 */
export function bucketFor(panelIds: readonly string[]): string {
	return [...panelIds].sort().join(",");
}

/**
 * Where the COLLAPSED side is persisted, given a split's storage key.
 *
 * Note the asymmetry, because it is the part most likely to be broken by a well-meaning
 * refactor: the layout store lives in `localStorage` under `storageKey`, but the collapsed side
 * lives in `sessionStorage` under this derived key. Collapse is a per-session posture; widths
 * are a preference.
 */
export function collapseKeyFor(storageKey: string): string {
	return `${storageKey}-collapsed`;
}
