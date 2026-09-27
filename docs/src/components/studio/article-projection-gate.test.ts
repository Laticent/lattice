import { describe, expect, it } from 'vitest';
import { hasRuntimeDrawn } from './article-projection';

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
		const start = performance.now();
		hasRuntimeDrawn(hostile);
		expect(performance.now() - start).toBeLessThan(500);
	});
});
