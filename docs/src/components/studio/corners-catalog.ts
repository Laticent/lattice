// The Studio corners catalog — DISPLAY metadata for the `corners:` register (whether
// the slide's own surface is rounded). Sibling of mode-catalog.ts / rule-catalog.ts.
// The engine's single source of truth is CORNERS_NAMES (lib/core/resolve-corners.js);
// THIS file adds only the human layer the picker needs. Rot-guard: corners-catalog.test.ts.
//
// Authored deck-wide via `corners:` or per-slide via `_class: corners-rounded` /
// `corners-square` (square carries an explicit token so a slide can opt back out of a
// rounded deck).

export type CornersEntry = {
	/** the `corners:` register value (and engine CORNERS_NAMES member) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip — a slide-shaped block, square or rounded */
	swatch: { background: string; backgroundSize?: string };
};

// The chip reads as a miniature slide: a filled block on the panel ground. The
// ROUNDNESS is what differs, and `SwatchChip` already rounds its own box, so the
// difference is carried by an inset ring rather than the chip's own radius.
const SURFACE = 'color-mix(in srgb, var(--text-heading) 22%, transparent)';

// Ordered as the picker shows them. `square` is the baseline (omitting the key renders it).
export const CORNERS: CornersEntry[] = [
	{
		name: 'square', label: 'Square',
		blurb: 'Slide corners meet at a right angle — the default.',
		swatch: { background: `linear-gradient(${SURFACE}, ${SURFACE}) center / 82% 68% no-repeat, var(--bg)` },
	},
	{
		name: 'rounded', label: 'Rounded',
		blurb: 'The slide surface itself carries a soft radius — a lighter, more screen-native frame.',
		swatch: { background: `radial-gradient(circle at 14% 22%, transparent 0 22%, ${SURFACE} 22%) center / 82% 68% no-repeat, var(--bg)` },
	},
];

export const CORNERS_BY_NAME: Record<string, CornersEntry> = Object.fromEntries(
	CORNERS.map((s) => [s.name, s]),
);

/** The active corners entry for a value; unknown / empty → the `square` baseline. */
export function activeCorners(value: string | undefined | null): CornersEntry {
	const key = (value ?? '').trim().toLowerCase();
	return CORNERS_BY_NAME[key] ?? CORNERS_BY_NAME.square;
}
