import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __clearPendingNotices, ArchitectChat } from './ArchitectChat';
import { loadChat } from './studio-store';

// #1787 — the streaming bubble has to be GONE once the reply commits.
//
// A chat turn paints tokens through a rAF-coalesced `setStreaming`, and clears that
// bubble in the turn's `finally`. If the last token's frame is still QUEUED when
// `chatComplete` resolves, the ordering is: commit appends the message → `finally`
// nulls `streaming` → the queued frame fires and sets `streaming` back to the full
// buffer. Nothing clears it again, so the reply renders TWICE, identically, until the
// next send. Observed on a live Playwright run (two identical Architect bubbles).
//
// The race is DETERMINISTIC once the frame is held, which is what these tests do:
// `requestAnimationFrame` is stubbed to a queue that only this file drains, so
// "a frame was still pending at completion" is a state we enter on purpose rather
// than one we wait for.

const REPLY = 'Slide two is already a closing layout.';
const REPLY_TWO = 'Here is a second answer entirely.';

let frames: Array<{ id: number; cb: FrameRequestCallback }> = [];
let nextFrameId = 1;
const flushFrames = async () => {
	const queued = frames;
	frames = [];
	await act(async () => {
		for (const f of queued) f.cb(0);
	});
};

const chatSpy = vi.hoisted(() =>
	vi.fn(async (_turns: unknown, _src: unknown, _docs: unknown, opts?: { onToken?: (t: string) => void }) => {
		opts?.onToken?.(REPLY);
		return { status: 'ok', reply: REPLY, proposed: null };
	}),
);
const statusSpy = vi.hoisted(() => vi.fn((): Record<string, unknown> => ({ ready: true, generation: 'openrouter', modelName: 'test', remaining: null, price: { promptPerM: 1, completionPerM: 2 } })));
vi.mock('./architect', () => ({
	chatComplete: chatSpy,
	useArchitectStatus: statusSpy,
	applyProposedEditsChecked: vi.fn((src: string) => ({ source: src, applied: 1, refusals: [] })),
	estimateUsd: () => 0.004,
	CHAT_OUTPUT_EST: 4096,
	chatSystemTokens: () => 0,
	CHAT_MAX_TOKENS: 16384,
	architectSpend: () => ({ total: 0, session: 0, totalTokens: 0, sessionTokens: 0, cap: 0, mode: 'alert', status: { level: 'ok', blocked: false, message: null } }),
}));

const props = { deckId: 'deck-1', source: '# One\n', aiReady: true, onApply: () => {}, onConnect: () => {}, notify: () => {} };

beforeEach(() => {
	localStorage.clear();
	// Parked notices are MODULE state — they outlive a `render()`, so without this one
	// case's failure shows up in the next.
	__clearPendingNotices();
	frames = [];
	nextFrameId = 1;
	vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
		const id = nextFrameId++;
		frames.push({ id, cb });
		return id;
	});
	vi.stubGlobal('cancelAnimationFrame', (id: number) => {
		frames = frames.filter((f) => f.id !== id);
	});
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	statusSpy.mockReturnValue({ ready: true, generation: 'openrouter', modelName: 'test', remaining: null, price: { promptPerM: 1, completionPerM: 2 } });
});

const sendOnce = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
	await user.type(screen.getByLabelText('Message the Architect'), text);
	await user.click(screen.getByRole('button', { name: 'Send' }));
};

/** A turn that emits its whole reply as one token and then WAITS to be released. */
const deferredTurn = (reply: string) => {
	let release: (v: { status: string; reply: string; proposed: null }) => void = () => {};
	chatSpy.mockImplementationOnce((_t: unknown, _s: unknown, _d: unknown, opts?: { onToken?: (t: string) => void }) => {
		opts?.onToken?.(reply);
		return new Promise((resolve) => {
			release = resolve;
		});
	});
	return {
		release: async () => {
			await act(async () => {
				release({ status: 'ok', reply, proposed: null });
			});
		},
	};
};

describe('Architect chat — a committed reply is not re-shown by a late frame (#1787)', () => {
	it('renders the reply ONCE when a paint frame is still queued as the turn completes', async () => {
		const user = userEvent.setup();
		render(<ArchitectChat {...props} />);

		// Hold the completion open so we can OBSERVE the pending frame first — asserting
		// it after the turn ends would be checking the fix with the fix's own effect.
		const turn = deferredTurn(REPLY);
		await sendOnce(user, 'tighten slide two');
		expect(frames.length, 'no frame was queued — this test proves nothing without one pending').toBeGreaterThan(0);

		// The completion lands with that frame STILL queued: the #1787 window exactly.
		await turn.release();
		expect(screen.getAllByText(REPLY)).toHaveLength(1);

		await flushFrames();
		expect(screen.getAllByText(REPLY), 'the late frame re-mounted the streaming bubble over the committed message').toHaveLength(1);
	});

	it('leaves no live Architect bubble behind after the late frame fires', async () => {
		const user = userEvent.setup();
		render(<ArchitectChat {...props} />);
		const turn = deferredTurn(REPLY);
		await sendOnce(user, 'tighten slide two');
		await turn.release();
		await flushFrames();

		// Two "Architect" captions means two bubbles: the committed message and a
		// streaming block the panel can no longer clear.
		expect(screen.getAllByText('Architect')).toHaveLength(1);
	});

	it('still paints tokens on the NEXT turn — the frame guard is reset, not just canceled', async () => {
		const user = userEvent.setup();
		render(<ArchitectChat {...props} />);
		await sendOnce(user, 'tighten slide two');
		await flushFrames();

		// Turn two: hold the completion open so the stream is observable mid-flight.
		const turn = deferredTurn(REPLY_TWO);
		await sendOnce(user, 'and again');
		await flushFrames();

		// If the completion canceled the frame WITHOUT zeroing `rafRef`, `onToken` reads
		// the stale id as "a frame is already scheduled" and never queues another — the
		// reply would stream to a permanently blank bubble.
		expect(screen.getByText(REPLY_TWO), 'no frame was scheduled for the second turn — the rAF guard was left stale').toBeTruthy();

		await turn.release();
	});
});

// A SECOND stale-bubble defect, found in the same teardown block while fixing #1787 and
// fixed with it (HARD RULE #18 — on the path of this change). `busy` and `streaming`
// describe the PANEL, but their teardown was gated on the turn's deck still being the one
// on screen. Switch decks mid-reply and neither ever cleared: the composer kept Stop in
// place of Send permanently, and the other deck's partial answer sat in this deck's
// transcript.
describe('Architect chat — a turn that ends on another deck still tears down', () => {
	it('clears busy when the turn completes after a deck switch', async () => {
		const user = userEvent.setup();
		const { rerender } = render(<ArchitectChat {...props} deckId="deck-1" />);
		const turn = deferredTurn(REPLY);
		await sendOnce(user, 'tighten slide two');
		expect(screen.getByRole('button', { name: 'Stop' }), 'the turn should be in flight').toBeTruthy();

		rerender(<ArchitectChat {...props} deckId="deck-2" />);
		await turn.release();
		await flushFrames();

		expect(screen.queryByRole('button', { name: 'Stop' }), 'busy was stranded — this deck can never be sent from again').toBeNull();
		expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
	});

	it('brings the in-flight reply BACK when the author returns mid-turn, with no new token', async () => {
		const user = userEvent.setup();
		const { rerender } = render(<ArchitectChat {...props} deckId="deck-1" />);
		const turn = deferredTurn(REPLY);
		await sendOnce(user, 'tighten slide two');
		await flushFrames();
		expect(screen.getByText(REPLY)).toBeTruthy();

		rerender(<ArchitectChat {...props} deckId="deck-2" />);
		expect(screen.queryByText(REPLY)).toBeNull();

		// Back to deck-1 while the model is still streaming. No token arrives — a slow model,
		// or the tail after the last content chunk — so anything that CLEARED the buffer on the
		// way out leaves this deck showing a Stop button over an empty transcript.
		rerender(<ArchitectChat {...props} deckId="deck-1" />);
		expect(screen.getByText(REPLY), 'the partial reply vanished on the round trip').toBeTruthy();

		await turn.release();
		await flushFrames();
	});

	it('shows no empty-state placeholder on a fresh deck while a turn runs elsewhere', async () => {
		const user = userEvent.setup();
		const { rerender } = render(<ArchitectChat {...props} deckId="deck-1" />);
		const turn = deferredTurn(REPLY);
		await sendOnce(user, 'tighten slide two');
		await flushFrames();

		rerender(<ArchitectChat {...props} deckId="deck-2" />);
		// deck-2 has no history, so the "nothing has happened here" placeholder is eligible —
		// beside a composer showing Stop, which says the opposite.
		expect(screen.queryByText(/Ask the Architect to tighten a slide/), 'the empty-state invitation is showing next to a Stop button').toBeNull();
		expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();

		await turn.release();
		await flushFrames();
	});

	it('does not paint the other deck\'s reply into this deck\'s transcript', async () => {
		const user = userEvent.setup();
		const { rerender } = render(<ArchitectChat {...props} deckId="deck-1" />);
		const turn = deferredTurn(REPLY);
		await sendOnce(user, 'tighten slide two');
		await flushFrames();
		expect(screen.getByText(REPLY), 'deck-1 should be streaming its own reply').toBeTruthy();

		rerender(<ArchitectChat {...props} deckId="deck-2" />);
		expect(screen.queryByText(REPLY), "deck-1's in-flight reply is showing in deck-2's transcript").toBeNull();

		// It commits to its ORIGINATING deck regardless — the survival contract holds.
		await turn.release();
		await flushFrames();
		expect(screen.queryByText(REPLY)).toBeNull();
		expect(loadChat('deck-1').at(-1)?.content, 'the survival contract: the reply still commits to the deck that asked for it').toBe(REPLY);
	});
});

// #1813 — the three non-`ok` outcomes had NO deck guard, unlike the `ok` branch (which
// carries one inside `commit`). A turn that started on deck-1 and ended while the author
// was looking at deck-2 painted deck-1's notice into deck-2's transcript, and — on the
// `offline` branch — called `onConnect()`, popping the Workspace sheet over a deck that
// never asked for anything. Reachable BY DESIGN, not by accident: the survival contract
// says a turn keeps completing across a deck switch.
const OFFLINE = /and I can answer and edit your deck/;

/** A turn that WAITS to be released, then ends on the given outcome (or throws). */
const deferredOutcome = (out: { status: string; reply: string } | { throws: true }) => {
	let settle: () => void = () => {};
	chatSpy.mockImplementationOnce(
		() =>
			new Promise((resolve, reject) => {
				settle = () => ('throws' in out ? reject(new Error('network')) : resolve({ ...out, proposed: null }));
			}),
	);
	return {
		release: async () => {
			await act(async () => {
				settle();
			});
		},
	};
};

describe('Architect chat — a turn ending offline/blocked/errored stays on the deck that asked (#1813)', () => {
	it('keeps an offline notice out of another deck, and still has it when the author returns', async () => {
		const user = userEvent.setup();
		const { rerender } = render(<ArchitectChat {...props} deckId="deck-1" />);
		const turn = deferredOutcome({ status: 'offline', reply: '' });
		await sendOnce(user, 'tighten slide two');

		rerender(<ArchitectChat {...props} deckId="deck-2" />);
		await turn.release();
		await flushFrames();
		expect(screen.queryByText(OFFLINE), "deck-1's offline notice is showing in deck-2's transcript").toBeNull();

		// Not cleared — WAITING. A notice the author never sees is a turn that failed silently.
		rerender(<ArchitectChat {...props} deckId="deck-1" />);
		expect(screen.getByText(OFFLINE), 'the deck that asked was never told why nothing came back').toBeTruthy();
	});

	it('does not pop the Workspace sheet over a deck that never asked', async () => {
		const user = userEvent.setup();
		const onConnect = vi.fn();
		const { rerender } = render(<ArchitectChat {...props} onConnect={onConnect} deckId="deck-1" />);
		const turn = deferredOutcome({ status: 'offline', reply: '' });
		await sendOnce(user, 'tighten slide two');

		rerender(<ArchitectChat {...props} onConnect={onConnect} deckId="deck-2" />);
		await turn.release();
		await flushFrames();
		expect(onConnect, 'a sheet opened over a deck whose author asked for nothing').not.toHaveBeenCalled();
	});

	it('DOES pop the Workspace sheet when the turn ends on the deck that asked', async () => {
		const user = userEvent.setup();
		const onConnect = vi.fn();
		render(<ArchitectChat {...props} onConnect={onConnect} deckId="deck-1" />);
		const turn = deferredOutcome({ status: 'offline', reply: '' });
		await sendOnce(user, 'tighten slide two');

		await turn.release();
		await flushFrames();
		// The guard must not cost the offline branch its whole point on the ordinary path.
		expect(onConnect, 'the guard swallowed the connect prompt on the deck that asked for it').toHaveBeenCalledTimes(1);
		expect(screen.getByText(OFFLINE)).toBeTruthy();
	});

	it('keeps a blocked notice out of another deck', async () => {
		const user = userEvent.setup();
		const { rerender } = render(<ArchitectChat {...props} deckId="deck-1" />);
		const turn = deferredOutcome({ status: 'blocked', reply: 'Spend cap reached for this session.' });
		await sendOnce(user, 'tighten slide two');

		rerender(<ArchitectChat {...props} deckId="deck-2" />);
		await turn.release();
		await flushFrames();
		expect(screen.queryByText('Spend cap reached for this session.'), "deck-1's blocked notice is showing in deck-2's transcript").toBeNull();

		rerender(<ArchitectChat {...props} deckId="deck-1" />);
		expect(screen.getByText('Spend cap reached for this session.')).toBeTruthy();
	});

	it('keeps an error notice out of another deck', async () => {
		const user = userEvent.setup();
		const { rerender } = render(<ArchitectChat {...props} deckId="deck-1" />);
		const turn = deferredOutcome({ throws: true });
		await sendOnce(user, 'tighten slide two');

		rerender(<ArchitectChat {...props} deckId="deck-2" />);
		await turn.release();
		await flushFrames();
		expect(screen.queryByText(/Something went wrong reaching the model/), "deck-1's error is showing in deck-2's transcript").toBeNull();

		rerender(<ArchitectChat {...props} deckId="deck-1" />);
		expect(screen.getByText(/Something went wrong reaching the model/)).toBeTruthy();
	});
});

// A REGRESSION THE #1813 FIX ITSELF CREATED, caught by the independent checker and fixed
// with it (HARD RULE #18 — a window you create, you close before shipping).
//
// Guarding `onConnect()` on `mountedRef` was half right and half a trapdoor. `notice` was
// component state, so closing the Chat panel mid-turn destroyed it; with the shell action
// withheld as well, a turn that failed while the panel was shut said NOTHING, anywhere.
// The `ok` branch never had that hole — `commit` calls `saveChat` unconditionally — so only
// a FAILED turn could vanish, which is the worst way round. One click reaches it: send,
// flip to the Coach while you wait (the Studio's assistant slot is mutually exclusive, so
// that unmounts this panel), turn comes back offline.
//
// Note what the fix is NOT: dropping the mounted check. `deckIdRef` is assigned during
// render, so it FREEZES at unmount — that "fix" would let a turn sent from deck-1 with Chat
// since closed pop the Workspace sheet over whatever deck the author moved to. The notice
// is parked per deck instead, which is what makes withholding the sheet honest.
describe('Architect chat — a failed turn is still there when the panel reopens (#1813 follow-on)', () => {
	it('shows the notice on reopen when the turn failed while the panel was closed', async () => {
		const user = userEvent.setup();
		const onConnect = vi.fn();
		const { unmount } = render(<ArchitectChat {...props} onConnect={onConnect} deckId="deck-1" />);
		const turn = deferredOutcome({ status: 'offline', reply: '' });
		await sendOnce(user, 'tighten slide two');

		// The author flips to the Coach mid-turn. The panel goes away; the turn does not.
		unmount();
		await turn.release();
		await flushFrames();
		expect(onConnect, 'a sheet opened over a shell whose chat panel is closed').not.toHaveBeenCalled();

		// Reopen Chat on the deck that asked. Before the fix this was the question with
		// nothing after it — no notice, no sheet, no explanation anywhere.
		render(<ArchitectChat {...props} onConnect={onConnect} deckId="deck-1" />);
		expect(screen.getByText(OFFLINE), 'the turn failed while the panel was shut and said nothing, anywhere').toBeTruthy();
	});

	it("does not let a send on one deck wipe another deck's waiting notice", async () => {
		const user = userEvent.setup();
		const { rerender } = render(<ArchitectChat {...props} deckId="deck-1" />);
		const failed = deferredOutcome({ status: 'offline', reply: '' });
		await sendOnce(user, 'tighten slide two');
		await failed.release();
		await flushFrames();
		expect(screen.getByText(OFFLINE)).toBeTruthy();

		// A second turn, on a DIFFERENT deck. It supersedes nothing on deck-1.
		rerender(<ArchitectChat {...props} deckId="deck-2" />);
		const other = deferredOutcome({ status: 'ok', reply: REPLY });
		await sendOnce(user, 'and something else');
		await other.release();
		await flushFrames();

		rerender(<ArchitectChat {...props} deckId="deck-1" />);
		expect(screen.getByText(OFFLINE), "deck-2's turn cleared the notice deck-1 was still waiting to show").toBeTruthy();
	});

	it('a new turn on the SAME deck does supersede its own last failure', async () => {
		const user = userEvent.setup();
		render(<ArchitectChat {...props} deckId="deck-1" />);
		const failed = deferredOutcome({ status: 'offline', reply: '' });
		await sendOnce(user, 'tighten slide two');
		await failed.release();
		await flushFrames();
		expect(screen.getByText(OFFLINE)).toBeTruthy();

		// Otherwise a stale "connect a model" sits under a turn that just worked.
		const good = deferredOutcome({ status: 'ok', reply: REPLY });
		await sendOnce(user, 'try again');
		await good.release();
		await flushFrames();
		expect(screen.queryByText(OFFLINE), 'a stale failure notice survived a turn that succeeded on the same deck').toBeNull();
	});
});

// SECOND CHECKER ROUND. Parking the notice fixed "close the panel mid-turn"; it did not fix
// "close it and open it straight back", because a park was only ever SAMPLED — at mount, or
// on a deck change. Reopen on the same deck and neither happens, so the notice sat in the
// map, invisible, and the author was back to their own question with nothing after it: the
// original bug one click further in (N1). The store publishes to live readers now.
//
// N2 came with it: a remounted panel resets `busy`, so a second turn can be sent while the
// first is still running — and the first would then park its failure UNDER the second's
// answer. Each turn captures the deck's sequence at send and drops its notice if the deck
// has moved on.
describe('Architect chat — a parked notice reaches a reader already on screen (#1813 follow-on)', () => {
	it('shows the notice when the panel was closed AND reopened before the turn landed', async () => {
		const user = userEvent.setup();
		const onConnect = vi.fn();
		const { unmount } = render(<ArchitectChat {...props} onConnect={onConnect} deckId="deck-1" />);
		const turn = deferredOutcome({ status: 'offline', reply: '' });
		await sendOnce(user, 'tighten slide two');

		// Coach, then straight back to Chat — still mid-turn, same deck. A fresh instance
		// mounts while the map is still empty, so nothing it samples at mount can help it.
		unmount();
		render(<ArchitectChat {...props} onConnect={onConnect} deckId="deck-1" />);

		await turn.release();
		await flushFrames();
		expect(screen.getByText(OFFLINE), 'the notice was parked but never reached the panel that was already open').toBeTruthy();
		expect(onConnect, 'the sheet fired at a panel that had been unmounted when the turn ended').not.toHaveBeenCalled();
	});

	it("drops a superseded turn's failure instead of parking it under a later reply", async () => {
		const user = userEvent.setup();
		const { unmount } = render(<ArchitectChat {...props} deckId="deck-1" />);
		const slow = deferredOutcome({ throws: true });
		await sendOnce(user, 'first ask');

		// The remount is what makes this reachable: `busy` is panel state, so the fresh
		// instance shows Send again and a second turn can go out under the first.
		unmount();
		render(<ArchitectChat {...props} deckId="deck-1" />);
		const quick = deferredOutcome({ status: 'ok', reply: REPLY });
		await sendOnce(user, 'second ask');
		await quick.release();
		await flushFrames();
		expect(screen.getByText(REPLY)).toBeTruthy();

		// The FIRST turn now fails, long after it stopped being the current one.
		await slow.release();
		await flushFrames();
		expect(screen.queryByText(/Something went wrong reaching the model/), "a superseded turn's failure landed under the reply that succeeded").toBeNull();
		expect(screen.getByText(REPLY), 'the successful reply was disturbed').toBeTruthy();
	});
});
