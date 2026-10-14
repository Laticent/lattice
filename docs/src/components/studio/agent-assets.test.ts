import { describe, expect, it } from 'vitest';
import { type AssetInfo, assetManifest, cleanCaption, libraryPromptTokens, listAssetsView, MANIFEST_CAP, shapeOf } from './agent-assets';

const photo = (name: string, over: Partial<AssetInfo> = {}): AssetInfo => ({ name, kind: 'image', width: 3000, height: 2000, bytes: 900_000, scope: 'library', ...over });

describe('shapeOf', () => {
	it('names the shape a layout turns on, with the nearest common ratio', () => {
		expect(shapeOf(3000, 2000)).toBe('landscape 3:2');
		expect(shapeOf(2000, 3000)).toBe('portrait 2:3');
		expect(shapeOf(1000, 1000)).toBe('square');
		expect(shapeOf(4000, 1300)).toBe('panorama 3:1');
		expect(shapeOf(5000, 1000)).toBe('panorama');
		expect(shapeOf(1920, 1080)).toBe('landscape 16:9');
		expect(shapeOf(0, 0)).toBe('unknown shape');
	});
});

describe('assetManifest', () => {
	it('is empty for an empty Library, so a deck without photos pays nothing', () => {
		expect(assetManifest([])).toBe('');
	});

	it('lists one short line per asset and shows how to use the name', () => {
		const m = assetManifest([photo('shop-floor', { caption: 'Two people at a workbench' }), photo('logo-wall', { scope: 'deck', width: 800, height: 800 }), photo('reel', { kind: 'video' })]);
		expect(m).toContain('- shop-floor · photo · landscape 3:2 · all decks · "Two people at a workbench"');
		expect(m).toContain('- logo-wall · photo · square · this deck only');
		expect(m).toContain('- reel · video ·');
		expect(m).toContain('asset:shop-floor');
		// Only logo-wall needs a look: shop-floor has a caption and a video cannot be viewed.
		expect(m).toContain('1 photo has no caption yet');
	});

	it('marks a clip that rides the message, and says to watch it there and not to call view_asset for a video', () => {
		const m = assetManifest([photo('clip', { kind: 'video' }), photo('reel', { kind: 'video' })], undefined, true, new Set(['clip']));
		expect(m).toContain("- clip · video · landscape 3:2 · all decks · ATTACHED TO THE AUTHOR'S MESSAGE: watch it there");
		expect(m).toContain('- reel · video · landscape 3:2 · all decks');
		expect(m).not.toContain('- reel · video · landscape 3:2 · all decks · ATTACHED');
		expect(m).toContain('do not call it for a video');
		expect(assetManifest([photo('reel', { kind: 'video' })])).not.toContain('ATTACHED');
	});

	it('stays small: a capped list that points at list_assets for the rest', () => {
		const many = Array.from({ length: 120 }, (_, i) => photo(`p-${i}`, { caption: 'A caption of average length for a photo' }));
		const m = assetManifest(many);
		expect(m.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(MANIFEST_CAP);
		expect(m).toContain('…and 80 more. Call list_assets');
		// ~15 tokens a line at 4 chars a token: the whole block stays under 1,200 tokens.
		expect(m.length / 4).toBeLessThan(1200);
	});

	it('does not nudge a model that cannot read images to look', () => {
		expect(assetManifest([photo('a')], undefined, false)).not.toContain('view_asset');
		expect(assetManifest([photo('a')], undefined, true)).toContain('view_asset');
	});

	it('does not tell the model to look when every photo has a caption', () => {
		expect(assetManifest([photo('a', { caption: 'x' })])).not.toContain('no caption yet');
	});
});

describe('listAssetsView', () => {
	const all = [photo('shop-floor', { caption: 'Two people at a workbench' }), photo('portrait-ana', { width: 2000, height: 3000 }), photo('reel', { kind: 'video' })];
	it('filters by words across name, caption and shape', () => {
		expect(listAssetsView(all, { query: 'workbench' })).toContain('shop-floor');
		expect(listAssetsView(all, { query: 'portrait' })).toContain('portrait-ana');
		expect(listAssetsView(all, { query: 'portrait' })).not.toContain('shop-floor');
		expect(listAssetsView(all, { kind: 'video' })).toContain('reel');
	});
	it('says what happened when nothing matches or the Library is empty', () => {
		expect(listAssetsView(all, { query: 'zebra' })).toContain('No asset matches');
		expect(listAssetsView([], {})).toContain('empty');
	});
});

describe('cleanCaption', () => {
	it('makes a model caption safe to store and to quote back in a prompt', () => {
		expect(cleanCaption('  Two people\n\tat a "workbench" `now`  ')).toBe("Two people at a 'workbench' 'now'");
		expect(cleanCaption('x'.repeat(500))).toHaveLength(140);
		expect(cleanCaption(null)).toBe('');
		expect(cleanCaption({ evil: true })).toBe('');
		expect(cleanCaption(42)).toBe('');
	});
	it('cuts by whole characters, so an emoji at the limit is not split in half', () => {
		const c = cleanCaption(`${'a'.repeat(139)}😀 more`);
		expect(c).toBe(`${'a'.repeat(139)}😀`);
		expect(Array.from(c)).toHaveLength(140);
		expect(c).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
	});
	it('reads blank-looking and smuggling characters as empty, and curly quotes as the straight ones', () => {
		expect(cleanCaption('\u3164\u2800')).toBe('');
		expect(cleanCaption('\ufe0f\u{e0100}\u{e0041}')).toBe('');
		expect(cleanCaption('A door” ⋅ this deck only “x')).toBe("A door' - this deck only 'x");
	});
	it('cannot forge a manifest field or hide text with invisible characters', () => {
		const c = cleanCaption('A door · this deck only \u202Ehidden\u200B \u0085 end');
		expect(c).not.toContain('·');
		expect(c).not.toMatch(/[\u202E\u200B\u0085]/);
		expect(c).toBe('A door - this deck only hidden end');
	});
});

describe('libraryPromptTokens — the readout never prices the Library below what the prompt really carries', () => {
	// The WORST line: a 40-character name and a full-length caption, kept to this deck.
	const real = (n: number) => Array.from({ length: n }, (_, i) => photo(`${'team-offsite-photo-'.padEnd(36, 'x')}${String(i).padStart(4, '0')}`, { scope: 'deck', caption: 'c'.repeat(140) }));
	it('is at or above the real manifest, estimated at four characters a token, at every size', () => {
		for (const n of [1, 3, 10, 40, 41, 200]) expect(libraryPromptTokens(n)).toBeGreaterThanOrEqual(Math.ceil(assetManifest(real(n)).length / 4));
	});
	it('is zero for an empty Library and flat past the manifest cap', () => {
		expect(libraryPromptTokens(0)).toBe(0);
		expect(libraryPromptTokens(-3)).toBe(0);
		expect(libraryPromptTokens(500)).toBe(libraryPromptTokens(MANIFEST_CAP));
	});
});
