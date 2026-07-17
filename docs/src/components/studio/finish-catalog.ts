// The Studio finish catalog — DISPLAY metadata for the Finish family, the
// surface artifact of the Finish axis (engineering/decisions/
// 2026-06-30-finish-the-surface-layer.md). The engine's single source of truth
// for name→class is FINISH_REGISTER (lib/core/resolve-finish.js), gated by the
// rot-guard in test/unit/parsing/resolve-finish.test.js. THIS file adds only the
// human layer the picker needs (label, blurb, swatch preview) and MUST stay in
// step with FINISH_REGISTER — every `name` here is a registered finish.
//
// A finish is authored deck-wide via the `finish:` front-matter register (no new
// key) or per-slide via `_class: finish finish-<name>`. Preset swatches use
// var(--accent) so the chip recolors with the site theme, exactly like the real
// finish does.

export type FinishNature = 'parametric' | 'typographic';
export type FinishZone = 'field' | 'none';
export type FinishGroup = 'plain' | 'finish';

export type FinishEntry = {
	/** the `finish:` register value (and engine FINISH_REGISTER key) */
	name: string;
	label: string;
	blurb: string;
	group: FinishGroup;
	nature: FinishNature;
	zone: FinishZone;
	/** CSS for the preview chip — background (+ optional size for tiled motifs) */
	swatch: { background: string; backgroundSize?: string };
};

const A = (pct: number) => `color-mix(in srgb, var(--accent) ${pct}%, transparent)`;

// Ordered as the picker shows them. `none` is the named baseline (no backdrop;
// omitting the key renders it). The rendering MODE — boardroom / sketch — is a
// SEPARATE axis now (mode-catalog.ts / the `style:` register), so it no longer
// lives here. Each finish preset is a STACK of layers in the engine; the chip
// shows a single representative layer, intentionally a touch more saturated than
// the real (deliberately subtle) finish so the motif reads at 16px.
export const FINISHES: FinishEntry[] = [
	{
		name: 'none', label: 'None', group: 'plain', nature: 'parametric', zone: 'none',
		blurb: 'No backdrop — just the content over the theme canvas.',
		swatch: { background: 'var(--bg)' },
	},
	{
		name: 'atrium', label: 'Atrium', group: 'finish', nature: 'parametric', zone: 'field',
		blurb: 'Corner glow + a fine grid + a left margin rule.',
		swatch: {
			background:
				`radial-gradient(120% 90% at 100% 0%, ${A(45)}, transparent 60%), `
				+ `repeating-linear-gradient(0deg, ${A(28)} 0 1px, transparent 1px 6px), `
				+ `repeating-linear-gradient(90deg, ${A(28)} 0 1px, transparent 1px 6px)`,
		},
	},
	{
		name: 'meridian', label: 'Meridian', group: 'finish', nature: 'parametric', zone: 'field',
		blurb: 'Diagonal duotone wash + contour lines + a ghost numeral.',
		swatch: {
			background:
				`linear-gradient(118deg, ${A(40)} 0%, transparent 45%, ${A(24)} 100%), `
				+ `repeating-linear-gradient(-4deg, transparent 0 7px, ${A(26)} 7px 8px)`,
		},
	},
	{
		name: 'strata', label: 'Strata', group: 'finish', nature: 'parametric', zone: 'field',
		blurb: 'Soft horizontal bands + a dot-matrix + a corner tick.',
		swatch: {
			background:
				`linear-gradient(125deg, ${A(40)}, transparent 60%), `
				+ `radial-gradient(${A(55)} 0 1px, transparent 1.6px)`,
			backgroundSize: 'cover, 6px 6px',
		},
	},
	{
		name: 'halo', label: 'Halo', group: 'finish', nature: 'parametric', zone: 'field',
		blurb: 'Centered spotlight + concentric rings + an inset vignette.',
		swatch: {
			background:
				`radial-gradient(60% 60% at 50% 50%, ${A(40)}, transparent 70%), `
				+ `repeating-radial-gradient(circle at 50% 50%, transparent 0 6px, ${A(34)} 6px 7px)`,
		},
	},
	{
		name: 'ledger', label: 'Ledger', group: 'finish', nature: 'parametric', zone: 'field',
		blurb: 'Fine ruled lines + a bold left margin bar + a corner fold.',
		swatch: {
			background:
				`linear-gradient(90deg, ${A(80)} 0 2px, transparent 2px), `
				+ `repeating-linear-gradient(180deg, transparent 0 5px, ${A(30)} 5px 6px)`,
		},
	},
	{
		name: 'nimbus', label: 'Nimbus', group: 'finish', nature: 'parametric', zone: 'field',
		blurb: 'A gradient mesh of soft accent blooms + a seating vignette.',
		swatch: {
			background:
				`radial-gradient(60% 60% at 15% 20%, ${A(55)}, transparent 60%), `
				+ `radial-gradient(60% 60% at 85% 25%, ${A(40)}, transparent 58%), `
				+ `radial-gradient(60% 60% at 75% 90%, ${A(34)}, transparent 62%)`,
		},
	},
	{
		name: 'loom', label: 'Loom', group: 'finish', nature: 'parametric', zone: 'field',
		blurb: 'A woven lattice cross-hatch + a movable corner glow.',
		swatch: {
			background:
				`radial-gradient(120% 90% at 0% 0%, ${A(45)}, transparent 60%), `
				+ `repeating-linear-gradient(45deg, ${A(30)} 0 1px, transparent 1px 7px), `
				+ `repeating-linear-gradient(-45deg, ${A(30)} 0 1px, transparent 1px 7px)`,
		},
	},
	{
		name: 'savile', label: 'Savile', group: 'finish', nature: 'parametric', zone: 'field',
		blurb: 'A tailored vertical pinstripe + a movable monogram.',
		swatch: {
			background: `repeating-linear-gradient(90deg, ${A(45)} 0 1px, transparent 1px 5px)`,
		},
	},
	{
		name: 'gallery', label: 'Gallery', group: 'finish', nature: 'parametric', zone: 'field',
		blurb: 'A museum inset keyline frame + a spotlight + a movable numeral.',
		swatch: {
			background:
				`linear-gradient(${A(60)}, ${A(60)}) center / calc(100% - 5px) calc(100% - 5px) no-repeat, `
				+ `radial-gradient(70% 70% at 50% 50%, ${A(30)}, transparent 65%)`,
		},
	},
	{
		name: 'hanami', label: 'Hanami', group: 'finish', nature: 'parametric', zone: 'field',
		blurb: 'A sakura haze + a new-leaf whisper + drifting petals + a settling vignette.',
		swatch: {
			background:
				`radial-gradient(135% 78% at 50% 0%, ${A(16)}, transparent 60%), `
				+ `radial-gradient(96% 62% at 6% 100%, ${A(12)}, transparent 58%), `
				+ `repeating-radial-gradient(circle at 20% 30%, ${A(14)} 0 1.5px, transparent 1.5px 10px)`,
		},
	},
];

export const FINISH_BY_NAME: Record<string, FinishEntry> = Object.fromEntries(
	FINISHES.map((f) => [f.name, f]),
);

/** The active finish for a deck `finish:` value (defaults to none). */
export function activeFinish(value: string | undefined | null): FinishEntry {
	const key = (value ?? '').trim().toLowerCase();
	return FINISH_BY_NAME[key] ?? FINISH_BY_NAME.none;
}
