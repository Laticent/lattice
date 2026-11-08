import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readVoiceSelection, selectVoice } from '@/lib/model-selection.js';
import { notify as notifyModule } from '@/lib/notify';
import type { ArchitectStatus } from './architect';
import * as readAloud from './read-aloud';
import { loadSettings } from './studio-store';
import { WorkspaceSheet } from './WorkspaceSheet';

vi.mock('@/lib/notify', async (orig) => ({ ...(await orig<object>()), notify: vi.fn() }));

// G6 — the Workspace AI tab (Model + Spend sections) against a CONNECTED (mocked)
// OpenRouter account. No live model is ever touched: listStudioModels/setStudioModel and
// the account figures are all mock spies (the Architect-test pattern — CI spends $0).

const CATALOG = [
	{ id: 'anthropic/claude-sonnet-4', name: 'Anthropic: Claude Sonnet 4', promptPerM: 3, completionPerM: 15, contextLength: 1_000_000, maxOutput: null, vision: true },
	{ id: 'anthropic/claude-3.5-haiku', name: 'Anthropic: Claude 3.5 Haiku', promptPerM: 0.8, completionPerM: 4, contextLength: 200_000, maxOutput: null, vision: false },
	{ id: 'deepseek/deepseek-r1', name: 'DeepSeek: R1', promptPerM: 0.7, completionPerM: 2.5, contextLength: 164_000, maxOutput: null, vision: false },
	{ id: 'google/gemma-free', name: 'Google: Gemma (free)', promptPerM: 0, completionPerM: 0, contextLength: 262_000, maxOutput: null, vision: true },
];

const connectedStatus: ArchitectStatus = {
	ready: true,
	generation: 'openrouter',
	modelName: 'Claude Sonnet 4',
	modelId: 'anthropic/claude-sonnet-4',
	remaining: 3.5,
	usage: 0.5,
	limit: 4,
	usageMonthly: 0.5,
	limitReset: 'monthly',
	wallet: { credits: 10, usage: 1.93, balance: 8.07 },
	price: { promptPerM: 3, completionPerM: 15 },
	keySettingsUrl: 'https://openrouter.ai/settings/keys',
	promptApi: 'unavailable',
	webgpu: false,
	webllmReady: false,
	universalReady: false,
	openRouterReady: true,
	openRouterKeyInvalid: false,
	readiness: { state: 'ready', source: 'cloud', provider: 'openrouter', model: 'anthropic/claude-sonnet-4' },
};
const deviceReadiness = (provider: string, state: 'ready' | 'unavailable' | 'warming' = 'ready') => ({ state, source: 'device' as const, provider, model: provider });

const setModelSpy = vi.hoisted(() => vi.fn(async () => {}));
const setTierSpy = vi.hoisted(() => vi.fn(async () => {}));
const loadUniversalSpy = vi.hoisted(() => vi.fn(async () => true));
const statusSpy = vi.hoisted(() => vi.fn(() => connectedStatus));
const spendSpy = vi.hoisted(() => vi.fn(() => ({ total: 0, session: 0.032, totalTokens: 0, sessionTokens: 9800, cap: 0, mode: 'alert', status: { level: 'ok', blocked: false, message: null } })));

vi.mock('./api-key', () => {
	const refuse = vi.fn(async () => ({ ok: false, note: 'OpenRouter rejected this key.' }));
	return { saveOpenRouterKey: refuse, saveProviderKey: refuse, disconnectAllProviders: vi.fn(), removeProviderKey: vi.fn(), switchProvider: vi.fn() };
});

vi.mock('./architect', () => ({
	useArchitectStatus: statusSpy,
	architectSpend: spendSpy,
	connectOpenRouter: vi.fn(),
	disconnectOpenRouter: vi.fn(),
	setBudget: vi.fn(),
	listStudioModels: vi.fn(async () => CATALOG),
	listRouteModels: vi.fn(async () => CATALOG),
	currentStudioModel: vi.fn(async () => 'anthropic/claude-sonnet-4'),
	setStudioModel: setModelSpy,
	setStudioTier: setTierSpy,
	summonWebLLM: vi.fn(async () => false),
	loadUniversalModel: loadUniversalSpy,
	architectAccount: vi.fn(async () => ({ usage: 0.5, limit: 4, remaining: 3.5 })),
}));

const TTS_CATALOG = [
	{ id: 'hexgrad/kokoro-82m', name: 'Kokoro 82M', promptPerM: 0.62, completionPerM: 0, voices: ['af_heart', 'af_bella', 'am_adam'] },
	{ id: 'openai/tts-1', name: 'OpenAI: TTS-1', promptPerM: 15, completionPerM: 0, voices: ['alloy', 'echo'] },
	{ id: 'x-ai/grok-voice-tts-1.0', name: 'xAI: Grok Voice TTS', promptPerM: 15, completionPerM: 0, voices: ['eve', 'ara', 'rex', 'sal', 'leo'] },
];
const voiceAvailSpy = vi.hoisted(() =>
	vi.fn(() => ({ rung: 'openrouter-tts', openRouterReady: true, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false })),
);

vi.mock('./read-aloud', () => ({
	voiceAvailability: vi.fn(async () => voiceAvailSpy()),
	listTtsModels: vi.fn(async () => TTS_CATALOG),
	normalizeVoiceSelection: vi.fn(async () => false),
	ttsOrModel: vi.fn(async () => ''),
	setTtsOrModel: vi.fn(),
	ttsOrVoice: vi.fn(async () => ''),
	setTtsOrVoice: vi.fn(),
	ttsKokoroVoice: vi.fn(async () => ''),
	setTtsKokoroVoice: vi.fn(),
	ttsSpeed: vi.fn(async () => 1),
	setTtsSpeed: vi.fn(),
	loadTtsKokoro: vi.fn(async () => true),
	previewTtsVoice: vi.fn(async () => ({ ok: true })),
	stopTtsPreview: vi.fn(async () => {}),
}));

const noop = () => {};

// These tests start from a voice on OpenRouter, the old default. Since the routes redesign a fresh
// desktop migrates to Kokoro on this device (2026-11-08-studio-ai-routes-ux.md §4.1), so the record
// is seeded rather than migrated.
beforeEach(() => {
	if (!localStorage.getItem('lattice-studio-voice-selection')) localStorage.setItem('lattice-studio-voice-selection', JSON.stringify({ v: 1, source: 'cloud', provider: 'openrouter', model: '', voice: '', last: {} }));
});

afterEach(() => {
	vi.clearAllMocks();
	localStorage.removeItem('lattice-studio-voice-selection');
	statusSpy.mockReturnValue(connectedStatus);
	voiceAvailSpy.mockReturnValue({ rung: 'openrouter-tts', openRouterReady: true, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false });
});

function openSheet() {
	const user = userEvent.setup();
	render(<WorkspaceSheet open onOpenChange={noop} />);
	const sheet = within(screen.getByRole('dialog', { name: /Workspace/ }));
	return { user, sheet };
}

/** Open the Chat model chooser (the summary card's Change). */
async function openChat(user: ReturnType<typeof userEvent.setup>, sheet: ReturnType<typeof within>) {
	await user.click(within(await sheet.findByTestId('chat-model-card')).getByRole('button', { name: /Change/ }));
}
/** Open the Voice model chooser. */
async function openVoice(user: ReturnType<typeof userEvent.setup>, sheet: ReturnType<typeof within>) {
	await user.click(within(await sheet.findByTestId('voice-model-card')).getByRole('button', { name: /Change/ }));
}
/** Open the voice section's "More narration settings" (moved here from General). */
async function openNarration(user: ReturnType<typeof userEvent.setup>, sheet: ReturnType<typeof within>) {
	await user.click(await sheet.findByRole('button', { name: /More narration settings/ }));
}

describe('WorkspaceSheet — G6 model picker', () => {
	it('shows the Chat model card from the selection, and the curated picker inside Change', async () => {
		const { user, sheet } = openSheet();
		const card = await sheet.findByTestId('chat-model-card');
		expect(within(card).getByTestId('chat-model-card-name')).toHaveTextContent('Claude Sonnet 4');
		expect(within(card).getByTestId('chat-model-card-state')).toHaveTextContent('Ready');
		await openChat(user, sheet);
		expect(await sheet.findByText('OpenRouter model')).toBeInTheDocument();
		// The picker summary (a button) reads the active model + its meta line once
		// the catalog loads — distinct from the active-tier card above it.
		const summary = await sheet.findByRole('button', { name: /Claude Sonnet 4/ });
		expect(summary).toHaveTextContent('1M ctx · $3.00/M in · $15.00/M out');
	});

	it('expands to search + the four lenses and vendor-grouped rows', async () => {
		const { user, sheet } = openSheet();
		await openChat(user, sheet);
		await user.click(await sheet.findByRole('button', { name: /Claude Sonnet 4/ }));
		expect(await sheet.findByPlaceholderText(/Search 500\+ models/)).toBeInTheDocument();
		for (const lens of ['Featured', 'Value', 'Free', 'All']) {
			expect(sheet.getByRole('tab', { name: lens })).toBeInTheDocument();
		}
		// Featured → the Anthropic group header; DeepSeek (a Value pick) is filtered out.
		expect(sheet.getByText('anthropic')).toBeInTheDocument();
		expect(sheet.queryByText('R1')).not.toBeInTheDocument();
		// All → the full catalog, incl. the DeepSeek group + the Haiku row.
		await user.click(sheet.getByRole('tab', { name: 'All' }));
		expect(await sheet.findByText('deepseek')).toBeInTheDocument();
		expect(sheet.getByText('Claude 3.5 Haiku')).toBeInTheDocument();
	});

	it('Free lens shows only the $0 model; Value shows DeepSeek', async () => {
		const { user, sheet } = openSheet();
		await openChat(user, sheet);
		await user.click(await sheet.findByRole('button', { name: /Claude Sonnet 4/ }));
		await user.click(sheet.getByRole('tab', { name: 'Free' }));
		expect(await sheet.findByText('Gemma (free)')).toBeInTheDocument();
		expect(sheet.queryByText('R1')).not.toBeInTheDocument();
		await user.click(sheet.getByRole('tab', { name: 'Value' }));
		expect(await sheet.findByText('R1')).toBeInTheDocument();
	});

	it('selecting a model calls setStudioModel with its id', async () => {
		const { user, sheet } = openSheet();
		await openChat(user, sheet);
		await user.click(await sheet.findByRole('button', { name: /Claude Sonnet 4/ }));
		await user.click(sheet.getByRole('tab', { name: 'Value' }));
		await user.click(await sheet.findByText('R1'));
		expect(setModelSpy).toHaveBeenCalledWith('deepseek/deepseek-r1');
	});
});

describe('WorkspaceSheet — a rejected key', () => {
	it('a 401-marked key says so on the Chat model card and offers to sign in again', async () => {
		statusSpy.mockReturnValue({ ...connectedStatus, openRouterKeyInvalid: true });
		try {
			const { sheet } = openSheet();
			const card = await sheet.findByTestId('chat-model-card');
			expect(within(card).getByRole('alert')).toHaveTextContent('OpenRouter rejected the key');
			expect(within(card).getByRole('button', { name: 'Key rejected' })).toBeInTheDocument();
			expect(sheet.getByRole('button', { name: /Sign in with OpenRouter|Sign in again to OpenRouter/ })).toBeInTheDocument();
		} finally {
			statusSpy.mockReturnValue(connectedStatus);
		}
	});
	it('a rejected DIRECT key names its provider and points at replacing it, not an OAuth reconnect', async () => {
		statusSpy.mockReturnValue({ ...connectedStatus, provider: 'anthropic', openRouterKeyInvalid: true, wallet: null, readiness: { state: 'ready', source: 'cloud', provider: 'anthropic', model: 'claude-sonnet-5-5' } });
		try {
			const { sheet } = openSheet();
			const card = await sheet.findByTestId('chat-model-card');
			expect(within(card).getByRole('alert')).toHaveTextContent('Anthropic rejected the key (revoked or expired) — replace it below.');
			expect(sheet.queryByRole('button', { name: /Reconnect/ })).toBeNull();
		} finally {
			statusSpy.mockReturnValue(connectedStatus);
		}
	});
	it('Spend on a direct key: no balance, a billing link, and an estimate label', async () => {
		statusSpy.mockReturnValue({ ...connectedStatus, provider: 'openai', wallet: null, price: null });
		try {
			const { sheet } = openSheet();
			expect(await sheet.findByText('Balance not available for this provider')).toBeInTheDocument();
			expect(sheet.getByRole('link', { name: /OpenAI billing/ })).toHaveAttribute('href', expect.stringMatching(/platform\.openai\.com/));
			expect(sheet.getByText('This session · estimate')).toBeInTheDocument();
			expect(sheet.getByText(/no price, so its calls are not counted/)).toBeInTheDocument();
		} finally {
			statusSpy.mockReturnValue(connectedStatus);
		}
	});
});

describe('WorkspaceSheet — Providers & keys', () => {
	it('with no key: a password field and Check & save; a refusal is shown, not stored', async () => {
		statusSpy.mockReturnValue({ ...connectedStatus, openRouterReady: false });
		try {
			const { user, sheet } = openSheet();
			const field = sheet.getByLabelText('OpenRouter API key');
			expect(field).toHaveAttribute('type', 'password');
			await user.type(field, 'sk-or-v1-revoked');
			await user.click(sheet.getByRole('button', { name: 'Check & save' }));
			expect(await sheet.findByRole('alert')).toHaveTextContent('OpenRouter rejected this key.');
		} finally {
			statusSpy.mockReturnValue(connectedStatus);
		}
	});
	it('with a key: only its last four characters, plus Replace and Remove', async () => {
		localStorage.setItem('lattice-db-or-key', 'sk-or-v1-abcdefgh1a2b');
		try {
			const { sheet } = openSheet();
			expect(sheet.getByTestId('provider-row-openrouter')).toHaveTextContent(/Key …1a2b/);
			expect(sheet.queryByText(/abcdefgh/)).toBeNull();
			expect(sheet.getByRole('button', { name: 'Replace the OpenRouter key' })).toBeInTheDocument();
			expect(sheet.getByRole('button', { name: 'Remove the OpenRouter key' })).toBeInTheDocument();
		} finally {
			localStorage.removeItem('lattice-db-or-key');
		}
	});
});

describe('WorkspaceSheet — one row per provider', () => {
	it('lists OpenRouter, Gemini, Anthropic, OpenAI and On-device, each with its key status; Add opens that row\'s field', async () => {
		localStorage.setItem('lattice-db-or-key', 'sk-or-v1-abcdefgh1a2b');
		try {
			const { user, sheet } = openSheet();
			for (const id of ['openrouter', 'gemini', 'anthropic', 'openai', 'device']) expect(sheet.getByTestId(`provider-row-${id}`)).toBeInTheDocument();
			expect(sheet.getByTestId('provider-row-gemini')).toHaveTextContent('No key');
			expect(sheet.getByTestId('provider-row-device')).toHaveTextContent('free and private, no key');
			// A key is saved, so no field is open until one is asked for.
			expect(sheet.queryByLabelText('Gemini API key')).toBeNull();
			await user.click(sheet.getByRole('button', { name: 'Add a Gemini key' }));
			expect(sheet.getByLabelText('Gemini API key')).toHaveAttribute('type', 'password');
			expect(sheet.queryByLabelText('Anthropic API key')).toBeNull();
		} finally {
			localStorage.removeItem('lattice-db-or-key');
		}
	});
});

describe('WorkspaceSheet — on-device chat models', () => {
	it('lists the on-device models under Change; loading the universal tier confirms, then selects it', async () => {
		const { user, sheet } = openSheet();
		await openChat(user, sheet);
		await user.click(sheet.getByRole('radio', { name: /On-device/ }));
		expect(await sheet.findByText('Browser built-in')).toBeInTheDocument();
		expect(sheet.getByText('WebLLM')).toBeInTheDocument();
		expect(sheet.getByText(/Universal/)).toBeInTheDocument();
		// A large download asks to confirm first (no silent ~350MB fetch), then loads and selects it.
		await user.click(sheet.getByRole('button', { name: /Get ~350MB/ }));
		await user.click(await sheet.findByRole('button', { name: /Download ~350MB/ }));
		expect(loadUniversalSpy).toHaveBeenCalled();
		expect(setTierSpy).toHaveBeenCalledWith('universal');
	});

	it('the Source switch only filters the list; it selects nothing', async () => {
		const { user, sheet } = openSheet();
		await openChat(user, sheet);
		await user.click(sheet.getByRole('radio', { name: /On-device/ }));
		await user.click(sheet.getByRole('radio', { name: /Cloud/ }));
		expect(setTierSpy).not.toHaveBeenCalled();
	});

	it('a selected on-device model is the card, and its row says it is running', async () => {
		statusSpy.mockReturnValue({ ...connectedStatus, generation: 'universal', universalReady: true, readiness: deviceReadiness('universal') });
		const { user, sheet } = openSheet();
		const card = await sheet.findByTestId('chat-model-card');
		expect(within(card).getByTestId('chat-model-card-name')).toHaveTextContent('Qwen2.5 0.5B (Universal)');
		expect(within(card).getByText('On this device · free and private')).toBeInTheDocument();
		await openChat(user, sheet);
		expect(sheet.getByText('active')).toBeInTheDocument();
		expect(sheet.getByText('Running on this device')).toBeInTheDocument();
	});

	it('a selected on-device model that is not loaded says so, and never claims to run', async () => {
		statusSpy.mockReturnValue({ ...connectedStatus, generation: 'floor', readiness: deviceReadiness('webllm', 'unavailable') });
		const { sheet } = openSheet();
		expect(within(await sheet.findByTestId('chat-model-card')).getByTestId('chat-model-card-state')).toHaveTextContent('Not loaded');
	});

	it('a new user with no key reads needs-key, actionable in place', async () => {
		statusSpy.mockReturnValue({ ...connectedStatus, openRouterReady: false, generation: 'floor', readiness: { state: 'needs-key', source: 'cloud', provider: 'openrouter', model: '' } });
		const { sheet } = openSheet();
		const card = await sheet.findByTestId('chat-model-card');
		expect(within(card).getByText('Add a key or choose on-device')).toBeInTheDocument();
		expect(within(card).getByRole('button', { name: 'Add a key' })).toBeInTheDocument();
	});
});

describe('WorkspaceSheet — spend (layered budget)', () => {
	it('shows the four labeled layers: wallet balance, this key, this session, your cap', async () => {
		const { sheet } = openSheet();
		// Spend is a section of the default AI tab now — no tab click needed.
		// 1 · Wallet — the real /credits balance as the hero (8.07 = 10 − 1.93).
		expect(await sheet.findByText('Wallet · OpenRouter')).toBeInTheDocument();
		expect(sheet.getByText('$8.07')).toBeInTheDocument();
		expect(sheet.getByText(/left of \$10\.00/)).toBeInTheDocument();
		// 2 · This key — the per-key limit (server-enforced) with remaining. Scope the
		// remaining figure to this row: the Model section's cloud card shows the same
		// "$3.50 left" glance, so an unscoped query would now match both.
		expect(sheet.getByText('This key · Lattice Studio')).toBeInTheDocument();
		const keyRow = within(sheet.getByText('This key · Lattice Studio').closest('div') as HTMLElement);
		expect(keyRow.getByText(/\$3\.50 left/)).toBeInTheDocument();
		expect(sheet.getByText(/resets monthly/)).toBeInTheDocument();
		// 3 · This session — the live local tally + tokens.
		expect(sheet.getByText('This session')).toBeInTheDocument();
		expect(sheet.getByText('$0.032')).toBeInTheDocument();
		expect(sheet.getByText(/9\.8K tokens/)).toBeInTheDocument();
		// 4 · Your cap — the client defense-in-depth control.
		expect(sheet.getByText('Your cap')).toBeInTheDocument();
		// Active model price is shown (no silent billing). Scope to the Spend "Active
		// model" row — the Model section's picker summary carries the same price string.
		const priceRow = within(sheet.getByText(/Active model ·/).closest('div') as HTMLElement);
		expect(priceRow.getByText(/\$3\.00\/M in · \$15\.00\/M out/)).toBeInTheDocument();
	});

	it('with no per-key limit, links to the OpenRouter dashboard to set a hard cap', async () => {
		statusSpy.mockReturnValue({ ...connectedStatus, limit: null, remaining: null });
		const { sheet } = openSheet();
		const link = await sheet.findByRole('link', { name: /Set a hard cap/ });
		expect(link).toHaveAttribute('href', 'https://openrouter.ai/settings/keys');
	});
});

describe('WorkspaceSheet — cloud/on-device config split (2026-07-09)', () => {
	it('Spend follows the ACTIVE chat selection: the layered budget on cloud, a free note on-device', async () => {
		const first = openSheet();
		expect(await first.sheet.findByText('Wallet · OpenRouter')).toBeInTheDocument();
		expect(first.sheet.getByText('Your cap')).toBeInTheDocument();
		// Browsing the on-device list changes nothing about money.
		await openChat(first.user, first.sheet);
		await first.user.click(first.sheet.getByRole('radio', { name: /On-device/ }));
		expect(first.sheet.getByText('Wallet · OpenRouter')).toBeInTheDocument();
	});

	it('Spend and instructions switch to the on-device versions only when on-device is SELECTED', async () => {
		statusSpy.mockReturnValue({ ...connectedStatus, generation: 'universal', universalReady: true, readiness: deviceReadiness('universal') });
		const { sheet } = openSheet();
		expect(sheet.queryByText('Wallet · OpenRouter')).not.toBeInTheDocument();
		expect(sheet.queryByText('Your cap')).not.toBeInTheDocument();
		expect(sheet.getByText(/runs free/)).toBeInTheDocument();
		const odField = await sheet.findByLabelText('On-device standing instructions');
		expect(odField).toHaveAttribute('maxlength', '300');
		expect(sheet.queryByLabelText('Standing instructions')).not.toBeInTheDocument();
	});

	// Model spine: the voice is its own selection. LOOKING at the chat's On-device tab must not
	// change the voice panel (the old `TtsSettings tier={sideView}` coupling).
	it('keeps the Voice model independent of the chat chooser', async () => {
		const { user, sheet } = openSheet();
		expect(await sheet.findByText('Voice model')).toBeInTheDocument();
		await openVoice(user, sheet);
		expect(await sheet.findByRole('combobox', { name: 'Cloud TTS voice' })).toBeInTheDocument();
		await openChat(user, sheet);
		await user.click(within(sheet.getByRole('group', { name: 'Chat model source' })).getByRole('radio', { name: /On-device/ }));
		expect(sheet.getByRole('combobox', { name: 'Cloud TTS voice' })).toBeInTheDocument();
		expect(sheet.queryByRole('combobox', { name: 'On-device TTS voice' })).not.toBeInTheDocument();
		expect(readVoiceSelection().provider).toBe('openrouter');
	});

	it('choosing the voice engine selects it, active at once', async () => {
		const { user, sheet } = openSheet();
		await openVoice(user, sheet);
		await user.click(within(sheet.getByRole('group', { name: 'Voice engine' })).getByRole('radio', { name: 'On-device' }));
		expect(readVoiceSelection()).toMatchObject({ source: 'device', provider: 'kokoro' });
		expect(await sheet.findByRole('combobox', { name: 'On-device TTS voice' })).toBeInTheDocument();
	});

	// A voice id stored under an older casing (Grok's "Eve" -> "eve") is shown as the live roster's
	// id at once, and the panel asks for the stored id to be normalized (a correction, not a pick:
	// see read-aloud.normalize-voice.test.ts), so storage, the UI and synthesis agree.
	it('shows a stale (pre-migration-casing) stored voice id as the live roster id and normalizes storage', async () => {
		voiceAvailSpy.mockReturnValue({ rung: 'openrouter-tts', openRouterReady: true, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false });
		selectVoice({ provider: 'openrouter', model: 'x-ai/grok-voice-tts-1.0', voice: 'Eve' });
		const { user, sheet } = openSheet();
		await openVoice(user, sheet);
		const picker = await sheet.findByRole('combobox', { name: 'Cloud TTS voice' });
		await waitFor(() => expect(picker).toHaveTextContent('Eve'));
		await waitFor(() => expect(readAloud.normalizeVoiceSelection).toHaveBeenCalledWith(TTS_CATALOG));
		expect(readAloud.setTtsOrVoice).not.toHaveBeenCalled(); // not a pick
	});

	it('cloud TTS voice is a model-specific dropdown (not free text) once a model is set', async () => {
		voiceAvailSpy.mockReturnValue({ rung: 'openrouter-tts', openRouterReady: true, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false });
		const { user, sheet } = openSheet();
		await openVoice(user, sheet);
		const picker = await sheet.findByRole('combobox', { name: 'Cloud TTS voice' });
		expect(picker).toBeInTheDocument();
		expect(sheet.queryByPlaceholderText('af_heart')).not.toBeInTheDocument(); // the old free-text field is gone
	});

	// Drives the REAL combobox (shadcn Command + Popover) through the sheet — the
	// grouping/gender/search/select interaction the pure groupVoices tests can't
	// see. A Kokoro roster with NON-featured voices across two languages so a
	// language group (not just ★ Featured) actually renders. The Popover content
	// portals to document.body, so query it via `screen`, not the dialog scope.
	it('the cloud voice combobox groups by language, badges gender, filters on search, and selects', async () => {
		voiceAvailSpy.mockReturnValue({ rung: 'openrouter-tts', openRouterReady: true, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false });
		selectVoice({ provider: 'openrouter', model: 'hexgrad/kokoro-82m' });
		selectVoice({ provider: 'openrouter', voice: 'af_heart' });
		vi.mocked(readAloud.listTtsModels).mockResolvedValueOnce([
			// af_sky / am_onyx (US) and jf_alpha (JP) are NOT in kokoro's featuredVoices → real language groups.
			{ id: 'hexgrad/kokoro-82m', name: 'Kokoro 82M', promptPerM: 0.62, completionPerM: 0, voices: ['af_heart', 'af_sky', 'am_onyx', 'jf_alpha'] },
		]);
		const user = userEvent.setup();
		render(<WorkspaceSheet open onOpenChange={noop} />);
		const sheet = within(screen.getByRole('dialog', { name: /Workspace/ }));
		await openVoice(user, sheet);
		await user.click(await sheet.findByRole('combobox', { name: 'Cloud TTS voice' }));

		// ★ Featured (Heart) on top, then real language groups (US English, Japanese).
		expect(await screen.findByText('★ Featured')).toBeInTheDocument();
		expect(screen.getByText('US English')).toBeInTheDocument();
		expect(screen.getByText('Japanese')).toBeInTheDocument();
		// Gender badges are present and derived (Sky ♀ = female, Onyx ♂ = male).
		expect(screen.getAllByRole('img', { name: 'Female' }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole('img', { name: 'Male' }).length).toBeGreaterThan(0);

		// Search filters — and it matches the LANGUAGE name (folded into each row's
		// search value), not just the voice name: "japanese" keeps only the JP row.
		await user.type(screen.getByPlaceholderText('Search voices…'), 'japanese');
		await waitFor(() => expect(screen.queryByRole('option', { name: /Sky/ })).not.toBeInTheDocument());
		const jpRow = screen.getByRole('option', { name: /Alpha/ });
		expect(jpRow).toBeInTheDocument();

		// Selecting a row persists the id and closes the popover.
		await user.click(jpRow);
		expect(readAloud.setTtsOrVoice).toHaveBeenCalledWith('jf_alpha');
		await waitFor(() => expect(screen.queryByText('★ Featured')).not.toBeInTheDocument());
	});

	it('the ▶ on a voice row auditions it WITHOUT selecting it or closing the list', async () => {
		voiceAvailSpy.mockReturnValue({ rung: 'openrouter-tts', openRouterReady: true, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false });
		selectVoice({ provider: 'openrouter', model: 'hexgrad/kokoro-82m' });
		selectVoice({ provider: 'openrouter', voice: 'af_heart' });
		vi.mocked(readAloud.listTtsModels).mockResolvedValueOnce([
			{ id: 'hexgrad/kokoro-82m', name: 'Kokoro 82M', promptPerM: 0.62, completionPerM: 0, voices: ['af_heart', 'am_onyx'] },
		]);
		const user = userEvent.setup();
		render(<WorkspaceSheet open onOpenChange={noop} />);
		const sheet = within(screen.getByRole('dialog', { name: /Workspace/ }));
		await openVoice(user, sheet);
		await user.click(await sheet.findByRole('combobox', { name: 'Cloud TTS voice' }));
		await screen.findByText('★ Featured');

		// Click the ▶ on a NON-selected voice's row.
		await user.click(screen.getByRole('button', { name: /Preview Onyx/ }));
		// It auditions that exact voice…
		await waitFor(() => expect(readAloud.previewTtsVoice).toHaveBeenCalledWith(expect.objectContaining({ voice: 'am_onyx' })));
		// …but does NOT persist it as the selection, and the list stays open (unlike clicking the row).
		expect(readAloud.setTtsOrVoice).not.toHaveBeenCalledWith('am_onyx');
		expect(screen.getByText('★ Featured')).toBeInTheDocument();
	});

	// Independent-checker finding (2026-07-11): every OTHER slider-presence
	// assertion in this file exercises only the DEFAULT model (Kokoro,
	// speedSupport:true) — nothing rendered the Speed section for a model whose
	// speed param is verified to do nothing, so a regression that always shows
	// the slider (or crashes SpeedSection for an unsupported model) would pass
	// CI untouched. See tts-voice-catalog.test.ts for speedSupported() itself.
	it('renders NO speed slider — just a fixed-pace note — for a model that does not support speed', async () => {
		voiceAvailSpy.mockReturnValue({ rung: 'openrouter-tts', openRouterReady: true, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false });
		selectVoice({ provider: 'openrouter', model: 'x-ai/grok-voice-tts-1.0' }); // speedSupport:false
		const { user, sheet } = openSheet();
		await openVoice(user, sheet);
		await sheet.findByRole('combobox', { name: 'Cloud TTS voice' });
		expect(sheet.queryByRole('slider', { name: 'Speech speed' })).not.toBeInTheDocument();
		expect(sheet.getByText(/doesn't support adjustable speed/i)).toBeInTheDocument();
	});

	it('renders a real, enabled speed slider for a model that DOES support speed', async () => {
		voiceAvailSpy.mockReturnValue({ rung: 'openrouter-tts', openRouterReady: true, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false });
		selectVoice({ provider: 'openrouter', model: 'hexgrad/kokoro-82m' }); // speedSupport:true
		const { user, sheet } = openSheet();
		await openVoice(user, sheet);
		await sheet.findByRole('combobox', { name: 'Cloud TTS voice' });
		expect(sheet.getByRole('slider', { name: 'Speech speed' })).toBeEnabled();
		expect(sheet.queryByText(/doesn't support adjustable speed/i)).not.toBeInTheDocument();
	});

	it('disables the cloud TTS model/voice/speed/preview controls until OpenRouter is connected', async () => {
		voiceAvailSpy.mockReturnValue({ rung: 'silent', openRouterReady: false, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false });
		const { user, sheet } = openSheet();
		await openVoice(user, sheet);
		expect(await sheet.findByRole('button', { name: 'Cloud TTS model' })).toBeDisabled();
		expect(sheet.getByRole('combobox', { name: 'Cloud TTS voice' })).toBeDisabled();
		expect(sheet.getByRole('slider', { name: 'Speech speed' })).toBeDisabled();
		expect(sheet.getByRole('button', { name: /Play sample/ })).toBeDisabled();
		expect(sheet.getByText(/Connect OpenRouter above to configure the cloud voice/)).toBeInTheDocument();
	});

	it('disables the on-device TTS voice/speed/preview controls until the on-device voice is loaded', async () => {
		const { user, sheet } = openSheet();
		await openVoice(user, sheet);
		await user.click(within(sheet.getByRole('group', { name: 'Voice engine' })).getByRole('radio', { name: 'On-device' }));
		expect(await sheet.findByRole('combobox', { name: 'On-device TTS voice' })).toBeDisabled();
		expect(sheet.getByRole('slider', { name: 'Speech speed' })).toBeDisabled();
		expect(sheet.getByRole('button', { name: /Play sample/ })).toBeDisabled();
		expect(sheet.getByText(/Download the voice above to configure it/)).toBeInTheDocument();
	});

	// Red-team finding: TtsSettings fetched availability ONCE on mount and never
	// re-checked it, so clicking Disconnect elsewhere in the SAME open sheet left
	// the TTS controls enabled against a dead connection — a live contradiction
	// with the Model/Spend sections, which do re-render on the same event.
	it('re-disables the cloud TTS controls live when OpenRouter disconnects mid-session (db-model-changed)', async () => {
		voiceAvailSpy.mockReturnValue({ rung: 'openrouter-tts', openRouterReady: true, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false });
		const { user, sheet } = openSheet();
		await openVoice(user, sheet);
		expect(await sheet.findByRole('button', { name: 'Cloud TTS model' })).not.toBeDisabled();

		voiceAvailSpy.mockReturnValue({ rung: 'silent', openRouterReady: false, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false });
		window.dispatchEvent(new Event('db-model-changed'));

		await waitFor(() => expect(sheet.getByRole('button', { name: 'Cloud TTS model' })).toBeDisabled());
	});

	it('enables the on-device TTS controls once Kokoro is ready', async () => {
		voiceAvailSpy.mockReturnValue({ rung: 'kokoro', openRouterReady: true, kokoroReady: true, kokoroCached: true, kokoroSupported: true, webgpu: false, speechAllowed: false });
		const { user, sheet } = openSheet();
		await openVoice(user, sheet);
		await user.click(within(sheet.getByRole('group', { name: 'Voice engine' })).getByRole('radio', { name: 'On-device' }));
		expect(await sheet.findByRole('combobox', { name: 'On-device TTS voice' })).not.toBeDisabled();
		expect(sheet.getByRole('slider', { name: 'Speech speed' })).not.toBeDisabled();
		expect(sheet.getByRole('button', { name: /Play sample/ })).not.toBeDisabled();
	});
});

describe('WorkspaceSheet — Data tab backup & restore', () => {
	it('shows the backup group with ownership copy, both controls, and the last-backup line', async () => {
		const { user, sheet } = openSheet();
		await user.click(sheet.getByRole('tab', { name: 'Data' }));
		expect(sheet.getByText('Backup & restore')).toBeInTheDocument();
		// Ownership framing, not alarm.
		expect(sheet.getByText(/Your decks live in this browser/)).toBeInTheDocument();
		expect(sheet.getByRole('button', { name: /Download backup/ })).toBeInTheDocument();
		expect(sheet.getByRole('button', { name: /Restore backup/ })).toBeInTheDocument();
		expect(sheet.getByText(/Last backup: never/)).toBeInTheDocument();
		// The restore input only takes zips.
		expect(sheet.getByLabelText('Restore a workspace backup')).toHaveAttribute('accept', '.zip');
	});

	it('downloading a backup stamps the last-backup line and toasts', async () => {
		const notify = vi.mocked(notifyModule);
			notify.mockClear();
		const user = userEvent.setup();
		render(<WorkspaceSheet open onOpenChange={noop} />);
		const sheet = within(screen.getByRole('dialog', { name: /Workspace/ }));
		await user.click(sheet.getByRole('tab', { name: 'Data' }));
		await user.click(sheet.getByRole('button', { name: /Download backup/ }));
		expect(await sheet.findByText(/Last backup: (?!never)/)).toBeInTheDocument();
		expect(notify).toHaveBeenCalledWith(expect.stringMatching(/Backup downloaded/));
	});
});

describe('WorkspaceSheet — General tab install group', () => {
	it('shows the install group; jsdom (no prompt, not iOS) gets the browser-menu fallback', async () => {
		const { user, sheet } = openSheet();
		await user.click(sheet.getByRole('tab', { name: 'General' }));
		expect(sheet.getByText('Install the app')).toBeInTheDocument();
		expect(sheet.getByText(/installs from its own menu/)).toBeInTheDocument();
	});

	it('with a parked Chromium prompt, the real Install button shows and drives it', async () => {
		(window as Window & { __latticeInstallPrompt?: unknown }).__latticeInstallPrompt = {
			prompt: vi.fn(async () => {}),
			userChoice: Promise.resolve({ outcome: 'accepted' }),
		};
		try {
			const notify = vi.mocked(notifyModule);
			notify.mockClear();
			const user = userEvent.setup();
			render(<WorkspaceSheet open onOpenChange={noop} />);
			const sheet = within(screen.getByRole('dialog', { name: /Workspace/ }));
			await user.click(sheet.getByRole('tab', { name: 'General' }));
			await user.click(sheet.getByRole('button', { name: /Install app/ }));
			expect(await sheet.findByText(/Installed on this device/)).toBeInTheDocument();
			expect(notify).toHaveBeenCalledWith(expect.stringMatching(/Installed/));
		} finally {
			(window as Window & { __latticeInstallPrompt?: unknown }).__latticeInstallPrompt = null;
		}
	});
});

// #1286 — the starting posture used to be DERIVED only (first visit → Read) and
// then silently pinned by the first use of the header dial, so there was no way
// to state a preference. It is now an explicit workspace setting.
describe('WorkspaceSheet — General tab starting mode', () => {
	it('shows the three stops with Write preselected for a fresh workspace', async () => {
		const { user, sheet } = openSheet();
		await user.click(sheet.getByRole('tab', { name: 'General' }));
		expect(sheet.getByText('Starting mode')).toBeInTheDocument();
		expect(sheet.getByRole('radio', { name: /Write/ })).toBeChecked();
		expect(sheet.getByRole('radio', { name: /Read/ })).not.toBeChecked();
		expect(sheet.getByRole('radio', { name: /Craft/ })).not.toBeChecked();
	});

	it('picking a stop persists it, so the Studio opens there next time', async () => {
		const { user, sheet } = openSheet();
		await user.click(sheet.getByRole('tab', { name: 'General' }));
		await user.click(sheet.getByRole('radio', { name: /Read/ }));
		expect(loadSettings().posture).toBe('read');
		expect(sheet.getByRole('radio', { name: /Read/ })).toBeChecked();
	});
});

// Two cross-surface switches whose ONLY control used to live in the Drawing Board's
// settings panel. That panel died with its route, so until they landed here a user who
// had turned either off could never turn it back on — and for prompt caching that meant
// silently paying full input price on every turn, forever. Both write the same keys the
// old panel wrote (they are user data, and the names do not change).
describe('WorkspaceSheet — settings rehomed from the retired Drawing Board panel', () => {
	it('prompt caching: reflects the stored value and writes it back', async () => {
		localStorage.setItem('lattice-db-or-cache', 'off');
		const { user, sheet } = openSheet();
		const sw = sheet.getByRole('switch', { name: 'Reuse the cached prompt' });
		expect(sw).toHaveAttribute('aria-checked', 'false');
		await user.click(sw);
		expect(localStorage.getItem('lattice-db-or-cache')).toBe('on');
		await user.click(sw);
		expect(localStorage.getItem('lattice-db-or-cache')).toBe('off');
	});

	// Only Anthropic takes a cache breakpoint; OpenAI, Google, DeepSeek and x-ai cache on their own, so the switch does nothing there.
	for (const modelId of ['google/gemini-2.5-flash', 'openai/gpt-5', '~google/gemini-flash-latest']) {
		it(`prompt caching: disabled, with its reason, on ${modelId}`, () => {
			statusSpy.mockReturnValue({ ...connectedStatus, modelId });
			const { sheet } = openSheet();
			expect(sheet.getByRole('switch', { name: 'Reuse the cached prompt' })).toBeDisabled();
			expect(sheet.getByText(/caches on its own, so the setting has no effect on it/)).toBeInTheDocument();
		});
	}

	it('guided tours: reflects the stored value and writes it back', async () => {
		localStorage.setItem('lattice-tour-enabled', 'off');
		const { user, sheet } = openSheet();
		await user.click(sheet.getByRole('tab', { name: 'General' }));
		const sw = sheet.getByRole('switch', { name: 'Guided tours' });
		expect(sw).toHaveAttribute('aria-checked', 'false');
		await user.click(sw);
		expect(localStorage.getItem('lattice-tour-enabled')).not.toBe('off');
	});
});

// The three Present-narration controls (General → Narration in Present). These shipped with no
// test at all, and the independent checker found the cost: "Fetch ahead → The whole deck" ran its
// value through `Number(v)`, so 'all' became NaN and `setLookaheadPref` floored it to 0 — the
// SHALLOWEST window — while the toast promised "ready to present offline". A presenter arming the
// deck before a board meeting got the exact opposite of what the control said, and reopening the
// sheet showed "Off". The pure prefs module was already tested and already correct; the defect
// lived in the one line between the widget and it, which is why only a real interaction catches it.
describe('WorkspaceSheet — narration in Present', () => {
	// Moved from General → Narration in Present to AI → Voice model → More narration settings.
	async function openGeneral() {
		const { user, sheet } = openSheet();
		await openNarration(user, sheet);
		return { user, sheet };
	}
	// Radix Select renders its listbox in a portal, outside the dialog subtree.
	async function pick(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement, option: RegExp) {
		await user.click(trigger);
		await user.click(await screen.findByRole('option', { name: option }));
	}

	it('"The whole deck" stores the unbounded window, not zero', async () => {
		const { user, sheet } = await openGeneral();
		await pick(user, sheet.getByRole('combobox', { name: 'Fetch ahead' }), /The whole deck/);
		expect(localStorage.getItem('lattice-present-lookahead')).toBe('all');
	});

	it('a numeric depth and Automatic both round-trip through the same control', async () => {
		const { user, sheet } = await openGeneral();
		const trigger = sheet.getByRole('combobox', { name: 'Fetch ahead' });
		await pick(user, trigger, /^3 slides ahead$/);
		expect(localStorage.getItem('lattice-present-lookahead')).toBe('3');
		await pick(user, sheet.getByRole('combobox', { name: 'Fetch ahead' }), /Automatic/);
		expect(localStorage.getItem('lattice-present-lookahead')).toBe('auto');
	});

	it('the pace preset writes the name the cadence kernel reads', async () => {
		const { user, sheet } = await openGeneral();
		await pick(user, sheet.getByRole('combobox', { name: 'Pace' }), /Deliberate/);
		expect(localStorage.getItem('lattice-present-pace')).toBe('deliberate');
	});

	it('audio quality round-trips, and the recommended default is stored as absence', async () => {
		// The default is written as "no entry" rather than "64", so the recommended value can be
		// re-tuned later without every workspace that never touched the control being pinned to
		// the old number by a stale localStorage row.
		const { user, sheet } = await openGeneral();
		const trigger = sheet.getByRole('combobox', { name: 'Audio quality' });
		await pick(user, trigger, /128 kbps/);
		expect(localStorage.getItem('lattice-present-narration-bitrate')).toBe('128');
		await pick(user, sheet.getByRole('combobox', { name: 'Audio quality' }), /64 kbps/);
		expect(localStorage.getItem('lattice-present-narration-bitrate')).toBeNull();
	});

	it('keeping narration on the device is on by default and switches off', async () => {
		const { user, sheet } = await openGeneral();
		const sw = sheet.getByRole('switch', { name: 'Keep narration on this device' });
		expect(sw).toHaveAttribute('aria-checked', 'true');
		await user.click(sw);
		expect(localStorage.getItem('lattice-present-narration-cache')).toBe('0');
	});
});

// The Image reader (2026-11-08-studio-ai-routes-ux.md §2): same as chat by default, or a model of
// its own on a connected route, listing only models that read images.
describe('WorkspaceSheet — the image reader', () => {
	afterEach(() => {
		localStorage.removeItem('lattice-studio-image-selection');
		localStorage.removeItem('lattice-db-or-key');
	});

	it('reads "Same as chat" with the chat model and what uses it', async () => {
		const { sheet } = openSheet();
		const card = await sheet.findByTestId('image-reader-card');
		expect(within(card).getByTestId('image-reader-card-name')).toHaveTextContent('Same as chat · Claude Sonnet 4');
		expect(within(card).getByTestId('image-reader-card-state')).toHaveTextContent('Ready');
		expect(sheet.getByText(/Used by Library photo descriptions/)).toBeInTheDocument();
	});

	it('a model of its own lists only models that read images, and picking one stores it on that route', async () => {
		localStorage.setItem('lattice-db-or-key', 'sk-or-v1-abcdefgh1a2b');
		const { user, sheet } = openSheet();
		await user.click(within(await sheet.findByTestId('image-reader-card')).getByRole('button', { name: /Change/ }));
		await user.click(sheet.getByRole('radio', { name: 'A model of its own' }));
		await user.click(await sheet.findByRole('tab', { name: 'All' }));
		expect(await sheet.findByText('Gemma (free)')).toBeInTheDocument();
		expect(sheet.queryByText('Claude 3.5 Haiku'), 'a model that cannot read images is not offered').toBeNull();
		await user.click(sheet.getByText('Gemma (free)'));
		expect(JSON.parse(localStorage.getItem('lattice-studio-image-selection') ?? '{}')).toMatchObject({ mode: 'own', provider: 'openrouter', model: 'google/gemma-free' });
		expect(within(sheet.getByTestId('image-reader-card')).getByTestId('image-reader-card-name')).toHaveTextContent(/Gemma/);
	});

	it('says plainly when the chat model runs on this device and cannot read images', async () => {
		statusSpy.mockReturnValue({ ...connectedStatus, generation: 'webllm', readiness: deviceReadiness('webllm') });
		const { sheet } = openSheet();
		const card = await sheet.findByTestId('image-reader-card');
		expect(card).toHaveTextContent("can't read images");
	});
});

describe('WorkspaceSheet — Connections', () => {
	afterEach(() => localStorage.removeItem('lattice-db-or-key'));

	it('each row says what the route serves and what it is in use for; no row chooses a model', async () => {
		localStorage.setItem('lattice-db-or-key', 'sk-or-v1-abcdefgh1a2b');
		const { sheet } = openSheet();
		expect(await sheet.findByTestId('provider-row-openrouter-line')).toHaveTextContent('Chat · Image reader · Voice — Key …1a2b · in use for chat, the image reader (same as chat) and voice');
		expect(sheet.getByTestId('provider-row-anthropic-line')).toHaveTextContent('Chat · Image reader — No key');
		expect(sheet.queryByRole('button', { name: 'Use for chat' })).toBeNull();
	});
});

// Every card on a route whose key was refused says so, not only the chat card (owner report,
// 2026-11-08: chat read "Key rejected" while the image reader and voice on the same key read Ready).
describe('WorkspaceSheet — a rejected key shows on every card on its route', () => {
	afterEach(() => {
		localStorage.removeItem('lattice-db-or-key');
		localStorage.removeItem('lattice-db-or-key-invalid');
	});
	it('chat, the image reader and the voice all read Key rejected', async () => {
		localStorage.setItem('lattice-db-or-key', 'sk-or-v1-abcdefgh1a2b');
		localStorage.setItem('lattice-db-or-key-invalid', '1');
		statusSpy.mockReturnValue({ ...connectedStatus, openRouterKeyInvalid: true });
		const { sheet } = openSheet();
		for (const id of ['chat-model-card', 'image-reader-card', 'voice-model-card']) {
			await waitFor(() => expect(within(sheet.getByTestId(id)).getByTestId(`${id}-state`)).toHaveTextContent('Key rejected'));
		}
	});
});
