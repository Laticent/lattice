import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ArchitectStatus } from './architect';
import { useModelCatalog } from './ModelPicker';

// A direct provider's model ids are bare (`gemini-3.8-flash`, no `vendor/`), so grouping by vendor
// made every model its own heading, and Gemini's live list (2026-11-08) opened on "Antigravity Agent
// Preview". The list is two groups instead: the registry's recommended families, then the rest.
const LIVE = ['antigravity-preview-05-2026', 'antigravity-preview-latest', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.1-pro-preview'].map((id) => ({ id, name: id, promptPerM: null, completionPerM: null, contextLength: null, vision: true }));
vi.mock('./architect', () => ({ listStudioModels: async () => LIVE, setStudioModel: async () => {} }));
vi.mock('@/lib/notify', () => ({ notify: () => {} }));

describe('a direct provider\'s model list', () => {
	it('opens on the recommended family, newest first, then every other live model', async () => {
		const status = { openRouterReady: true, modelId: null, provider: 'gemini' } as unknown as ArchitectStatus;
		const { result } = renderHook(() => useModelCatalog(status));
		await waitFor(() => expect(result.current.models).not.toBeNull());
		const groups = result.current.groups.map((g: { vendor: string; models: { id: string }[] }) => [g.vendor, g.models.map((m) => m.id)]);
		expect(groups).toEqual([
			['Recommended', ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.1-pro-preview']],
			['All Gemini models', ['antigravity-preview-05-2026', 'antigravity-preview-latest', 'gemini-3.1-flash-lite']],
		]);
	});
});
