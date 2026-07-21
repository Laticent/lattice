// Unit tests for the pure resolution/injection logic behind
// scripts/inject-modulepreload.mjs. No build, no browser — the chunk graph is
// a plain object fixture (the same shape astro.config.mjs's chunkGraphPlugin
// emits from Rollup's OutputChunk.imports/dynamicImports/viteMetadata).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ENTRIES, findEntryChunk, injectIntoPage, MARKER, processEntry, resolveTransitiveDeps } from './inject-modulepreload.mjs';

function chunk({ facadeModuleId = null, imports = [], dynamicImports = [], css = [] } = {}) {
	return { facadeModuleId, moduleIds: [], imports, dynamicImports, css };
}

describe('findEntryChunk', () => {
	it('matches by facadeModuleId suffix', () => {
		const graph = {
			'_astro/StudioShell.abc.js': chunk({ facadeModuleId: '/home/user/lattice/docs/src/components/studio/StudioShell.tsx' }),
			'_astro/other.def.js': chunk({ facadeModuleId: '/home/user/lattice/docs/src/components/other/Other.tsx' }),
		};
		expect(findEntryChunk(graph, 'src/components/studio/StudioShell.tsx')).toBe('_astro/StudioShell.abc.js');
	});

	it('returns null when no chunk matches', () => {
		const graph = { '_astro/other.def.js': chunk({ facadeModuleId: '/repo/src/Other.tsx' }) };
		expect(findEntryChunk(graph, 'src/components/studio/StudioShell.tsx')).toBeNull();
	});

	it('normalizes Windows-style backslashes before matching', () => {
		const graph = { '_astro/x.js': chunk({ facadeModuleId: 'C:\\repo\\docs\\src\\components\\studio\\StudioShell.tsx' }) };
		expect(findEntryChunk(graph, 'src/components/studio/StudioShell.tsx')).toBe('_astro/x.js');
	});

	it('ignores chunks with no facadeModuleId (non-entry chunks)', () => {
		const graph = { '_astro/shared.js': chunk({ facadeModuleId: null }) };
		expect(findEntryChunk(graph, 'src/components/studio/StudioShell.tsx')).toBeNull();
	});
});

describe('resolveTransitiveDeps', () => {
	it('walks static imports transitively AND includes the entry itself', () => {
		// entry -> a -> b, entry -> c (diamond: b and c both reachable, no dupes).
		// The entry is included: it's the one chunk the astro-island's runtime
		// only discovers via the opaque component-url attribute at hydration
		// time, so it needs its own modulepreload hint just as much as its deps.
		const graph = {
			entry: chunk({ imports: ['a', 'c'] }),
			a: chunk({ imports: ['b'] }),
			b: chunk({ imports: [] }),
			c: chunk({ imports: ['b'] }), // b reached twice — must not duplicate
		};
		const { jsChunks } = resolveTransitiveDeps(graph, 'entry');
		expect(jsChunks.sort()).toEqual(['a', 'b', 'c', 'entry']);
	});

	it('never follows dynamicImports (intentionally-lazy code stays lazy)', () => {
		const graph = {
			entry: chunk({ imports: ['eager'], dynamicImports: ['lazy'] }),
			eager: chunk({ imports: [] }),
			lazy: chunk({ imports: ['lazy-dep'] }),
			'lazy-dep': chunk({ imports: [] }),
		};
		const { jsChunks } = resolveTransitiveDeps(graph, 'entry');
		expect(jsChunks.sort()).toEqual(['eager', 'entry']);
		expect(jsChunks).not.toContain('lazy');
		expect(jsChunks).not.toContain('lazy-dep');
	});

	it('collects the union of css across every visited chunk, entry included', () => {
		const graph = {
			entry: chunk({ imports: ['a'], css: ['entry.css'] }),
			a: chunk({ imports: [], css: ['a.css', 'shared.css'] }),
		};
		const { cssFiles } = resolveTransitiveDeps(graph, 'entry');
		expect(cssFiles.sort()).toEqual(['a.css', 'entry.css', 'shared.css']);
	});

	it('does not infinite-loop on a circular import graph', () => {
		const graph = {
			entry: chunk({ imports: ['a'] }),
			a: chunk({ imports: ['b'] }),
			b: chunk({ imports: ['a'] }), // cycle back to a
		};
		const { jsChunks } = resolveTransitiveDeps(graph, 'entry');
		expect(jsChunks.sort()).toEqual(['a', 'b', 'entry']);
	});

	it('returns just the entry, no css, when it has no dependencies', () => {
		const graph = { entry: chunk() };
		expect(resolveTransitiveDeps(graph, 'entry')).toEqual({ jsChunks: ['entry'], cssFiles: [] });
	});

	describe('eagerDynamicImportSuffixes', () => {
		it('walks an allowlisted dynamic import (and its own static deps) even though it is only dynamically reached', () => {
			// entry -[dynamic]-> lint-kernel -[static]-> lint-dep
			const graph = {
				entry: chunk({ imports: [], dynamicImports: ['lint-kernel'] }),
				'lint-kernel': chunk({ facadeModuleId: '/repo/docs/src/playground/authoring-core.generated.js', imports: ['lint-dep'] }),
				'lint-dep': chunk({ imports: [] }),
			};
			const { jsChunks } = resolveTransitiveDeps(graph, 'entry', ['src/playground/authoring-core.generated.js']);
			expect(jsChunks.sort()).toEqual(['entry', 'lint-dep', 'lint-kernel']);
		});

		it('leaves every OTHER dynamic import lazy — the allowlist is not a blanket switch', () => {
			const graph = {
				entry: chunk({ imports: [], dynamicImports: ['lint-kernel', 'fabricate-lazy-tab'] }),
				'lint-kernel': chunk({ facadeModuleId: '/repo/docs/src/playground/authoring-core.generated.js', imports: [] }),
				'fabricate-lazy-tab': chunk({ facadeModuleId: '/repo/docs/src/components/studio/Fabricate.tsx', imports: [] }),
			};
			const { jsChunks } = resolveTransitiveDeps(graph, 'entry', ['src/playground/authoring-core.generated.js']);
			expect(jsChunks).toContain('lint-kernel');
			expect(jsChunks).not.toContain('fabricate-lazy-tab');
		});

		it('is a no-op when no suffixes are passed (default), matching prior behavior', () => {
			const graph = {
				entry: chunk({ imports: [], dynamicImports: ['lint-kernel'] }),
				'lint-kernel': chunk({ facadeModuleId: '/repo/docs/src/playground/authoring-core.generated.js', imports: [] }),
			};
			const { jsChunks } = resolveTransitiveDeps(graph, 'entry');
			expect(jsChunks).toEqual(['entry']);
		});

		it('resolves a suffix match reached only via a SECOND-level dynamic import (fixed-point loop)', () => {
			// entry -[static]-> mid -[dynamic]-> lint-kernel
			const graph = {
				entry: chunk({ imports: ['mid'] }),
				mid: chunk({ imports: [], dynamicImports: ['lint-kernel'] }),
				'lint-kernel': chunk({ facadeModuleId: '/repo/docs/src/playground/authoring-core.generated.js', imports: [] }),
			};
			const { jsChunks } = resolveTransitiveDeps(graph, 'entry', ['src/playground/authoring-core.generated.js']);
			expect(jsChunks.sort()).toEqual(['entry', 'lint-kernel', 'mid']);
		});
	});
});

describe('injectIntoPage', () => {
	let tmp;
	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-modulepreload-test-'));
	});
	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	function writePage(relPath, html) {
		const full = path.join(tmp, relPath);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, html);
		return full;
	}

	it('injects modulepreload + stylesheet links right before </head>', () => {
		const full = writePage('studio/index.html', '<html><head><title>t</title></head><body></body></html>');
		const count = injectIntoPage('studio/index.html', ['_astro/a.js', '_astro/b.js'], ['_astro/a.css'], tmp);
		expect(count).toBe(3);
		const html = fs.readFileSync(full, 'utf8');
		expect(html).toContain('<link rel="modulepreload" href="/_astro/a.js">');
		expect(html).toContain('<link rel="modulepreload" href="/_astro/b.js">');
		expect(html).toContain('<link rel="stylesheet" href="/_astro/a.css">');
		expect(html.indexOf(MARKER)).toBeLessThan(html.indexOf('</head>'));
		expect(html).toContain('<title>t</title>');
	});

	it('is idempotent — running twice does not double-inject', () => {
		writePage('studio/index.html', '<html><head></head><body></body></html>');
		injectIntoPage('studio/index.html', ['_astro/a.js'], [], tmp);
		const secondCount = injectIntoPage('studio/index.html', ['_astro/a.js'], [], tmp);
		expect(secondCount).toBe(0);
		const full = path.join(tmp, 'studio/index.html');
		const html = fs.readFileSync(full, 'utf8');
		expect(html.split('_astro/a.js').length - 1).toBe(1); // appears exactly once
	});

	it('returns 0 and does not throw when the page file is missing', () => {
		expect(injectIntoPage('missing/index.html', ['_astro/a.js'], [], tmp)).toBe(0);
	});

	it('returns 0 and does not throw when the page has no </head>', () => {
		writePage('broken/index.html', '<html><body>no head tag</body></html>');
		expect(injectIntoPage('broken/index.html', ['_astro/a.js'], [], tmp)).toBe(0);
	});

	it('injects zero links cleanly when both chunk lists are empty', () => {
		const full = writePage('empty/index.html', '<html><head></head><body></body></html>');
		const count = injectIntoPage('empty/index.html', [], [], tmp);
		expect(count).toBe(0);
		const html = fs.readFileSync(full, 'utf8');
		expect(html).toContain(MARKER); // still marks the page as processed
	});

	it('returns 0 and does not throw when </head> appears more than once (ambiguous injection point)', () => {
		const full = writePage('weird/index.html', '<html><head></head><body>a literal "</head>" string in body text</body></html>');
		expect(injectIntoPage('weird/index.html', ['_astro/a.js'], [], tmp)).toBe(0);
		const html = fs.readFileSync(full, 'utf8');
		expect(html).not.toContain(MARKER); // untouched, not silently mis-injected
	});
});

describe('processEntry', () => {
	let tmp;
	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-modulepreload-test-'));
	});
	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	function writeDist(relPath, content = '') {
		const full = path.join(tmp, relPath);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, content);
	}

	const entry = { page: 'studio/index.html', sourceSuffix: 'src/components/studio/StudioShell.tsx' };

	it('throws when no chunk matches the entry sourceSuffix (regression: this must fail loudly, never silently skip)', () => {
		writeDist('studio/index.html', '<html><head></head><body></body></html>');
		const graph = { '_astro/other.js': chunk({ facadeModuleId: '/repo/src/Other.tsx' }) };
		expect(() => processEntry(graph, entry, tmp)).toThrow(/no chunk found for src\/components\/studio\/StudioShell\.tsx/);
	});

	it('throws when an injected href does not resolve to a real file on disk (chunk-graph vs dist drift)', () => {
		writeDist('studio/index.html', '<html><head></head><body></body></html>');
		// 'a.js' is in the graph but was never actually written to dist/ — the
		// exact shape of "chunk-graph.json and dist/ have silently drifted apart".
		const graph = {
			'_astro/StudioShell.js': chunk({ facadeModuleId: '/repo/src/components/studio/StudioShell.tsx', imports: ['_astro/a.js'] }),
			'_astro/a.js': chunk(),
		};
		expect(() => processEntry(graph, entry, tmp)).toThrow(/doesn't exist in/);
	});

	it('succeeds end to end when the entry resolves and every injected href exists on disk', () => {
		writeDist('studio/index.html', '<html><head></head><body></body></html>');
		writeDist('_astro/StudioShell.js', '// entry facade');
		writeDist('_astro/a.js', '// chunk a');
		const graph = {
			'_astro/StudioShell.js': chunk({ facadeModuleId: '/repo/src/components/studio/StudioShell.tsx', imports: ['_astro/a.js'] }),
			'_astro/a.js': chunk(),
		};
		const count = processEntry(graph, entry, tmp);
		expect(count).toBe(2); // entry + a.js
		const html = fs.readFileSync(path.join(tmp, 'studio/index.html'), 'utf8');
		expect(html).toContain('<link rel="modulepreload" href="/_astro/StudioShell.js">');
		expect(html).toContain('<link rel="modulepreload" href="/_astro/a.js">');
	});

	it('resolves the real Studio ENTRIES config end to end, including its eagerDynamicImportSuffixes', () => {
		const studioEntry = ENTRIES.find((e) => e.page === 'studio/index.html');
		expect(studioEntry.eagerDynamicImportSuffixes).toEqual(['src/playground/authoring-core.generated.js']);
		writeDist(studioEntry.page, '<html><head></head><body></body></html>');
		writeDist('_astro/StudioIsland.js', '// entry facade (StrictMode wrapper)');
		writeDist('_astro/StudioShell.js', '// shell, statically imported by the wrapper');
		writeDist('_astro/lint-kernel.js', '// lint kernel');
		// The astro-island entry is now the StrictMode wrapper (StudioIsland),
		// which statically imports StudioShell; the eager lint-kernel is reached
		// via StudioShell's dynamic import, still inside the entry's static closure.
		const graph = {
			'_astro/StudioIsland.js': chunk({ facadeModuleId: '/repo/src/components/studio/StudioIsland.tsx', imports: ['_astro/StudioShell.js'] }),
			'_astro/StudioShell.js': chunk({ facadeModuleId: '/repo/src/components/studio/StudioShell.tsx', dynamicImports: ['_astro/lint-kernel.js'] }),
			'_astro/lint-kernel.js': chunk({ facadeModuleId: '/repo/src/playground/authoring-core.generated.js' }),
		};
		processEntry(graph, studioEntry, tmp);
		const html = fs.readFileSync(path.join(tmp, studioEntry.page), 'utf8');
		expect(html).toContain('<link rel="modulepreload" href="/_astro/lint-kernel.js">');
	});
});
