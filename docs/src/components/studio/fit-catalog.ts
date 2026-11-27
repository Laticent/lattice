// The Studio fit catalog — DISPLAY metadata for the `fit:` register:
// what the engine may do to make a slide fit. Sibling of corners-catalog.ts /
// claim-catalog.ts. The engine's single source of truth is FIT_NAMES
// (lib/core/resolve-fit.js); THIS file adds only the human layer the picker needs.
// Rot-guard: fit-catalog.test.ts. Design record:
// engineering/decisions/2026-09-25-fit-policy.md.
//
// Authored deck-wide via `fit:` or per-slide via `_class: fit-report` / `fit-heal` /
// `fit-trim` (heal carries an explicit token so a slide can opt back to the default).
// The old `guards:` spelling is retired: the engine does not read it, so neither does this.

export type FitEntry = {
	/** the `fit:` register value (and engine FIT_NAMES member) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip — lines of text, whole, flagged or cut short */
	swatch: { background: string; backgroundSize?: string };
};

const INK = (pct: number) => `color-mix(in srgb, var(--text-heading) ${pct}%, transparent)`;
// Three text lines. Report runs the last line past the frame; heal keeps it whole; trim cuts it short.
const lines = (last: string) =>
	`linear-gradient(${INK(30)}, ${INK(30)}) 18% 30% / 64% 10% no-repeat, `
	+ `linear-gradient(${INK(30)}, ${INK(30)}) 18% 50% / 64% 10% no-repeat, `
	+ `linear-gradient(${INK(30)}, ${INK(30)}) 18% 70% / ${last} 10% no-repeat, var(--bg)`;

// Ordered as the picker shows them. `pack` is the DEFAULT since 2026-11-06 (omitting the key
// measures the split; lib/core/resolve-fit.js `fitPacks`); `heal` splits by count, as the old
// default did, and is chosen by writing it.
export const FIT: FitEntry[] = [
	{
		name: 'report', label: 'Report only',
		blurb: 'The engine changes nothing. A slide that does not fit is clipped and flagged for you to fix.',
		swatch: { background: lines('82%') },
	},
	{
		name: 'pack', label: 'Measure and split',
		blurb: 'The default. The engine measures each slide: one that fits stays one page, and one that overflows splits into as many items a page as fit. It never changes the type size.',
		swatch: { background: lines('64%') },
	},
	{
		name: 'heal', label: 'Split by count',
		blurb: 'Splits an overfull slide by a set number of items a page, without measuring. The default before measuring.',
		swatch: { background: lines('64%') },
	},
	{
		name: 'trim', label: 'Split by count and trim',
		blurb: 'Splits by count, and also lets the engine cut the tail of text that does not fit its box.',
		swatch: { background: lines('30%') },
	},
];

export const FIT_BY_NAME: Record<string, FitEntry> = Object.fromEntries(
	FIT.map((s) => [s.name, s]),
);

/**
 * The active fit entry for a deck's front matter, resolved exactly as the engine does: a known
 * `fit:` value, else the `pack` default (an unknown value reads as `pack` there too:
 * lib/core/resolve-fit.js `fitPacks`).
 */
export function activeFit(fit: string | undefined | null): FitEntry {
	return FIT_BY_NAME[(fit ?? '').trim().toLowerCase()] ?? FIT_BY_NAME.pack;
}
