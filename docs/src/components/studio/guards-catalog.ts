// The Studio guards catalog — DISPLAY metadata for the `guards:` register (whether the
// engine may trim text that does not fit). Sibling of corners-catalog.ts / claim-catalog.ts.
// The engine's single source of truth is GUARDS_NAMES (lib/core/resolve-guards.js); THIS
// file adds only the human layer the picker needs. Rot-guard: guards-catalog.test.ts.
//
// Authored deck-wide via `guards:` or per-slide via `_class: guards-strict` /
// `guards-loose` (loose carries an explicit token so a slide can opt back out of a
// strict deck).

export type GuardsEntry = {
	/** the `guards:` register value (and engine GUARDS_NAMES member) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip — lines of text, whole or cut short */
	swatch: { background: string; backgroundSize?: string };
};

const INK = (pct: number) => `color-mix(in srgb, var(--text-heading) ${pct}%, transparent)`;
// Three text lines. Loose runs the last line to the frame edge; strict cuts it short.
const lines = (last: string) =>
	`linear-gradient(${INK(30)}, ${INK(30)}) 18% 30% / 64% 10% no-repeat, `
	+ `linear-gradient(${INK(30)}, ${INK(30)}) 18% 50% / 64% 10% no-repeat, `
	+ `linear-gradient(${INK(30)}, ${INK(30)}) 18% 70% / ${last} 10% no-repeat, var(--bg)`;

// Ordered as the picker shows them. `loose` is the baseline (it maps to no class token, so
// omitting the key renders it).
export const GUARDS: GuardsEntry[] = [
	{
		name: 'loose', label: 'Keep all text',
		blurb: 'Text that overflows is kept and flagged — nothing is ever cut. The default.',
		swatch: { background: lines('64%') },
	},
	{
		name: 'strict', label: 'Trim to fit',
		blurb: 'The engine may cut the tail of text that does not fit its box.',
		swatch: { background: lines('30%') },
	},
];

export const GUARDS_BY_NAME: Record<string, GuardsEntry> = Object.fromEntries(
	GUARDS.map((s) => [s.name, s]),
);

/** The active guards entry for a value; unknown / empty → the `loose` baseline. */
export function activeGuards(value: string | undefined | null): GuardsEntry {
	const key = (value ?? '').trim().toLowerCase();
	return GUARDS_BY_NAME[key] ?? GUARDS_BY_NAME.loose;
}
