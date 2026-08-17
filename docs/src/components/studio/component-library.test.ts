import { describe, expect, it, vi } from 'vitest';

// Capture what reaches the asset store so we can assert the FULL manifest is
// persisted (not just name/bucket). listAssets returns [] so the empty-shelf test
// still holds; deleteAsset is a no-op.
vi.mock('@/components/studio/library/asset-store.js', () => ({
	putAsset: vi.fn(async (a: unknown) => a),
	listAssets: vi.fn(async () => []),
	deleteAsset: vi.fn(async () => {}),
}));

import { listAssets, putAsset } from '@/components/studio/library/asset-store.js';
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

	it('reads the manifest back OUT again — a save that survives is only half a round trip', async () => {
		// The persist half above has been green since #610 while the read half silently
		// dropped every one of these fields. Nothing noticed, because the only reader was
		// a card showing a name and a bucket. It breaks the moment a component can be
		// REOPENED for editing: the faculty would seed from the component's own saved
		// record and lose the author's whole contract.
		const manifest = {
			name: 'verdict-grid', function: 'inventory', form: 'grid', substance: 'structure',
			bucket: 'inventory', tags: ['cards', 'verdict'], description: 'A grid of verdicts.',
			adapt: { mode: 'native' }, capacity: { sweet: 4, soft: 6, hard: 8 }, density: { axis: 'item', soft: 5 },
		};
		vi.mocked(listAssets).mockResolvedValueOnce([
			{ id: 'c1', kind: 'component', name: 'verdict-grid', bucket: 'inventory', text: 'section.verdict-grid{}', skeleton: '<!-- _class: verdict-grid -->', manifest },
		] as never);
		const [comp] = await listStudioComponents();
		expect(comp.meta).toMatchObject({
			function: 'inventory', form: 'grid', substance: 'structure', bucket: 'inventory',
			tags: ['cards', 'verdict'], description: 'A grid of verdicts.',
			adapt: { mode: 'native' }, capacity: { sweet: 4, soft: 6, hard: 8 }, density: { axis: 'item', soft: 5 },
		});
	});

	it('gives a legacy record with no manifest an empty contract, not undefined', async () => {
		vi.mocked(listAssets).mockResolvedValueOnce([
			{ id: 'c2', kind: 'component', name: 'old', text: '.a{}', skeleton: '# a' },
		] as never);
		const [comp] = await listStudioComponents();
		expect(comp.meta).toEqual({});
	});
});
