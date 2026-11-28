// The Studio drawing catalog — DISPLAY metadata for the `drawing:` axis (how the
// content itself is drawn). The sibling of finish-catalog.ts (the backdrop axis).
// The engine's single source of truth for name→class is DRAWING_REGISTER
// (lib/core/resolve-drawing.js). THIS file adds only the human layer the picker needs
// (label, blurb, swatch) and MUST stay in step with DRAWING_REGISTER — the
// catalog↔register rot-guard is drawing-catalog.test.ts (both directions), mirroring
// finish-catalog.test.ts.
//
// A drawing is authored deck-wide via the `drawing:` front-matter register or per-slide
// via `_class: sketch` (or `_class: no-sketch` to opt one slide back to clean).

export type DrawingEntry = {
	/** the `drawing:` register value (and engine DRAWING_REGISTER key) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip */
	swatch: { background: string; backgroundSize?: string };
};

const A = (pct: number) => `color-mix(in srgb, var(--accent) ${pct}%, transparent)`;

// Ordered as the picker shows them. `clean` is the named baseline (the clean
// default hand; omitting the key renders it).
export const DRAWINGS: DrawingEntry[] = [
	{
		name: 'clean', label: 'Clean',
		blurb: 'The clean default — Playfair headings, Outfit body, crisp boxes.',
		swatch: { background: 'var(--bg)' },
	},
	{
		name: 'sketch', label: 'Sketch',
		blurb: 'Hand-drawn — handwriting type, wobbly boxes, wavy rules.',
		swatch: { background: `repeating-linear-gradient(8deg, ${A(62)} 0 1.5px, transparent 1.5px 5px)` },
	},
	{
		name: 'sketch-headings', label: 'Sketch headings',
		blurb: 'Hand headings and boxes; clean body text for dense slides.',
		swatch: { background: `repeating-linear-gradient(8deg, ${A(52)} 0 1.5px, transparent 1.5px 7px)` },
	},
];

export const DRAWING_BY_NAME: Record<string, DrawingEntry> = Object.fromEntries(
	DRAWINGS.map((s) => [s.name, s]),
);

/** The active drawing for a deck `drawing:` value (defaults to clean). */
export function activeDrawing(value: string | undefined | null): DrawingEntry {
	const key = (value ?? '').trim().toLowerCase();
	return DRAWING_BY_NAME[key] ?? DRAWING_BY_NAME.clean;
}
