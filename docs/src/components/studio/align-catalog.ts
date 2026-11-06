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
	blurb: string;
	/** CSS for the preview chip: one block placed in a frame */
	swatch: { background: string; backgroundSize?: string };
};

const INK = (pct: number) => `color-mix(in srgb, var(--text-heading) ${pct}%, transparent)`;
const block = (x: string, y: string, w: string, h: string) => `linear-gradient(${INK(26)}, ${INK(26)}) ${x} ${y} / ${w} ${h} no-repeat`;
const chip = (...blocks: string[]) => `${blocks.join(', ')}, var(--bg)`;

// Up and down, ordered as the picker shows them.
export const ALIGN_VERTICAL: AlignEntry[] = [
	{ name: 'top', label: 'Top', blurb: 'Content starts under the title; spare space falls below.', swatch: { background: chip(block('50%', '14%', '70%', '16%'), block('50%', '38%', '70%', '16%')) } },
	{ name: 'middle', label: 'Middle', blurb: 'Content sits together in the middle of the frame.', swatch: { background: chip(block('50%', '38%', '70%', '16%'), block('50%', '62%', '70%', '16%')) } },
	{ name: 'bottom', label: 'Bottom', blurb: 'Content sits on the floor of the frame; spare space rises above.', swatch: { background: chip(block('50%', '62%', '70%', '16%'), block('50%', '86%', '70%', '16%')) } },
	{ name: 'spread', label: 'Spread', blurb: 'Rows keep their height and share the spare space evenly between them.', swatch: { background: chip(block('50%', '24%', '70%', '16%'), block('50%', '76%', '70%', '16%')) } },
	{ name: 'fill', label: 'Fill', blurb: 'Rows grow to share the whole frame height.', swatch: { background: chip(block('50%', '12%', '70%', '36%'), block('50%', '88%', '70%', '36%')) } },
];

// Side to side, ordered as the picker shows them.
export const ALIGN_HORIZONTAL: AlignEntry[] = [
	{ name: 'left', label: 'Left', blurb: 'Content starts at the left edge.', swatch: { background: chip(block('14%', '50%', '40%', '40%')) } },
	{ name: 'center', label: 'Center', blurb: 'Content sits in the middle, side to side. Alone, `center` centers both ways.', swatch: { background: chip(block('50%', '50%', '40%', '40%')) } },
	{ name: 'right', label: 'Right', blurb: 'Content ends at the right edge.', swatch: { background: chip(block('86%', '50%', '40%', '40%')) } },
	{ name: 'full', label: 'Full', blurb: 'Content runs the full width.', swatch: { background: chip(block('50%', '50%', '86%', '40%')) } },
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
