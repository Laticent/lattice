// @vitest-environment node

import { gzipSync } from 'node:zlib';
import { buildSync } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { compileRuleset, digestRuleset, editsFix, type RulesetInput } from './index';
import { fix, lint, loadRuleset } from './runtime';
import type { CodeRule, Language, Node, Source } from './types';

// The browser entry (`@laticent/squadra/runtime`): rules the build verified, no compiler.

/** One `line` node per line; nothing inert. */
const lines: Language = {
	id: 'lines',
	version: '1',
	kinds: ['doc', 'line'],
	parse(source: Source) {
		const kids: Node[] = [];
		let pos = 0;
		for (const l of source.text.split('\n')) {
			kids.push({ kind: 'line', from: pos, to: pos + l.length, kids: [] });
			pos += l.length + 1;
		}
		return { tree: { kind: 'doc', from: 0, to: source.text.length, kids }, errors: [] };
	},
	shape: () => ({ units: 1, header: null, inert: [] }),
};

const noTodo: CodeRule = {
	id: 'notes/no-todo',
	language: 'lines',
	severity: 'warning',
	summary: 'A TODO left in the text.',
	examples: 'no-todo.md',
	fixable: true,
	budget: { ops: 1000 },
	visit: {
		line(node, ctx) {
			const i = ctx.text(node).indexOf('TODO');
			if (i < 0) return;
			const span = { from: node.from + i, to: node.from + i + 4 };
			ctx.report({ span, message: 'A TODO is left in.', fixes: [editsFix('Mark it done.', { op: 'replace', span, text: 'DONE' })] });
		},
	},
};
const examples = { 'no-todo.md': '```lines bad\ncall ⟦TODO⟧\n```\n\n```lines fixed\ncall DONE\n```\n\n```lines good\ncall DONE\n```\n' };
const input: RulesetInput = { name: 'notes', version: '1', languages: [lines], rules: [noTodo], examples };
const src = (text: string) => ({ path: 'a.txt', text, language: 'lines' });

describe('loadRuleset', () => {
	it('runs a rule whose digest the build recorded, and its fix', () => {
		compileRuleset(input); // the build's strict compile: the examples pass
		const verified = digestRuleset(input);
		const rules = loadRuleset({ name: 'notes', version: '1', languages: [lines], rules: [noTodo], verified });
		expect(rules.refused).toEqual([]);
		expect(lint(rules, [src('a TODO here')]).findings.map((f) => f.rule)).toEqual(['notes/no-todo']);
		expect(fix(rules, src('a TODO here')).text).toBe('a DONE here');
	});

	it('refuses a rule with no digest, and one whose declaration changed since the build', () => {
		const verified = digestRuleset(input);
		const none = loadRuleset({ name: 'notes', version: '1', languages: [lines], rules: [noTodo], verified: {} });
		expect(none.rules).toEqual([]);
		expect(none.refused.map((p) => p.code)).toEqual(['not-verified']);
		const changed = loadRuleset({ name: 'notes', version: '1', languages: [lines], rules: [{ ...noTodo, severity: 'error' }], verified });
		expect(changed.rules).toEqual([]);
		const f = lint(changed, [src('a TODO')]).findings;
		expect(f.map((x) => [x.rule, x.data.code])).toEqual([['squadra/rule-refused', 'not-verified']]);
	});

	it('refuses every rule when the language version moves under it', () => {
		const verified = digestRuleset(input);
		const next = { ...lines, version: '2' };
		expect(loadRuleset({ name: 'notes', version: '1', languages: [next], rules: [noTodo], verified }).rules).toEqual([]);
	});

	it('keeps a digest across a function-body edit (the build stamp, not the digest, catches that)', () => {
		const edited: CodeRule = { ...noTodo, visit: { line() {} } };
		expect(digestRuleset({ ...input, rules: [edited] })).toEqual(digestRuleset(input));
	});

	it('still runs the declaration checks: a selector naming an unknown kind is refused', () => {
		const bad: CodeRule = { ...noTodo, visit: { para() {} } };
		const verified = digestRuleset({ ...input, rules: [bad] });
		const rules = loadRuleset({ name: 'notes', version: '1', languages: [lines], rules: [bad], verified });
		expect(rules.refused.map((p) => p.code)).toEqual(['unknown-kind']);
	});
});

describe('the runtime bundle', () => {
	// The built entry bundled and minified as a browser would ship it. The point of the entry is what it leaves out.
	const bundle = (entry: string) =>
		buildSync({ entryPoints: [`${__dirname}/${entry}`], bundle: true, minify: true, format: 'esm', write: false, logLevel: 'error' }).outputFiles[0].text;

	it('carries no compiler, fixtures runner or reporter, and is smaller than the main entry', () => {
		const runtime = bundle('runtime.ts');
		for (const marker of ['bad-did-not-fire', 'good-avoids-selector', 'fix-missing-fixed', 'parseFixtures', 'bad-fixtures', 'squadra: no findings']) expect(runtime).not.toContain(marker);
		const main = bundle('index.ts');
		expect(main).toContain('bad-did-not-fire'); // the markers are real: the main entry does carry them
		const gz = (s: string) => gzipSync(s, { level: 6 }).length;
		expect(gz(runtime)).toBeLessThan(gz(main));
		console.log(`squadra bundle gz: runtime ${gz(runtime)} B, main ${gz(main)} B, driver ${gz(bundle('driver.ts'))} B`);
	});
});
