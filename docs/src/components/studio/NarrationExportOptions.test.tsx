// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
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
const onDeviceBakeVoice = vi.fn();

vi.mock('./read-aloud', async (importOriginal) => ({
	...(await importOriginal<typeof import('./read-aloud')>()),
	listTtsCatalog: () => listTtsCatalog(),
	listTtsModels: async () => (await listTtsCatalog()).models,
	defaultBakeVoice: () => defaultBakeVoice(),
	voiceAvailability: () => voiceAvailability(),
	onDeviceBakeVoice: () => onDeviceBakeVoice(),
	previewTtsVoice: async () => ({ ok: true }),
}));

// The pre-flight renders the whole deck; stub it to a fixed measurement so these tests are
// about the COPY, not about projection.
vi.mock('./narration-bake', async (importOriginal) => ({
	...(await importOriginal<typeof import('./narration-bake')>()),
	// A VALID NarrationMeasure. The first version of this fixture omitted `totalChars` and
	// `missingBytes` and invented `onDeviceCached`, so the panel these tests render actually
	// said "Adds to the file about NaN" — and nothing failed, because no assertion looked at the
	// bill. A fixture that does not typecheck as the real thing is a test of a different panel.
	// `missingBytes` is DERIVED, not typed in. The literal here was 95_400 — which is
	// missingChars * the engine rate, i.e. the RAW audio bytes, skipping the base64 step that
	// `shippedBytes` applies. The real figure is 127_223, so the fixture was 25% low on the one
	// number this module's own comment calls load-bearing, and every assertion above it passed
	// (#1462 item 7). Computing it through the real function means it cannot drift again.
	measureNarration: async (_s: string, _p: unknown, voice: { model: string }) => ({
		total: 4, cached: 0, cachedBytes: 0, missing: 4, missingChars: 200, totalChars: 200,
		missingBytes: (await importOriginal<typeof import('./narration-bake')>()).estimateSynthBytes(200, voice?.model),
		estCostUsd: null, estSeconds: 3,
		voice: voice ?? { model: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: 1 }, complete: true,
	}),
}));

const { NarrationExportOptions } = await import('./NarrationExportOptions');

const VOICE = { model: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: 1 };
const CHOICE = { captions: false, audio: true, voice: VOICE, allowPartial: false };

beforeEach(() => {
	vi.clearAllMocks();
	defaultBakeVoice.mockResolvedValue(VOICE);
	voiceAvailability.mockResolvedValue({ rung: 'openrouter-tts', openRouterReady: true, kokoroReady: false, kokoroCached: false, kokoroSupported: false, webgpu: false, speechAllowed: false });
	onDeviceBakeVoice.mockResolvedValue(null);
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
		const within = (line.textContent ?? '').replace(/\s+/g, ' ');
		// ORDER MATTERS, and asserting `toContain` on each name separately does not check it: a
		// version that printed "your saved voice — hexgrad/kokoro-82m on af_heart" passed that
		// way, which is the voice and the model swapped — a garbled sentence about the one thing
		// the author needs to read correctly. Pin the phrase.
		expect(within).toMatch(/saved voice — af_heart on hexgrad\/kokoro-82m/);
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

describe('the bill, which no assertion here used to look at', () => {
	it('never renders NaN, and never calls an unreachable catalog a model without a price', async () => {
		// Both halves caught by the checker: an invalid fixture rendered "about NaN" unnoticed,
		// and the price line — fed by the same empty catalog as the roster — said "this model
		// publishes no price" while sitting directly above a button that spends money.
		listTtsCatalog.mockResolvedValue({ models: [], reachable: false });
		panel();
		await screen.findByText(/Couldn't reach the voice catalog/i);
		const bill = document.body.textContent ?? '';
		expect(bill).not.toMatch(/NaN/);
		expect(bill).toMatch(/cost unknown until the catalog is reachable/i);
		expect(bill).not.toMatch(/this model publishes no price/i);
	});
});

// #1462 item 2. The on-device rung was reachable ONLY through `cloudReady === false`, so an
// author who HAD a key and had rehearsed the whole deck on-device was measured against the
// cloud voice, quoted for 100% of a deck already on their disk, and told by this panel that
// they could "pick the voice you rehearsed in, to pay nothing". They could not: the pickers
// were fed the OpenRouter catalog only. The panel gave advice the panel made impossible, and
// the consequence was money.
describe('choosing the narrator when BOTH a cloud key and an on-device voice exist', () => {
	const DEVICE = { rung: 'kokoro' as const, model: 'hexgrad/kokoro-82m', voice: 'af_sky', speed: 1 };

	beforeEach(() => {
		listTtsCatalog.mockResolvedValue({ models: [{ id: 'hexgrad/kokoro-82m', name: 'Kokoro', promptPerM: 0.62, completionPerM: null, voices: ['af_heart'] }], reachable: true });
		voiceAvailability.mockResolvedValue({ rung: 'openrouter-tts', openRouterReady: true, kokoroReady: true, kokoroCached: true, kokoroSupported: true, webgpu: true, speechAllowed: false });
	});

	it('offers the on-device narrator even though a cloud voice IS connected', async () => {
		onDeviceBakeVoice.mockResolvedValue(DEVICE);
		panel();
		const pick = await screen.findByRole('button', { name: /This device/i });
		expect(pick).toBeTruthy();
		expect(screen.getByRole('button', { name: /Cloud voice/i })).toBeTruthy();
	});

	it('defaults to the cloud voice, so a deck still ships sounding like the rehearsal', async () => {
		onDeviceBakeVoice.mockResolvedValue(DEVICE);
		panel();
		const cloud = await screen.findByRole('button', { name: /Cloud voice/i });
		expect(cloud.getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByRole('button', { name: /This device/i }).getAttribute('aria-pressed')).toBe('false');
	});

	it('picking it names the rehearsed voice and promises no bill', async () => {
		onDeviceBakeVoice.mockResolvedValue(DEVICE);
		panel();
		const btn = await screen.findByRole('button', { name: /This device/i });
		await act(async () => { btn.click(); });
		await waitFor(() => expect(screen.getByRole('button', { name: /This device/i }).getAttribute('aria-pressed')).toBe('true'));
		const copy = (document.body.textContent ?? '').replace(/\s+/g, ' ');
		expect(copy, 'the voice actually rehearsed in, not the cloud one').toMatch(/af_sky/);
		expect(copy).toMatch(/nothing is billed/i);
	});

	it('does not offer the choice when there is no on-device voice at all', async () => {
		onDeviceBakeVoice.mockResolvedValue(null);
		voiceAvailability.mockResolvedValue({ rung: 'openrouter-tts', openRouterReady: true, kokoroReady: false, kokoroCached: false, kokoroSupported: false, webgpu: false, speechAllowed: false });
		panel();
		await waitFor(() => expect(screen.getByLabelText('Narration voice')).toBeTruthy());
		expect(screen.queryByRole('button', { name: /This device/i })).toBeNull();
	});
});

describe('the copy at rest', () => {
	it('never claims the deck is part-rehearsed before anything has been measured', async () => {
		// `measure` only runs once a switch is on. The old copy asserted at rest that "part of
		// this deck has not been rehearsed yet" — a statement about a count nobody had taken, and
		// false for the author it was shown to. Flipping the UNRELATED Captions switch then
		// started the measurement and silently reversed it.
		listTtsCatalog.mockResolvedValue({ models: [], reachable: true });
		voiceAvailability.mockResolvedValue({ rung: 'kokoro', openRouterReady: false, kokoroReady: true, kokoroCached: true, kokoroSupported: true, webgpu: true, speechAllowed: false });
		onDeviceBakeVoice.mockResolvedValue({ rung: 'kokoro' as const, model: 'hexgrad/kokoro-82m', voice: 'af_sky', speed: 1 });
		render(
			<NarrationExportOptions
				source={'---\ntheme: indaco\n---\n\n# One\n\nA sentence.\n'}
				project={async () => ['A sentence.']}
				value={{ captions: false, audio: false, voice: VOICE, allowPartial: false }}
				onChange={() => {}}
			/>,
		);
		await waitFor(() => expect(screen.getByLabelText('Include narration audio')).toBeTruthy());
		expect(document.body.textContent ?? '').not.toMatch(/has not been rehearsed yet/i);
	});
});
