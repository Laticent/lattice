// chart_from_data: the tool definition and the slide it writes. Its own module, imported only by the
// lazily loaded chat agent, because it carries the chart family's number reader and chat-actions.ts is
// also imported by the chat panel (autoHold), whose bundle should not pay for it.

import { readNumber } from '@laticent/segno/values';

/** The chart kinds chart_from_data writes: the ones whose data is a plain list with value pills. */
export const CHART_KINDS = ['bar', 'line', 'piechart', 'stacked-bar'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];
const CHART_VARIANTS: Readonly<Record<ChartKind, readonly string[]>> = { bar: ['row', 'diverging'], line: [], piechart: ['donut'], 'stacked-bar': [] };

export const CHART_TOOL = {
	type: 'function',
	function: {
		name: 'chart_from_data',
		description:
			'Put numbers on a NEW slide as a chart, on the draft. bar compares categories; line shows a trend over ordered steps; piechart shows parts of one whole (values summing to 100%); stacked-bar shows what each total is made of (give `parts`). Write the heading as the claim the numbers make. Values keep their units: `$4.2M`, `68%`, `12,400`. Read the chart guide (read_component) if unsure.',
		parameters: {
			type: 'object',
			properties: {
				after: { type: 'integer', description: 'Insert after this slide number (0 puts it first).' },
				kind: { type: 'string', enum: [...CHART_KINDS] },
				variant: { type: 'string', enum: ['row', 'diverging', 'donut'], description: 'Optional: bar row (long names) or diverging (signed values); piechart donut.' },
				heading: { type: 'string', description: 'The claim, as a sentence.' },
				rows: {
					type: 'array',
					items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' }, parts: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] } } }, required: ['label'] },
				},
				summary: { type: 'string' },
			},
			required: ['after', 'kind', 'heading', 'rows'],
		},
	},
} as const;

// A value is what the chart family's own reader reads (Segno's readNumber, the test isValuePill uses):
// one grammar for the engine and this tool (HARD RULE #1), so a value the engine draws is never refused
// here and one it cannot draw never passes.
const isValue = (t: string) => readNumber(t) !== undefined;
// Only what would change the Markdown's structure goes: a leading list or heading marker (a year like
// 2021 stays), backticks that would open a pill, line breaks, angle brackets, format characters.
const cleanLabel = (s: unknown, max = 80) => {
	const t = String(s ?? '')
		.replace(/\p{Cf}/gu, '')
		.replace(/[`\r\n<>]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^(?:[-*+>]|#{1,6}|\d+[.)])\s+/, '');
	return t.length <= max ? t : `${t.slice(0, max).replace(/\s+\S*$/, '')}…`;
};

/** The slide chart_from_data writes, or the reason it cannot. Labels lose characters that would
 *  break the list (backticks, newlines, markup, list markers); values must be one number each. */
export function buildChartSlide(a: { kind?: unknown; variant?: unknown; heading?: unknown; rows?: unknown }): { body: string } | { error: string } {
	const kind = String(a.kind ?? '') as ChartKind;
	if (!CHART_KINDS.includes(kind)) return { error: `kind must be one of ${CHART_KINDS.join(', ')}.` };
	const variant = a.variant == null || a.variant === '' ? '' : String(a.variant);
	if (variant && !CHART_VARIANTS[kind].includes(variant)) return { error: `${kind} has no ${variant} variant${CHART_VARIANTS[kind].length ? `; use ${CHART_VARIANTS[kind].join(' or ')}` : ''}.` };
	const h = cleanLabel(a.heading, 120);
	const heading = /[.!?…]$/.test(h) ? h : `${h}.`;
	if (heading.length < 3) return { error: 'heading must state the claim the numbers make.' };
	const rows = Array.isArray(a.rows) ? (a.rows as { label?: unknown; value?: unknown; parts?: unknown }[]) : [];
	if (rows.length < 2 || rows.length > 12) return { error: 'give between 2 and 12 rows.' };
	const pill = (v: unknown, where: string): string | { error: string } => {
		const t = String(v ?? '').trim();
		return isValue(t) ? `\`${t}\`` : { error: `${where}: "${t}" is not one number (write it like 4.2, $4.2M, 68% or 12,400).` };
	};
	const lines: string[] = [];
	for (const r of rows) {
		const label = cleanLabel(r.label);
		if (!label) return { error: 'every row needs a label.' };
		if (kind === 'stacked-bar') {
			const parts = Array.isArray(r.parts) ? (r.parts as { label?: unknown; value?: unknown }[]) : [];
			if (parts.length < 2) return { error: `${label}: a stacked bar needs at least two parts.` };
			lines.push(`- ${label}`);
			for (const p of parts) {
				const pl = cleanLabel(p.label);
				const v = pill(p.value, `${label} / ${pl}`);
				if (typeof v !== 'string') return v;
				if (!pl) return { error: `${label}: every part needs a label.` };
				lines.push(`  - ${pl} ${v}`);
			}
		} else {
			const v = pill(r.value, label);
			if (typeof v !== 'string') return v;
			lines.push(`- ${label} ${v}`);
		}
	}
	return { body: `<!-- _class: ${kind}${variant ? ` ${variant}` : ''} -->\n\n## ${heading}\n\n${lines.join('\n')}` };
}
