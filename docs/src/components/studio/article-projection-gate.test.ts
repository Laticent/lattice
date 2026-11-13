import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { hasRuntimeDrawn } from './article-projection';

// The root's work counter and regex trace (test/helpers/), CommonJS.
const req = createRequire(import.meta.url);
const { charReads } = req('../../../../test/helpers/work-count.js') as {
	charReads: <T>(fn: () => T) => { result: T; scanned: number; reads: number };
};
const { assertLinearRegexes } = req('../../../../test/helpers/regex-trace.js') as {
	assertLinearRegexes: <T>(fn: () => T, opts?: { allow?: Record<string, string> }) => { result: T; keys: Set<string> };
};
const work = (fn: () => unknown) => {
	const r = charReads(fn);
	return r.scanned + r.reads;
};
// The patterns the gate's path runs. They live in docs/src (the tag tokenizer in @laticent/markup), outside
// tools/regex-census.json's lib/**, so each is named here with recheck's own verdict (`npm run regex:census -- --check`).
const SAFE = 'recheck 4.6.2 (automaton): safe; docs/src, outside the lib/** census';
const allow = {
	'/<(\\/?)([a-zA-Z][a-zA-Z0-9-]*)/y': SAFE,
	'/[>"\']/g': SAFE,
	'/(?:^|\\s)class="([^"]*)"/': SAFE,
	'/\\s+/y': SAFE,
};

// The Read pane's bake gate (article-projection.ts `hasRuntimeDrawn`). It decides whether the
// render pays for a capture-frame bake, and it runs on deck text that can come from a shared link.
describe('hasRuntimeDrawn — the Read pane bake gate', () => {
	it('finds a Mermaid fence by its resolved class, and a plugin figure by the host marker', () => {
		expect(hasRuntimeDrawn('<pre><code class="hljs language-mermaid">graph LR</code></pre>')).toBe(true);
		expect(hasRuntimeDrawn('<div class="functionplot" data-lattice-hydrate="function-plot"></div>')).toBe(true);
	});

	it('does not bake for the class name in prose, or in the RAW data-class (#1358)', () => {
		expect(hasRuntimeDrawn('<p>write <code>language-mermaid</code> to get a diagram</p>')).toBe(false);
		expect(hasRuntimeDrawn('<code data-class="language-mermaid">x</code>')).toBe(false);
		expect(hasRuntimeDrawn('<p>no figures here</p>')).toBe(false);
	});

	// The regex it replaced was quadratic here (CodeQL js/polynomial-redos on #2439): 247 ms for
	// 8,000 repeated `<code`, four times that for twice as many. A single-pass walk stays flat.
	it('stays linear on a hostile run of unclosed <code tags', () => {
		const hostile = `${'<code'.repeat(64_000)} language-mermaid`;
		// COUNTED, not timed (HARD RULE #32). The walk covers about 5 characters per character of input today; a search on
		// from every `<code` covers n / 2. And no regex on the path may backtrack, which a count cannot see.
		const w = work(() => hasRuntimeDrawn(hostile));
		expect(w, `${w} for ${hostile.length} characters`).toBeLessThan(20 * hostile.length);
		assertLinearRegexes(() => hasRuntimeDrawn(hostile), { allow });
	});

	it('failing arms: a rescanning walk and the old regex are each caught', () => {
		const hostile = `${'<code'.repeat(64_000)} language-mermaid`;
		const rescan = (s: string) => {
			for (let i = s.indexOf('<code'); i !== -1; i = s.indexOf('<code', i + 1)) s.indexOf('>', i);
		};
		expect(work(() => rescan(hostile))).toBeGreaterThan(20 * hostile.length);
		// recheck calls the old pattern polynomial, and the census does not hold it, so the trace refuses it.
		const old = /<code[^>]*\sclass="[^"]*language-mermaid/;
		expect(() => assertLinearRegexes(() => old.test('<code class="language-mermaid">'), { allow })).toThrow(/does not hold/);
	});
});
