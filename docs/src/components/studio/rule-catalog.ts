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
	blurb: string;
	/** CSS for the preview chip — an underline segment beneath a title */
	swatch: { background: string; backgroundSize?: string };
};

const HAIR = 'var(--border)';

// Ordered as the picker shows them. `auto` is the named baseline (today's render).
export const RULES: RuleEntry[] = [
	{
		name: 'auto', label: 'Auto',
		blurb: 'Today’s render — a hairline where the masthead already draws one, else nothing.',
		swatch: { background: `linear-gradient(${HAIR}, ${HAIR}) left bottom / 66% 1.5px no-repeat, var(--bg)` },
	},
	{
		name: 'full', label: 'Full',
		blurb: 'A full-width hairline under the heading.',
		swatch: { background: `linear-gradient(${HAIR}, ${HAIR}) left bottom / 100% 1.5px no-repeat, var(--bg)` },
	},
	{
		name: 'short', label: 'Short',
		blurb: 'A short left-aligned rule under the heading.',
		swatch: { background: `linear-gradient(${HAIR}, ${HAIR}) left bottom / 40% 2px no-repeat, var(--bg)` },
	},
	{
		name: 'accent', label: 'Accent',
		blurb: 'A short rule in the accent color — a signature without shouting.',
		swatch: { background: 'linear-gradient(var(--accent), var(--accent)) left bottom / 40% 2px no-repeat, var(--bg)' },
	},
	{
		name: 'none', label: 'None',
		blurb: 'No heading underline anywhere.',
		swatch: { background: 'var(--bg)' },
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
