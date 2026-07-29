import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scrubOAuthCode } from './architect';

// `overlay-back.ts` records ownership of its synthetic history entry in `history.state`, and
// that is the ONLY record which survives a reload. Any `replaceState(null, …)` wipes it —
// silently, because the in-memory sentinel carries on and nothing breaks until the next
// reload. Two URL-tidy call sites were losing it.
//
// These tests exist because an independent checker mutated BOTH fixes back to `null` and the
// entire suite stayed green: 4 mutations, 0 failures. A fix to a silent invariant, with no
// test, is a fix that gets reverted by the next person who finds the line ugly.
//
// The scrubs run at boot inside effects that are awkward to drive in isolation, so these
// assert on the source. That is weaker than executing them and it is stated plainly rather
// than dressed up: what it pins is "this call site passes state through", which is exactly
// the property that regressed.

const DOCS_SRC = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(DOCS_SRC, rel), 'utf8');

/** Every `replaceState`/`pushState` call in a file, with its first argument. */
function historyWrites(source: string): string[] {
	return [...source.matchAll(/history\.(?:replaceState|pushState)\(\s*([^,]+?)\s*,/g)].map((m) => m[1]);
}

describe('history.state is preserved by the URL scrubs', () => {
	it('the ?new=1 scrub carries state through', () => {
		const writes = historyWrites(read('components/studio/StudioShell.tsx'));
		expect(writes.length).toBeGreaterThan(0);
		for (const arg of writes) {
			expect(arg, 'a URL tidy in StudioShell must not pass null/{} as history.state').toMatch(
				/history\.state/,
			);
		}
	});

	it('the OpenRouter OAuth scrub carries state through', () => {
		const writes = historyWrites(read('components/studio/architect.ts'));
		expect(writes.length).toBeGreaterThan(0);
		for (const arg of writes) {
			expect(arg, 'the OAuth scrub must not pass null/{} as history.state').toMatch(/history\.state/);
		}
	});

	it('the OAuth scrub removes the code and keeps everything else', () => {
		// The REAL exported function, not a re-implementation. The first version of this test
		// re-implemented the four lines here, so deleting `params.delete('code')` from the
		// shipped code left the suite green — with the authorization code sitting in the
		// address bar.
		const scrub = (href: string) => {
			const url = new URL(href, 'https://example.test');
			return scrubOAuthCode(url.pathname, url.search, url.hash);
		};
		expect(scrub('/studio/?code=SECRET')).toBe('/studio/');
		expect(scrub('/studio/?code=A&code=B')).toBe('/studio/');
		expect(scrub('/studio/?new=1&code=SECRET')).toBe('/studio/?new=1');
		expect(scrub('/studio/?code=SECRET#frag')).toBe('/studio/#frag');
		expect(scrub('/studio/')).toBe('/studio/');
	});

	it("overlay-back's offender roster names only call sites that really still drop state", () => {
		// The roster is prose in a header, and its own text records having been wrong three
		// commits running. This checks the count it claims against the tree.
		const roster = read('lib/overlay-back.ts');
		const claimed = /FOUR call sites still do this/.test(roster);
		expect(claimed, 'the roster wording changed — re-count and update this test with it').toBe(true);

		const files = [
			'components/playground/PlaygroundApp.tsx',
			'playground/theme-studio.js',
			'components/studio/StudioShell.tsx',
			'components/studio/architect.ts',
		];
		const dropping = files.flatMap((rel) =>
			historyWrites(read(rel))
				.filter((arg) => !/history\.state/.test(arg))
				.map(() => rel),
		);
		// PlaygroundApp has two; theme-studio one; the two fixed sites contribute none.
		expect(dropping.sort()).toEqual([
			'components/playground/PlaygroundApp.tsx',
			'components/playground/PlaygroundApp.tsx',
			'playground/theme-studio.js',
		]);
	});
});
