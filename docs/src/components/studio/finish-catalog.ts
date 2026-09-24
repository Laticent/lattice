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

// A DEFAULT import: the presets module is CommonJS, and the docs dev server only interops
// a default import off a CommonJS leaf (docs/src/plugins/vite-cjs-lib-dev.mjs).
import finishPresets from '../../../../lib/finishes/presets.generated.js';

const { FINISH_PRESETS } = finishPresets;

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

// The shipped finishes come from their PACKAGES (lib/finishes/<name>/<name>.manifest.json:
// label, blurb, picker swatch), through the generated presets module. This file used to
// hand-keep a second copy of every preset's label and swatch, one of four places a new
// finish had to be typed in (engineering/decisions/2026-09-23-portable-packages.md §3.6).
export const FINISHES: FinishEntry[] = [
	{
		name: 'none', label: 'None', group: 'plain', nature: 'parametric', zone: 'none',
		blurb: 'No backdrop — just the content over the theme canvas.',
		swatch: { background: 'var(--bg)' },
	},
	...FINISH_PRESETS.map((p): FinishEntry => ({
		name: p.name,
		label: p.label,
		blurb: p.blurb,
		group: 'finish',
		nature: 'parametric',
		zone: 'field',
		swatch: p.swatch as FinishEntry['swatch'],
	})),
];

export const FINISH_BY_NAME: Record<string, FinishEntry> = Object.fromEntries(
	FINISHES.map((f) => [f.name, f]),
);

/** The active finish for a deck `finish:` value (defaults to none). */
export function activeFinish(value: string | undefined | null): FinishEntry {
	const key = (value ?? '').trim().toLowerCase();
	return FINISH_BY_NAME[key] ?? FINISH_BY_NAME.none;
}
