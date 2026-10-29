// The Squadra demo page's ruleset (/libraries/squadra/): a small "notes" language and six rules,
// three honest and three broken in a way the compiler catches. The page compiles them with the REAL
// library, in lenient mode, so a reader sees a broken rule refused before it touches their text.
// Kept out of the package (docs/src/lib/squadra/) because it is a demo, not part of the library.
//
// The notes language: `===` on its own line ends a section, a ``` fence is inert, and an optional
// `---` header holds `key: value` lines. Nodes: doc → header → key; doc → section → line | fence.

import { type CodeRule, compileRuleset, editsFix, type Language, type Node, type Ruleset, type Source, type Span } from './squadra/index';

const lineSpans = (text: string): Span[] => {
	const out: Span[] = [];
	let pos = 0;
	for (const l of text.split('\n')) {
		out.push({ from: pos, to: pos + l.length });
		pos += l.length + 1;
	}
	if (text.endsWith('\n')) out.pop();
	return out;
};

export const notes: Language = {
	id: 'notes',
	version: '1',
	kinds: ['doc', 'header', 'key', 'section', 'line', 'fence'],
	parse(source: Source) {
		const { text } = source;
		const lines = lineSpans(text);
		const at = (i: number) => text.slice(lines[i].from, lines[i].to);
		const kids: Node[] = [];
		let i = 0;
		if (lines.length && at(0) === '---') {
			let j = 1;
			while (j < lines.length && at(j) !== '---') j++;
			if (j < lines.length) {
				const keys: Node[] = [];
				for (let k = 1; k < j; k++) {
					const m = /^([a-z-]+):\s*(.*)$/.exec(at(k));
					if (m) keys.push({ kind: 'key', from: lines[k].from, to: lines[k].to, kids: [], attrs: { name: m[1], value: m[2] } });
				}
				kids.push({ kind: 'header', from: 0, to: Math.min(text.length, lines[j].to + 1), kids: keys });
				i = j + 1;
			}
		}
		let section: Node[] = [];
		let from = i < lines.length ? lines[i].from : text.length;
		const close = (to: number) => {
			kids.push({ kind: 'section', from, to, kids: section });
			section = [];
		};
		for (; i < lines.length; i++) {
			const l = at(i);
			if (l === '===') {
				close(lines[i].from);
				from = i + 1 < lines.length ? lines[i + 1].from : text.length;
				continue;
			}
			if (l.startsWith('```')) {
				let j = i + 1;
				while (j < lines.length && !at(j).startsWith('```')) j++;
				section.push({ kind: 'fence', from: lines[i].from, to: j < lines.length ? lines[j].to : text.length, kids: [] });
				i = j;
				continue;
			}
			section.push({ kind: 'line', from: lines[i].from, to: lines[i].to, kids: [] });
		}
		close(text.length);
		return { tree: { kind: 'doc', from: 0, to: text.length, kids }, errors: [] };
	},
	inert(tree: Node) {
		const out: Span[] = [];
		const walk = (n: Node) => {
			if (n.kind === 'fence') out.push({ from: n.from, to: n.to });
			n.kids.forEach(walk);
		};
		walk(tree);
		return out;
	},
	shape(tree: Node, source: Source) {
		const header = tree.kids.find((k) => k.kind === 'header');
		const inert = (notes.inert?.(tree, source) ?? []).map((s) => source.text.slice(s.from, s.to));
		return { units: tree.kids.filter((k) => k.kind === 'section').length, header: header ? { from: header.from, to: header.to } : null, inert };
	},
	locate(tree: Node, span: Span) {
		const sections = tree.kids.filter((k) => k.kind === 'section');
		const idx = sections.findIndex((s) => s.from <= span.from && span.from <= s.to);
		return { section: idx < 0 ? 1 : idx + 1 };
	},
};

const budget = { ops: 20_000 };
const fence = (role: string, body: string) => `\`\`\`notes ${role}\n${body}\n\`\`\`\n`;

/** A rule that reports `re` on every line and offers `fixText(match)`, or no fix when it is null. */
function lineRule(id: string, summary: string, message: string, re: RegExp, fixText: ((m: string) => string) | null, extra: Partial<CodeRule> = {}): CodeRule {
	return {
		id: `notes/${id}`,
		language: 'notes',
		severity: 'warning',
		summary,
		examples: `${id}.fixtures.md`,
		fixable: fixText !== null,
		budget,
		visit: {
			line(node, ctx) {
				const t = ctx.text(node);
				for (const m of t.matchAll(new RegExp(re.source, 'g'))) {
					const span = { from: node.from + (m.index ?? 0), to: node.from + (m.index ?? 0) + m[0].length };
					ctx.report({ span, message, fixes: fixText ? [editsFix(summary, { op: 'replace', span, text: fixText(m[0]) })] : [] });
				}
			},
		},
		...extra,
	};
}

export interface DemoRule {
	readonly id: string;
	readonly label: string;
	/** What the rule does, or what is wrong with it, in one line for the page. */
	readonly note: string;
	readonly broken: boolean;
	readonly rule: CodeRule;
	readonly fixtures: string;
}

export const DEMO_RULES: readonly DemoRule[] = [
	{
		id: 'notes/no-todo',
		label: 'No TODO',
		note: 'A TODO left in the text. The fix marks it DONE.',
		broken: false,
		rule: lineRule('no-todo', 'Mark it done.', 'A TODO is left in.', /\bTODO\b/, () => 'DONE'),
		fixtures: fence('bad', 'call the venue ⟦TODO⟧') + fence('fixed', 'call the venue DONE') + fence('good', 'call the venue DONE'),
	},
	{
		id: 'notes/one-space',
		label: 'One space',
		note: 'Two or more spaces between words. The fix leaves one.',
		broken: false,
		rule: lineRule('one-space', 'Use one space.', 'More than one space between words.', /(?<=\S) {2,}(?=\S)/, () => ' '),
		fixtures: fence('bad', 'book the⟦  ⟧room') + fence('fixed', 'book the room') + fence('good', 'book the room'),
	},
	{
		id: 'notes/no-trailing-space',
		label: 'No trailing space',
		note: 'Spaces at the end of a line. The fix deletes them.',
		broken: false,
		rule: lineRule('no-trailing-space', 'Delete the trailing spaces.', 'Spaces at the end of the line.', /(?<=\S)[ \t]+$/, () => ''),
		fixtures: fence('bad', 'send the agenda⟦   ⟧') + fence('fixed', 'send the agenda') + fence('good', 'send the agenda'),
	},
	{
		id: 'notes/no-venue',
		label: 'Too eager',
		note: 'Meant to flag "venue TBC", it flags every "venue", including its own good example.',
		broken: true,
		rule: lineRule('no-venue', 'Confirm the venue.', 'The venue is not confirmed.', /\bvenue\b/, null),
		fixtures: fence('bad', 'the ⟦venue⟧ TBC') + fence('good', 'the venue is the Hall'),
	},
	{
		id: 'notes/next-section',
		label: 'Splits a section',
		note: 'Its fix starts a new section before "Next:", which changes the number of sections without saying so.',
		broken: true,
		rule: lineRule('next-section', 'Start a section.', '"Next:" belongs in its own section.', /^Next:/, (m) => `===\n${m}`),
		fixtures: fence('bad', 'done\n⟦Next:⟧ the budget') + fence('fixed', 'done\n===\nNext: the budget') + fence('good', 'done\n===\nthe budget'),
	},
	{
		id: 'notes/tbd',
		label: 'Never finishes',
		note: 'Its fix turns "TBD" into "TBD." and the rule still fires on the result.',
		broken: true,
		rule: lineRule('tbd', 'Close the sentence.', 'A TBD is left in.', /\bTBD\b/, (m) => `${m}.`),
		fixtures: fence('bad', 'room ⟦TBD⟧') + fence('fixed', 'room TBD.') + fence('good', 'room booked'),
	},
];

/** Compile the chosen rules with the real library, in lenient mode: a refused rule is dropped and named. */
export function compileDemo(ids: readonly string[] = DEMO_RULES.map((r) => r.id)): Ruleset {
	const chosen = DEMO_RULES.filter((r) => ids.includes(r.id));
	return compileRuleset({
		name: 'notes',
		version: '1',
		mode: 'lenient',
		languages: [notes],
		rules: chosen.map((r) => r.rule),
		examples: Object.fromEntries(chosen.map((r) => [r.rule.examples as string, r.fixtures])),
	});
}

export const SAMPLE = [
	'---',
	'owner: Ada',
	'---',
	'Offsite plan',
	'call the venue TODO',
	'book the  room   ',
	'===',
	'Agenda TBD',
	'Next: the budget',
	'```',
	'an example, left as written: TODO  here',
	'```',
	'send the agenda TODO',
].join('\n');
