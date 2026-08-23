import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { orSupportsCache, withCachedSystem } from './or-cache.js';

// Prompt caching (#610): mark the static SYSTEM prefix with a `cache_control`
// breakpoint so a repeated, byte-identical system prompt (our ~7K-token authoring
// canon) is read at ~0.1x on calls 2..N instead of re-billed at full input price.
// These lock the PURE message-shaping contract; the live cache HIT is observed
// against the real API (a budget-gated manual smoke), not here.

const SYS = { role: 'system', content: 'BIG STATIC CANON …' };
const USER = { role: 'user', content: 'a grid of cards' };
const NEIGHBORS = { role: 'assistant', content: 'near-neighbors: capability-cards' };

describe('architect-model — prompt-cache breakpoint (#610)', () => {
	it('marks the system block for vendors that need an explicit breakpoint (anthropic/google)', () => {
		for (const id of ['anthropic/claude-sonnet-4.5', 'google/gemini-2.5-pro']) {
			const out = withCachedSystem([SYS, USER], id);
			expect(Array.isArray(out[0].content)).toBe(true);
			expect(out[0].content).toEqual([{ type: 'text', text: SYS.content, cache_control: { type: 'ephemeral' } }]);
			// the user turn is untouched — it varies, so it stays OUTSIDE the cached prefix
			expect(out[1]).toEqual(USER);
		}
	});

	it('leaves auto-caching vendors (openai/deepseek/x-ai) untouched — plain string content', () => {
		for (const id of ['openai/gpt-5', 'deepseek/deepseek-r1', 'x-ai/grok-4']) {
			const out = withCachedSystem([SYS, USER], id);
			expect(out).toEqual([SYS, USER]);
			expect(typeof out[0].content).toBe('string');
		}
	});

	it('marks ONLY the first system message (a per-request dedup-neighbor block stays uncached)', () => {
		const out = withCachedSystem([SYS, NEIGHBORS, USER], 'anthropic/claude-sonnet-4.5');
		expect(Array.isArray(out[0].content)).toBe(true);
		expect(out[1]).toEqual(NEIGHBORS); // assistant neighbors: untouched
		expect(out[2]).toEqual(USER);
	});

	it('is a no-op when there is no system message, and is pure (inputs untouched)', () => {
		const input = [USER];
		const out = withCachedSystem(input, 'anthropic/claude-sonnet-4.5');
		expect(out).toEqual([USER]);
		expect(typeof SYS.content).toBe('string'); // the shared SYS literal was never mutated
		expect(input[0]).toBe(USER);
	});

	it('tolerates junk input (null model, empty list) without throwing', () => {
		expect(withCachedSystem([SYS, USER], '')).toEqual([SYS, USER]);
		expect(withCachedSystem([], 'anthropic/x')).toEqual([]);
		expect(withCachedSystem(undefined as never, 'anthropic/x')).toEqual([]);
	});

	it('the breakpoint vendor set is a subset of the cache-capable vendor set', () => {
		// every vendor we mark must be one OpenRouter reports as cache-capable
		for (const id of ['anthropic/x', 'google/x']) expect(orSupportsCache(id)).toBe(true);
	});

	// A canon/voice split (withStudioVoice's cloud path): the system arrives as
	// [stable canon, volatile voice] text parts. The breakpoint goes on the FIRST
	// part so the cached prefix ends AFTER the canon and BEFORE the voice — a
	// deck-language / standing-instructions change re-pays only the short voice tail.
	const CANON = { type: 'text', text: 'BIG STATIC CANON …' };
	const VOICE = { type: 'text', text: 'Output language: English. Standing instructions: …' };
	it('marks the FIRST part of a [canon, voice] system split, leaving the voice uncached', () => {
		const split = { role: 'system', content: [CANON, VOICE] };
		const out = withCachedSystem([split, USER], 'anthropic/claude-sonnet-4.5');
		expect(out[0].content).toEqual([
			{ ...CANON, cache_control: { type: 'ephemeral' } }, // canon cached
			VOICE, // voice trails, uncached
		]);
		expect(out[1]).toEqual(USER);
	});

	it('leaves a [canon, voice] split as plain parts for auto-caching vendors', () => {
		const split = { role: 'system', content: [CANON, VOICE] };
		const out = withCachedSystem([split, USER], 'openai/gpt-5');
		expect(out[0].content).toEqual([CANON, VOICE]); // untouched — no explicit breakpoint needed
	});

	it('does not double-mark a split that already carries a cache_control', () => {
		const preMarked = { role: 'system', content: [{ ...CANON, cache_control: { type: 'ephemeral' } }, VOICE] };
		const out = withCachedSystem([preMarked, USER], 'anthropic/claude-sonnet-4.5');
		expect(out[0].content).toEqual(preMarked.content); // left as authored, no second breakpoint
	});
});

// The ids the product ACTUALLY ships are OpenRouter aliases — `architect.ts`'s
// `defaultModel: '~anthropic/claude-haiku-latest'` and this module's own
// `DEFAULT_OR_MODEL = '~anthropic/claude-sonnet-latest'`. The vendor split used to read
// `'~anthropic'`, so no breakpoint was emitted for either, and Anthropic caches only what
// you mark: the entire static-prefix seam was inert for the default model while every test
// here passed against a bare `anthropic/…` id nobody is served. Test the shipped ids.
describe('architect-model — the alias prefix does not defeat caching', () => {
	for (const id of ['~anthropic/claude-haiku-latest', '~anthropic/claude-sonnet-latest', '~google/gemini-2.5-pro']) {
		it(`marks the system block for the shipped alias ${id}`, () => {
			const out = withCachedSystem([SYS, USER], id);
			expect(Array.isArray(out[0].content)).toBe(true);
			expect(out[0].content).toEqual([{ type: 'text', text: SYS.content, cache_control: { type: 'ephemeral' } }]);
			expect(out[1]).toEqual(USER);
		});
	}

	it('carries the chat’s 1h TTL through an alias id too', () => {
		const out = withCachedSystem([SYS, USER], '~anthropic/claude-haiku-latest', '1h');
		expect((out[0].content as { cache_control?: unknown }[])[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
	});

	it('reports alias ids as cache-capable to the UI-honesty gate', () => {
		expect(orSupportsCache('~anthropic/claude-haiku-latest')).toBe(true);
		expect(orSupportsCache('~openai/gpt-5')).toBe(true);
		expect(orSupportsCache('~meta-llama/llama-3-70b')).toBe(false);
	});

	it('leaves an auto-caching vendor alone whether or not it is aliased', () => {
		expect(withCachedSystem([SYS, USER], '~openai/gpt-5')).toEqual([SYS, USER]);
	});
});


// The reason this module exists as its own file, pinned so it cannot quietly rot back.
//
// `WorkspaceSheet.tsx` needs `orSupportsCache` on its render path, and importing it from
// `architect-model.js` put the whole AI provider layer — the only consumer of which is
// `architect.ts`'s dynamic `import()` — into the Studio's EAGER bundle: 16.0KB raw /
// 5.6KB gz, inlined straight into the monolith chunk (#1773,
// engineering/decisions/2026-08-23-studio-shell-decomposition.md §5.2).
//
// Neither half of that is caught by an existing gate. The route-byte ledger carries ~3%
// (~19KB gz) of headroom by design, so re-adding the static import fits inside it
// silently; and nothing at all stops an import landing IN this module, which would drag
// whatever it names along the same path. Both are one-line regressions, so both are
// asserted here rather than left to a reviewer noticing an import line.
describe('the AI provider layer stays off the Studio’s eager path (#1773)', () => {
	const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

	// `.astro` is in the sweep because it is a real static-import surface into this
	// graph, not only a page shell: `src/pages/studio.astro` frontmatter statically
	// imports eight `components/studio/*` modules. A scan of script files alone would
	// let the edge back in through a page.
	/** Every `.ts`/`.tsx`/`.js`/`.mjs`/`.astro` under docs/src that is not itself a test. */
	function sources(dir: string, out: string[] = []): string[] {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, e.name);
			if (e.isDirectory()) sources(full, out);
			else if (/\.(ts|tsx|js|mjs|astro)$/.test(e.name) && !/\.test\.[^.]+$/.test(e.name)) out.push(full);
		}
		return out;
	}

	// Comments first, or the scan reads the prose ABOUT imports as imports — this
	// module's own header names `import()` twice explaining why it exists. Block
	// comments go wholesale; line comments only when `//` opens the line (the house
	// style), so a `https://` inside a string can't be mistaken for one.
	const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

	// A STATIC edge only: `import … from '…'`, bare `import '…'`, and `export … from '…'`
	// — the re-export form is a static edge too, and a scan that only knew the word
	// `import` would wave it straight past. A dynamic `import('…')` has no space before
	// its paren and is exactly what this file's existence is protecting, so it must NOT
	// match.
	const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?:[^;]*?\sfrom\s*)?['"]([^'"]+)['"]/g;
	const staticSpecifiers = (src: string) => [...stripComments(src).matchAll(STATIC_IMPORT)].map((m) => m[1]);

	// The extension is OPTIONAL, because Vite/Astro resolve an extension-less specifier
	// and this tree already relies on that (`@/lib/resolve-captions` and
	// `@/lib/resolve-pace`, both from StudioShell, both landing on a `.js` file). A
	// suffix test against the written text alone therefore reads
	// `'…/ai/architect-model'` as innocent — and that spelling gives the whole win back:
	// measured, it re-inlines the module into the monolith chunk, restores studio
	// eagerJsGz to 640,861, and leaves `check:route-budget` GREEN, because the ledger's
	// ~3% headroom swallows it. The pin matches module IDENTITY, not one spelling of it.
	const NAMES_THE_PROVIDER_LAYER = /(?:^|\/)architect-model(?:\.(?:js|mjs|ts))?$/;

	it('no docs/src module statically imports architect-model.js', () => {
		const offenders = sources(SRC)
			.filter((f) => !f.endsWith(`${path.sep}architect-model.js`))
			.filter((f) => staticSpecifiers(fs.readFileSync(f, 'utf8')).some((spec) => NAMES_THE_PROVIDER_LAYER.test(spec)))
			.map((f) => path.relative(SRC, f));
		expect(offenders).toEqual([]);
	});

	it('or-cache.js imports nothing, so importing it costs only itself', () => {
		const src = fs.readFileSync(path.join(SRC, 'components', 'studio', 'ai', 'or-cache.js'), 'utf8');
		expect(staticSpecifiers(src)).toEqual([]);
		expect(stripComments(src)).not.toMatch(/\bimport\s*\(/);
	});
});
