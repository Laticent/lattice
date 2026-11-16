// The Studio align catalog — DISPLAY metadata for the `align:` register (where a slide's content
// sits, up and down and side to side). Sibling of corners-catalog.ts. The engine's single source
// of truth is VERTICAL / HORIZONTAL (lib/core/resolve-align.js); THIS file adds only the human
// layer the two pickers need. Rot-guard: align-catalog.test.ts.
//
// There is deliberately NO default entry. Omitting an axis means "each component decides", which
// is not the same as any one word, so each picker's Auto row is added by the caller.

export type AlignEntry = {
	/** the `align:` word (and engine VERTICAL / HORIZONTAL member) */
	name: string;
	label: string;
	blurb?: string;
	/** unused beside the icon; CatalogSelect's entry shape requires one */
	swatch: { background: string; backgroundSize?: string };
};

// The pickers draw an icon for every entry (option-glyphs.tsx `alignV` / `alignH`), which
// CatalogSelect paints in place of a swatch, so every entry carries the same plain one.
const swatch = { background: 'var(--bg)' };

// Up and down, ordered as the picker shows them.
export const ALIGN_VERTICAL: AlignEntry[] = [
	{ name: 'top', label: 'Top', swatch },
	{ name: 'middle', label: 'Middle', swatch },
	{ name: 'bottom', label: 'Bottom', swatch },
	{ name: 'spread', label: 'Spread', swatch },
	{ name: 'fill', label: 'Fill', swatch },
];

// Side to side, ordered as the picker shows them.
export const ALIGN_HORIZONTAL: AlignEntry[] = [
	{ name: 'left', label: 'Left', swatch },
	{ name: 'center', label: 'Center', swatch },
	{ name: 'right', label: 'Right', swatch },
	{ name: 'full', label: 'Full', swatch },
];

const byName = (rows: AlignEntry[]): Record<string, AlignEntry> => Object.fromEntries(rows.map((s) => [s.name, s]));
const V = byName(ALIGN_VERTICAL);
const H = byName(ALIGN_HORIZONTAL);

/**
 * The deck's `align:` value read into its two axes, as the engine reads it: one word per axis,
 * the first word for an axis wins, and `center` alone also means `middle`.
 */
export function readAlign(value: string | undefined | null): { v: AlignEntry | null; h: AlignEntry | null } {
	const words = (value ?? '').trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
	let v: AlignEntry | null = null;
	let h: AlignEntry | null = null;
	for (const w of words) {
		if (V[w] && !v) v = V[w];
		else if (H[w] && !h) h = H[w];
	}
	if (words.length === 1 && h?.name === 'center') v = V.middle;
	return { v, h };
}

/**
 * The `align:` value for a pair of picks, or null when both are Auto. `middle center` is written
 * as `center`, the one word that says both.
 */
export function writeAlign(v: string | null, h: string | null): string | null {
	if (v === 'middle' && h === 'center') return 'center';
	const words = [v, h].filter((w): w is string => Boolean(w));
	return words.length ? words.join(' ') : null;
}
