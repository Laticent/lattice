// The Studio rule catalog — DISPLAY metadata for the `rule:` register (the HEADING
// underline: auto / full / short / accent / none). Sibling of spectrum-catalog.ts, an accent
// finish. The engine's single source of truth is RULE_NAMES (lib/core/resolve-rule.js). THIS
// file adds only the human layer the picker needs; the rot-guard is rule-catalog.test.ts.
//
// Authored deck-wide via `rule:` or per-slide via `_class: rule-short` etc.

export type RuleEntry = {
	/** the `rule:` register value (and engine RULE_NAMES member) */
	name: string;
	label: string;
	/** For an entry whose own label is "Auto": what auto RESOLVES to, for the
	 *  `Auto — <resolved>` head. Without it that head reads "Auto — Auto"
	 *  (see autoHeadLabel in auto-mark.tsx). */
	autoLabel?: string;
	blurb: string;
	/** CSS for the preview chip — an underline segment beneath a title */
	swatch: { background: string; backgroundSize?: string };
};

// The chip draws the hairline in the MUTED ink, not --border: at 16px a --border rule on the
// panel ground is near-invisible, and the chip's job is to show the rule's length.
const HAIR = 'var(--text-muted)';
// A heading stroke up top, then the rule under it — so the chip reads as "the line under a
// heading", and the rule sits clear of the chip's own border.
const HEAD = 'linear-gradient(var(--text-heading), var(--text-heading)) 3px 34% / 56% 2.5px no-repeat';
const ruled = (ink: string, width: string, weight: string) =>
	`${HEAD}, linear-gradient(${ink}, ${ink}) 3px 70% / ${width} ${weight} no-repeat, var(--bg)`;

// Ordered as the picker shows them. `auto` is the named baseline (today's render).
export const RULES: RuleEntry[] = [
	{
		name: 'auto', label: 'Auto', autoLabel: 'Hairline',
		blurb: 'Today’s render — a hairline where the masthead already draws one, else nothing.',
		swatch: { background: ruled(HAIR, '66%', '1.5px') },
	},
	{
		name: 'full', label: 'Full',
		blurb: 'A full-width hairline under the heading.',
		swatch: { background: ruled(HAIR, 'calc(100% - 6px)', '1.5px') },
	},
	{
		name: 'short', label: 'Short',
		blurb: 'A short left-aligned rule under the heading.',
		swatch: { background: ruled(HAIR, '40%', '2px') },
	},
	{
		name: 'accent', label: 'Accent',
		blurb: 'A short rule in the accent color — a signature without shouting.',
		swatch: { background: ruled('var(--accent)', '40%', '2px') },
	},
	{
		name: 'none', label: 'None',
		blurb: 'No heading underline anywhere.',
		swatch: { background: `${HEAD}, var(--bg)` },
	},
];

export const RULE_BY_NAME: Record<string, RuleEntry> = Object.fromEntries(
	RULES.map((s) => [s.name, s]),
);

/** The active rule entry for a value; unknown / empty → the `auto` default. */
export function activeRule(value: string | undefined | null): RuleEntry {
	const key = (value ?? '').trim().toLowerCase();
	return RULE_BY_NAME[key] ?? RULE_BY_NAME.auto;
}
