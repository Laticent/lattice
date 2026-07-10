// Unit tests for the pure resolution/injection logic behind
// scripts/inject-modulepreload.mjs. No build, no browser — the chunk graph is
// a plain object fixture (the same shape astro.config.mjs's chunkGraphPlugin
// emits from Rollup's OutputChunk.imports/dynamicImports/viteMetadata).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findEntryChunk, injectIntoPage, MARKER, resolveTransitiveDeps } from './inject-modulepreload.mjs';

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
});
