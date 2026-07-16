// The Studio eyebrow catalog — DISPLAY metadata for the `eyebrow:` register (the mono-caps
// kicker decoration: plain / dot / bar / arrow / underline). Sibling of spectrum-catalog.ts,
// an accent finish. The engine's single source of truth is EYEBROW_NAMES
// (lib/core/resolve-eyebrow.js). THIS file adds only the human layer the picker needs; the
// rot-guard is eyebrow-catalog.test.ts.
//
// Authored deck-wide via `eyebrow:` or per-slide via `_class: eyebrow-dot` etc.

export type EyebrowEntry = {
	/** the `eyebrow:` register value (and engine EYEBROW_NAMES member) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip — a leading mark, mirroring the decoration */
	swatch: { background: string; backgroundSize?: string };
};

const AC = 'var(--accent)';

// Ordered as the picker shows them. `plain` is the named baseline (the bare label).
export const EYEBROWS: EyebrowEntry[] = [
	{
		name: 'plain', label: 'Plain',
		blurb: 'The bare mono-caps label — the default.',
		swatch: { background: 'var(--bg)' },
	},
	{
		name: 'dot', label: 'Dot',
		blurb: 'A small filled accent dot before the label.',
		swatch: { background: `radial-gradient(circle at 4px 50%, ${AC} 0 3px, transparent 3.5px), var(--bg)` },
	},
	{
		name: 'bar', label: 'Bar',
		blurb: 'A short vertical accent tick before the label.',
		swatch: { background: `linear-gradient(${AC}, ${AC}) 2px 50% / 2.5px 60% no-repeat, var(--bg)` },
	},
	{
		name: 'arrow', label: 'Arrow',
		blurb: 'A leading chevron (›) in the accent color.',
		swatch: { background: `linear-gradient(45deg, transparent 46%, ${AC} 46% 54%, transparent 54%) 1px 50% / 7px 7px no-repeat, var(--bg)` },
	},
	{
		name: 'underline', label: 'Underline',
		blurb: 'A hairline rule beneath the label.',
		swatch: { background: 'linear-gradient(var(--border), var(--border)) left bottom / 60% 1.5px no-repeat, var(--bg)' },
	},
];

export const EYEBROW_BY_NAME: Record<string, EyebrowEntry> = Object.fromEntries(
	EYEBROWS.map((s) => [s.name, s]),
);

/** The active eyebrow entry for a value; unknown / empty → the `plain` default. */
export function activeEyebrow(value: string | undefined | null): EyebrowEntry {
	const key = (value ?? '').trim().toLowerCase();
	return EYEBROW_BY_NAME[key] ?? EYEBROW_BY_NAME.plain;
}
