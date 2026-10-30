import { describe, expect, it } from 'vitest';
import {
	type CodeRule,
	checkRuleset,
	compileRuleset,
	editsFix,
	type FixEngine,
	fix,
	lint,
	type Producer,
	parseFixtures,
	RulesetError,
	type RulesetInput,
	reportJson,
	reportText,
	stampRuleset,
} from './index';
import { globToRegExp } from './ruleset';
import type { Language, Node, Source, Span } from './types';

// ── The toy language ───────────────────────────────────────────────────────
// A toy language for Squadra's own tests: small enough to read at a glance, shaped like a deck.
//
//   ---            ← an optional header (front matter): `---` lines around `key: value` lines
//   key: value
//   ---
//   line           ← units are separated by a line that is exactly `===`
//   ===
//   ```            ← a fence: inert, and a `===` inside it is not a separator
//   ===
//   ```
//
// Nodes: `doc` → `header` → `key`; `doc` → `unit` → `line` | `fence`. A `key` has parts `name`
// and `value`. Facts: `doc.units` (the unit count), `line.words` (words on a line).


const toy: Language = {
	id: 'toy',
	version: '1',
	kinds: ['doc', 'header', 'key', 'unit', 'line', 'fence'],
	parse(source: Source) {
		const text = source.text;
		const lines: Span[] = [];
		let pos = 0;
		for (const l of text.split('\n')) {
			lines.push({ from: pos, to: pos + l.length });
			pos += l.length + 1;
		}
		if (text.endsWith('\n')) lines.pop();
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
					if (!m) continue;
					const from = lines[k].from;
					keys.push({ kind: 'key', from, to: lines[k].to, kids: [], attrs: { name: m[1], value: m[2] }, parts: { name: { from, to: from + m[1].length }, value: { from: lines[k].to - m[2].length, to: lines[k].to } } });
				}
				kids.push({ kind: 'header', from: 0, to: Math.min(text.length, lines[j].to + 1), kids: keys });
				i = j + 1;
			}
		}
		let unit: Node[] = [];
		let unitFrom = i < lines.length ? lines[i].from : text.length;
		const close = (to: number) => {
			kids.push({ kind: 'unit', from: unitFrom, to, kids: unit });
			unit = [];
		};
		for (; i < lines.length; i++) {
			const l = at(i);
			if (l === '===') {
				close(lines[i].from);
				unitFrom = i + 1 < lines.length ? lines[i + 1].from : text.length;
				continue;
			}
			if (l.startsWith('```')) {
				let j = i + 1;
				while (j < lines.length && !at(j).startsWith('```')) j++;
				const end = j < lines.length ? lines[j].to : text.length;
				unit.push({ kind: 'fence', from: lines[i].from, to: end, kids: [] });
				i = j;
				continue;
			}
			unit.push({ kind: 'line', from: lines[i].from, to: lines[i].to, kids: [] });
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
		const inert = (toy.inert?.(tree, source) ?? []).map((s) => source.text.slice(s.from, s.to));
		return { units: tree.kids.filter((k) => k.kind === 'unit').length, header: header ? { from: header.from, to: header.to } : null, inert };
	},
	facts: {
		'doc.units': (tree: Node) => tree.kids.filter((k) => k.kind === 'unit').length,
		'line.words': (_tree: Node, source: Source, node?: Node) => (node ? source.text.slice(node.from, node.to).split(/\s+/).filter(Boolean).length : 0),
	},
	locate(tree: Node, span: Span) {
		const units = tree.kids.filter((k) => k.kind === 'unit');
		const idx = units.findIndex((u) => u.from <= span.from && span.from <= u.to);
		return { unit: idx < 0 ? 0 : idx + 1 };
	},
};

// ── Rules used across the tests ─────────────────────────────────────────────

/** Flags `TODO` and offers `DONE`. The plain, well-behaved rule. */
const noTodo: CodeRule = {
	id: 'toy/no-todo',
	language: 'toy',
	severity: 'warning',
	summary: 'A TODO left in a line.',
	examples: 'no-todo.fixtures.md',
	fixable: true,
	budget: { ops: 10_000 },
	visit: {
		line(node, ctx) {
			const t = ctx.text(node);
			const i = t.indexOf('TODO');
			if (i < 0) return;
			const span = { from: node.from + i, to: node.from + i + 4 };
			ctx.report({ span, message: 'A TODO is left in.', hint: 'Finish it.', fixes: [editsFix('Mark it done.', { op: 'replace', span, text: 'DONE' })] });
		},
	},
};
const NO_TODO_FIXTURES = `# no-todo

\`\`\`toy bad
hello ⟦TODO⟧ world
\`\`\`

\`\`\`toy fixed
hello DONE world
\`\`\`

\`\`\`toy good
hello DONE world
\`\`\`
`;

/** Deletes a retired `old:` key, and with it an emptied header, which it declares. */
const retiredKey: CodeRule = {
	id: 'toy/retired-key',
	language: 'toy',
	severity: 'error',
	summary: 'The `old` key is retired.',
	examples: 'retired-key.fixtures.md',
	fixable: true,
	budget: { ops: 10_000 },
	changes: [{ kind: 'front-matter', reason: 'deleting the last key deletes the emptied header' }],
	visit: {
		'header > key'(node, ctx) {
			if (node.attrs?.name !== 'old') return;
			ctx.report({ span: node, message: '`old` is retired.', fixes: [editsFix('Delete the line.', { op: 'deleteLine', span: node })] });
		},
	},
};
const RETIRED_KEY_FIXTURES = `\`\`\`toy bad one
---
⟦old: 1⟧
keep: 2
---
body
\`\`\`
\`\`\`toy fixed one
---
keep: 2
---
body
\`\`\`
\`\`\`toy bad last
---
⟦old: 1⟧
---
body
\`\`\`
\`\`\`toy fixed last
body
\`\`\`
\`\`\`toy good
---
keep: 2
---
body
\`\`\`
`;

function input(rules: CodeRule[], extra: Partial<RulesetInput> = {}): RulesetInput {
	return {
		name: 'toy',
		version: '1',
		languages: [toy],
		rules,
		examples: { 'no-todo.fixtures.md': NO_TODO_FIXTURES, 'retired-key.fixtures.md': RETIRED_KEY_FIXTURES, ...(extra.examples ?? {}) },
		...extra,
		...(extra.examples ? { examples: { 'no-todo.fixtures.md': NO_TODO_FIXTURES, 'retired-key.fixtures.md': RETIRED_KEY_FIXTURES, ...extra.examples } } : {}),
	};
}
const src = (text: string, path = 'a.toy') => ({ path, text, language: 'toy' });

/** A rule built from a function, its examples supplied inline as a fixtures file. */
function ruleWith(id: string, fixtures: string, body: Partial<CodeRule>): { rule: CodeRule; examples: Record<string, string> } {
	return {
		rule: { id: `toy/${id}`, language: 'toy', severity: 'warning', summary: id, examples: `${id}.md`, budget: { ops: 10_000 }, fixable: true, ...body },
		examples: { [`${id}.md`]: fixtures },
	};
}

// ── Lint ─────────────────────────────────────────────────────────────────────

describe('lint', () => {
	const rules = compileRuleset(input([noTodo, retiredKey]));

	it('reports findings with spans, positions, locations and lowered fixes', () => {
		const { findings, stats } = lint(rules, [src('a\nx TODO\n===\nTODO\n')]);
		expect(findings.map((f) => [f.rule, f.span, f.start, f.end, f.location])).toEqual([
			['toy/no-todo', { from: 4, to: 8 }, { line: 2, column: 3 }, { line: 2, column: 7 }, { unit: 1 }],
			['toy/no-todo', { from: 13, to: 17 }, { line: 4, column: 1 }, { line: 4, column: 5 }, { unit: 2 }],
		]);
		expect(findings[0].fixes).toEqual([{ engine: 'edits', safety: 'safe', description: 'Mark it done.', edits: [{ from: 4, to: 8, text: 'DONE' }] }]);
		expect(stats.files).toBe(1);
		expect(stats.perRule['toy/no-todo'].ops).toBeGreaterThan(0);
	});

	it('does not dispatch nodes inside inert ranges, and masks them in ctx.text', () => {
		let seen = '';
		const peek: CodeRule = {
			...noTodo,
			fixable: false,
			id: 'toy/peek',
			examples: 'peek.md',
			visit: undefined,
			check(root, ctx) {
				seen = ctx.text(root);
				if (seen.includes('PEEK')) ctx.report({ span: root, message: 'peek' });
			},
		};
		const r = compileRuleset(input([noTodo, peek], { examples: { 'peek.md': '```toy bad\nPEEK\n```\n```toy good\nx\n```\n' } }));
		const text = 'ok\n```\nTODO\n```\n';
		expect(lint(r, [src(text)], { only: ['toy/no-todo'] }).findings).toEqual([]);
		lint(r, [src(text)], { only: ['toy/peek'] });
		expect(seen).toBe('ok\n   \n    \n   \n');
	});

	it('reports a source in a language the ruleset lacks as a parse error, never as clean', () => {
		const { findings } = lint(rules, [{ path: 'x.css', text: 'a{}', language: 'css' }]);
		expect(findings.map((f) => [f.rule, f.severity])).toEqual([['squadra/parse-error', 'error']]);
	});

	// A rule that runs its own examples within budget, then meets a file far larger than they are.
	const marker = (id: string, budget: { ops: number; findings?: number }) => ({
		rule: { ...noTodo, id: `toy/${id}`, examples: `${id}.md`, budget, fixable: false, visit: { line: (n: import('./types').Node, ctx: import('./types').RuleContext) => (ctx.text(n).includes('G') ? ctx.report({ span: n, message: 'a G' }) : undefined) } },
		examples: { [`${id}.md`]: '```toy bad\nG\n```\n```toy good\nx\n```\n' },
	});

	it('stops a rule past its op budget, and keeps running the others', () => {
		const g = marker('greedy', { ops: 12 });
		const r = compileRuleset(input([noTodo, g.rule], { examples: g.examples }));
		const big = `${'x\n'.repeat(30)}TODO\n`;
		expect(lint(r, [src(big)]).findings.map((f) => f.rule)).toEqual(['squadra/budget-exceeded', 'toy/no-todo']);
	});

	it('caps a rule that floods findings, and reports the cap once', () => {
		const g = marker('flood', { ops: 10_000, findings: 2 });
		const r = compileRuleset(input([g.rule], { examples: g.examples }));
		expect(lint(r, [src('G\nG\nG\nG\n')]).findings.map((f) => f.rule)).toEqual(['squadra/findings-capped', 'toy/flood', 'toy/flood']);
	});

	it('reports a rule that throws or reads what it did not declare, without stopping the run', () => {
		const thrower: CodeRule = { ...noTodo, id: 'toy/thrower', check: () => { throw new Error('boom'); }, visit: undefined };
		const sneaky: CodeRule = { ...noTodo, id: 'toy/sneaky', check: (_r, ctx) => void ctx.fact('doc.units'), visit: undefined };
		const problems = checkRuleset(input([thrower, sneaky]));
		expect(problems.filter((p) => p.code === 'rule-threw').map((p) => p.rule)).toContain('toy/thrower');
		expect(problems.filter((p) => p.code === 'undeclared-read').map((p) => p.rule)).toContain('toy/sneaky');
	});
});

// ── Fix ──────────────────────────────────────────────────────────────────────

describe('fix', () => {
	const rules = compileRuleset(input([noTodo, retiredKey]));

	it('applies every non-conflicting fix in one pass', () => {
		const res = fix(rules, src('TODO a\nb TODO\n===\nTODO\n'));
		expect(res.text).toBe('DONE a\nb DONE\n===\nDONE\n');
		expect(res.passes).toBe(1);
		expect(res.applied).toHaveLength(3);
		expect(res.remaining).toEqual([]);
	});

	it('fixing twice equals fixing once', () => {
		for (const text of ['TODO\n', '---\nold: 1\n---\nTODO\n', 'x\n```\nTODO\n```\nTODO\n']) {
			const once = fix(rules, src(text)).text;
			expect(fix(rules, src(once)).text).toBe(once);
		}
	});

	it('deletes an emptied header with its last key, and only because the rule declares it', () => {
		expect(fix(rules, src('---\nold: 1\n---\nbody\n')).text).toBe('body\n');
		const undeclared = compileRuleset({ ...input([{ ...retiredKey, changes: undefined }]), mode: 'lenient' });
		expect(undeclared.rules).toEqual([]);
		expect(checkRuleset(input([{ ...retiredKey, changes: undefined }])).map((p) => p.code)).toContain('fix-changed-shape');
	});

	it('catches a slide-deleting fix among good ones, reverts only it, and records broke-structure', () => {
		const producer: Producer = {
			id: 'test',
			produce(s) {
				const sep = s.text.indexOf('===');
				return sep < 0
					? []
					: [{ rule: 'legacy/sep', severity: 'error', span: { from: sep, to: sep + 3 }, message: 'a separator', fixes: [editsFix('Delete it.', { op: 'deleteLine', span: { from: sep, to: sep + 3 } })] }];
			},
		};
		const res = fix(rules, src('TODO\n===\nTODO\n'), { producers: [producer] });
		expect(res.text).toBe('DONE\n===\nDONE\n');
		expect(res.skipped.filter((s) => s.reason === 'broke-structure').map((s) => s.rule)).toEqual(['legacy/sep']);
		// And the producer's finding is still there to see.
		expect(res.remaining.map((f) => f.rule)).toEqual(['legacy/sep']);
	});

	it('reverts a fix that does not resolve its finding, and stops that rule for the run', () => {
		const producer: Producer = {
			id: 'test',
			produce(s) {
				return [...s.text.matchAll(/x+/g)].map((m) => ({
					rule: 'legacy/x',
					severity: 'warning' as const,
					span: { from: m.index as number, to: (m.index as number) + m[0].length },
					message: 'an x',
					fixes: [editsFix('Grow it.', { op: 'insertAfter', span: { from: m.index as number, to: (m.index as number) + m[0].length }, text: 'x' })],
				}));
			},
		};
		const res = fix(rules, src('x TODO\n'), { producers: [producer] });
		expect(res.text).toBe('x DONE\n');
		expect(res.skipped.find((s) => s.reason === 'did-not-resolve')?.rule).toBe('legacy/x');
	});

	it('does not count a same-rule finding on the next line as the deleted line coming back', () => {
		// Inversion probe: a correct delete was reverted because the next line's identical finding
		// touched the deleted line's mapped point.
		const todos: Producer = {
			id: 'todos',
			produce: (s) =>
				[...s.text.matchAll(/^TODO.*$/gm)].map((m) => {
					const span = { from: m.index as number, to: (m.index as number) + m[0].length };
					return { rule: 'legacy/todo', severity: 'warning' as const, span, message: 'a TODO line', fixes: m[0] === 'TODO' ? [editsFix('delete', { op: 'deleteLine', span })] : [] };
				}),
		};
		const res = fix(rules, src('TODO\nTODO x\nok\n'), { producers: [todos] });
		expect(res.text).toBe('DONE x\nok\n');
		expect(res.skipped).toEqual([]);
	});

	it('refuses edits inside an inert range unless the producer opts in', () => {
		const inFence = (inert: boolean): Producer => ({
			id: 'test',
			produce(s) {
				const i = s.text.indexOf('TODO');
				return i < 0 ? [] : [{ rule: 'legacy/todo', severity: 'warning', inert, span: { from: i, to: i + 4 }, message: 'todo', fixes: [editsFix('done', { op: 'replace', span: { from: i, to: i + 4 }, text: 'DONE' })] }];
			},
		});
		const text = '```\nTODO\n```\n';
		const refused = fix(rules, src(text), { producers: [inFence(false)] });
		expect(refused.text).toBe(text);
		expect(refused.skipped.map((s) => s.reason)).toEqual(['inert']);
		// Opting in still changes the inert text, which the shape check refuses unless declared.
		const optIn = fix(rules, src(text), { producers: [{ ...inFence(true), produce: (s) => inFence(true).produce(s).map((f) => ({ ...f, changes: ['inert' as const] })) }] });
		expect(optIn.text).toBe('```\nDONE\n```\n');
	});

	it('applies conflicting fixes in later passes, in a deterministic order', () => {
		const a: Producer = { id: 'a', produce: (s) => (s.text.startsWith('ab') ? [{ rule: 'legacy/a', severity: 'warning', span: { from: 0, to: 2 }, message: 'ab', fixes: [editsFix('AB', { op: 'replace', span: { from: 0, to: 2 }, text: 'AB' })] }] : []) };
		const b: Producer = { id: 'b', produce: (s) => (s.text.slice(1, 3) === 'bc' ? [{ rule: 'legacy/b', severity: 'error', span: { from: 1, to: 3 }, message: 'bc', fixes: [editsFix('BC', { op: 'replace', span: { from: 1, to: 3 }, text: 'BC' })] }] : []) };
		const one = fix(rules, src('abc\n'), { producers: [a, b] });
		const two = fix(rules, src('abc\n'), { producers: [b, a] });
		expect(one.text).toBe(two.text);
		// Errors go first, so legacy/b wins the overlap and legacy/a no longer applies.
		expect(one.text).toBe('aBC\n');
		expect(one.applied.map((x) => x.rule)).toEqual(['legacy/b']);
	});

	it('stops on a cycle and returns the text before the repeat', () => {
		const swap: Producer = {
			id: 'swap',
			produce: (s) => {
				const m = /[xy]/.exec(s.text);
				if (!m) return [];
				const to = m[0] === 'x' ? 'y' : 'x';
				return [{ rule: `legacy/${m[0]}`, severity: 'warning', span: { from: m.index, to: m.index + 1 }, message: m[0], fixes: [editsFix(to, { op: 'replace', span: { from: m.index, to: m.index + 1 }, text: to })] }];
			},
		};
		const res = fix(rules, src('x\n'), { producers: [swap] });
		expect(res.text).toBe('y\n');
		expect(res.skipped.map((s) => s.reason)).toContain('cycle');
	});

	it('lists a fix refused as broke-structure once, never again as out of passes', () => {
		// The out-of-passes sweep used to add `max-passes` for every finding still fixable, a blocked one
		// included, which told the author to press Fix all again for a fix that can never land.
		const sep: Producer = {
			id: 'sep',
			produce(s) {
				const at = s.text.indexOf('===');
				return at < 0 ? [] : [{ rule: 'legacy/sep', severity: 'error', span: { from: at, to: at + 3 }, message: 'a separator', fixes: [editsFix('Delete it.', { op: 'deleteLine', span: { from: at, to: at + 3 } })] }];
			},
		};
		const res = fix(rules, src('TODO\n===\nTODO\n'), { producers: [sep], maxPasses: 1 });
		expect(res.skipped.filter((s) => s.rule === 'legacy/sep').map((s) => s.reason)).toEqual(['broke-structure']);
	});

	it('drops a broke-structure refusal whose finding a later fix resolved', () => {
		// `Z` asks for the separator after it to go, which would merge two units: refused. Another rule
		// lowers the `Z` in the same pass, so the finding is gone, and "not applied" would mislead.
		const zsep: Producer = {
			id: 'zsep',
			produce(s) {
				const z = s.text.indexOf('Z');
				const at = s.text.indexOf('===');
				return z < 0 || at < 0 ? [] : [{ rule: 'legacy/zsep', severity: 'error', span: { from: at, to: at + 3 }, message: 'Z wants no separator', fixes: [editsFix('Delete it.', { op: 'deleteLine', span: { from: at, to: at + 3 } })] }];
			},
		};
		const lower: Producer = {
			id: 'lower',
			produce(s) {
				const z = s.text.indexOf('Z');
				return z < 0 ? [] : [{ rule: 'legacy/z', severity: 'warning', span: { from: z, to: z + 1 }, message: 'a capital Z', fixes: [editsFix('Lower it.', { op: 'replace', span: { from: z, to: z + 1 }, text: 'z' })] }];
			},
		};
		const res = fix(rules, src('Z\n===\nb\n'), { producers: [zsep, lower] });
		expect(res.text).toBe('z\n===\nb\n');
		expect(res.skipped).toEqual([]);
		// Without the lowering rule the refusal stands.
		expect(fix(rules, src('Z\n===\nb\n'), { producers: [zsep] }).skipped.map((s) => s.reason)).toEqual(['broke-structure']);
	});

	it('reports what was still fixable when it runs out of passes', () => {
		const chain: Producer = {
			id: 'chain',
			produce: (s) => {
				const m = /[ab]/.exec(s.text);
				if (!m) return [];
				const to = m[0] === 'a' ? 'b' : 'c';
				return [{ rule: `legacy/${m[0]}`, severity: 'warning', span: { from: m.index, to: m.index + 1 }, message: m[0], fixes: [editsFix(to, { op: 'replace', span: { from: m.index, to: m.index + 1 }, text: to })] }];
			},
		};
		const res = fix(rules, src('a\n'), { producers: [chain], maxPasses: 1 });
		expect(res.text).toBe('b\n');
		expect(res.skipped).toEqual([{ rule: 'legacy/b', span: { from: 0, to: 1 }, reason: 'max-passes', data: {} }]);
	});

	it('applies only fixes at or under the requested safety, and refuses unsafe without `only`', () => {
		const sugg: Producer = { id: 's', produce: (s) => (s.text[0] !== 's' ? [] : [{ rule: 'legacy/s', severity: 'warning', span: { from: 0, to: 1 }, message: 's', fixes: [editsFix('S', { op: 'replace', span: { from: 0, to: 1 }, text: 'S' }, 'suggested')] }]) };
		expect(fix(rules, src('s\n'), { producers: [sugg] }).skipped.map((s) => s.reason)).toEqual(['safety']);
		expect(fix(rules, src('s\n'), { producers: [sugg], safety: 'suggested' }).text).toBe('S\n');
		expect(() => fix(rules, src('s\n'), { safety: 'unsafe' })).toThrow(RangeError);
	});

	it('caps every fix from an untrusted ruleset at suggested', () => {
		const untrusted = compileRuleset({ ...input([noTodo]), trust: 'untrusted' });
		expect(lint(untrusted, [src('TODO\n')]).findings[0].fixes[0].safety).toBe('suggested');
		expect(fix(untrusted, src('TODO\n')).text).toBe('TODO\n');
		expect(fix(untrusted, src('TODO\n'), { safety: 'suggested' }).text).toBe('DONE\n');
	});

	it('runs an exclusive engine in a pass of its own', () => {
		const upper: FixEngine<null> = { id: 'upper', exclusive: true, toEdits: (s) => [{ from: 0, to: s.text.length, text: s.text.toUpperCase() }] };
		const p: Producer = { id: 'p', produce: (s) => (s.text === s.text.toUpperCase() ? [] : [{ rule: 'legacy/case', severity: 'info', span: { from: 0, to: 0 }, message: 'lower case', fixes: [{ engine: 'upper', safety: 'safe', description: 'upper', payload: null }] }]) };
		const r = compileRuleset({ ...input([noTodo]), engines: [upper] });
		const res = fix(r, src('abc TODO\n'), { producers: [p] });
		expect(res.applied.map((a) => [a.rule, a.pass])).toEqual([['toy/no-todo', 1], ['legacy/case', 2]]);
		expect(res.text).toBe('ABC DONE\n');
	});

	it('records stale, engine-missing and engine-threw without stopping', () => {
		const bad: Producer = {
			id: 'bad',
			produce: () => [
				{ rule: 'legacy/missing', severity: 'warning', span: { from: 0, to: 0 }, message: 'm', fixes: [{ engine: 'nope', safety: 'safe', description: 'x', payload: null }] },
				{ rule: 'legacy/throws', severity: 'warning', span: { from: 0, to: 0 }, message: 't', fixes: [{ engine: 'boom', safety: 'safe', description: 'x', payload: null }] },
			],
		};
		const boom: FixEngine<null> = { id: 'boom', toEdits: () => { throw new Error('kaboom'); } };
		const r = compileRuleset({ ...input([noTodo]), engines: [boom] });
		const res = fix(r, src('TODO\n'), { producers: [bad] });
		expect(res.text).toBe('DONE\n');
		expect(res.skipped.map((s) => s.reason).sort()).toEqual(['engine-missing', 'engine-threw']);
	});

	it('returns the input unchanged on a dry run, with the plan it would apply', () => {
		const res = fix(rules, src('TODO\n'), { dryRun: true });
		expect(res.text).toBe('TODO\n');
		expect(res.applied).toHaveLength(1);
	});
});

// ── The edits engine's line guards ──────────────────────────────────────────

describe('deleteLine', () => {
	const rules = compileRuleset(input([noTodo, retiredKey]));
	it('skips as not-alone when the line holds more, or the next line continues it', () => {
		const p = (text: string, from: number, to: number): Producer => ({ id: 'p', produce: (s) => (s.text !== text ? [] : [{ rule: 'legacy/del', severity: 'warning', span: { from, to }, message: 'd', fixes: [editsFix('d', { op: 'deleteLine', span: { from, to } })] }]) });
		expect(fix(rules, src('ab cd\n'), { producers: [p('ab cd\n', 0, 2)] }).skipped[0].reason).toBe('not-alone');
		expect(fix(rules, src('key: |\n  body\nnext\n'), { producers: [p('key: |\n  body\nnext\n', 0, 6)] }).skipped[0].reason).toBe('not-alone');
		expect(fix(rules, src('  a\n  b\n'), { producers: [p('  a\n  b\n', 2, 3)] }).text).toBe('  b\n');
	});
});

// ── The refusals (design §8) ────────────────────────────────────────────────

describe('compileRuleset refuses', () => {
	const codes = (rules: CodeRule[], extra: Partial<RulesetInput> = {}) => checkRuleset(input(rules, extra)).map((p) => p.code);
	const fx = (body: string) => body;

	it('nothing in a sound ruleset', () => {
		expect(checkRuleset(input([noTodo, retiredKey]))).toEqual([]);
	});
	it('no-examples', () => {
		expect(codes([{ ...noTodo, examples: 'missing.md' }])).toEqual(['no-examples']);
		const { rule, examples } = ruleWith('only-bad', fx('```toy bad\nTODO\n```\n'), { visit: noTodo.visit });
		expect(codes([rule], { examples })).toEqual(['no-examples']);
	});
	it('bad-did-not-fire: no finding, a wrong span, a wrong count', () => {
		const silent = ruleWith('silent', '```toy bad\nx\n```\n```toy good\nTODO\n```\n', { fixable: false, visit: { line: () => {} } });
		expect(codes([silent.rule], { examples: silent.examples })).toContain('bad-did-not-fire');
		const span = ruleWith('span', '```toy bad\n⟦hello⟧ TODO\n```\n```toy fixed\nhello DONE\n```\n```toy good\nline\n```\n', { visit: noTodo.visit });
		expect(codes([span.rule], { examples: span.examples })).toEqual(['bad-did-not-fire']);
		const count = ruleWith('count', '```toy bad x2\nTODO\n```\n```toy fixed\nDONE\n```\n```toy good\nline\n```\n', { visit: noTodo.visit });
		expect(codes([count.rule], { examples: count.examples })).toEqual(['bad-did-not-fire']);
	});
	it('good-fired', () => {
		const r = ruleWith('gf', '```toy bad\nTODO\n```\n```toy fixed\nDONE\n```\n```toy good\nTODO\n```\n', { visit: noTodo.visit });
		expect(codes([r.rule], { examples: r.examples })).toEqual(['good-fired']);
	});
	it('good-avoids-selector', () => {
		const r = ruleWith('ga', '```toy bad\nTODO\n```\n```toy fixed\nDONE\n```\n```toy good\n===\n```\n', { visit: noTodo.visit });
		expect(codes([r.rule], { examples: r.examples })).toEqual(['good-avoids-selector']);
	});
	it('fix-mismatch and fix-missing-fixed', () => {
		const mis = ruleWith('mis', '```toy bad\nTODO\n```\n```toy fixed\nFINISHED\n```\n```toy good\nline\n```\n', { visit: noTodo.visit });
		expect(codes([mis.rule], { examples: mis.examples })).toEqual(['fix-mismatch']);
		const miss = ruleWith('miss', '```toy bad\nTODO\n```\n```toy good\nline\n```\n', { visit: noTodo.visit });
		expect(codes([miss.rule], { examples: miss.examples })).toEqual(['fix-missing-fixed']);
	});
	it('fix-did-not-resolve', () => {
		const r = ruleWith('nr', '```toy bad\nTODO\n```\n```toy fixed\nTODO!\n```\n```toy good\nline\n```\n', {
			fixable: true,
			visit: {
				line(n, ctx) {
					const t = ctx.text(n);
					if (t.includes('TODO')) ctx.report({ span: n, message: 'todo', fixes: [editsFix('bang', { op: 'insertAfter', span: n, text: '!' })] });
				},
			},
		});
		expect(codes([r.rule], { examples: r.examples })).toContain('fix-did-not-resolve');
	});
	it('fix-grew', () => {
		// Each pass appends a line the rule then flags again, under a different message: it never converges.
		const r = ruleWith('grow', '```toy bad\nx\n```\n```toy fixed\nx\n```\n```toy good\n===\n```\n', {
			fixable: true,
			check(root, ctx) {
				const t = ctx.raw(root);
				ctx.report({ span: { from: t.length, to: t.length }, message: `len ${t.length}`, fixes: [editsFix('grow', { op: 'insertAfter', span: { from: t.length, to: t.length }, text: 'x\n' })] });
			},
		});
		// The driver's runtime growth check stops it first (did-not-resolve); either way it is refused.
		expect(codes([r.rule], { examples: r.examples }).some((c) => c === 'fix-grew' || c === 'fix-did-not-resolve')).toBe(true);
	});
	it('fix-changed-shape', () => {
		expect(codes([{ ...retiredKey, changes: undefined }])).toContain('fix-changed-shape');
	});
	it('unknown-kind and bad-selector', () => {
		expect(codes([{ ...noTodo, visit: { slide: () => {} } }])).toContain('unknown-kind');
		expect(codes([{ ...noTodo, visit: { 'line[x]': () => {} } }])).toContain('bad-selector');
	});
	it('unknown-vocab, unknown-fact, unknown-language, unknown engines at fix time', () => {
		expect(codes([{ ...noTodo, reads: { vocab: ['corners'] } }])).toContain('unknown-vocab');
		expect(codes([{ ...noTodo, reads: { facts: ['slide.capacity'] } }])).toContain('unknown-fact');
		expect(codes([{ ...noTodo, language: 'css' }])).toContain('unknown-language');
	});
	it('reserved-name, duplicate-id, no-budget, bad-id, not-built', () => {
		expect(codes([{ ...noTodo, reads: { facts: ['__proto__'] } }])).toContain('reserved-name');
		expect(codes([noTodo, noTodo])).toContain('duplicate-id');
		expect(codes([{ ...noTodo, budget: undefined }])).toContain('no-budget');
		expect(codes([{ ...noTodo, budget: undefined }], { defaults: { budget: { ops: 100 } } })).toEqual([]);
		expect(codes([{ ...noTodo, id: 'deck/no-todo' }])).toContain('bad-id');
		expect(checkRuleset({ ...input([]), rules: [{ format: 1, id: 'toy/decl', select: 'line' }] }).map((p) => p.code)).toEqual(['not-built']);
	});

	it('throws one RulesetError listing every problem in strict mode', () => {
		try {
			compileRuleset(input([{ ...noTodo, budget: undefined }, { ...noTodo, id: 'toy/x', language: 'css' }]));
			expect.unreachable();
		} catch (e) {
			expect(RulesetError.is(e)).toBe(true);
			expect((e as RulesetError).problems.map((p) => p.code).sort()).toEqual(['no-budget', 'unknown-language']);
		}
	});

	it('drops a refused rule in lenient mode and reports it as squadra/rule-refused', () => {
		const r = compileRuleset({ ...input([noTodo, { ...noTodo, id: 'toy/broken', examples: 'none.md' }]), mode: 'lenient' });
		expect(r.rules.map((x) => x.id)).toEqual(['toy/no-todo']);
		const f = lint(r, [src('TODO\n')]).findings;
		expect(f.map((x) => x.rule)).toEqual(['squadra/rule-refused', 'toy/no-todo']);
	});

	it('skips the example run for a rule whose verified stamp matches, and re-checks one that changed', () => {
		const ok = input([noTodo]);
		const stamp = stampRuleset(ok);
		const silent = { ...noTodo, visit: { line: () => {} } };
		// The stamp no longer matches the changed rule, so its examples run and refuse it.
		expect(checkRuleset({ ...input([silent]), verified: stamp }).map((p) => p.code)).toContain('bad-did-not-fire');
		// A stamp for the rule as it now stands skips the run, which is the point: the build vouches.
		expect(checkRuleset({ ...input([silent]), verified: stampRuleset(input([silent])) })).toEqual([]);
		expect(checkRuleset({ ...ok, verified: stamp })).toEqual([]);
	});
});

// ── Waivers and ratchets (design §9) ────────────────────────────────────────

describe('waivers', () => {
	const rules = compileRuleset(input([noTodo]));
	const two = [src('TODO\nTODO\n', 'a.toy'), src('TODO\n', 'b.toy')];
	const ids = (fs: readonly { rule: string; path: string }[]) => fs.map((f) => `${f.path}:${f.rule}`);

	it('covers exactly its count, so a second finding still fails', () => {
		const w = { waivers: [{ rule: 'toy/no-todo', target: 'a.toy', reason: 'kept on purpose' }], ratchets: [] };
		expect(ids(lint(rules, two, { waivers: w }).findings)).toEqual(['a.toy:toy/no-todo', 'b.toy:toy/no-todo']);
	});
	it('fails stale when it covers fewer than its count, on full runs only', () => {
		const w = { waivers: [{ rule: 'toy/no-todo', target: 'b.toy', count: 2, reason: 'r' }], ratchets: [] };
		expect(ids(lint(rules, two, { waivers: w }).findings)).toEqual(['a.toy:toy/no-todo', 'a.toy:toy/no-todo', 'b.toy:squadra/stale-waiver']);
		expect(ids(lint(rules, two, { waivers: w, coverage: 'partial' }).findings)).toEqual(['a.toy:toy/no-todo', 'a.toy:toy/no-todo']);
	});
	it('matches on the source text at the span', () => {
		const w = { waivers: [{ rule: 'toy/no-todo', target: 'b.toy', match: 'TODO', reason: 'r' }, { rule: 'toy/no-todo', target: 'a.toy', match: 'FIXME', reason: 'r' }], ratchets: [] };
		expect(ids(lint(rules, two, { waivers: w }).findings)).toEqual(['a.toy:squadra/stale-waiver', 'a.toy:toy/no-todo', 'a.toy:toy/no-todo']);
	});
	it('stops suppressing once expired', () => {
		const w = { waivers: [{ rule: 'toy/no-todo', target: 'b.toy', reason: 'r', expires: '2026-01-01' }], ratchets: [] };
		expect(ids(lint(rules, [two[1]], { waivers: w, now: '2026-10-29' }).findings)).toEqual(['b.toy:squadra/expired-waiver', 'b.toy:toy/no-todo']);
		expect(ids(lint(rules, [two[1]], { waivers: w, now: '2025-12-31' }).findings)).toEqual([]);
	});
	it('ratchets per file under a glob: over budget fails, under budget asks to lower it', () => {
		const w = { waivers: [], ratchets: [{ rule: 'toy/no-todo', target: '*.toy', budget: 1, reason: 'baseline' }] };
		expect(ids(lint(rules, two, { waivers: w }).findings)).toEqual(['a.toy:squadra/ratchet-exceeded', 'a.toy:toy/no-todo', 'a.toy:toy/no-todo']);
		const loose = { waivers: [], ratchets: [{ rule: 'toy/no-todo', target: 'b.toy', budget: 3, reason: 'baseline' }] };
		expect(ids(lint(rules, [two[1]], { waivers: loose }).findings)).toEqual(['b.toy:squadra/ratchet-down']);
	});
	it('refuses a waiver set that waives Squadra itself, uses a glob, or gives no reason', () => {
		for (const w of [{ rule: 'squadra/parse-error', target: 'a.toy', reason: 'r' }, { rule: 'toy/no-todo', target: '*.toy', reason: 'r' }, { rule: 'toy/no-todo', target: 'a.toy', reason: ' ' }]) {
			expect(() => lint(rules, two, { waivers: { waivers: [w], ratchets: [] } })).toThrow(/waiver set is invalid/);
		}
	});
});

// ── Fixtures and reporters ──────────────────────────────────────────────────

describe('fixtures files', () => {
	it('reads roles, names, counts, markers and pairs, and ignores prose fences', () => {
		const f = parseFixtures('prose\n```js\nignored\n```\n````md bad one x2\n```\n⟦a⟧b⟦c⟧\n```\n````\n```md fixed one\nb\n```\n```md good\nok\n```\n');
		expect(f.errors).toEqual([]);
		expect(f.examples.map((e) => [e.role, e.name, e.count, e.pairs])).toEqual([
			['bad', 'one', 2, undefined],
			['fixed', 'fixed-1', undefined, 'one'],
			['good', 'good-1', undefined, undefined],
		]);
		expect(f.examples[0].text).toBe('```\nabc\n```\n');
		expect(f.examples[0].spans).toEqual([{ from: 4, to: 5 }, { from: 6, to: 7 }]);
	});
	it('reports unbalanced markers, an unclosed fence and an orphan fixed example', () => {
		expect(parseFixtures('```md bad\n⟦a\n```\n').errors[0].message).toMatch(/never closes/);
		expect(parseFixtures('```md good\nx\n').errors[0].message).toMatch(/never closes/);
		expect(parseFixtures('```md fixed\nx\n```\n').errors[0].message).toMatch(/no bad example/);
	});
});

describe('reporters', () => {
	const rules = compileRuleset(input([noTodo]));
	const result = lint(rules, [src('a TODO\n')]);
	it('prints text with the source line and a caret, escaping control characters', () => {
		expect(reportText(result, new Map([['a.toy', 'a TODO\n']]))).toBe('a.toy\n  1:3  warning  A TODO is left in.  toy/no-todo (fixable)\n      a TODO\n        ^^^^\n      Finish it.\n1 finding: 0 error, 1 warning, 0 suggestion, 0 info\n');
		const hostile = { ...result, findings: [{ ...result.findings[0], message: 'x\u001b[2Jy‮' }] };
		expect(reportText(hostile)).toContain('x\\u001b[2Jy\\u202e');
	});
	it('prints JSON with the format version and lowered fixes, never a payload', () => {
		const j = JSON.parse(reportJson(result));
		expect(j.format).toBe(1);
		expect(j.findings[0].fixes[0]).toEqual({ engine: 'edits', safety: 'safe', description: 'Mark it done.', edits: [{ from: 2, to: 6, text: 'DONE' }] });
	});
});

// ── Regressions from the adversarial review (2026-10-29) ────────────────────

describe('the driver, after the red team, inversion and checker', () => {
	const rules = compileRuleset(input([noTodo, retiredKey]));
	const one = (rule: string, span: Span, text: string, extra: Record<string, unknown> = {}) => ({ rule, severity: 'warning' as const, span, message: rule, fixes: [editsFix(rule, { op: 'replace', span, text })], ...extra });

	it('catches two fixes whose slide-count changes cancel out', () => {
		// One deletes a separator, the other adds one: the combined count is unchanged.
		const p: Producer = {
			id: 'p',
			produce: (s) => (s.text !== 'a\n===\nb\nc\n' ? [] : [one('legacy/del', { from: 2, to: 6 }, ''), one('legacy/add', { from: 8, to: 8 }, '===\n')]),
		};
		const res = fix(rules, src('a\n===\nb\nc\n'), { producers: [p] });
		expect(res.text).toBe('a\n===\nb\nc\n');
		expect(res.skipped.filter((x) => x.reason === 'broke-structure').map((x) => x.rule).sort()).toEqual(['legacy/add', 'legacy/del']);
	});

	it('does not starve a pass when one fix declares its shape change', () => {
		// Ten TODO fixes plus a declared separator delete all apply in one pass.
		const sep: Producer = {
			id: 'sep',
			produce: (s) => {
				const i = s.text.indexOf('===\n');
				return i < 0 ? [] : [{ ...one('legacy/sep', { from: i, to: i + 4 }, ''), changes: ['slide-count' as const] }];
			},
		};
		const text = `${'TODO\n'.repeat(5)}===\n${'TODO\n'.repeat(5)}`;
		const res = fix(rules, src(text), { producers: [sep] });
		expect(res.text).toBe('DONE\n'.repeat(10));
		expect(res.passes).toBe(1);
		expect(res.skipped).toEqual([]);
	});

	it('rewinds a fix that grows one place every pass while its message changes, and stops it', () => {
		const p: Producer = {
			id: 'p',
			produce: (s) => {
				const i = s.text.indexOf('TODO');
				return i < 0 ? [] : [{ rule: 'legacy/col', severity: 'warning', span: { from: i, to: i + 4 }, message: `TODO at column ${i + 1}`, fixes: [editsFix('quote', { op: 'insertBefore', span: { from: i, to: i + 4 }, text: '> ' })] }];
			},
		};
		const res = fix(compileRuleset(input([retiredKey])), src('TODO\n'), { producers: [p] });
		expect(res.text).toBe('TODO\n');
		expect(res.skipped.map((x) => x.reason)).toEqual(['did-not-resolve']);
	});

	it('keeps a rule stopped that swallows the budget or cap signal', () => {
		const sneaky: CodeRule = {
			...noTodo,
			id: 'toy/sneaky',
			fixable: false,
			examples: 'sneaky.md',
			budget: { ops: 10_000, findings: 3 },
			visit: {
				line(n, ctx) {
					try {
						if (ctx.text(n).includes('G')) ctx.report({ span: n, message: 'G' });
					} catch {
						/* swallowed on purpose */
					}
				},
			},
		};
		const r = compileRuleset(input([sneaky], { examples: { 'sneaky.md': '```toy bad\nG\n```\n```toy good\nx\n```\n' } }));
		const f = lint(r, [src('G\n'.repeat(200))]).findings;
		expect(f.filter((x) => x.rule === 'squadra/findings-capped')).toHaveLength(1);
		expect(f.filter((x) => x.rule === 'toy/sneaky')).toHaveLength(3);
	});

	it('refuses a rule that offers a fix without declaring fixable', () => {
		expect(checkRuleset(input([{ ...noTodo, fixable: undefined }])).map((p) => p.code)).toContain('undeclared-fix');
	});

	it('never stamps a rule whose source it cannot read (a bound function)', () => {
		const bound: CodeRule = { ...noTodo, visit: { line: noTodo.visit?.line?.bind(null) as NonNullable<CodeRule['visit']>[string] } };
		expect(stampRuleset(input([bound]))).toEqual({});
		// And the resolved default budget is part of the stamp.
		const free = { ...noTodo, budget: undefined };
		expect(stampRuleset(input([free], { defaults: { budget: { ops: 10 } } }))).not.toEqual(stampRuleset(input([free], { defaults: { budget: { ops: 10_000 } } })));
	});

	it('refuses unsafe fixes by glob, and a waiver expiry that is not a date', () => {
		expect(() => fix(rules, src('x\n'), { safety: 'unsafe', only: ['*'] })).toThrow(RangeError);
		expect(() => lint(rules, [src('x\n')], { waivers: { waivers: [{ rule: 'toy/no-todo', target: 'a.toy', reason: 'r', expires: '31/12/2020' }], ratchets: [] } })).toThrow(/YYYY-MM-DD/);
	});

	it('reports a ruleset problem that names no rule, in lenient mode', () => {
		const r = compileRuleset({ ...input([noTodo]), languages: [toy, toy], mode: 'lenient' });
		expect(lint(r, [src('x\n')]).findings.map((f) => f.data.code)).toEqual(['duplicate-language']);
	});

	it('matches `**/` as whole directories', () => {
		expect(globToRegExp('**/foo.md').test('docs/xfoo.md')).toBe(false);
		expect(globToRegExp('**/foo.md').test('docs/a/foo.md')).toBe(true);
		expect(globToRegExp('**/foo.md').test('foo.md')).toBe(true);
	});

	it('deletes a line at offset 0, and refuses a span over several lines', () => {
		const del = (text: string, span: Span): Producer => ({ id: 'd', produce: (s) => (s.text !== text ? [] : [{ rule: 'legacy/d', severity: 'warning', span, message: 'd', fixes: [editsFix('d', { op: 'deleteLine', span })] }]) });
		expect(fix(rules, src('\nkey\n'), { producers: [del('\nkey\n', { from: 0, to: 0 })] }).text).toBe('key\n');
		expect(fix(rules, src('a\nb\n'), { producers: [del('a\nb\n', { from: 0, to: 3 })] }).skipped[0].reason).toBe('not-alone');
	});
});

describe('fixtures, after the red team', () => {
	it('refuses an example that holds a fence as long as its own', () => {
		const f = parseFixtures('```md bad\n```js\nx\n```\n```\n```md good\nok\n```\n');
		expect(f.errors.map((e) => e.message).join()).toMatch(/longer fence/);
	});
});
