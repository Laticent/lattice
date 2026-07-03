import { describe, expect, it, vi } from 'vitest';

// Capture what reaches the asset store so we can assert the FULL manifest is
// persisted (not just name/bucket). listAssets returns [] so the empty-shelf test
// still holds; deleteAsset is a no-op.
vi.mock('@/components/studio/library/asset-store.js', () => ({
	putAsset: vi.fn(async (a: unknown) => a),
	listAssets: vi.fn(async () => []),
	deleteAsset: vi.fn(async () => {}),
}));

import { putAsset } from '@/components/studio/library/asset-store.js';
import { listStudioComponents, saveStudioComponent } from './component-library';

const putSpy = putAsset as unknown as ReturnType<typeof vi.fn>;

describe('component-library', () => {
	it('lists an empty shelf when the asset store is unavailable (no IndexedDB)', async () => {
		await expect(listStudioComponents()).resolves.toEqual([]);
	});

	it('rejects an invalid component name (the record shape enforces a slug)', async () => {
		await expect(saveStudioComponent({ name: 'Bad Name', css: 'section.x{}', skeleton: '' })).rejects.toBeTruthy();
	});

	it('persists the FULL manifest — axes, tags, and capacity, not just name (#610)', async () => {
		putSpy.mockClear();
		await saveStudioComponent({
			name: 'verdict-grid',
			css: 'section.verdict-grid{}',
			skeleton: '<!-- _class: verdict-grid -->',
			meta: { function: 'inventory', form: 'grid', substance: 'structure', bucket: 'inventory', tags: ['cards', 'verdict', 'grid'], description: 'A grid of verdicts.', adapt: { mode: 'native' }, capacity: { sweet: 4, soft: 6, hard: 8 } },
		});
		const asset = putSpy.mock.calls.at(-1)?.[0] as { manifest: Record<string, unknown> };
		// The whole contract is captured — so the saved component stays classifiable,
		// dedups against future requests, and graduates without a re-author.
		expect(asset.manifest).toMatchObject({
			name: 'verdict-grid', function: 'inventory', form: 'grid', substance: 'structure',
			bucket: 'inventory', tags: ['cards', 'verdict', 'grid'], description: 'A grid of verdicts.',
			adapt: { mode: 'native' }, capacity: { sweet: 4, soft: 6, hard: 8 },
		});
	});
});
