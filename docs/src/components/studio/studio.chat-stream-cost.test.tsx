import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DOMPurify from 'dompurify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __clearPendingNotices, ArchitectChat } from './ArchitectChat';
import { saveChat } from './studio-store';

// THE COST OF A STREAMED FRAME DOES NOT GROW WITH THE THREAD.
//
// Measured on the real Studio at 4x CPU throttle: turn 1 of a thread had 6 long tasks while its
// reply streamed, turn 5 had hundreds, nearly one per frame. Each painted frame set panel state, so
// the whole panel re-rendered, and every settled reply re-ran DOMPurify over its HTML in the render
// body. The same happened on each keystroke in the composer. A settled reply's text never changes,
// so it must cost nothing to repaint. These tests count sanitizer passes, which is the work that
// scaled with the thread, rather than timing anything.

type Opts = { onToken?: (t: string) => void };
let opts: Opts = {};
let release: (v: { status: string; reply: string; proposed: null }) => void = () => {};
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
const SETTLED = 6;

let frames: Array<{ id: number; cb: FrameRequestCallback }> = [];
let nextFrameId = 1;
let clock = 0;
const flushFrames = async () => {
	const queued = frames;
	frames = [];
	await act(async () => {
		for (const f of queued) f.cb(0);
	});
};

beforeEach(() => {
	localStorage.clear();
	__clearPendingNotices();
	frames = [];
	nextFrameId = 1;
	clock = 0;
	// A clock the test owns: every paint reads as free, so the scheduler never defers a frame and a
	// flush is a paint.
	vi.spyOn(performance, 'now').mockImplementation(() => clock);
	vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
		const id = nextFrameId++;
		frames.push({ id, cb });
		return id;
	});
	vi.stubGlobal('cancelAnimationFrame', (id: number) => {
		frames = frames.filter((f) => f.id !== id);
	});
	// A thread of settled replies, each with prose AND a list so it is a real sanitizer input.
	saveChat(
		'deck-1',
		Array.from({ length: SETTLED * 2 }, (_, i) => (i % 2 === 0 ? { role: 'user' as const, content: `question ${i}` } : { role: 'assistant' as const, content: `## Answer ${i}\n\nSome **bold** words and a list:\n\n- one\n- two\n- three\n` })),
	);
	chatSpy.mockImplementation((_t: unknown, _s: unknown, _d: unknown, o: Opts) => {
		opts = o;
		return new Promise((resolve) => {
			release = resolve;
		});
	});
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

const send = async (text: string) => {
	const user = userEvent.setup();
	await user.type(screen.getByLabelText('Message the Architect'), text);
	await user.click(screen.getByRole('button', { name: 'Send' }));
};

describe('Architect chat — a streamed frame costs the live bubble, not the thread', () => {
	it('re-sanitizes nothing that has settled while a reply streams', async () => {
		render(<ArchitectChat {...props} />);
		const sanitize = vi.spyOn(DOMPurify, 'sanitize');
		await send('go');
		await flushFrames();
		const before = sanitize.mock.calls.length;

		const FRAMES = 20;
		for (let i = 0; i < FRAMES; i++) {
			await act(async () => opts.onToken?.(`word${i} `));
			await flushFrames();
		}
		const during = sanitize.mock.calls.length - before;

		// One pass per painted frame, for the live bubble's one prose segment. Before the fix every frame
		// also ran a pass for each settled reply: (SETTLED + 1) * FRAMES.
		expect(during, `${during} sanitizer passes over ${FRAMES} frames with ${SETTLED} settled replies`).toBeLessThanOrEqual(FRAMES + 2);
		expect(screen.getAllByText(/Answer/).length).toBe(SETTLED);
	});

	it('re-sanitizes nothing when the author types in the composer', async () => {
		render(<ArchitectChat {...props} />);
		const sanitize = vi.spyOn(DOMPurify, 'sanitize');
		const user = userEvent.setup();
		await user.type(screen.getByLabelText('Message the Architect'), 'a message typed while the thread is on screen');
		expect(sanitize.mock.calls.length).toBe(0);
	});

	it('does not repaint the panel on a streamed frame: the settled replies keep their DOM nodes', async () => {
		render(<ArchitectChat {...props} />);
		const answers = screen.getAllByText(/Answer/);
		await send('go');
		for (let i = 0; i < 5; i++) {
			await act(async () => opts.onToken?.(`w${i} `));
			await flushFrames();
		}
		const after = screen.getAllByText(/Answer/);
		expect(after.length).toBe(answers.length);
		for (let i = 0; i < answers.length; i++) expect(after[i], `reply ${i} was rebuilt`).toBe(answers[i]);
	});

	it('shows the whole reply once the turn commits, even if frames were deferred', async () => {
		render(<ArchitectChat {...props} />);
		await send('go');
		await act(async () => opts.onToken?.('Final answer text.'));
		await act(async () => release({ status: 'ok', reply: 'Final answer text.', proposed: null }));
		expect(screen.getAllByText('Final answer text.')).toHaveLength(1);
	});
});

describe('Architect chat — the transcript only follows the reply while the author is at the bottom', () => {
	const scroller = () => document.querySelector('.overflow-y-auto') as HTMLElement;
	const geometry = (el: HTMLElement, top: number) => {
		Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 });
		Object.defineProperty(el, 'clientHeight', { configurable: true, value: 200 });
		Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: top });
	};

	it('does not pull a reader who scrolled up back to the bottom on every frame', async () => {
		render(<ArchitectChat {...props} />);
		await send('go');
		await flushFrames();
		const el = scroller();
		const scrollTo = vi.fn();
		el.scrollTo = scrollTo as unknown as typeof el.scrollTo;
		geometry(el, 100); // 700px above the bottom: rereading an earlier reply
		act(() => {
			el.dispatchEvent(new Event('scroll'));
		});
		await act(async () => opts.onToken?.('more text '));
		await flushFrames();
		expect(scrollTo).not.toHaveBeenCalled();
	});

	it('follows the reply while the author is at the bottom', async () => {
		render(<ArchitectChat {...props} />);
		await send('go');
		await flushFrames();
		const el = scroller();
		const scrollTo = vi.fn();
		el.scrollTo = scrollTo as unknown as typeof el.scrollTo;
		geometry(el, 790); // within the follow slop of the bottom (1000 - 790 - 200 = 10)
		act(() => {
			el.dispatchEvent(new Event('scroll'));
		});
		await act(async () => opts.onToken?.('more text '));
		await flushFrames();
		expect(scrollTo).toHaveBeenCalled();
	});
});

describe('Architect chat — the paint rate backs off when frames are expensive', () => {
	// Each tick is one 60 Hz frame. `frameMs` is how long a frame takes on this machine: the clock jumps by that
	// much after every frame callback, as if style, layout and paint had run. Timers are the real ones, so a
	// paint the scheduler defers to a timer does not land inside the test, which is the point being counted.
	const paintsOver = async (frameMs: number, ticks: number) => {
		render(<ArchitectChat {...props} />);
		const sanitize = vi.spyOn(DOMPurify, 'sanitize');
		await send('go');
		const base = sanitize.mock.calls.length;
		for (let i = 0; i < ticks; i++) {
			await act(async () => opts.onToken?.(`w${i} `));
			const queued = frames;
			frames = [];
			for (const f of queued) {
				await act(async () => f.cb(0));
				clock += frameMs;
			}
		}
		return sanitize.mock.calls.length - base;
	};

	it('paints about every frame when frames are cheap', async () => {
		expect(await paintsOver(17, 30)).toBeGreaterThanOrEqual(25);
	});

	it('paints a fraction as often when every frame costs 100 ms', async () => {
		const slow = await paintsOver(100, 30);
		expect(slow, `${slow} paints in 30 slow frames`).toBeLessThanOrEqual(12);
		expect(slow).toBeGreaterThan(0);
	});
});
