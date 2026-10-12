import { describe, expect, it } from 'vitest';
import { type AssetInfo, assetManifest, cleanCaption, listAssetsView, MANIFEST_CAP, shapeOf } from './agent-assets';

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

	it('stays small: a capped list that points at list_assets for the rest', () => {
		const many = Array.from({ length: 120 }, (_, i) => photo(`p-${i}`, { caption: 'A caption of average length for a photo' }));
		const m = assetManifest(many);
		expect(m.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(MANIFEST_CAP);
		expect(m).toContain('…and 80 more. Call list_assets');
		// ~15 tokens a line at 4 chars a token: the whole block stays under 1,200 tokens.
		expect(m.length / 4).toBeLessThan(1200);
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
	});
});
