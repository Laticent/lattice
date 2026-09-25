// The Studio fit catalog — DISPLAY metadata for the `fit:` register (formerly `guards:`):
// what the engine may do to make a slide fit. Sibling of corners-catalog.ts /
// claim-catalog.ts. The engine's single source of truth is FIT_NAMES
// (lib/core/resolve-guards.js); THIS file adds only the human layer the picker needs.
// Rot-guard: guards-catalog.test.ts. Design record:
// engineering/decisions/2026-09-25-fit-policy.md.
//
// Authored deck-wide via `fit:` or per-slide via `_class: fit-report` / `fit-heal` /
// `fit-trim` (heal carries an explicit token so a slide can opt back to the default).
// `guards: loose|strict` is the old spelling and reads as heal|trim.

export type GuardsEntry = {
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

// Ordered as the picker shows them. `heal` is the baseline (it maps to no class token, so
// omitting the key renders it).
export const GUARDS: GuardsEntry[] = [
	{
		name: 'report', label: 'Report only',
		blurb: 'The engine changes nothing. A slide that does not fit is clipped and flagged for you to fix.',
		swatch: { background: lines('82%') },
	},
	{
		name: 'heal', label: 'Heal',
		blurb: 'The engine fixes what it can without losing words: it splits a slide or steps its font scale down. The default.',
		swatch: { background: lines('64%') },
	},
	{
		name: 'trim', label: 'Heal and trim',
		blurb: 'Also lets the engine cut the tail of text that does not fit its box.',
		swatch: { background: lines('30%') },
	},
];

export const GUARDS_BY_NAME: Record<string, GuardsEntry> = Object.fromEntries(
	GUARDS.map((s) => [s.name, s]),
);

/**
 * The active fit entry for a deck's front matter, resolved exactly as the engine does: any
 * `fit:` wins (an unknown one reads as `heal`); else the old `guards:` reads as its new name
 * (`strict` → trim, `loose` → heal); else the `heal` baseline.
 */
export function activeGuards(fit: string | undefined | null, guards?: string | undefined | null): GuardsEntry {
	const key = (fit ?? '').trim().toLowerCase();
	if (GUARDS_BY_NAME[key]) return GUARDS_BY_NAME[key];
	// A `fit:` the engine does not know still WINS over `guards:` there
	// (fitClassFromFrontMatter), resolving to the default — so it must here too, or the
	// picker shows a level the deck does not render.
	if (key) return GUARDS_BY_NAME.heal;
	const legacy = (guards ?? '').trim().toLowerCase();
	if (legacy === 'strict') return GUARDS_BY_NAME.trim;
	return GUARDS_BY_NAME.heal;
}
