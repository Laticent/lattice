import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deckFenceTags, fenceAdvice, fenceGroups, type HljsManifest, hljsOptions, isEngineFence, LATTICE_FENCES, latticeFencesCovered, PLAIN_FENCE, resolveFenceTag } from './fence-catalog';

// A stand-in manifest: two lazy grammars with aliases, two common ones. Small on
// purpose — the REAL manifest is exercised by the last block, which reads the built
// file when it is there.
const MANIFEST: HljsManifest = {
	languages: { powershell: { file: 'powershell.js', bytes: 100 }, dockerfile: { file: 'dockerfile.js', bytes: 100 } },
	aliases: { ps1: 'powershell', pwsh: 'powershell', docker: 'dockerfile' },
	common: { javascript: ['js', 'jsx', 'mjs', 'cjs'], python: ['py', 'gyp'], bash: ['sh', 'zsh'], shell: ['console', 'shellsession'] },
};

describe('the Lattice group', () => {
	it('carries every engine sub-language, and each one is named for what it draws', () => {
		expect(LATTICE_FENCES.map((f) => f.tag)).toEqual(['mermaid', 'anima', 'functionplot']);
		for (const f of LATTICE_FENCES) expect(f.label).toBeTruthy();
	});

	it('covers every fence the LFM grammar registry declares', () => {
		// The direction that matters: a fourth engine fence cannot ship without the
		// picker learning it. (The reverse does NOT hold — `anima` is engine-recognized
		// and absent from the registry; see the catalog's docblock.)
		const grammarPath = path.resolve(__dirname, '../../../../dist/docs/grammar.json');
		if (!fs.existsSync(grammarPath)) return; // dist is generated, not committed
		const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8')) as { fences?: Record<string, { deprecatedAliases?: string[] }> };
		const tags = Object.keys(grammar.fences || {});
		expect(tags.length).toBeGreaterThan(0);
		expect(latticeFencesCovered(tags)).toEqual([]);
		// The deprecated spellings resolve too, or a deck written before the rename
		// would show a language the picker cannot name.
		for (const [, spec] of Object.entries(grammar.fences || {})) {
			for (const alias of spec.deprecatedAliases || []) expect(isEngineFence(alias)).toBe(true);
		}
	});

	it('treats an engine fence as rendered, not colored', () => {
		expect(isEngineFence('mermaid')).toBe(true);
		expect(isEngineFence('latticeplot')).toBe(true); // the deprecated alias of functionplot
		expect(isEngineFence('javascript')).toBe(false);
	});
});

describe('resolving a tag', () => {
	it('follows aliases on both halves of the manifest', () => {
		expect(resolveFenceTag('ps1', MANIFEST)?.tag).toBe('powershell'); // lazy, via `aliases`
		expect(resolveFenceTag('js', MANIFEST)?.tag).toBe('javascript'); // common, scanned
		expect(resolveFenceTag('python', MANIFEST)?.tag).toBe('python');
	});

	it('normalizes case and marp attribute syntax, the way markdown-it does', () => {
		expect(resolveFenceTag('JS', MANIFEST)?.tag).toBe('javascript');
		expect(resolveFenceTag('js {highlight=1,3}', MANIFEST)?.tag).toBe('javascript');
	});

	it('answers null for a tag nothing knows, which is not an error', () => {
		expect(resolveFenceTag('klingon', MANIFEST)).toBeNull();
		expect(resolveFenceTag('', MANIFEST)).toBeNull();
	});

	it('gives the engine row for mermaid even though hljs also has a grammar for it', () => {
		const withMermaid = { ...MANIFEST, languages: { ...MANIFEST.languages, mermaid: { file: 'mermaid.js', bytes: 1 } } };
		expect(resolveFenceTag('mermaid', withMermaid)?.label).toBe('Diagram');
		expect(hljsOptions(withMermaid).some((o) => o.tag === 'mermaid')).toBe(false);
	});
});

describe('the picker model', () => {
	const DECK = ['# One', '', '```powershell', 'Get-Item', '```', '', '```mermaid', 'graph LR', '```', '', '```klingon', 'nuqneH', '```'].join('\n');

	it('reads the deck s own tags in first-appearance order', () => {
		expect(deckFenceTags(DECK)).toEqual(['powershell', 'mermaid', 'klingon']);
	});

	it('groups Lattice first, then this deck, then everything else — with no row twice', () => {
		const groups = fenceGroups({ source: DECK, manifest: MANIFEST });
		expect(groups.map((g) => g.key)).toEqual(['lattice', 'deck', 'all']);
		// `mermaid` is already in the Lattice group, so the deck group does not repeat it.
		expect(groups[1].options.map((o) => o.tag)).toEqual(['powershell', 'klingon']);
		const all = groups.flatMap((g) => g.options.map((o) => o.tag));
		expect(new Set(all).size).toBe(all.length);
	});

	it('says so when the deck uses a tag no grammar knows, instead of showing it bare', () => {
		const deck = fenceGroups({ source: DECK, manifest: MANIFEST })[1];
		expect(deck.options.find((o) => o.tag === 'klingon')?.note).toMatch(/uncolored/);
	});

	it('offers plain text as a choice, not as an absence', () => {
		const groups = fenceGroups({ source: '', manifest: MANIFEST });
		expect(groups.find((g) => g.key === 'all')?.options[0]).toEqual(PLAIN_FENCE);
	});

	it('filters every group once the query is a real search', () => {
		const groups = fenceGroups({ source: DECK, manifest: MANIFEST, query: 'py' });
		const tags = groups.flatMap((g) => g.options.map((o) => o.tag));
		expect(tags).toContain('python'); // matched by its `py` alias
		expect(tags).not.toContain('mermaid'); // the Lattice group is filtered too
	});

	it('caps the long group so the picker never renders 192 rows at once', () => {
		const big: HljsManifest = { languages: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`lang${i}`, { file: 'x', bytes: 1 }])), aliases: {}, common: {} };
		expect(fenceGroups({ manifest: big }).find((g) => g.key === 'all')?.options.length).toBe(40);
	});

	it('survives a manifest that has not loaded', () => {
		const groups = fenceGroups({ source: DECK, manifest: null });
		expect(groups.find((g) => g.key === 'lattice')?.options.length).toBe(3);
		expect(groups.find((g) => g.key === 'all')?.options).toEqual([PLAIN_FENCE]);
	});
});

describe('coaching', () => {
	const SCRIPT = 'set -euo pipefail\nfor f in *.md; do\n  echo "$f"\ndone';
	const SESSION = '$ npm run build\nbuild OK';

	it('names the script-tagged-as-session mix-up and the fix', () => {
		const advice = fenceAdvice('shell', SCRIPT, MANIFEST);
		expect(advice).toMatch(/terminal-session/);
		expect(advice).toMatch(/`bash`/);
	});

	it('stays quiet on a real captured session', () => {
		expect(fenceAdvice('shell', SESSION, MANIFEST)).toBeNull();
	});

	it('stays quiet on an engine sub-language — it is rendered, not colored', () => {
		expect(fenceAdvice('mermaid', 'graph LR', MANIFEST)).toBeNull();
		expect(fenceAdvice('anima', '{"scenes":[]}', MANIFEST)).toBeNull();
	});

	it('warns on a tag with no grammar, and on no tag at all', () => {
		expect(fenceAdvice('klingon', 'nuqneH', MANIFEST)).toMatch(/No grammar/);
		expect(fenceAdvice('', 'x', MANIFEST)).toMatch(/Untagged/);
	});

	it('says nothing rather than guessing before the catalog loads', () => {
		expect(fenceAdvice('klingon', 'nuqneH', null)).toBeNull();
	});
});

describe('against the real built manifest', () => {
	const manifestPath = path.resolve(__dirname, '../../../public/playground/hljs/index.json');
	it('offers all 192 grammars the renderer actually carries', () => {
		if (!fs.existsSync(manifestPath)) return; // built artifact, gitignored
		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as HljsManifest;
		expect(Object.keys(manifest.common || {}).length).toBeGreaterThan(30);
		// The count the picker can offer = lazy + common, minus the engine rows it hides.
		const options = hljsOptions(manifest);
		expect(options.length).toBeGreaterThan(180);
		// The tags our own decks use all resolve — the picker can name every fence we ship.
		for (const tag of ['js', 'javascript', 'python', 'bash', 'sh', 'css', 'yaml', 'html', 'powershell', 'console']) {
			expect(resolveFenceTag(tag, manifest), tag).not.toBeNull();
		}
	});
});
