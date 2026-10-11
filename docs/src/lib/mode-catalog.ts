// The Studio mode catalog — DISPLAY metadata for the `mode:` axis (the deck's
// RENDERING MODE: how the content itself is drawn). The sibling of finish-catalog.ts
// (the backdrop axis). The engine's single source of truth for name→class is
// MODE_REGISTER (lib/core/resolve-mode.js). THIS file adds only the human layer the
// picker needs (label, blurb, swatch) and MUST stay in step with MODE_REGISTER — the
// catalog↔register rot-guard is mode-catalog.test.ts (both directions), mirroring
// finish-catalog.test.ts.
//
// A mode is authored deck-wide via the `mode:` front-matter register or per-slide
// via `_class: sketch` (or `_class: boardroom` to opt one slide back to clean).

export type ModeEntry = {
	/** the `mode:` register value (and engine MODE_REGISTER key) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip */
	swatch: { background: string; backgroundSize?: string };
};

const A = (pct: number) => `color-mix(in srgb, var(--accent) ${pct}%, transparent)`;

// Ordered as the picker shows them. `boardroom` is the named baseline (the clean
// default hand; omitting the key renders it).
export const MODES: ModeEntry[] = [
	{
		name: 'boardroom', label: 'Boardroom',
		blurb: 'The clean default — Playfair headings, Outfit body, crisp boxes.',
		swatch: { background: 'var(--bg)' },
	},
	{
		name: 'sketch', label: 'Sketch',
		blurb: 'Hand-drawn — handwriting type, wobbly boxes, wavy rules.',
		swatch: { background: `repeating-linear-gradient(8deg, ${A(34)} 0 1.5px, transparent 1.5px 5px)` },
	},
	{
		name: 'sketch-clean', label: 'Sketch · clean body',
		blurb: 'Hand headings and boxes; clean body text for dense slides.',
		swatch: { background: `repeating-linear-gradient(8deg, ${A(28)} 0 1.5px, transparent 1.5px 7px)` },
	},
];

export const MODE_BY_NAME: Record<string, ModeEntry> = Object.fromEntries(
	MODES.map((s) => [s.name, s]),
);

/** The active mode for a deck `mode:` value (defaults to boardroom). */
export function activeMode(value: string | undefined | null): ModeEntry {
	const key = (value ?? '').trim().toLowerCase();
	return MODE_BY_NAME[key] ?? MODE_BY_NAME.boardroom;
}
