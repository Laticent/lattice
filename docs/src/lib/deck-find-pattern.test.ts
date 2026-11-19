import { describe, expect, it, vi } from 'vitest';
import { findInSlide, replaceInSlide, searchTexts } from './deck-find';
import { compilePattern, expandReplacement, type PatternJob, type PatternWorker, patternFlags, patternSource, runPattern, withCaseOf, workerPatternRunner } from './deck-find-pattern';

// A pattern never runs in the kernel. These tests stand in for the Worker with `runPattern` called in the
// test's own thread (it is the function the Worker calls), so the kernel sees exactly what it would see.
const viaWorker = (slide: string, pattern: string, o: { caseSensitive?: boolean; wholeWord?: boolean } = {}) => {
	const opts = { ...o, regex: true };
	const texts = searchTexts(slide, opts);
	const r = runPattern({ source: patternSource(pattern, opts), flags: patternFlags(opts), texts });
	if (!r.ok) throw new Error(r.message);
	const answers = new Map(texts.map((t, i) => [t, r.matches[i]]));
	return { ...opts, matches: (t: string) => answers.get(t) ?? [] };
};

describe('withCaseOf: preserve-case', () => {
	it('carries ALL CAPS, Capitalized and lower case over, and leaves mixed case alone', () => {
		expect(withCaseOf('OCT', 'October')).toBe('OCTOBER');
		expect(withCaseOf('Oct', 'october')).toBe('October');
		expect(withCaseOf('oct', 'October')).toBe('october');
		expect(withCaseOf('iPhone', 'Pixel')).toBe('Pixel');
		expect(withCaseOf('Q', 'quarter')).toBe('Quarter'); // a single capital reads as Capitalized
		expect(withCaseOf('2026', 'Next year')).toBe('Next year'); // no letters: as typed
		expect(withCaseOf('OCT. 10', 'October tenth')).toBe('OCTOBER TENTH');
		expect(withCaseOf('Été', 'automne')).toBe('Automne');
		expect(withCaseOf('Oct', '10 october')).toBe('10 October'); // the first LETTER, past a digit
	});
});

describe('expandReplacement: a pattern’s groups', () => {
	const m = { index: 0, text: 'Q3 2026', groups: ['3', '2026'], named: undefined };
	it('fills $1, $&, $$ and leaves an unknown group as typed', () => {
		expect(expandReplacement('Q$1 FY$2', m)).toBe('Q3 FY2026');
		expect(expandReplacement('[$&]', m)).toBe('[Q3 2026]');
		expect(expandReplacement('$$5', m)).toBe('$5');
		expect(expandReplacement('$5 and $0', m)).toBe('$5 and $0');
		expect(expandReplacement('$10', m)).toBe('30'); // no group 10: group 1, then a literal 0
	});
	it('fills named groups, and an unknown name stays as typed', () => {
		const n = { index: 0, text: 'Oct 10', groups: ['Oct', '10'], named: { mon: 'Oct', day: '10' } };
		expect(expandReplacement('$<day> $<mon>', n)).toBe('10 Oct');
		expect(expandReplacement('$<year>', n)).toBe('$<year>');
	});
});

describe('compilePattern', () => {
	it('refuses a pattern that does not compile, with the engine’s reason', () => {
		const bad = compilePattern('(oct', { regex: true });
		expect(bad).toHaveProperty('error');
		expect(compilePattern('(oct', {})).toBeInstanceOf(RegExp); // literal: the parenthesis is text
	});
});

describe('runPattern: the Worker’s side', () => {
	it('skips empty matches and caps the total', () => {
		const r = runPattern({ source: 'x*', flags: 'gu', texts: ['axxb'] });
		expect(r.ok && r.matches[0].map((m) => m.text)).toEqual(['xx']);
		const many = runPattern({ source: '.', flags: 'gu', texts: ['a'.repeat(6000)] });
		expect(many).toMatchObject({ ok: false, reason: 'too-many' });
	});
});

describe('the kernel with a pattern', () => {
	const slide = ['<!-- _class: content -->', '`Q3 2026 REVIEW`', '', '## Results for Q3 2026', '', 'Revenue in Q3 2026 rose; see [Q3 2026](https://x.test/q3-2026).', '', '<!-- say: Q3 2026 was strong. -->', '', '```', 'Q3 2026 in code', '```'].join('\n');

	it('throws if asked to run a pattern itself', () => {
		expect(() => findInSlide(slide, 'Q\\d', { regex: true })).toThrow(/never runs a pattern/);
	});

	it('finds by pattern in the same fields as a literal find, never in targets', () => {
		const found = findInSlide(slide, 'Q(\\d) (\\d{4})', viaWorker(slide, 'Q(\\d) (\\d{4})'));
		expect(found.map((m) => [m.field, m.replaceable])).toEqual([
			['eyebrow', true],
			['heading', true],
			['body', true],
			['body', true],
			['spoken line', true],
			['code', false],
		]);
	});

	it('replaces with groups, escaping the result like typed words, and leaves the link target', () => {
		const r = replaceInSlide(slide, 'Q(\\d) (\\d{4})', '$2 $$Q$1', viaWorker(slide, 'Q(\\d) (\\d{4})'));
		expect(r.blocked).toBeUndefined();
		expect(r.text).toContain('## Results for 2026 \\$Q3');
		expect(r.text).toContain('(https://x.test/q3-2026)');
		expect(r.text).toContain('<!-- say: 2026 $Q3 was strong. -->');
		expect(r.text).toContain('Q3 2026 in code');
	});

	it('refuses a group that would carry a backtick into a code span', () => {
		const s = 'Use `npm run a` or `npm run b`.';
		const r = replaceInSlide(s, 'run (\\w)', 'run `$1', viaWorker(s, 'run (\\w)'));
		expect(r.blocked).toMatch(/backtick/);
		expect(r.text).toBe(s);
	});

	it('preserve-case writes each match in its own case', () => {
		const s = ['<!-- _class: content -->', '`OCT LAUNCH`', '', '## Oct launch', '', 'We shipped in oct.'].join('\n');
		const r = replaceInSlide(s, 'oct', 'October', { preserveCase: true, wholeWord: true });
		expect(r.text).toContain('`OCTOBER LAUNCH`');
		expect(r.text).toContain('## October launch');
		expect(r.text).toContain('We shipped in october.');
		// Off by default: the replacement is written exactly as given.
		expect(replaceInSlide(s, 'oct', 'October', { wholeWord: true }).text).toContain('`October LAUNCH`');
	});

	it('preserve-case and a pattern combine: groups first, then the case', () => {
		const s = '## OCT 10 RECAP\n\nOct 10 was busy.';
		const r = replaceInSlide(s, '(oct) (\\d+)', '$2 $1ober', { ...viaWorker(s, '(oct) (\\d+)'), preserveCase: true });
		expect(r.text).toBe('## 10 OCTOBER RECAP\n\n10 October was busy.');
	});
});

describe('workerPatternRunner: the timeout', () => {
	// A worker that never answers: the stand-in for `(a+)+$` backtracking. The runner must end it and refuse.
	const silent = () => {
		const w: PatternWorker & { ended: boolean; got: PatternJob | null } = {
			onmessage: null,
			onerror: null,
			ended: false,
			got: null,
			postMessage(job) {
				w.got = job;
			},
			terminate() {
				w.ended = true;
			},
		};
		return w;
	};

	it('ends a worker that misses the deadline and reports a timeout', async () => {
		// Fake timers: the deadline is the product's behavior, and the test waits on it as a signal, not a sleep.
		vi.useFakeTimers();
		let w = silent();
		const run = workerPatternRunner(() => {
			w = silent();
			return w;
		}, 2000);
		const pending = run({ source: '(a+)+$', flags: 'gu', texts: ['aaaa!'] });
		await vi.advanceTimersByTimeAsync(1999);
		expect(w.ended).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		const r = await pending;
		vi.useRealTimers();
		expect(r).toMatchObject({ ok: false, reason: 'timeout' });
		expect(w.got?.source).toBe('(a+)+$');
		expect(w.ended).toBe(true);
	});

	it('ends the worker after an answer, and reads an error event as a failure', async () => {
		let w = silent();
		const run = workerPatternRunner(() => {
			w = silent();
			queueMicrotask(() => w.onmessage?.({ data: runPattern(w.got as PatternJob) }));
			return w;
		}, 1000);
		const ok = await run({ source: 'a', flags: 'gu', texts: ['banana'] });
		expect(ok.ok && ok.matches[0].length).toBe(3);
		expect(w.ended).toBe(true);
		const failing = workerPatternRunner(() => {
			w = silent();
			queueMicrotask(() => w.onerror?.({ message: 'boom' }));
			return w;
		}, 1000);
		expect(await failing({ source: 'a', flags: 'gu', texts: [] })).toMatchObject({ ok: false, reason: 'failed', message: 'boom' });
	});
});
