import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sonner is a DOM-mounted singleton; what this module owns is the OPTIONS OBJECT
// it hands over, so the toast function is the seam worth stubbing.
const toast = Object.assign(vi.fn(), { dismiss: vi.fn() });
vi.mock('sonner', () => ({ toast: Object.assign((...args: unknown[]) => toast(...args), { dismiss: (id: unknown) => toast.dismiss(id) }) }));

const { ACTION_DURATION, NOTICE_ID_PREFIX, STATUS_DURATION, __resetNotify, dismissNotice, notify, notifyAction, notifySticky } = await import('./notify');

/** The options object from the nth call (0-based). */
function opts(n: number): Record<string, unknown> {
	return toast.mock.calls[n]?.[1] as Record<string, unknown>;
}
/** Close the pill raised by the nth call, the way Sonner's own dwell would. */
function autoClose(n: number): void {
	(opts(n).onAutoClose as () => void)();
}

describe('notify — the status kind', () => {
	beforeEach(() => {
		toast.mockClear();
		__resetNotify();
	});

	it('writes consecutive messages to ONE id, so the second REPLACES the first', () => {
		notify('Deck created.');
		notify('Renamed to “Q3”.');
		expect(toast).toHaveBeenCalledTimes(2);
		expect(String(opts(0).id)).toContain(NOTICE_ID_PREFIX.status);
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
		notify('First message.');
		autoClose(0);
		notify('Second message.');
		expect(opts(1).id).not.toBe(opts(0).id);
	});

	it('rotates on a manual dismiss too, not only on the dwell expiring', () => {
		notify('First message.');
		(opts(0).onDismiss as () => void)();
		notify('Second message.');
		expect(opts(1).id).not.toBe(opts(0).id);
	});

	// A callback from a pill we have already moved past must not mark the CURRENT
	// one dead — that would rotate the next message onto a fresh id and put two
	// pills on screen where one was asked for.
	it('ignores a stale close from a pill that was already replaced', () => {
		notify('First message.');
		notify('Second message.'); // replaces in place, same id
		autoClose(0); // the first call's callback, fired late
		notify('Third message.');
		expect(opts(2).id).toBe(opts(1).id);
	});

	// Sonner merges by id (`{...toast, ...data}`), so a key this function omits
	// would silently inherit the previous message's value — stale explanatory lines
	// riding along under new text, in the card shape rather than the capsule.
	it('passes `description` on every call, as undefined when there is none', () => {
		notify('Imported 2 themes.', { description: 'Refused scene-a — its motion plan is not valid.' });
		notify('Deck saved.');
		expect(opts(0).description).toBe('Refused scene-a — its motion plan is not valid.');
		expect('description' in opts(1)).toBe(true);
		expect(opts(1).description).toBeUndefined();
	});

	// PRESENT and undefined, not absent. An affordance keeps its own toast (see the
	// module header), and an omitted key is exactly what would let an `action` set by
	// another writer survive onto the next status message — the symptom the gotchas
	// entry names and prescribes this function as the fix for.
	it('clears any action rather than leaving the key off', () => {
		notify('Deck deleted.');
		expect('action' in opts(0)).toBe(true);
		expect(opts(0).action).toBeUndefined();
	});

	it('dwells for the Studio default, and honors an override', () => {
		notify('Deck saved.');
		notify('A longer read that needs longer on screen.', { duration: 8000 });
		expect(opts(0).duration).toBe(STATUS_DURATION);
		expect(opts(1).duration).toBe(8000);
	});
});

describe('the kinds are separate slots', () => {
	beforeEach(() => {
		toast.mockClear();
		__resetNotify();
	});

	// The whole reason `action` is a kind and not a flag: a status message must never
	// be able to replace a button the reader is reaching for.
	it('a status message does not touch the action pill', () => {
		notifyAction('Set pace to deliberate.', { label: 'Undo', onClick: () => {} });
		notify('Applied indaco.');
		expect(opts(1).id).not.toBe(opts(0).id);
		expect(String(opts(0).id)).toContain(NOTICE_ID_PREFIX.action);
		expect(String(opts(1).id)).toContain(NOTICE_ID_PREFIX.status);
	});

	// One at a time WITHIN a kind, though — the superseded Undo is a dead button.
	it('a second action rewrites the first, in place', () => {
		notifyAction('Set split to 40/60.', { label: 'Undo', onClick: () => {} });
		notifyAction('Set pace to deliberate.', { label: 'Undo', onClick: () => {} });
		expect(opts(1).id).toBe(opts(0).id);
	});

	it('sticky never expires and keeps its own slot', () => {
		notifySticky('This page is out of date.', { label: 'Reload', onClick: () => {} });
		notifyAction('Deleted.', { label: 'Undo', onClick: () => {} });
		notify('Applied indaco.');
		expect(opts(0).duration).toBe(Number.POSITIVE_INFINITY);
		const ids = new Set([opts(0).id, opts(1).id, opts(2).id]);
		expect(ids.size).toBe(3);
	});

	it('an action dwells for the unified duration', () => {
		notifyAction('Deleted.', { label: 'Undo', onClick: () => {} });
		expect(opts(0).duration).toBe(ACTION_DURATION);
	});

	it('hands back a handle the caller can retire early', () => {
		const h = notifyAction('Deleted.', { label: 'Undo', onClick: () => {} });
		dismissNotice(h);
		expect(toast.dismiss).toHaveBeenCalledWith(h);
	});
});
