import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

let blobs: Blob[] = [];

beforeEach(() => {
	blobs = [];
	(window as unknown as { LatticePlayground: unknown }).LatticePlayground = {
		marp: {
			bakeSplits: (s: string) => s,
			appendAutoGlossary: (s: string) => s,
			liftImageBgImages: (s: string) => s,
			withRuntimeScripts: (s: string) => s,
			marpScopableCss: (s: string) => s,
			fontAssetsFor: () => [],
			STATIC_ASSETS: [],
			AGENT_ASSETS: [],
			MARP_CONFIG_CJS: 'module.exports = {};',
			packageJson: (name: string) => ({ name }),
			vscodeSettings: (themes: string[]) => JSON.stringify({ themes }),
			readme: ({ palette }: { palette: string }) => `palette: ${palette}`,
			agentsMd: undefined,
		},
	};
	vi.stubGlobal('fetch', vi.fn(async (url: string) => {
		const file = String(url).split('/').pop() || '';
		const body = SHIPPED[file];
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

describe('importedThemeNames', () => {
	it('reads bare-name imports and nothing else', async () => {
		expect(await importedThemeNames("@import 'lattice';\n@import \"Indaco\";\n@import url(x.css);")).toEqual(['lattice', 'indaco']);
	});
	it('ignores an import inside a comment', async () => {
		expect(await importedThemeNames("/* @import 'ghost'; */\n@import 'lattice';")).toEqual(['lattice']);
	});
});
