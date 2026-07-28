import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetOverlayBack, useOverlayBack } from './overlay-back';

// The back-stack controller (#1226). These cases exist because the FIRST implementation
// passed review, passed jsdom, and failed on the device — it owned one history entry per
// open level from a `depth`-keyed effect, and the entries interleaved. So the assertions
// here are deliberately about HISTORY TRAFFIC (how many entries we push and pop), not
// just about whether `onBack` fires: the traffic is what got corrupted, and it is
// invisible to a test that only checks the callback.
//
// Driven through React on purpose. The decisive case is the drawer's own hand-off —
// `closeDrawerAndOpen` closes the drawer and opens the child in ONE commit — and that
// batching only exists when the hooks run inside a real render.

/** Both levels of the stack, driven from props. */
function Harness({ outer, inner, onOuter, onInner }: { outer: boolean; inner: boolean; onOuter: () => void; onInner: () => void }) {
	useOverlayBack(outer, onOuter);
	useOverlayBack(inner, onInner);
	return null;
}

let push: ReturnType<typeof vi.spyOn>;
let back: ReturnType<typeof vi.spyOn>;

/** Let the controller's reconcile microtask run. */
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

/** jsdom's `history.back()` does not reliably emit `popstate`, so drive it by hand. */
const userBack = async () => {
	window.dispatchEvent(new PopStateEvent('popstate'));
	await settle();
};

beforeEach(() => {
	__resetOverlayBack();
	push = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
	// Call-through is wrong here: a real jsdom `back()` would emit a popstate the
	// controller must swallow, and the timing of that is jsdom's, not ours. Counting the
	// call is the assertion; the swallow is exercised explicitly below.
	back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
});
afterEach(() => {
	push.mockRestore();
	back.mockRestore();
});

describe('useOverlayBack', () => {
	it('owns exactly ONE history entry no matter how deep the stack goes', async () => {
		const noop = () => {};
		const { rerender } = render(<Harness outer={false} inner={false} onOuter={noop} onInner={noop} />);
		await settle();
		expect(push).not.toHaveBeenCalled();

		// Drawer opens at its index → one entry.
		rerender(<Harness outer={true} inner={false} onOuter={noop} onInner={noop} />);
		await settle();
		expect(push).toHaveBeenCalledTimes(1);

		// A door pushes a SECOND level. This is where the reverted version pushed a second
		// entry and then raced its own teardown rewinding the first.
		rerender(<Harness outer={true} inner={true} onOuter={noop} onInner={noop} />);
		await settle();
		expect(push).toHaveBeenCalledTimes(1);
		expect(back).not.toHaveBeenCalled();
	});

	it('pops the INNERMOST level first, then closes the outer one', async () => {
		const onOuter = vi.fn();
		const onInner = vi.fn();
		const { rerender } = render(<Harness outer={true} inner={true} onOuter={onOuter} onInner={onInner} />);
		await settle();

		// Back inside a door pops the door, not the drawer.
		await userBack();
		expect(onInner).toHaveBeenCalledTimes(1);
		expect(onOuter).not.toHaveBeenCalled();

		// The door closes in response; the drawer is still open, so the entry re-arms.
		rerender(<Harness outer={true} inner={false} onOuter={onOuter} onInner={onInner} />);
		await settle();
		expect(push).toHaveBeenCalledTimes(2);

		// Back again closes the drawer itself.
		await userBack();
		expect(onOuter).toHaveBeenCalledTimes(1);
		expect(onInner).toHaveBeenCalledTimes(1);
	});

	it('leaves NO history residue when the sheet is closed by X or scrim', async () => {
		const noop = () => {};
		const { rerender } = render(<Harness outer={true} inner={false} onOuter={noop} onInner={noop} />);
		await settle();
		expect(push).toHaveBeenCalledTimes(1);

		// Dismissed without a back gesture — the entry we own must be consumed, or the
		// user's NEXT back would be eaten by a drawer that is no longer on screen
		// (issue #1226, acceptance check 3).
		rerender(<Harness outer={false} inner={false} onOuter={noop} onInner={noop} />);
		await settle();
		expect(back).toHaveBeenCalledTimes(1);

		// And the popstate that pop generates is bookkeeping, not a user gesture: it must
		// NOT be forwarded to a handler or counted as a new level.
		const after = vi.fn();
		window.dispatchEvent(new PopStateEvent('popstate'));
		await settle();
		expect(after).not.toHaveBeenCalled();
		expect(push).toHaveBeenCalledTimes(1);
	});

	it('nets out a close and an open that land in the SAME commit', async () => {
		// THE regression case. `closeDrawerAndOpen` runs `setMoreOpen(false)` and the
		// child's open in one batch, so React tears down one registration and sets up
		// another within a single commit. Reconciling synchronously would fire
		// `history.back()` for the momentarily-empty stack and land that queued pop on
		// the entry the child had just pushed — leaving `sentinel` true with no entry
		// actually owned, i.e. the next back gesture leaves the app. Exactly the failure
		// shape that got the first attempt reverted.
		const noop = () => {};
		const { rerender } = render(<Harness outer={true} inner={false} onOuter={noop} onInner={noop} />);
		await settle();
		expect(push).toHaveBeenCalledTimes(1);

		// Drawer closes, child opens, one commit.
		rerender(<Harness outer={false} inner={true} onOuter={noop} onInner={noop} />);
		await settle();
		expect(back).not.toHaveBeenCalled();
		expect(push).toHaveBeenCalledTimes(1);
	});

	it('does not re-register when only the callback identity changes', async () => {
		// A fresh closure every render is the norm in this codebase (`() => onOpenChange(false)`
		// at some call sites, inline arrows at others). If that re-ran the effect, every
		// render would pop and re-push an entry — the other half of what made the first
		// attempt fragile.
		const { rerender } = render(<Harness outer={true} inner={false} onOuter={() => {}} onInner={() => {}} />);
		await settle();
		expect(push).toHaveBeenCalledTimes(1);

		for (let i = 0; i < 3; i += 1) {
			rerender(<Harness outer={true} inner={false} onOuter={() => {}} onInner={() => {}} />);
		}
		await settle();
		expect(push).toHaveBeenCalledTimes(1);
		expect(back).not.toHaveBeenCalled();
	});

	it('ignores a popstate when nothing is open', async () => {
		const onOuter = vi.fn();
		render(<Harness outer={false} inner={false} onOuter={onOuter} onInner={() => {}} />);
		await settle();
		await userBack();
		expect(onOuter).not.toHaveBeenCalled();
		expect(push).not.toHaveBeenCalled();
	});
});
