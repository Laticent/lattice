import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatCost, readableModelId } from './ChatCost';

// The chat header: one chip that names the model and opens the picker, and one session figure.

const setModel = vi.hoisted(() => vi.fn(async (_id: string) => {}));
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

describe('readableModelId', () => {
	it('turns an id into a name without the catalog', () => {
		expect(readableModelId('~anthropic/claude-sonnet-latest')).toBe('Claude Sonnet (latest)');
		expect(readableModelId('google/gemini-3-flash')).toBe('Gemini 3 Flash');
		expect(readableModelId('openai/gpt-5.1:free')).toBe('Gpt 5.1 Free');
		expect(readableModelId(null)).toBe('Choose a model');
	});
});
