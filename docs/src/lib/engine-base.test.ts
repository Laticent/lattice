// engine-base.ts is where every engine asset loader finds its directory (KaTeX, fence grammars,
// plugin data, chart kernels). Before it, each read the engine's <script> tag, which the ESM engine
// does not leave, so each would have skipped its asset with no error (spine note §3).
import { afterEach, describe, expect, it } from 'vitest';
import { ENGINE_ENTRY, engineBase, engineBaseFor, recordEngineUrl, resetEngineBase } from './engine-base';
import { hljsBaseFor } from './ensure-hljs-language';
import { katexProviderUrlFor } from './ensure-katex';

afterEach(() => {
	resetEngineBase();
	for (const s of document.querySelectorAll('script[data-lattice-engine]')) s.remove();
});

describe('engineBaseFor', () => {
	it('reads the asset directory off the ESM engine and the single-file engine alike', () => {
		expect(engineBaseFor(`/playground/v/abc123def456/${ENGINE_ENTRY}`)).toBe('/playground/v/abc123def456/');
		expect(engineBaseFor('/playground/v/abc123def456/lattice-playground.js')).toBe('/playground/v/abc123def456/');
		expect(engineBaseFor(`/playground/v/abc123def456/${ENGINE_ENTRY}?v=2`)).toBe('/playground/v/abc123def456/');
	});

	it('refuses an address that is not the engine', () => {
		expect(engineBaseFor('/playground/v/abc/lattice-runtime.js')).toBeNull();
		expect(engineBaseFor('/playground/v/abc/esm/engine.js.map')).toBeNull();
	});

	it('is what the KaTeX and grammar loaders derive from', () => {
		expect(katexProviderUrlFor(`/pg/v/1/${ENGINE_ENTRY}`)).toBe('/pg/v/1/lattice-katex.js');
		expect(hljsBaseFor(`/pg/v/1/${ENGINE_ENTRY}`)).toBe('/pg/v/1/hljs/');
	});
});

describe('engineBase', () => {
	it('answers the engine the page loaded, with no <script> tag to read', () => {
		expect(engineBase()).toBeNull();
		recordEngineUrl(`/playground/v/feedface0001/${ENGINE_ENTRY}`);
		expect(engineBase()).toBe('/playground/v/feedface0001/');
	});

	it('falls back to a classic engine tag', () => {
		const s = document.createElement('script');
		s.setAttribute('data-lattice-engine', '');
		s.setAttribute('src', '/playground/v/0123456789ab/lattice-playground.js');
		document.head.appendChild(s);
		expect(engineBase()).toBe('/playground/v/0123456789ab/');
	});
});
