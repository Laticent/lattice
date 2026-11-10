// useArchitectStatus names the picked OpenRouter model from the catalog, which the model module prefetches at boot.
// A status read before that fetch lands used to keep the id-derived name ("test/model" as "Model") until the author
// opened the chip, since nothing read the catalog again. Found by e2e/model-spine.spec.ts:155 under load
// (followups.d/3087-p4-mobile-load-only-flakes.md).

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

let catalog: { id: string; name: string }[] | null = null;
let land: () => void = () => {};
const listed = new Promise<void>((resolve) => {
	land = () => {
		catalog = [{ id: 'test/model', name: 'Test Model' }];
		resolve();
	};
});
const listCalls = vi.fn(() => listed);

vi.mock('@/components/studio/ai/architect-model.js', () => ({
	loadOpenRouterKey: async () => {},
	loadProviderKey: async () => {},
	createArchitectModel: () => ({
		availability: () => ({ generation: 'openrouter', readiness: { source: 'cloud', provider: 'openrouter', model: 'test/model', state: 'ready' }, openRouterReady: true, provider: 'openrouter' }),
		openRouterModel: () => 'test/model',
		openRouterModelName: () => catalog?.find((m) => m.id === 'test/model')?.name ?? 'test/model',
		openRouterModelPrice: () => (catalog ? { promptPerM: 3, completionPerM: 15 } : null),
		listOpenRouterModels: listCalls,
		openRouterAccount: async () => null,
		openRouterCredits: async () => null,
		openRouterKeySettingsUrl: () => null,
	}),
}));

import { useArchitectStatus } from './architect';

describe('useArchitectStatus and a catalog that lands after the status read', () => {
	it('names and prices the picked model once the prefetched catalog arrives', async () => {
		const { result } = renderHook(() => useArchitectStatus());
		// Read before the catalog: the id stands in.
		await waitFor(() => expect(result.current.modelId).toBe('test/model'));
		expect(result.current.modelName).toBe('test/model');
		expect(listCalls).toHaveBeenCalled();
		await act(async () => {
			land();
			await listed;
		});
		await waitFor(() => expect(result.current.modelName).toBe('Test Model'));
		expect(result.current.price).toEqual({ promptPerM: 3, completionPerM: 15 });
	});
});
