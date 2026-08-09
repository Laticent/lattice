// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// WHY THIS FILE EXISTS.
//
// The panel was driven in a real browser and photographed at three widths, and every automated
// assertion passed — including one that claimed the voice picker was fine. It was not. The
// screenshot showed "No published voices" and "this model publishes no price" for
// `hexgrad/kokoro-82m`, a model with both. The assertion had checked that the picker ELEMENT
// EXISTED, which is true of an empty, disabled, wrong picker.
//
// The trigger was environmental — that browser could not reach OpenRouter's catalog — but the
// STATE is not: offline, a corporate firewall, or OpenRouter down all produce it, and
// `listTtsModels()` degrades to `[]` by design rather than throwing. In that state the panel
// blamed the model for what the network did, and it was false in the way that matters: the
// bake identity comes from the SAVED PREFS, not the catalog, so the export would have
// succeeded in the author's own voice while the panel told them there wasn't one.
//
// So these tests assert on what the author can READ, not on what is mounted.

const listTtsCatalog = vi.fn();
const defaultBakeVoice = vi.fn();
const voiceAvailability = vi.fn();

vi.mock('./read-aloud', async (importOriginal) => ({
	...(await importOriginal<typeof import('./read-aloud')>()),
	listTtsCatalog: () => listTtsCatalog(),
	listTtsModels: async () => (await listTtsCatalog()).models,
	defaultBakeVoice: () => defaultBakeVoice(),
	voiceAvailability: () => voiceAvailability(),
	onDeviceBakeVoice: async () => null,
	previewTtsVoice: async () => ({ ok: true }),
}));

// The pre-flight renders the whole deck; stub it to a fixed measurement so these tests are
// about the COPY, not about projection.
vi.mock('./narration-bake', async (importOriginal) => ({
	...(await importOriginal<typeof import('./narration-bake')>()),
	measureNarration: async () => ({
		total: 4, cached: 0, cachedBytes: 0, missing: 4, missingChars: 200,
		estCostUsd: null, estSeconds: 3, voice: { model: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: 1 },
		complete: true, onDeviceCached: 0,
	}),
}));

const { NarrationExportOptions } = await import('./NarrationExportOptions');

const VOICE = { model: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: 1 };
const CHOICE = { captions: false, audio: true, voice: VOICE, allowPartial: false };

beforeEach(() => {
	vi.clearAllMocks();
	defaultBakeVoice.mockResolvedValue(VOICE);
	voiceAvailability.mockResolvedValue({ rung: 'openrouter-tts', openRouterReady: true, kokoroReady: false, kokoroCached: false, kokoroSupported: false, webgpu: false, speechAllowed: false });
});

const panel = () =>
	render(
		<NarrationExportOptions
			source={'---\ntheme: indaco\n---\n\n# One\n\nA sentence.\n'}
			project={async () => ['A sentence.']}
			value={CHOICE}
			onChange={() => {}}
		/>,
	);

describe('when the voice catalog cannot be reached', () => {
	it('says the CATALOG is unreachable — never that the model has no voices', async () => {
		listTtsCatalog.mockResolvedValue({ models: [], reachable: false });
		panel();
		await waitFor(() => expect(screen.getByText(/Couldn't reach the voice catalog/i)).toBeTruthy());
		// The old copy blamed the model. It must not come back.
		expect(screen.queryByText(/hasn't published a voice list/i)).toBeNull();
	});

	it('names the voice the export will actually bake with, so the author knows it still works', async () => {
		// The load-bearing half: the bake reads the saved prefs, not the catalog, so this state
		// is a degraded PICKER, not a broken export. Saying otherwise would send an author off
		// to fix a connection they do not need.
		listTtsCatalog.mockResolvedValue({ models: [], reachable: false });
		panel();
		// Scoped to the fallback line: the model id also appears in the model picker's own
		// summary, so an unscoped query matches twice and proves nothing about THIS copy.
		const line = await screen.findByText(/Couldn't reach the voice catalog/i);
		const within = line.textContent ?? '';
		expect(within).toContain('af_heart');
		expect(within).toContain('hexgrad/kokoro-82m');
		expect(within).toMatch(/which still works/i);
	});

	it('does NOT show the unreachable copy while the catalog is still in flight', async () => {
		// `null` (in flight) and `[]` (resolved empty) are different answers, and flashing
		// "couldn't reach the catalog" during a slow fetch would be its own small lie.
		let release: (v: unknown) => void = () => {};
		listTtsCatalog.mockReturnValue(new Promise((r) => { release = r; }));
		panel();
		await waitFor(() => expect(screen.getByLabelText('Include narration audio')).toBeTruthy());
		expect(screen.queryByText(/Couldn't reach the voice catalog/i)).toBeNull();
		release({ models: [], reachable: false });
		await waitFor(() => expect(screen.getByText(/Couldn't reach the voice catalog/i)).toBeTruthy());
	});
});

describe('when the catalog IS reachable', () => {
	it('offers the real picker rather than the fallback line', async () => {
		listTtsCatalog.mockResolvedValue({ models: [{ id: 'hexgrad/kokoro-82m', name: 'Kokoro', promptPerM: 0.62, completionPerM: null, voices: ['af_heart', 'am_michael'] }], reachable: true });
		panel();
		await waitFor(() => expect(screen.getByLabelText('Narration voice')).toBeTruthy());
		expect(screen.queryByText(/Couldn't reach the voice catalog/i)).toBeNull();
	});
});

// The defect this shape exists to prevent, pinned so it cannot come back by someone
// "simplifying" reachability into an emptiness check.
describe('when the catalog is REACHABLE but genuinely lists nothing', () => {
	it('does NOT claim the catalog was unreachable', async () => {
		// A live answer with no speech models is empty for a real reason. Saying "couldn't reach
		// the voice catalog" about a catalog we reached is the same lie, one layer down — and an
		// `Array.isArray(models) && !models.length` guard cannot tell the two apart.
		listTtsCatalog.mockResolvedValue({ models: [], reachable: true });
		panel();
		await waitFor(() => expect(screen.getByLabelText('Include narration audio')).toBeTruthy());
		expect(screen.queryByText(/Couldn't reach the voice catalog/i)).toBeNull();
	});
});
