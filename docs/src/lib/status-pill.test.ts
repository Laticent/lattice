import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sonner is a DOM-mounted singleton; what this module owns is the OPTIONS OBJECT
// it hands over, so the toast function is the seam worth stubbing.
const toast = vi.fn();
vi.mock('sonner', () => ({ toast: (...args: unknown[]) => toast(...args) }));

const { STATUS_DURATION, STATUS_TOAST_PREFIX, __resetStatusPill, showStatus } = await import('./status-pill');

/** The options object from the nth call (0-based). */
function opts(n: number): Record<string, unknown> {
	return toast.mock.calls[n]?.[1] as Record<string, unknown>;
}
/** Close the pill raised by the nth call, the way Sonner's own dwell would. */
function autoClose(n: number): void {
	(opts(n).onAutoClose as () => void)();
}

describe('showStatus', () => {
	beforeEach(() => {
		toast.mockClear();
		__resetStatusPill();
	});

	it('writes consecutive messages to ONE id, so the second REPLACES the first', () => {
		showStatus('Deck created.');
		showStatus('Renamed to “Q3”.');
		expect(toast).toHaveBeenCalledTimes(2);
		expect(String(opts(0).id)).toContain(STATUS_TOAST_PREFIX);
		// Same id both times is the whole mechanism: Sonner rewrites the existing
		// toast instead of stacking a second one.
		expect(opts(1).id).toBe(opts(0).id);
	});

	// THE REGRESSION GUARD. Sonner's auto-close starts a 200ms exit animation and
	// schedules `removeToast` for the end of it, matching BY ID. Reusing the id of a
	// pill that has just closed therefore renders the new message and then deletes
	// it 200ms later, on the PREVIOUS message's timer — a flash-and-vanish at an
	// ordinary working pace. The id must rotate once the pill is no longer live.
	it('rotates the id once the pill has closed, so the next message is not swallowed', () => {
		showStatus('First message.');
		autoClose(0);
		showStatus('Second message.');
		expect(opts(1).id).not.toBe(opts(0).id);
	});

	it('rotates on a manual dismiss too, not only on the dwell expiring', () => {
		showStatus('First message.');
		(opts(0).onDismiss as () => void)();
		showStatus('Second message.');
		expect(opts(1).id).not.toBe(opts(0).id);
	});

	// A callback from a pill we have already moved past must not mark the CURRENT
	// one dead — that would rotate the next message onto a fresh id and put two
	// pills on screen where one was asked for.
	it('ignores a stale close from a pill that was already replaced', () => {
		showStatus('First message.');
		showStatus('Second message.'); // replaces in place, same id
		autoClose(0); // the first call's callback, fired late
		showStatus('Third message.');
		expect(opts(2).id).toBe(opts(1).id);
	});

	// Sonner merges by id (`{...toast, ...data}`), so a key this function omits
	// would silently inherit the previous message's value — stale explanatory lines
	// riding along under new text, in the card shape rather than the capsule.
	it('passes `description` on every call, as undefined when there is none', () => {
		showStatus('Imported 2 themes.', { description: 'Refused scene-a — its motion plan is not valid.' });
		showStatus('Deck saved.');
		expect(opts(0).description).toBe('Refused scene-a — its motion plan is not valid.');
		expect('description' in opts(1)).toBe(true);
		expect(opts(1).description).toBeUndefined();
	});

	// PRESENT and undefined, not absent. An affordance keeps its own toast (see the
	// module header), and an omitted key is exactly what would let an `action` set by
	// another writer survive onto the next status message — the symptom the gotchas
	// entry names and prescribes this function as the fix for.
	it('clears any action rather than leaving the key off', () => {
		showStatus('Deck deleted.');
		expect('action' in opts(0)).toBe(true);
		expect(opts(0).action).toBeUndefined();
	});

	it('dwells for the Studio default, and honors an override', () => {
		showStatus('Deck saved.');
		showStatus('A longer read that needs longer on screen.', { duration: 8000 });
		expect(opts(0).duration).toBe(STATUS_DURATION);
		expect(opts(1).duration).toBe(8000);
	});
});
