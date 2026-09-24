// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { createRequire } from 'node:module';
import { Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { packVocabNames, withUnpackedNames } from '../components/studio/lint-vocab-names';
import { buildVocabSets, chunkStartLines, findingsToDiagnostics } from './editor-diagnostics.js';

const require = createRequire(import.meta.url);

const doc = (s: string) => Text.of(s.split('\n'));

describe('chunkStartLines', () => {
	it('maps human slide numbers to 1-based start lines (no front matter)', () => {
		// slide 1 starts at line 1; the `---` separator is line 3, so slide 2's chunk
		// starts on line 4 (the line right after the separator) — matching the
		// Architect's existing reveal numbering.
		const starts = chunkStartLines('# A\n\n---\n\n# B\n');
		expect(starts[0]).toBe(1); // deck top (slide 0 / deck-level findings)
		expect(starts[1]).toBe(1); // slide 1
		expect(starts[2]).toBe(4); // slide 2
	});

	it('skips a front-matter block so slide 1 is the first real slide', () => {
		const src = '---\ntheme: indaco\n---\n\n# A\n\n---\n\n# B\n';
		const starts = chunkStartLines(src);
		expect(starts[1]).toBe(4); // first content line after the closing `---`
		expect(starts[2]).toBe(8); // line after the slide separator
	});
});

describe('buildVocabSets', () => {
	it('rehydrates arrays into the Sets/shape lint-core expects', () => {
		const sets = buildVocabSets({
			names: ['title', 'kpi'],
			modifiers: ['compact'],
			mapRegions: { us: { valid: ['CA'], names: ['California'] } },
			finishNames: ['none', 'atrium'],
			modeNames: ['boardroom', 'sketch'],
			capacity: { kpi: { axis: 'item', hard: 4 } },
		});
		expect(sets.names instanceof Set).toBe(true);
		expect(sets.names.has('kpi')).toBe(true);
		expect(sets.modifiers.has('compact')).toBe(true);
		expect(sets.mapRegions?.us.valid.has('CA')).toBe(true);
		expect(sets.finishNames).toEqual(['none', 'atrium']);
		// The `mode:` validator must survive rehydration too — without this forward
		// the browser/Drawing Board unknown-mode rule is silently dead (only the CLI
		// catches a typo). Regression guard for the maker-checker #3 finding.
		expect(sets.modeNames).toEqual(['boardroom', 'sketch']);
		expect(sets.capacity?.kpi.hard).toBe(4);
	});

	// The Studio's inline lint and the Coach read the vocab through this builder, and
	// every `*Names` list gates one `findUnknown*` rule in lint-core. When the builder
	// forwarded a hand-kept six, fifteen of those rules were dead in the Studio while
	// `lint:deck` still fired them. So: take the LIVE vocab down the same road
	// studio.astro ships it (packed, then unpacked by the island), and prove a bad value
	// on each register's key draws that register's warning.
	it('forwards every *Names register list, so each findUnknown* rule fires in the Studio', () => {
		const { loadAll } = require('../../../lib/components/index.js');
		const { buildVocab } = require('../../../lib/authoring/lint.js');
		const { lintTextWith } = require('../../../lib/authoring/lint-core.js');
		const live = buildVocab(loadAll());
		const shipped = withUnpackedNames({ names: [...live.names], modifiers: [...live.modifiers], packedNames: packVocabNames(live) });
		const sets = buildVocabSets(shipped) as unknown as Record<string, unknown>;
		const lists = Object.keys(live).filter((k) => k.endsWith('Names'));
		expect(lists.length).toBeGreaterThanOrEqual(21);
		// The front-matter key each list validates: camelCase → kebab-case, with the two
		// SHAPE registers named for the key rather than the style.
		const keyFor = (list: string) => ({ stampStyleNames: 'stamp', toneStyleNames: 'tone' })[list] ?? list.replace(/Names$/, '').replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
		const silent = lists.filter((list) => {
			expect(sets[list], list).toEqual(live[list]);
			const deck = `---\n${keyFor(list)}: zzqx-not-a-value\n---\n\n# A\n`;
			// Each register's own rule, `unknown-<key>` — not any `unknown-*`, which a
			// neighboring rule could satisfy while this one stays dead.
			return !lintTextWith(deck, sets).some((f: { rule: string }) => f.rule === `unknown-${keyFor(list)}`);
		});
		expect(silent, `a bad value on these registers draws no warning in the Studio: ${silent.join(', ')}`).toEqual([]);
	});

	it('tolerates an empty/missing vocab', () => {
		const sets = buildVocabSets(undefined);
		expect(sets.names.size).toBe(0);
		expect(sets.modifiers.size).toBe(0);
		expect(sets.mapRegions).toBeUndefined();
	});
});

describe('findingsToDiagnostics', () => {
	const src = '<!-- _class: cards-grid -->\n\n## Title\n\n- **A.** body\n';
	const d = doc(src);

	it('anchors a finding to its line and underlines the trimmed content', () => {
		const [diag] = findingsToDiagnostics(d, [
			{ slide: 1, rule: 'card-style-inline-title', severity: 'error', line: '- **A.** body', message: 'inline title', fix: 'nest it' },
		]);
		const line = d.lineAt(diag.from);
		expect(line.text).toBe('- **A.** body');
		expect(diag.from).toBe(line.from); // no leading indent on this line
		expect(diag.to).toBe(line.to);
		expect(diag.severity).toBe('error');
		expect(diag.message).toContain('inline title');
		expect(diag.message).toContain('Fix: nest it'); // fix folded into the tooltip
	});

	it('underlines only the SPAN a finding names, not the whole line', () => {
		const pills = doc('## Title\n\nStatus is `{OK}:tag` and `{WM}:circle` today.\n');
		const [diag] = findingsToDiagnostics(pills, [
			{ slide: 1, rule: 'pill-shape-crowded', severity: 'warning', line: 'Status is `{OK}:tag` and `{WM}:circle` today.', span: '`{WM}:circle`', message: 'm' },
		]);
		expect(pills.sliceString(diag.from, diag.to)).toBe('`{WM}:circle`');
		// A span that is not on the matched line falls back to the whole line, never elsewhere.
		const [fallback] = findingsToDiagnostics(pills, [
			{ slide: 1, rule: 'r', severity: 'warning', line: 'Status is `{OK}:tag` and `{WM}:circle` today.', span: '`{GONE}:circle`', message: 'm' },
		]);
		expect(pills.sliceString(fallback.from, fallback.to)).toBe('Status is `{OK}:tag` and `{WM}:circle` today.');
	});

	it('starts the underline past leading indentation', () => {
		const indented = doc('<!-- _class: kpi -->\n\n  - **A.** body\n');
		const [diag] = findingsToDiagnostics(indented, [
			{ slide: 1, rule: 'r', severity: 'warning', line: '- **A.** body', message: 'm' },
		]);
		const line = indented.lineAt(diag.from);
		expect(diag.from).toBe(line.from + 2); // two-space indent skipped
	});

	it('prefers the line the finding quoted VERBATIM over one that merely trims to it', () => {
		// A nested render-target key and a top-level one trim to the same characters. The
		// finding is about the INDENTED line, so quoting it with its indentation has to win —
		// on the trimmed match alone the squiggle landed on the innocent top-level line while
		// the message said it was indented.
		const nested = doc('---\nfluid: true\nnest:\n  fluid: true\n---\n\n# One\n');
		const [diag] = findingsToDiagnostics(nested, [
			{ slide: 0, rule: 'nested-render-target-key', severity: 'warning', line: '  fluid: true', message: 'indented' },
		]);
		expect(nested.lineAt(diag.from).number).toBe(4);
		// And the trimmed form still lands on the first line that trims to it — the behavior
		// every other rule relies on, since they all quote their line trimmed.
		const [plain] = findingsToDiagnostics(nested, [{ slide: 0, rule: 'r', severity: 'warning', line: 'fluid: true', message: 'm' }]);
		expect(nested.lineAt(plain.from).number).toBe(2);
	});

	it('falls back to the trimmed match when the verbatim line is not in the document', () => {
		// The indentation is a preference, not a requirement: a finding quoting `  - **A.**
		// body` on a document that indents it differently still lands on the line.
		const indented = doc('<!-- _class: kpi -->\n\n   - **A.** body\n');
		const [diag] = findingsToDiagnostics(indented, [{ slide: 1, rule: 'r', severity: 'warning', line: '  - **A.** body', message: 'm' }]);
		expect(indented.lineAt(diag.from).number).toBe(3);
	});

	it('attaches a quick-fix action only for autofixable findings with an onFix hook', () => {
		const calls: unknown[] = [];
		const diags = findingsToDiagnostics(
			d,
			[
				{ slide: 1, rule: 'a', severity: 'error', line: '- **A.** body', message: 'm', autofixable: true },
				{ slide: 1, rule: 'b', severity: 'warning', line: '## Title', message: 'm' },
			],
			{ onFix: (_v: unknown, f: unknown) => calls.push(f) },
		);
		// Results are returned sorted by position: '## Title' (line 3) before
		// '- **A.** body' (line 5).
		const withAction = diags.filter((x) => x.actions);
		const without = diags.filter((x) => !x.actions);
		expect(withAction).toHaveLength(1);
		expect(without).toHaveLength(1);
		const fixable = withAction[0];
		const plain = without[0];
		expect(plain.from).toBeLessThan(fixable.from);
		expect(fixable.actions?.[0].name).toBe('Quick fix');
		expect(plain.actions).toBeUndefined();
		fixable.actions?.[0].apply({} as never, fixable.from, fixable.to);
		expect(calls).toHaveLength(1);
	});

	it('names the button after what it will do, and drops the prose fix it replaces', () => {
		// #1658: a tooltip that prints "Fix: set it to one of: …" underneath a button that
		// already does it reads as the tool knowing the answer and making you type it.
		const [diag] = findingsToDiagnostics(
			d,
			[{ slide: 1, rule: 'unknown-class', severity: 'warning', line: '<!-- _class: kpi -->', message: 'unknown', fix: 'Check the spelling.', autofixable: true, didYouMean: 'kpi' }],
			{ onFix: () => {} },
		);
		expect(diag.actions?.[0].name).toBe('Fix: use “kpi”');
		expect(diag.message).toBe('unknown');
		expect(diag.message).not.toContain('Fix:');
	});

	it('keeps the prose fix when the kernel cannot apply it — guidance is all there is', () => {
		const [diag] = findingsToDiagnostics(
			d,
			[{ slide: 1, rule: 'r', severity: 'warning', line: '<!-- _class: kpi -->', message: 'unknown', fix: 'Check the spelling.' }],
			{ onFix: () => {} },
		);
		expect(diag.actions).toBeUndefined();
		expect(diag.message).toContain('Fix: Check the spelling.');
	});

	it('falls back to the generic label when a fixable finding names no suggestion', () => {
		const [diag] = findingsToDiagnostics(
			d,
			[{ slide: 1, rule: 'card-style-inline-title', severity: 'error', line: '- **A.** body', message: 'm', autofixable: true }],
			{ onFix: () => {} },
		);
		expect(diag.actions?.[0].name).toBe('Quick fix');
	});

	it('offers no button when there is no onFix hook, even for an autofixable finding', () => {
		// The Architect panel renders the same findings without an editor to dispatch into.
		const [diag] = findingsToDiagnostics(d, [
			{ slide: 1, rule: 'unknown-class', severity: 'warning', line: '<!-- _class: kpi -->', message: 'unknown', fix: 'Check the spelling.', autofixable: true, didYouMean: 'kpi' },
		]);
		expect(diag.actions).toBeUndefined();
		expect(diag.message).toContain('Fix: Check the spelling.');
	});

	it('prefers an exact line match over an earlier superset line', () => {
		const d2 = doc('<!-- _class: cards-grid -->\n\n- foobar baz\n- foo\n');
		const [diag] = findingsToDiagnostics(d2, [{ slide: 1, rule: 'r', severity: 'warning', line: '- foo', message: 'm' }]);
		expect(d2.lineAt(diag.from).text).toBe('- foo'); // not the earlier `- foobar baz`
	});

	it('falls back to the slide start when a finding has no line', () => {
		const [diag] = findingsToDiagnostics(d, [{ slide: 1, rule: 'r', severity: 'warning', message: 'm' }]);
		expect(d.lineAt(diag.from).number).toBe(1);
	});

	it('maps an unknown severity to info', () => {
		const [diag] = findingsToDiagnostics(d, [{ slide: 1, rule: 'r', severity: 'suggestion', message: 'm' } as never]);
		expect(diag.severity).toBe('info');
	});
});
