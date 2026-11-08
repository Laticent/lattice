import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ArchitectStatus } from './architect';
import { useModelCatalog } from './ModelPicker';

// A direct provider's model ids are bare (`gemini-3.8-flash`, no `vendor/`), so grouping by vendor
// made every model its own heading, and Gemini's live list (2026-11-08) opened on "Antigravity Agent
// Preview". It opens on the registry's recommended families; All and a search reach the rest.
const LIVE = ['antigravity-preview-05-2026', 'antigravity-preview-latest', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.1-pro-preview'].map((id) => ({ id, name: id, promptPerM: null, completionPerM: null, contextLength: null, vision: true }));
vi.mock('./architect', () => ({ listStudioModels: async () => LIVE, setStudioModel: async () => {} }));
vi.mock('@/lib/notify', () => ({ notify: () => {} }));

describe('a direct provider\'s model list', () => {
	it('opens on Recommended only, the newest model of each registry family; All and a search show every live model', async () => {
		const status = { openRouterReady: true, modelId: null, provider: 'gemini' } as unknown as ArchitectStatus;
		const { result } = renderHook(() => useModelCatalog(status));
		await waitFor(() => expect(result.current.models).not.toBeNull());
		const shape = () => result.current.groups.map((g: { vendor: string; models: { id: string }[] }) => [g.vendor, g.models.map((m) => m.id)]);
		expect(result.current.view).toBe('featured');
		// The newest of each family only: 3.5 Flash is an older Flash, so it waits in All.
		expect(shape()).toEqual([['Recommended', ['gemini-3.8-flash', 'gemini-3.1-pro-preview']]]);
		act(() => result.current.setView('all'));
		expect(shape()).toEqual([
			['Recommended', ['gemini-3.8-flash', 'gemini-3.1-pro-preview']],
			['All Gemini models', ['antigravity-preview-05-2026', 'antigravity-preview-latest', 'gemini-3.1-flash-lite', 'gemini-3.5-flash']],
		]);
		act(() => {
			result.current.setView('featured');
			result.current.setQuery('lite');
		});
		expect(shape()).toEqual([['All Gemini models', ['gemini-3.1-flash-lite']]]);
	});

	it('keeps a selected model that is not recommended in view on the Recommended lens', async () => {
		const status = { openRouterReady: true, modelId: 'antigravity-preview-latest', provider: 'gemini' } as unknown as ArchitectStatus;
		const { result } = renderHook(() => useModelCatalog(status));
		await waitFor(() => expect(result.current.models).not.toBeNull());
		expect(result.current.groups.map((g: { vendor: string }) => g.vendor)).toEqual(['Recommended', 'Selected']);
	});
});
