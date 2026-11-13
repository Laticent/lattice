// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
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
		transcoded: true,
		...measureOverride,
	}),
}));

/** Per-test slice over the fixture above, for the cases that are ABOUT the measurement (a
 *  fully-rehearsed deck, a voice we do not encode) rather than about the voice picker. Reset in
 *  `beforeEach` so a test cannot leak its shape into the next one. */
let measureOverride: Record<string, unknown> | null = null;

const { NarrationExportOptions } = await import('./NarrationExportOptions');
type NarrationChoice = Parameters<typeof NarrationExportOptions>[0]['value'];

const VOICE = { model: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: 1 };
const CHOICE = { captions: false, audio: true, voice: VOICE, allowPartial: false };

beforeEach(() => {
	vi.clearAllMocks();
	measureOverride = null;
	defaultBakeVoice.mockResolvedValue(VOICE);
	voiceAvailability.mockResolvedValue({ rung: 'openrouter-tts', openRouterReady: true, kokoroReady: false, kokoroCached: false, kokoroSupported: false, webgpu: false, speechAllowed: false });
	onDeviceBakeVoice.mockResolvedValue(null);
});


/** The panel is CONTROLLED: `value.voice` is the single source of truth and the parent owns it.
 *  A test that clicks with a no-op `onChange` therefore observes nothing — which is precisely
 *  how the narrator picker shipped writing to local state only. Interactive tests use this. */
function statefulPanel(initial = CHOICE) {
	const emitted: NarrationChoice[] = [];
	const Harness = () => {
		const [v, setV] = React.useState<NarrationChoice>(initial);
		return (
			<NarrationExportOptions
				source={'---\ntheme: indaco\n---\n\n# One\n\nA sentence.\n'}
				project={async () => ['A sentence.']}
				value={v}
				onChange={(next) => { emitted.push(next); setV(next); }}
			/>
		);
	};
	render(<Harness />);
	return emitted;
}

const panel = () =>
	render(
		<NarrationExportOptions
			source={'---\ntheme: indaco\n---\n\n# One\n\nA sentence.\n'}
			project={async () => ['A sentence.']}
			value={CHOICE}
			onChange={() => {}}
		/>,
	);

// THE NARRATOR IS THE VOICE MODEL (engineering/decisions/2026-11-08-studio-ai-routes-ux.md §3).
// The panel used to carry its own narrator picker (a cloud/device toggle, a model and a voice), a
// second place that decided "which voice" beside Workspace › AI. It now names the author's voice
// selection and says where to change it; the catalog is read only for the price.
describe('when the voice catalog cannot be reached', () => {
	it('says the PRICE is unknown, never that the model publishes none, and never renders NaN', async () => {
		listTtsCatalog.mockResolvedValue({ models: [], reachable: false });
		panel();
		await screen.findByText(/To synthesize/i);
		await waitFor(() => expect(document.body.textContent ?? '').toMatch(/cost unknown until the catalog is reachable/i));
		const bill = document.body.textContent ?? '';
		expect(bill).not.toMatch(/NaN/);
		expect(bill).not.toMatch(/this model publishes no price/i);
		expect(bill, 'the old copy blamed the model').not.toMatch(/hasn't published a voice list/i);
	});

	it('still names the voice the export will bake with: the catalog is not where it comes from', async () => {
		listTtsCatalog.mockResolvedValue({ models: [], reachable: false });
		panel();
		const line = (await screen.findByText(/Narrated by your voice model/i)).textContent ?? '';
		expect(line.replace(/\s+/g, ' ')).toMatch(/Heart · Kokoro 82M · OpenRouter/);
	});

	it('does NOT say the cost is unknown while the catalog is still in flight', async () => {
		let release: (v: unknown) => void = () => {};
		listTtsCatalog.mockReturnValue(new Promise((r) => { release = r; }));
		panel();
		await screen.findByText(/To synthesize/i);
		expect(screen.queryByText(/cost unknown/i)).toBeNull();
		release({ models: [], reachable: false });
		await waitFor(() => expect(document.body.textContent ?? '').toMatch(/cost unknown until the catalog is reachable/i));
	});
});

describe('when the catalog is REACHABLE but genuinely lists nothing', () => {
	it('does NOT claim the catalog was unreachable', async () => {
		// A live answer with no speech models is empty for a real reason; an emptiness check
		// cannot tell it from an unreachable catalog, so reachability is its own answer.
		listTtsCatalog.mockResolvedValue({ models: [], reachable: true });
		panel();
		await screen.findByText(/To synthesize/i);
		expect(screen.queryByText(/cost unknown/i)).toBeNull();
	});
});

describe('the narrator follows the voice selection', () => {
	const DEVICE = { rung: 'kokoro' as const, model: 'hexgrad/kokoro-82m', voice: 'af_sky', speed: 1 };
	const GEMINI = { rung: 'gemini' as const, model: 'gemini-3.8-flash-lite-tts', voice: 'Kore', speed: 1 };
	beforeEach(() => {
		listTtsCatalog.mockResolvedValue({ models: [{ id: 'hexgrad/kokoro-82m', name: 'Kokoro', promptPerM: 0.62, completionPerM: null, voices: ['af_heart'] }], reachable: true });
	});

	it('has no narrator picker of its own, and says where the voice is chosen', async () => {
		panel();
		const line = await screen.findByText(/Narrated by your voice model/i);
		expect(line.textContent).toMatch(/Change it in Workspace › AI/);
		expect(screen.queryByLabelText('Narration voice')).toBeNull();
		expect(screen.queryByRole('button', { name: /Cloud voice|This device/i })).toBeNull();
	});

	it('WRITES the selected identity, the one the bake reads, not just the one it shows', async () => {
		defaultBakeVoice.mockResolvedValue(DEVICE);
		voiceAvailability.mockResolvedValue({ rung: 'kokoro', openRouterReady: true, kokoroReady: true, kokoroCached: true, kokoroSupported: true, webgpu: true, speechAllowed: false });
		const emitted = statefulPanel();
		await waitFor(() => expect(emitted.at(-1)?.voice).toEqual(DEVICE));
		await waitFor(() => expect((document.body.textContent ?? '').replace(/\s+/g, ' ')).toMatch(/Sky · Kokoro · This device\. Nothing leaves this machine and nothing is billed/));
	});

	it('re-reads the selection when it changes while the panel is open', async () => {
		voiceAvailability.mockResolvedValue({ rung: 'kokoro', openRouterReady: true, kokoroReady: true, kokoroCached: true, kokoroSupported: true, webgpu: true, speechAllowed: false });
		const emitted = statefulPanel();
		await screen.findByText(/Narrated by your voice model/i);
		defaultBakeVoice.mockResolvedValue(DEVICE);
		await act(async () => { window.dispatchEvent(new Event('db-voice-changed')); });
		await waitFor(() => expect(emitted.at(-1)?.voice.rung).toBe('kokoro'));
	});

	it('narrates on a Gemini key when that is the voice model', async () => {
		defaultBakeVoice.mockResolvedValue(GEMINI);
		voiceAvailability.mockResolvedValue({ rung: 'gemini-tts', openRouterReady: false, kokoroReady: false, kokoroCached: false, kokoroSupported: false, webgpu: false, speechAllowed: false, readiness: { state: 'ready', source: 'cloud', provider: 'gemini', voice: 'Kore', model: 'gemini-3.8-flash-lite-tts' } });
		const emitted = statefulPanel();
		await waitFor(() => expect(emitted.at(-1)?.voice).toEqual(GEMINI));
		expect(((await screen.findByText(/Narrated by your voice model/i)).textContent ?? '').replace(/\s+/g, ' ')).toMatch(/Kore · .* · your Gemini key/);
		expect((screen.getByLabelText('Include narration audio') as HTMLButtonElement).disabled).toBe(false);
	});

	it('cannot turn audio on while the on-device voice is on disk but not LOADED', async () => {
		// `kokoroReady`, not `kokoroReady || kokoroCached`: a cached-but-unloaded model is a bake
		// `synthBakeClip` refuses, so the switch must not promise it.
		defaultBakeVoice.mockResolvedValue(DEVICE);
		voiceAvailability.mockResolvedValue({ rung: 'silent', openRouterReady: true, kokoroReady: false, kokoroCached: true, kokoroSupported: true, webgpu: true, speechAllowed: false });
		statefulPanel({ captions: false, audio: false, voice: VOICE, allowPartial: false });
		await waitFor(() => expect(voiceAvailability).toHaveBeenCalled());
		await waitFor(() => expect((screen.getByLabelText('Include narration audio') as HTMLButtonElement).disabled).toBe(true));
		expect(document.body.textContent ?? '').toMatch(/Your voice model cannot speak right now/);
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

// THE GUIDE IS AN EXPORT OPTION (owner, 2026-09-28), on by default whenever the export narrates, and
// meaningless without narration, so it waits for captions or audio.
describe('the Guide switch', () => {
	const renderWith = (value: NarrationChoice, onChange: (v: NarrationChoice) => void = () => {}) => {
		listTtsCatalog.mockResolvedValue({ models: [], reachable: true });
		voiceAvailability.mockResolvedValue({ rung: 'kokoro', openRouterReady: false, kokoroReady: true, kokoroCached: true, kokoroSupported: true, webgpu: true, speechAllowed: false });
		onDeviceBakeVoice.mockResolvedValue({ rung: 'kokoro' as const, model: 'hexgrad/kokoro-82m', voice: 'af_sky', speed: 1 });
		return render(<NarrationExportOptions source={'---\ntheme: indaco\n---\n\n# One\n\nA sentence.\n'} project={async () => ['A sentence.']} value={value} onChange={onChange} />);
	};

	it('waits for narration, then starts on', async () => {
		const { unmount } = renderWith({ captions: false, audio: false, voice: VOICE, allowPartial: false });
		const off = await screen.findByLabelText('Include the Guide');
		expect(off.getAttribute('aria-checked')).toBe('false');
		expect(off.hasAttribute('disabled') || off.getAttribute('data-disabled') !== null).toBe(true);
		unmount();
		renderWith({ captions: true, audio: false, voice: VOICE, allowPartial: false });
		expect((await screen.findByLabelText('Include the Guide')).getAttribute('aria-checked')).toBe('true');
	});

	it('the size the bill adds for it stays within 5% of the real bundle', async () => {
		const { GUIDE_EXPORT_BYTES } = await import('./NarrationExportOptions');
		const { GUIDE_PLAYER_JS } = await import('../../../../lib/export/guide-player-bundle.generated.mjs');
		// The bundle is most of it; the switch and the focus rules are the rest (~4 KB).
		expect(Math.abs(GUIDE_EXPORT_BYTES - (GUIDE_PLAYER_JS.length + 4000)) / GUIDE_EXPORT_BYTES).toBeLessThan(0.05);
	});

	it('turning it off records guide: false for the export', async () => {
		const seen: NarrationChoice[] = [];
		renderWith({ captions: true, audio: false, voice: VOICE, allowPartial: false }, (v) => seen.push(v));
		const sw = await screen.findByLabelText('Include the Guide');
		act(() => sw.click());
		expect(seen.at(-1)?.guide).toBe(false);
	});
});

// A REHEARSED deck is the case this panel is least likely to be read carefully on, and the one
// where it was most wrong. Compression moved to the bake, so the export now re-encodes every
// clip the device already holds — free, but tens of seconds for a long deck. The panel went on
// saying "free and instant" and showed no duration at all, because the duration line hung off
// the SYNTHESIS branch, which a fully-prepared deck does not take.
describe('a fully-rehearsed deck states its wait', () => {
	const REHEARSED = { total: 4, cached: 4, cachedBytes: 40_000, missing: 0, missingChars: 0, missingBytes: 0, estCostUsd: null };

	async function rehearsed(extra: Record<string, unknown>) {
		measureOverride = { ...REHEARSED, ...extra };
		listTtsCatalog.mockResolvedValue({ models: [{ id: VOICE.model, name: 'Kokoro', voices: ['af_heart'] }], reachable: true });
		render(<NarrationExportOptions source={'---\ntheme: indaco\n---\n\n# One\n\nA sentence.\n'} project={async () => ['A sentence.']} value={CHOICE} onChange={() => {}} />);
		// NOT /already prepared/ — the SPINNER says "checking what this device has already
		// prepared…", so that regex matches before the measurement exists and every assertion
		// below then reads an empty bill. Wait for a line only the settled bill renders.
		await screen.findByText(/To synthesize/i);
		return (document.body.textContent ?? '').replace(/\s+/g, ' ');
	}

	it('does not promise "instant" for a voice the export has to encode', async () => {
		const copy = await rehearsed({ transcoded: true, estSeconds: 32 });
		expect(copy, 'the promise the encode broke').not.toMatch(/free and instant/i);
		expect(copy, 'still free — only the "instant" half was false').toMatch(/no charge/i);
	});

	it('shows the time even though there is nothing to synthesize', async () => {
		const copy = await rehearsed({ transcoded: true, estSeconds: 32 });
		expect(copy).toMatch(/Takes about/i);
		expect(copy, 'formatDuration(32)').toMatch(/32 ?s/i);
	});

	it('keeps "free and instant" for a voice that ships its own compressed audio', async () => {
		// The cloud engines that return mp3 are untouched by the bake, so a cached clip really
		// is copied straight into the file. Narrowing the claim must not widen into a lie the
		// other way — an honest panel does not hedge a wait that does not exist.
		const copy = await rehearsed({ transcoded: false, estSeconds: 0 });
		expect(copy).toMatch(/free and instant/i);
		expect(copy, 'no wait, so no line about one').not.toMatch(/Takes about/i);
	});
});

// ── the voice IS the language control ─────────────────────────────────────────
// Neither speech engine takes a language parameter, so a deck's `lang:` only reaches the
// voice through WHICH VOICE is picked — and nothing said so when they disagreed. This is
// `voiceLanguageMismatch`'s first real caller (2026-09-20-narration-audit.md Finding 4).
// Per this file's own rule, these assert on what the AUTHOR CAN READ, not on what mounted.
describe('when the chosen voice does not speak the deck’s language', () => {
	// `vi.clearAllMocks()` in the outer beforeEach wipes resolved values, and this file's
	// convention is that each test states the catalog it wants. A reachable Kokoro roster is
	// the ordinary case for every test here except the unreachable-catalog one.
	beforeEach(() => {
		listTtsCatalog.mockResolvedValue({
			models: [{ id: 'hexgrad/kokoro-82m', name: 'Kokoro', promptPerM: 0.62, completionPerM: null, voices: ['af_heart', 'am_michael'] }],
			reachable: true,
		});
	});

	/** The nodes carrying the warning, split into the one the author READS and the sr-only
	 *  mirror. Asserting on the visible one specifically is what stops a test passing on the
	 *  <Announce> node alone — mutation-checked: removing the visible warning left the
	 *  announcement behind, and a `length > 0` assertion survived it. */
	const warningNodes = () => {
		const all = screen.queryAllByText(/This deck declares lang/i);
		return {
			visible: all.filter((n) => !n.classList.contains('sr-only')),
			announced: all.filter((n) => n.getAttribute('aria-live') === 'polite'),
		};
	};

	/** The same panel, with the deck declaring a language in its front matter. */
	const panelWithLang = (lang: string, choice = CHOICE) =>
		render(
			<NarrationExportOptions
				source={`---\ntheme: indaco\nlang: ${lang}\n---\n\n# One\n\nA sentence.\n`}
				project={async () => ['A sentence.']}
				value={choice}
				onChange={() => {}}
			/>,
		);

	it('says so, names both languages, and explains why the voice is the control', async () => {
		panelWithLang('es'); // VOICE is af_heart — US English
		await screen.findAllByText(/This deck declares lang: es/i);
		// Two nodes on purpose: the one the author READS and the sr-only <Announce> mirror. A
		// warning a sighted author sees and a screen-reader user does not would be a poor fix
		// for an accessibility-shaped defect.
		const { visible, announced } = warningNodes();
		expect(visible, 'the author can read it').toHaveLength(1);
		expect(announced, 'and a screen reader says it').toHaveLength(1);
		expect(visible[0].textContent).toMatch(/US English/);
		expect(visible[0].textContent, 'the author needs to know WHY picking a voice is the fix')
			.toMatch(/neither speech engine takes a language parameter/i);
	});

	it('renders the sentence as prose — no stray markdown backticks in the UI', async () => {
		panelWithLang('es');
		await screen.findAllByText(/This deck declares lang: es/i);
		expect(warningNodes().visible[0].textContent).not.toMatch(/`/);
	});

	it('stays quiet when the voice and the deck agree', async () => {
		panelWithLang('en'); // af_heart IS US English
		await screen.findByText(/Narrated by your voice model/i);
		expect(screen.queryByText(/This deck declares lang/i)).toBeNull();
	});

	it('stays quiet when the deck declares no language at all', async () => {
		// The "unset, as before" half — the half a regression would break silently, because a
		// warning on every deck that never said anything about language is worse than none.
		panel(); // the default fixture carries no `lang:`
		await screen.findByText(/Narrated by your voice model/i);
		expect(screen.queryByText(/This deck declares lang/i)).toBeNull();
	});

	it('stays quiet for a REGIONAL variant of the same language', async () => {
		// `en-GB` against a US English voice is a narrower claim than either side is making;
		// warning there would train the author to dismiss the warning that matters.
		panelWithLang('en-GB');
		await screen.findByText(/Narrated by your voice model/i);
		expect(screen.queryByText(/This deck declares lang/i)).toBeNull();
	});

	it('warns even when the catalog is unreachable — the bake still uses that voice', async () => {
		listTtsCatalog.mockResolvedValue({ models: [], reachable: false });
		panelWithLang('es');
		await waitFor(() => expect(document.body.textContent ?? '').toMatch(/cost unknown until the catalog is reachable/i));
		expect(warningNodes().visible, 'READABLE, not just announced').toHaveLength(1);
	});
});

// THE KEYLESS AUTHOR WITH ONLY THE ON-DEVICE VOICE — the free path to a narrated export, and the
// one #2423's follow-up recorded as unreachable (record: engineering/decisions/
// 2026-08-04-shared-deck-narration-audio.md §10). Two
// defects, both found by driving the real panel with a real Kokoro load:
//
//  1. Availability was read ONCE, at mount. The Workspace does not cancel a Kokoro download when
//     it closes, so an author who opened Share while the ~80 MB load ran saw the audio switch
//     stay disabled after the voice was ready — for as long as the panel stayed open.
//  2. With the device voice chosen, the bill still spoke cloud: "this model publishes no price",
//     "this export bills the whole deck", "Connect OpenRouter … to synthesize". The export
//     succeeded; the panel told the author it would not.
describe('the on-device narrator with no cloud key', () => {
	const DEVICE = { rung: 'kokoro' as const, model: 'hexgrad/kokoro-82m', voice: 'af_sky', speed: 1 };
	const KEYLESS = { rung: 'silent', openRouterReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false };
	const OFF = { captions: false, audio: false, voice: VOICE, allowPartial: false };

	beforeEach(() => {
		listTtsCatalog.mockResolvedValue({ models: [], reachable: false });
		onDeviceBakeVoice.mockResolvedValue(DEVICE);
		defaultBakeVoice.mockResolvedValue(DEVICE); // the voice model is Kokoro on this device
	});

	it('offers audio once the voice finishes loading WHILE the panel is open, and selects it', async () => {
		voiceAvailability.mockResolvedValue({ ...KEYLESS, kokoroReady: false });
		const emitted = statefulPanel(OFF);
		const audio = await screen.findByLabelText('Include narration audio');
		// Settled on "nothing can speak": no key and no loaded voice.
		await waitFor(() => expect(voiceAvailability).toHaveBeenCalled());
		await waitFor(() => expect((audio as HTMLButtonElement).disabled).toBe(true));
		// The load completes elsewhere; voice-model's loadKokoro emits this event.
		voiceAvailability.mockResolvedValue({ ...KEYLESS, rung: 'kokoro', kokoroReady: true, kokoroCached: true });
		await act(async () => { window.dispatchEvent(new Event('db-voice-changed')); });
		await waitFor(() => expect((screen.getByLabelText('Include narration audio') as HTMLButtonElement).disabled).toBe(false));
		await act(async () => { (screen.getByLabelText('Include narration audio') as HTMLButtonElement).click(); });
		const last = emitted[emitted.length - 1];
		expect(last.audio).toBe(true);
		expect(last.voice.rung, 'the narrator is the voice selection, Kokoro').toBe('kokoro');
		expect(last.voice.voice).toBe('af_sky');
	});

	it('quotes the device voice as free, and never asks for OpenRouter', async () => {
		voiceAvailability.mockResolvedValue({ ...KEYLESS, rung: 'kokoro', kokoroReady: true, kokoroCached: true });
		statefulPanel(OFF);
		const audio = await screen.findByLabelText('Include narration audio');
		await waitFor(() => expect((audio as HTMLButtonElement).disabled).toBe(false));
		await act(async () => { (audio as HTMLButtonElement).click(); });
		await screen.findByText(/To synthesize/i);
		const copy = (document.body.textContent ?? '').replace(/\s+/g, ' ');
		expect(copy, 'the narrator is named').toMatch(/Narrated by your voice model, Sky · Kokoro · This device/);
		expect(copy).toMatch(/4 sentences · free, on this device/);
		expect(copy, 'a cloud price line under a free voice').not.toMatch(/publishes no price|cost unknown/i);
		expect(copy, 'a cloud bill under a free voice').not.toMatch(/bills the whole deck/i);
		expect(copy, 'reads as a refusal of the path that works').not.toMatch(/Connect OpenRouter/i);
	});

	it('stops listening when it unmounts', async () => {
		voiceAvailability.mockResolvedValue({ ...KEYLESS, kokoroReady: false });
		const { unmount } = render(<NarrationExportOptions source={'# One\n\nA sentence.\n'} project={async () => ['A sentence.']} value={OFF} onChange={() => {}} />);
		await waitFor(() => expect(voiceAvailability).toHaveBeenCalledTimes(1));
		unmount();
		window.dispatchEvent(new Event('db-voice-changed'));
		window.dispatchEvent(new Event('db-model-changed'));
		expect(voiceAvailability).toHaveBeenCalledTimes(1);
	});
});

// A switch that is ON must stay operable when availability drops under it. The panel re-reads
// availability while open (#2446), so a key disconnecting with a cloud voice chosen used to
// disable the audio switch in its CHECKED state: the author could not opt out of an export
// that would now refuse. Record: engineering/decisions/2026-08-04-shared-deck-narration-audio.md §10.
describe('availability dropping under a switch that is on', () => {
	it('leaves the audio switch operable, so the author can turn it off', async () => {
		listTtsCatalog.mockResolvedValue({ models: [], reachable: true });
		voiceAvailability.mockResolvedValue({ rung: 'openrouter-tts', openRouterReady: true, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false });
		const emitted = statefulPanel({ captions: true, audio: true, voice: VOICE, allowPartial: false });
		await waitFor(() => expect(voiceAvailability).toHaveBeenCalled());
		// The key disconnects elsewhere; architect-model emits this.
		voiceAvailability.mockResolvedValue({ rung: 'silent', openRouterReady: false, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false });
		await act(async () => { window.dispatchEvent(new Event('db-model-changed')); });
		await waitFor(() => expect(document.body.textContent ?? '').toMatch(/Your voice model cannot speak right now/));
		const audio = screen.getByLabelText('Include narration audio') as HTMLButtonElement;
		expect(audio.disabled, 'a checked switch the author cannot turn off').toBe(false);
		await act(async () => { audio.click(); });
		expect(emitted[emitted.length - 1].audio).toBe(false);
		// And once off, it cannot be turned back on — nothing can speak.
		await waitFor(() => expect((screen.getByLabelText('Include narration audio') as HTMLButtonElement).disabled).toBe(true));
	});
});
