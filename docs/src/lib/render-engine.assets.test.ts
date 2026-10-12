// @vitest-environment node
// `renderMarkdown` hands the engine the Studio's name → URL map ONLY when the source names a
// Library photo. A deck without one must reach `PG.render` exactly as before: no IndexedDB read,
// no extra option, no new module loaded (docs/src/components/studio/media-urls.ts).
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteAsset, listAssets } from '@/components/studio/library/asset-store.js';
import { LIBRARY_SCOPE, saveMedia } from '@/components/studio/media-store';
import { resetAssetUrlsForTests } from '@/components/studio/media-urls';
import { renderMarkdown } from './render-engine';

vi.mock('./ensure-katex', () => ({ deriveKatexProviderUrl: vi.fn(), ensureKatexProvider: vi.fn() }));

const PGWith = () => {
	const render = vi.fn().mockReturnValue({ html: '', css: '' });
	return { PG: { render, addThemes: vi.fn(), hasTheme: vi.fn() }, render };
};

beforeEach(async () => {
	resetAssetUrlsForTests();
	for (const a of await listAssets()) await deleteAsset(a.id);
});

describe('renderMarkdown — Library photos', () => {
	it('adds nothing for a deck that names no photo', async () => {
		const { PG, render } = PGWith();
		await renderMarkdown(PG, '# hi\n\n![a](sample:photo-wide.jpg)', 'indaco', { baseUrl: 'https://x.test/' });
		expect(render.mock.calls[0][2]).toEqual({ baseUrl: 'https://x.test/' });
	});

	it('passes the live map when the source names a photo, merged with the caller’s own options', async () => {
		await saveMedia({ kind: 'image', name: 'hero', scope: LIBRARY_SCOPE, blob: new Blob(['x']), mime: 'image/png', bytes: 1, width: 1, height: 1, sourceName: 'hero.png', original: true }, 1);
		const { PG, render } = PGWith();
		await renderMarkdown(PG, '![a](asset:hero)', 'indaco', { baseUrl: 'https://x.test/' });
		const opts = render.mock.calls[0][2] as { baseUrl: string; assetUrls: Record<string, string> };
		expect(opts.baseUrl).toBe('https://x.test/');
		expect(Object.keys(opts.assetUrls)).toEqual(['hero']);
		expect(opts.assetUrls.hero).toMatch(/^blob:/);
	});

	it('hands an EMPTY map (not none) when the shelf holds nothing, so the engine draws the stand-in', async () => {
		const { PG, render } = PGWith();
		await renderMarkdown(PG, '![a](asset:gone)', 'indaco');
		expect((render.mock.calls[0][2] as { assetUrls: unknown }).assetUrls).toEqual({});
	});

	it('keeps a map the caller supplied', async () => {
		const { PG, render } = PGWith();
		const mine = { hero: 'blob:https://x.test/mine' };
		await renderMarkdown(PG, '![a](asset:hero)', 'indaco', { assetUrls: mine });
		expect((render.mock.calls[0][2] as { assetUrls: unknown }).assetUrls).toBe(mine);
	});
});
