// The Studio MOTION catalogs — DISPLAY metadata for the Style and Speed axes of chart motion (the
// Play axis is a simple on/off, no catalog). Motion is a PREVIEW-ONLY enhancement resolved in the
// Anima host (docs/src/playground/anima-host-sel.ts — `MOTION_STYLES` / `MOTION_SPEEDS`), never baked
// into the export. This file adds only the human layer the pickers need (label, blurb, swatch); the
// value sets must stay in step with the host's `MOTION_STYLES` / `MOTION_SPEEDS` (motion-catalog.test.ts).

export type MotionEntry = {
	name: string;
	label: string;
	blurb: string;
	swatch: { background: string; backgroundSize?: string };
};

const A = (pct: number) => `color-mix(in srgb, var(--accent) ${pct}%, transparent)`;

/** STYLE — HOW a chart animates. */
export const MOTION_STYLE_ENTRIES: MotionEntry[] = [
	{ name: 'build', label: 'Build', blurb: 'Marks appear in reading order — a funnel top-to-bottom, a pie as one disc; the worst drop-off emphasizes.', swatch: { background: `linear-gradient(90deg, ${A(52)} 0 33%, ${A(30)} 33% 66%, ${A(14)} 66%)` } },
	{ name: 'together', label: 'Together', blurb: 'The whole chart fades in at once — every mark synchronized.', swatch: { background: A(34) } },
	{ name: 'rise', label: 'Rise', blurb: 'Marks slide up into place as they fade in — the build, with a lift.', swatch: { background: `linear-gradient(0deg, ${A(50)} 0 40%, ${A(18)} 40%)` } },
];

/** SPEED — how FAST. `auto` scales to the chart's mark count. */
export const MOTION_SPEED_ENTRIES: MotionEntry[] = [
	{ name: 'auto', label: 'Auto', blurb: 'Paced to the chart — a bigger chart takes a little longer, so each mark keeps a steady beat.', swatch: { background: A(28) } },
	{ name: 'slow', label: 'Slow', blurb: 'A calm, deliberate build (~5s).', swatch: { background: A(16) } },
	{ name: 'normal', label: 'Normal', blurb: 'The standard pace (~3.6s).', swatch: { background: A(34) } },
	{ name: 'fast', label: 'Fast', blurb: 'A quick build (~2s).', swatch: { background: A(52) } },
];

const byName = (entries: MotionEntry[]) => Object.fromEntries(entries.map((e) => [e.name, e]));
const STYLE_BY_NAME = byName(MOTION_STYLE_ENTRIES);
const SPEED_BY_NAME = byName(MOTION_SPEED_ENTRIES);

/** The active style entry for a value (defaults to build — the built-in default). */
export function activeMotionStyle(value: string | undefined | null): MotionEntry {
	return STYLE_BY_NAME[(value ?? '').trim().toLowerCase()] ?? STYLE_BY_NAME.build;
}
/** The active speed entry for a value (defaults to auto). */
export function activeMotionSpeed(value: string | undefined | null): MotionEntry {
	return SPEED_BY_NAME[(value ?? '').trim().toLowerCase()] ?? SPEED_BY_NAME.auto;
}
