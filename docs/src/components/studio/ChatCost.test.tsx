import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatCost, chipLabel, readableModelId } from './ChatCost';

// The chat header: one chip that names the model and opens the picker, and one session figure.

const setModel = vi.hoisted(() => vi.fn(async (_id: string) => {}));
const switchProvider = vi.hoisted(() => vi.fn((_p: string) => {}));
const setTier = vi.hoisted(() => vi.fn(async (_t: string) => {}));
const MODELS = [
	{ id: 'anthropic/claude-sonnet-5.5', name: 'Anthropic: Claude Sonnet 5.5', promptPerM: 3, completionPerM: 15, contextLength: 200000, vision: true },
	{ id: 'google/gemini-3-flash', name: 'Google: Gemini 3 Flash', promptPerM: 0.3, completionPerM: 2.5, contextLength: 1000000, vision: true },
];
vi.mock('./architect', () => ({
	useArchitectStatus: () => ({ ready: true, generation: 'openrouter', openRouterReady: true, modelId: 'anthropic/claude-sonnet-5.5', modelName: 'Claude Sonnet 5.5', price: { promptPerM: 3, completionPerM: 15 } }),
	architectSpend: () => ({ total: 6, session: 6.08, totalTokens: 0, sessionTokens: 0, cap: 10, mode: 'alert', status: { level: 'ok', blocked: false, message: null } }),
	agentTurnUsd: () => ({ question: 0.018, edit: 0.024 }),
	listStudioModels: async () => MODELS,
	setStudioModel: setModel,
	setStudioTier: setTier,
	architectModel: async () => ({ switchProvider }),
}));
vi.mock('@/lib/notify', () => ({ notify: () => {} }));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('ChatCost — the header chip', () => {
	it('names the model and shows ONE session figure, not two unlabeled numbers', () => {
		render(<ChatCost source="# One" />);
		expect(screen.getByRole('button', { name: /Model: .*Change model/ }).textContent).toContain('Claude Sonnet 5.5');
		expect(screen.getByText('$6.08')).toBeTruthy();
		// The per-turn range is inside the dropdown now, not in the header.
		expect(screen.queryByText(/0\.018/)).toBeNull();
	});

	it('opens to the price of a question and an edit, the session against its cap, and the model list', async () => {
		const user = userEvent.setup();
		render(<ChatCost source="# One" />);
		await user.click(screen.getByRole('button', { name: /Change model/ }));
		expect(await screen.findByText('≈ $0.018')).toBeTruthy();
		expect(screen.getByText('≈ $0.024')).toBeTruthy();
		expect(screen.getByText(/\$6\.08 of \$10\.00/)).toBeTruthy();
		await waitFor(() => expect(screen.getByLabelText('Search OpenRouter models')).toBeTruthy());
	});

	it('picking a model sets it and closes the dropdown', async () => {
		const user = userEvent.setup();
		render(<ChatCost source="# One" />);
		await user.click(screen.getByRole('button', { name: /Change model/ }));
		await user.click(await screen.findByRole('tab', { name: 'All' }));
		await user.click(await screen.findByRole('radio', { name: /Gemini 3 Flash/ }));
		expect(setModel).toHaveBeenCalledWith('google/gemini-3-flash');
		await waitFor(() => expect(screen.queryByLabelText('Search OpenRouter models')).toBeNull());
	});
});

describe('ChatCost — the chip reaches every source (model spine)', () => {
	afterEach(() => localStorage.clear());
	it('lists each provider holding a key plus On-device; a provider pick selects it, an engine pick selects that engine', async () => {
		localStorage.setItem('lattice-db-or-key', 'sk-or-v1-abcdefgh1a2b');
		localStorage.setItem('lattice-db-gemini-key', 'AIzaPlainTestKey000000000a1b2');
		const user = userEvent.setup();
		render(<ChatCost source="# One" />);
		await user.click(screen.getByRole('button', { name: /Change model/ }));
		const sources = screen.getByRole('radiogroup', { name: 'Chat source' });
		const names = [...sources.querySelectorAll('[role=radio]')].map((b) => b.textContent);
		expect(names).toEqual(['OpenRouter', 'Gemini', 'On-device']);
		await user.click(screen.getByRole('radio', { name: 'Gemini' }));
		await waitFor(() => expect(switchProvider).toHaveBeenCalledWith('gemini'));
		await user.click(screen.getByRole('radio', { name: 'On-device' }));
		expect(screen.getByRole('radio', { name: 'On-device' })).toHaveAttribute('aria-checked', 'true');
		expect(screen.getByRole('radio', { name: 'OpenRouter' })).toHaveAttribute('aria-checked', 'false');
		// The engines replace the cloud catalog: one list at a time.
		expect(screen.queryByLabelText('Search OpenRouter models')).toBeNull();
		await user.click(within(screen.getByRole('radiogroup', { name: 'On-device model' })).getByRole('radio', { name: /Universal/ }));
		expect(setTier).toHaveBeenCalledWith('universal');
	});
});

describe('ChatCost — reopening the chip', () => {
	it('shows the selected source again, not On-device browsed and left unpicked', async () => {
		localStorage.setItem('lattice-db-or-key', 'sk-or-v1-abcdefgh1a2b');
		const user = userEvent.setup();
		render(<ChatCost source="# One" />);
		await user.click(screen.getByRole('button', { name: /Change model/ }));
		await user.click(screen.getByRole('radio', { name: 'On-device' }));
		await user.keyboard('{Escape}');
		await user.click(screen.getByRole('button', { name: /Change model/ }));
		expect(screen.getByRole('radio', { name: 'OpenRouter' })).toHaveAttribute('aria-checked', 'true');
		expect(screen.queryByRole('radiogroup', { name: 'On-device model' })).toBeNull();
		localStorage.clear();
	});
});

describe('readableModelId', () => {
	it('turns an id into a name without the catalog', () => {
		expect(readableModelId('~anthropic/claude-sonnet-latest')).toBe('Claude Sonnet (latest)');
		expect(readableModelId('google/gemini-3-flash')).toBe('Gemini 3 Flash');
		expect(readableModelId('openai/gpt-5.1:free')).toBe('GPT 5.1 Free');
		expect(readableModelId(null)).toBe('Choose a model');
	});
});

// The chip names the SELECTED model — on-device included — or what the selection is waiting for.
describe('chipLabel (model spine)', () => {
	const base = { modelName: null, modelId: null, provider: 'openrouter' } as unknown as Parameters<typeof chipLabel>[0];
	it('names an on-device selection by its model', () => {
		expect(chipLabel({ ...base, readiness: { state: 'ready', source: 'device', provider: 'prompt-api', model: 'prompt-api' } })).toBe('Browser built-in model');
	});
	it('says what a selection without a key needs', () => {
		expect(chipLabel({ ...base, readiness: { state: 'needs-key', source: 'cloud', provider: 'openrouter', model: '' } })).toBe('Add a key or choose on-device');
	});
	it('names a cloud selection by the catalog name when known, else from its id', () => {
		const r = { state: 'ready', source: 'cloud', provider: 'gemini', model: 'gemini-3.8-flash' } as const;
		expect(chipLabel({ ...base, readiness: r })).toBe('Gemini 3.8 Flash');
		expect(chipLabel({ ...base, readiness: r }, { id: 'gemini-3.8-flash', name: 'Google: Gemini 3.8 Flash' })).toBe('Gemini 3.8 Flash');
	});
});
