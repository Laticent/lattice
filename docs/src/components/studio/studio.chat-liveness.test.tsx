import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __clearPendingNotices, ArchitectChat } from './ArchitectChat';

// A reply in flight always says what it is doing — on EVERY turn, not only the first.
//
// The first turn of a thread showed bouncing dots because the reply was empty. Every later
// turn opened with prose ("I'll read the slides…"), which hid the dots for good, and the
// tool round that followed showed a 2px pulsing bar and nothing else: Thinking → tool →
// Thinking left the author looking at a cursor that did nothing (studio recording,
// 2026-10-11). The status line is now present from send to commit and names the phase.

type Opts = { onToken?: (t: string) => void; onActivity?: (l: string) => void };
let hold: (v: { status: string; reply: string; proposed: null }) => void = () => {};
let script: (o: Opts) => void = () => {};

const chatSpy = vi.hoisted(() => vi.fn());
vi.mock('./architect', () => ({
	chatComplete: chatSpy,
	useArchitectStatus: () => ({ ready: true, generation: 'openrouter', modelName: 'test', remaining: null, price: { promptPerM: 1, completionPerM: 2 } }),
	applyProposedEditsChecked: () => ({ source: '', applied: 0, refusals: [] }),
	estimateUsd: () => 0.004,
	CHAT_OUTPUT_EST: 4096,
	chatSystemTokens: () => 0,
	agentTurnUsd: () => null,
	CHAT_MAX_TOKENS: 16384,
	architectSpend: () => ({ total: 0, session: 0, totalTokens: 0, sessionTokens: 0, cap: 0, mode: 'alert', status: { level: 'ok', blocked: false, message: null } }),
}));

const props = { deckId: 'deck-1', source: '# One\n', aiReady: true, onApply: () => {}, onConnect: () => {} };

beforeEach(() => {
	localStorage.clear();
	__clearPendingNotices();
	// Paint frames run immediately so tokens reach the DOM without a manual flush.
	vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
		cb(0);
		return 1;
	});
	vi.stubGlobal('cancelAnimationFrame', () => {});
	chatSpy.mockImplementation((_t: unknown, _s: unknown, _d: unknown, opts: Opts) => {
		script(opts);
		return new Promise((resolve) => {
			hold = resolve;
		});
	});
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

const send = async (text: string) => {
	const user = userEvent.setup();
	await user.type(screen.getByLabelText('Message the Architect'), text);
	await user.click(screen.getByRole('button', { name: 'Send' }));
};
const status = () => screen.getByTestId('chat-live-status').textContent;

describe('Architect chat — the live status line', () => {
	it('says Thinking before the first token', async () => {
		script = () => {};
		render(<ArchitectChat {...props} />);
		await send('hello');
		expect(status()).toBe('Thinking…');
	});

	it('says Writing while prose streams, so a later turn is never silent', async () => {
		script = (o) => o.onToken?.("I'll read the slides.");
		render(<ArchitectChat {...props} />);
		await send('hello');
		expect(status()).toBe('Writing…');
	});

	it('names the tool, then Thinking for the next round, then Writing again', async () => {
		let o: Opts = {};
		script = (x) => {
			o = x;
			x.onToken?.("I'll read the slides.");
		};
		render(<ArchitectChat {...props} />);
		await send('hello');

		await act(async () => o.onActivity?.('Reading slides…'));
		expect(status()).toBe('Reading slides…');

		// The gap between a finished tool and the next round's first token — the silent stretch.
		await act(async () => o.onActivity?.('Thinking…'));
		expect(status()).toBe('Thinking…');

		await act(async () => o.onToken?.(' Here is the change.'));
		expect(status()).toBe('Writing…');
	});

	it('goes away when the turn commits', async () => {
		script = (o) => o.onToken?.('Done.');
		render(<ArchitectChat {...props} />);
		await send('hello');
		await act(async () => hold({ status: 'ok', reply: 'Done.', proposed: null }));
		expect(screen.queryByTestId('chat-live-status')).toBeNull();
	});

	it('admits a long silence instead of looking hung', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		try {
			script = () => {};
			render(<ArchitectChat {...props} />);
			await send('hello');
			await act(async () => {
				vi.advanceTimersByTime(16_000);
			});
			expect(status()).toMatch(/still working/);
		} finally {
			vi.useRealTimers();
		}
	});
});
