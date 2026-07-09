import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArchitectStatus } from './architect';
import { WorkspaceSheet } from './WorkspaceSheet';

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
};

const setModelSpy = vi.hoisted(() => vi.fn(async () => {}));
const setTierSpy = vi.hoisted(() => vi.fn(async () => {}));
const loadUniversalSpy = vi.hoisted(() => vi.fn(async () => true));
const statusSpy = vi.hoisted(() => vi.fn(() => connectedStatus));
const spendSpy = vi.hoisted(() => vi.fn(() => ({ total: 0, session: 0.032, totalTokens: 0, sessionTokens: 9800, cap: 0, mode: 'alert', status: { level: 'ok', blocked: false, message: null } })));

vi.mock('./architect', () => ({
	useArchitectStatus: statusSpy,
	architectSpend: spendSpy,
	connectOpenRouter: vi.fn(),
	disconnectOpenRouter: vi.fn(),
	setBudget: vi.fn(),
	listStudioModels: vi.fn(async () => CATALOG),
	currentStudioModel: vi.fn(async () => 'anthropic/claude-sonnet-4'),
	setStudioModel: setModelSpy,
	setStudioTier: setTierSpy,
	summonWebLLM: vi.fn(async () => false),
	loadUniversalModel: loadUniversalSpy,
	architectAccount: vi.fn(async () => ({ usage: 0.5, limit: 4, remaining: 3.5 })),
}));

const TTS_CATALOG = [
	{ id: 'hexgrad/kokoro-82m', name: 'Kokoro 82M' },
	{ id: 'openai/tts-1', name: 'OpenAI: TTS-1' },
];
const voiceAvailSpy = vi.hoisted(() =>
	vi.fn(() => ({ rung: 'openrouter-tts', openRouterReady: true, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false })),
);

vi.mock('./read-aloud', () => ({
	voiceAvailability: vi.fn(async () => voiceAvailSpy()),
	listTtsModels: vi.fn(async () => TTS_CATALOG),
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

afterEach(() => {
	vi.clearAllMocks();
	statusSpy.mockReturnValue(connectedStatus);
	voiceAvailSpy.mockReturnValue({ rung: 'openrouter-tts', openRouterReady: true, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false });
});

function openSheet() {
	const user = userEvent.setup();
	render(<WorkspaceSheet open onOpenChange={noop} notify={noop} />);
	const sheet = within(screen.getByRole('dialog', { name: /Workspace/ }));
	return { user, sheet };
}

describe('WorkspaceSheet — G6 model picker', () => {
	it('shows the curated picker with the connected model summary', async () => {
		const { sheet } = openSheet();
		expect(await sheet.findByText('OpenRouter model')).toBeInTheDocument();
		// The picker summary (a button) reads the active model + its meta line once
		// the catalog loads — distinct from the active-tier card above it.
		const summary = await sheet.findByRole('button', { name: /Claude Sonnet 4/ });
		expect(summary).toHaveTextContent('1M ctx · $3.00/M in · $15.00/M out');
	});

	it('expands to search + the four lenses and vendor-grouped rows', async () => {
		const { user, sheet } = openSheet();
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
		await user.click(await sheet.findByRole('button', { name: /Claude Sonnet 4/ }));
		await user.click(sheet.getByRole('tab', { name: 'Free' }));
		expect(await sheet.findByText('Gemma (free)')).toBeInTheDocument();
		expect(sheet.queryByText('R1')).not.toBeInTheDocument();
		await user.click(sheet.getByRole('tab', { name: 'Value' }));
		expect(await sheet.findByText('R1')).toBeInTheDocument();
	});

	it('selecting a model calls setStudioModel with its id', async () => {
		const { user, sheet } = openSheet();
		await user.click(await sheet.findByRole('button', { name: /Claude Sonnet 4/ }));
		await user.click(sheet.getByRole('tab', { name: 'Value' }));
		await user.click(await sheet.findByText('R1'));
		expect(setModelSpy).toHaveBeenCalledWith('deepseek/deepseek-r1');
	});
});

describe('WorkspaceSheet — G6 on-device tier', () => {
	it('switches to the on-device ladder; loading the universal tier confirms then activates it', async () => {
		const { user, sheet } = openSheet();
		await user.click(sheet.getByRole('tab', { name: 'On-device' }));
		expect(await sheet.findByText('Browser built-in')).toBeInTheDocument();
		expect(sheet.getByText('WebLLM')).toBeInTheDocument();
		expect(sheet.getByText(/Universal/)).toBeInTheDocument();
		// The cloud stays connected-but-dormant while the on-device pane is shown.
		expect(sheet.getByText(/connected, dormant/)).toBeInTheDocument();
		// A large download asks to confirm first (no silent ~350MB fetch), then loads
		// AND activates the tier (Policy B — a pick truly switches the active tier).
		await user.click(sheet.getByRole('button', { name: /Get ~350MB/ }));
		await user.click(await sheet.findByRole('button', { name: /Download ~350MB/ }));
		expect(loadUniversalSpy).toHaveBeenCalled();
		expect(setTierSpy).toHaveBeenCalledWith('universal');
	});

	it('the On-device button does not silently switch; "Use Cloud" resumes the cloud tier', async () => {
		const { user, sheet } = openSheet();
		await user.click(sheet.getByRole('tab', { name: 'On-device' }));
		await user.click(await sheet.findByRole('button', { name: 'Use Cloud' }));
		expect(setTierSpy).toHaveBeenCalledWith('auto');
	});

	it('when an on-device tier is the ACTIVE generation, the badge + helper reflect it (not a "loaded" flag)', () => {
		// generation is the normalized Studio value ('universal'); useArchitectStatus
		// maps the backend's 'transformers' name to this before the UI ever sees it.
		statusSpy.mockReturnValue({ ...connectedStatus, generation: 'universal', universalReady: true });
		const { sheet } = openSheet();
		// The active-tier helper agrees with the real active tier.
		expect(sheet.getByText(/On-device is active/)).toBeInTheDocument();
		// The Universal rung shows the live "active" badge + its running subtext.
		expect(sheet.getByText('active')).toBeInTheDocument();
		expect(sheet.getByText('Running on this device')).toBeInTheDocument();
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
	it('Spend shows the layered budget under Cloud; a free note (no cap control) under On-device', async () => {
		const { user, sheet } = openSheet();
		expect(await sheet.findByText('Wallet · OpenRouter')).toBeInTheDocument();
		expect(sheet.getByText('Your cap')).toBeInTheDocument();
		await user.click(sheet.getByRole('tab', { name: 'On-device' }));
		expect(sheet.queryByText('Wallet · OpenRouter')).not.toBeInTheDocument();
		expect(sheet.queryByText('Your cap')).not.toBeInTheDocument();
		expect(sheet.getByText(/runs free/)).toBeInTheDocument();
	});

	it('Standing instructions splits into a cloud field and a separate, capped on-device field', async () => {
		const { user, sheet } = openSheet();
		expect(await sheet.findByLabelText('Standing instructions')).toBeInTheDocument();
		expect(sheet.queryByLabelText('On-device standing instructions')).not.toBeInTheDocument();
		await user.click(sheet.getByRole('tab', { name: 'On-device' }));
		const odField = await sheet.findByLabelText('On-device standing instructions');
		expect(odField).toHaveAttribute('maxlength', '300');
		expect(sheet.queryByLabelText('Standing instructions')).not.toBeInTheDocument();
	});

	it('shows a Read-aloud voice section that relabels between cloud and on-device', async () => {
		const { user, sheet } = openSheet();
		expect(await sheet.findByText(/Read-aloud voice · cloud/)).toBeInTheDocument();
		await user.click(sheet.getByRole('tab', { name: 'On-device' }));
		expect(await sheet.findByText(/Read-aloud voice · on-device/)).toBeInTheDocument();
	});

	it('cloud TTS voice is a model-specific dropdown (not free text) once a model is set', async () => {
		voiceAvailSpy.mockReturnValue({ rung: 'openrouter-tts', openRouterReady: true, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false });
		const { sheet } = openSheet();
		const picker = await sheet.findByRole('combobox', { name: 'Cloud TTS voice' });
		expect(picker).toBeInTheDocument();
		expect(sheet.queryByPlaceholderText('af_heart')).not.toBeInTheDocument(); // the old free-text field is gone
	});

	it('disables the cloud TTS model/voice/speed/preview controls until OpenRouter is connected', async () => {
		voiceAvailSpy.mockReturnValue({ rung: 'silent', openRouterReady: false, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false });
		const { sheet } = openSheet();
		expect(await sheet.findByRole('combobox', { name: 'Cloud TTS model' })).toBeDisabled();
		expect(sheet.getByRole('combobox', { name: 'Cloud TTS voice' })).toBeDisabled();
		expect(sheet.getByRole('slider', { name: 'Speech speed' })).toBeDisabled();
		expect(sheet.getByRole('button', { name: /Play sample/ })).toBeDisabled();
		expect(sheet.getByText(/Connect OpenRouter above to configure the cloud voice/)).toBeInTheDocument();
	});

	it('disables the on-device TTS voice/speed/preview controls until the on-device voice is loaded', async () => {
		const { user, sheet } = openSheet();
		await user.click(sheet.getByRole('tab', { name: 'On-device' }));
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
		const { sheet } = openSheet();
		expect(await sheet.findByRole('combobox', { name: 'Cloud TTS model' })).not.toBeDisabled();

		voiceAvailSpy.mockReturnValue({ rung: 'silent', openRouterReady: false, kokoroReady: false, kokoroCached: false, kokoroSupported: true, webgpu: false, speechAllowed: false });
		window.dispatchEvent(new Event('db-model-changed'));

		await waitFor(() => expect(sheet.getByRole('combobox', { name: 'Cloud TTS model' })).toBeDisabled());
	});

	it('enables the on-device TTS controls once Kokoro is ready', async () => {
		voiceAvailSpy.mockReturnValue({ rung: 'kokoro', openRouterReady: true, kokoroReady: true, kokoroCached: true, kokoroSupported: true, webgpu: false, speechAllowed: false });
		const { user, sheet } = openSheet();
		await user.click(sheet.getByRole('tab', { name: 'On-device' }));
		expect(await sheet.findByRole('combobox', { name: 'On-device TTS voice' })).not.toBeDisabled();
		expect(sheet.getByRole('slider', { name: 'Speech speed' })).not.toBeDisabled();
		expect(sheet.getByRole('button', { name: /Play sample/ })).not.toBeDisabled();
	});
});

describe('WorkspaceSheet — General tab backup & restore', () => {
	it('shows the backup group with ownership copy, both controls, and the last-backup line', async () => {
		const { user, sheet } = openSheet();
		await user.click(sheet.getByRole('tab', { name: 'General' }));
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
		const notify = vi.fn();
		const user = userEvent.setup();
		render(<WorkspaceSheet open onOpenChange={noop} notify={notify} />);
		const sheet = within(screen.getByRole('dialog', { name: /Workspace/ }));
		await user.click(sheet.getByRole('tab', { name: 'General' }));
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
			const notify = vi.fn();
			const user = userEvent.setup();
			render(<WorkspaceSheet open onOpenChange={noop} notify={notify} />);
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
