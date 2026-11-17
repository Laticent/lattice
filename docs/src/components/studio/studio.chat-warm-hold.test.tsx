import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __clearPendingNotices, ArchitectChat } from './ArchitectChat';
import { whenNotHeld } from './first-slide';

// A chat turn holds the Studio's warm-ups from Send until it settles (first-slide.ts `holdWarmUps`). Holding them
// only inside `render_slide` was not enough: a warm-up item that started while the model was answering was still
// loading when the render began, and under load on webkit-phone that pushed a render past its 15 s budget (PR 3272,
// 1 red in 200). Counted as held or not, never timed (HARD RULE #32).

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

let turn = deferred<{ status: string; reply: string; proposed: null }>();
const chatSpy = vi.hoisted(() => vi.fn());
const statusSpy = vi.hoisted(() => vi.fn((): Record<string, unknown> => ({ ready: true, generation: 'openrouter', modelName: 'test', remaining: null, price: { promptPerM: 1, completionPerM: 2 } })));
vi.mock('./architect', () => ({
	chatComplete: chatSpy,
	useArchitectStatus: statusSpy,
	applyProposedEditsChecked: (src: string) => ({ source: src, applied: 1, refusals: [] }),
	estimateUsd: () => 0.004,
	CHAT_OUTPUT_EST: 4096,
	chatSystemTokens: () => 0,
	agentTurnUsd: () => null,
	CHAT_MAX_TOKENS: 16384,
	architectSpend: () => ({ total: 0, session: 0, totalTokens: 0, sessionTokens: 0, cap: 0, mode: 'alert', status: { level: 'ok', blocked: false, message: null } }),
}));

const props = { deckId: 'deck-1', source: '# One\n', aiReady: true, onApply: () => {}, onConnect: () => {}, notify: () => {} };

/** Whether no foreground work holds the warm-ups right now: one microtask turn, no clock. */
async function open(): Promise<boolean> {
	let done = false;
	void whenNotHeld().then(() => {
		done = true;
	});
	await act(async () => {
		await Promise.resolve();
	});
	return done;
}

async function send(user: ReturnType<typeof userEvent.setup>, text: string) {
	await user.type(screen.getByLabelText('Message the Architect'), text);
	await user.click(screen.getByRole('button', { name: 'Send' }));
}

beforeEach(() => {
	localStorage.clear();
	__clearPendingNotices();
	turn = deferred();
	chatSpy.mockImplementation(() => turn.promise);
});
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('a chat turn holds the warm-ups', () => {
	it('from Send until the reply lands', async () => {
		const user = userEvent.setup();
		render(<ArchitectChat {...props} />);
		expect(await open()).toBe(true);
		await send(user, 'how does slide one look?');
		expect(chatSpy).toHaveBeenCalledTimes(1);
		expect(await open()).toBe(false); // the model is answering
		await act(async () => turn.resolve({ status: 'ok', reply: 'It reads cleanly.', proposed: null }));
		expect(await screen.findByText('It reads cleanly.')).toBeInTheDocument();
		expect(await open()).toBe(true);
	});

	it('and lets go when the turn fails', async () => {
		const user = userEvent.setup();
		render(<ArchitectChat {...props} />);
		await send(user, 'hello');
		expect(await open()).toBe(false);
		await act(async () => turn.reject(new Error('network down')));
		expect(await open()).toBe(true);
	});
});
