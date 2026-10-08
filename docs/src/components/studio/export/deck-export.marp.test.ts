import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleAssetNames, withRuntimeScriptsReport, withSampleAssets } from '../../../../../lib/core/marp-bundle.js';
import { exportMarp, importedThemeNames } from './deck-export.js';

// The Marp bundle's THEME and COMPONENT supply (2026-09-23-portable-packages.md §1, §4).
//
// Two defects this pins:
//   1. A deck in a SAVED library theme shipped in `indaco`. The bundler fetched the
//      theme from the site's shipped-theme folder, found nothing, and retried with
//      `indaco` without a word. It now writes the saved theme's own CSS, and a theme
//      it can't find fails the export with the theme's name.
//   2. A saved component's CSS never reached the bundle, so its slides arrived
//      unstyled. It now rides as the same `<style>` block the Markdown export uses.
//
// The engine half (`window.LatticePlayground.marp`) is stubbed down to identity
// transforms and fixed templates: this suite pins what the BUNDLER writes, and the
// shared bundle spec is covered where it lives.

const SHIPPED: Record<string, string> = {
	'indaco.css': "/* @theme indaco */\n@import 'lattice';\n:root{--accent:#006FA8}",
	'indaco-dark.css': "/* @theme indaco-dark */\n@import 'indaco';",
};
// The sample art the site stages beside its themes (docs/src/lib/samples-base.ts).
const SAMPLES: Record<string, string> = {
	'portrait-ada.svg': '<svg id="ada"/>',
	'logo-acme-mark.svg': '<svg id="mark"/>',
};

let blobs: Blob[] = [];

beforeEach(() => {
	blobs = [];
	(window as unknown as { LatticePlayground: unknown }).LatticePlayground = {
		marp: {
			bakeSplits: (s: string) => s,
			stripPaneMarkers: (s: string) => s,
			appendAutoGlossary: (s: string) => s,
			liftImageBgImages: (s: string) => s,
			sampleAssetNames,
			withSampleAssets,
			withRuntimeScriptsReport: (s: string) => ({ markdown: s, removed: { scripts: 0, handlers: 0, urls: 0 } }),
			marpScopableCss: (s: string) => s,
			fontAssetsFor: () => [],
			STATIC_ASSETS: [],
			AGENT_ASSETS: [],
			marpConfigCjs: () => 'module.exports = { options: { math: false } };',
			packageJson: (name: string) => ({ name }),
			vscodeSettings: (themes: string[]) => JSON.stringify({ themes }),
			readme: ({ palette }: { palette: string }) => `palette: ${palette}`,
			agentsMd: undefined,
		},
	};
	vi.stubGlobal('fetch', vi.fn(async (url: string) => {
		const file = String(url).split('/').pop() || '';
		const body = String(url).includes('/samples/') ? SAMPLES[file] : SHIPPED[file];
		return body ? new Response(body, { status: 200 }) : new Response('', { status: 404 });
	}));
	URL.createObjectURL = vi.fn((b: Blob) => {
		blobs.push(b);
		return 'blob:probe';
	}) as typeof URL.createObjectURL;
	URL.revokeObjectURL = vi.fn();
	// jsdom can't navigate, so the download anchor's click is a no-op here.
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	delete (window as unknown as { LatticePlayground?: unknown }).LatticePlayground;
});

function arrayBuffer(blob: Blob): Promise<ArrayBuffer> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(r.result as ArrayBuffer);
		r.onerror = () => reject(r.error);
		r.readAsArrayBuffer(blob);
	});
}

async function bundle(): Promise<JSZip> {
	expect(blobs).toHaveLength(1);
	return JSZip.loadAsync(await arrayBuffer(blobs[0]));
}

const BASE = 'https://site/playground/v/abc/themes/';
const SAVED = { name: 'brand', css: "/* @theme brand */\n@import 'lattice';\n:root{--accent:#123456}" };

describe('exportMarp — the bundle carries a saved theme', () => {
	it('writes the saved theme’s own CSS instead of falling back to indaco', async () => {
		await exportMarp('---\ntheme: brand\n---\n\n# Hi', 'deck', 'brand', BASE, { includeAgent: false, extraTheme: SAVED });
		const zip = await bundle();
		expect(await zip.file('deck/themes/brand.css')?.async('string')).toContain('--accent:#123456');
		expect(zip.file('deck/themes/indaco.css')).toBeNull();
		expect(await zip.file('deck/README.md')?.async('string')).toBe('palette: brand');
	});

	it('bundles a shipped parent the saved theme extends', async () => {
		const child = { name: 'brand', css: "/* @theme brand */\n@import 'indaco';\n:root{--accent:#123456}" };
		await exportMarp('# Hi', 'deck', 'brand', BASE, { includeAgent: false, extraTheme: child });
		const zip = await bundle();
		expect(zip.file('deck/themes/brand.css')).not.toBeNull();
		expect(zip.file('deck/themes/indaco.css')).not.toBeNull();
	});

	it('guards the saved theme against a `</style>` break-out (#22)', async () => {
		const hostile = { name: 'brand', css: "/* @theme brand */\n:root{--x:'</style><img src=x>'}" };
		await exportMarp('# Hi', 'deck', 'brand', BASE, { includeAgent: false, extraTheme: hostile });
		const css = await (await bundle()).file('deck/themes/brand.css')?.async('string');
		expect(css).not.toMatch(/<\/style/i);
	});

	it('still fetches a shipped theme, with its dark companion', async () => {
		await exportMarp('# Hi', 'deck', 'indaco', BASE, { includeAgent: false });
		const zip = await bundle();
		expect(zip.file('deck/themes/indaco.css')).not.toBeNull();
		expect(zip.file('deck/themes/indaco-dark.css')).not.toBeNull();
	});

	it('fails with the theme’s name when it can’t bundle it, and downloads nothing', async () => {
		await expect(exportMarp('# Hi', 'deck', 'ghost', BASE, { includeAgent: false })).rejects.toThrow(/ghost/);
		expect(blobs).toHaveLength(0);
	});

	it('ignores a saved theme whose name isn’t the palette being exported', async () => {
		await exportMarp('# Hi', 'deck', 'indaco', BASE, { includeAgent: false, extraTheme: SAVED });
		const zip = await bundle();
		expect(zip.file('deck/themes/brand.css')).toBeNull();
		expect(zip.file('deck/themes/indaco.css')).not.toBeNull();
	});
});

describe('exportMarp — the bundle carries the saved components the deck uses', () => {
	it('embeds each component’s CSS in the deck markdown', async () => {
		const src = '---\ntheme: indaco\n---\n\n<!-- _class: mybox -->\n\n# Boxed';
		await exportMarp(src, 'deck', 'indaco', BASE, { includeAgent: false, components: [{ name: 'mybox', css: 'section.mybox{padding:1rem}' }] });
		const md = await (await bundle()).file('deck/deck.md')?.async('string');
		expect(md).toContain('section.mybox{padding:1rem}');
		expect(md).toMatch(/^---\ntheme: indaco\n---\n/);
	});
});

describe('exportMarp — a panes deck', () => {
	it('bakes the pane markers out after the split bake (bake-splits.js stripPaneMarkers)', async () => {
		// The engine half is stubbed to identity above, so this swaps in stubs that leave a mark:
		// the deck must go through BOTH, split bake first, or a marker Marp would keep as a speaker
		// note reaches the bundle.
		const PG = (window as unknown as { LatticePlayground: { marp: Record<string, (s: string) => string> } }).LatticePlayground;
		const seen: string[] = [];
		const { bakeSplits, stripPaneMarkers } = PG.marp;
		PG.marp.bakeSplits = (s) => { seen.push('split'); return s; };
		PG.marp.stripPaneMarkers = (s) => { seen.push('panes'); return s.replace(/<!-- pane: \w+ -->\n/g, ''); };
		try {
			await exportMarp('## T\n\n<!-- pane: list -->\n- a\n\n<!-- pane: list -->\n- b\n', 'deck', 'indaco', BASE, { includeAgent: false });
			const md = await (await bundle()).file('deck/deck.md')?.async('string');
			expect(seen).toEqual(['split', 'panes']);
			expect(md).not.toContain('<!-- pane:');
		} finally {
			Object.assign(PG.marp, { bakeSplits, stripPaneMarkers });
		}
	});
});

describe('importedThemeNames', () => {
	it('reads bare-name imports and nothing else', async () => {
		expect(await importedThemeNames("@import 'lattice';\n@import \"Indaco\";\n@import url(x.css);")).toEqual(['lattice', 'indaco']);
	});
	it('ignores an import inside a comment', async () => {
		expect(await importedThemeNames("/* @import 'ghost'; */\n@import 'lattice';")).toEqual(['lattice']);
	});
});

// The deck's math is typeset at export (lib/core/marp-bundle-math.js), so Marp's own typesetter is off
// in every bundle, whatever the deck's admission says.
describe('exportMarp — the bundle\'s Marp config turns Marp\'s own math off', () => {
	it('writes math: false with the math plugin on and off', async () => {
		await exportMarp('# Hi $x$', 'deck', 'indaco', BASE, { includeAgent: false });
		expect(await (await bundle()).file('deck/marp.config.cjs')?.async('string')).toContain('math: false');
		blobs = [];
		await exportMarp('# Hi $x$', 'deck', 'indaco', BASE, { includeAgent: false, pluginsOff: ['math', 'mermaid'] });
		expect(await (await bundle()).file('deck/marp.config.cjs')?.async('string')).toContain('math: false');
	});
});

describe('exportMarp — the bundle carries the deck\'s `sample:` pictures', () => {
	// A name the site does not stage. Assembled, so test/unit/core/sample-images.test.js
	// (every shipped `sample:` names a real file) does not read it as a real reference.
	const MISSING = ['portrait', 'missing.svg'].join('-');
	const DECK = [
		'---',
		'theme: indaco',
		'logo: sample:logo-acme-mark.svg',
		'---',
		'',
		'<!-- _class: team-profile -->',
		'',
		'## Team',
		'',
		'- ![Ada](sample:portrait-ada.svg)',
		'  - Ada',
		'- ![Ada again](sample:portrait-ada.svg "same file")',
		'  - Ada',
		`- ![Gone](sample:${MISSING})`,
		'  - Nobody',
		'',
	].join('\n');

	it('fetches each sample into assets/ and names it there, front-matter logo included', async () => {
		await exportMarp(DECK, 'deck', 'indaco', BASE, { includeAgent: false });
		const zip = await bundle();
		expect(await zip.file('deck/assets/portrait-ada.svg')?.async('string')).toBe('<svg id="ada"/>');
		expect(await zip.file('deck/assets/logo-acme-mark.svg')?.async('string')).toBe('<svg id="mark"/>');
		const md = (await zip.file('deck/deck.md')?.async('string')) ?? '';
		expect(md).toContain('logo: assets/logo-acme-mark.svg');
		expect(md).toContain('![Ada](assets/portrait-ada.svg)');
		expect(md).toContain('![Ada again](assets/portrait-ada.svg "same file")');
		// The site has no such file, so the reference stays as written rather than name a path
		// the bundle lacks.
		expect(md).toContain(`![Gone](sample:${MISSING})`);
		expect(zip.file(`deck/assets/${MISSING}`)).toBeNull();
		const fetched = vi.mocked(fetch).mock.calls.map(([u]) => String(u)).filter((u) => u.includes('/samples/'));
		expect(fetched.sort()).toEqual([
			'https://site/playground/v/abc/samples/logo-acme-mark.svg',
			'https://site/playground/v/abc/samples/portrait-ada.svg',
			`https://site/playground/v/abc/samples/${MISSING}`,
		]);
	});

	it('keeps the reference when a body read fails, and still exports', async () => {
		vi.mocked(fetch).mockImplementation(async (url) => {
			const file = String(url).split('/').pop() || '';
			if (String(url).includes('/samples/')) {
				const r = new Response(SAMPLES[file] ?? '', { status: SAMPLES[file] ? 200 : 404 });
				if (file === 'portrait-ada.svg') r.arrayBuffer = () => Promise.reject(new Error('reset'));
				return r;
			}
			return SHIPPED[file] ? new Response(SHIPPED[file], { status: 200 }) : new Response('', { status: 404 });
		});
		await exportMarp(DECK, 'deck', 'indaco', BASE, { includeAgent: false });
		const zip = await bundle();
		const md = (await zip.file('deck/deck.md')?.async('string')) ?? '';
		expect(md).toContain('![Ada](sample:portrait-ada.svg)');
		expect(zip.file('deck/assets/portrait-ada.svg')).toBeNull();
		expect(md).toContain('logo: assets/logo-acme-mark.svg');
	});

	it('keeps the fetched logo in the baked front matter, and still drops a relative one', async () => {
		const PG = (window as unknown as { LatticePlayground: { marp: Record<string, unknown> } }).LatticePlayground;
		PG.marp.withRuntimeScriptsReport = withRuntimeScriptsReport;
		await exportMarp(DECK, 'deck', 'indaco', BASE, { includeAgent: false });
		const md = (await (await bundle()).file('deck/deck.md')?.async('string')) ?? '';
		const baked = md.slice(md.indexOf('application/lattice-front-matter'));
		expect(baked).toContain('logo: assets/logo-acme-mark.svg');
		expect(md).not.toContain('sample:logo-acme-mark.svg');

		blobs = [];
		await exportMarp(DECK.replace('sample:logo-acme-mark.svg', 'brand/mark.svg'), 'deck', 'indaco', BASE, { includeAgent: false });
		const md2 = (await (await bundle()).file('deck/deck.md')?.async('string')) ?? '';
		expect(md2.slice(md2.indexOf('application/lattice-front-matter'))).not.toContain('logo:');
	});
});
