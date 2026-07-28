// ONE history entry for the whole overlay stack, owned in ONE place.
//
// THE BUG (#1226). On iOS the edge-swipe-from-the-left is the *primary* back
// affordance — there is no system back button to avoid. With a drawer open it
// navigated page history, i.e. straight out of the Studio. The drawer handled
// `onEscapeKeyDown` and nothing else, and a back gesture is not Escape.
//
// THE FIRST ATTEMPT, AND WHY THIS IS SHAPED THE WAY IT IS. The reverted version
// (`useSheetBackGuard(depth, onBack)`) owned one history entry PER OPEN LEVEL, from
// one `useEffect` keyed on `depth`. Entering a door tore down the depth-1 effect,
// whose cleanup called `history.back()` to rewind its entry — asynchronously — while
// the depth-2 effect was already calling `pushState`. The two interleaved and the
// history stack ended up corrupted, taking the drawer's own level state with it. In
// WebKit the door never opened and back still left the app.
//
// Two changes make that race unrepresentable rather than merely unlikely:
//
//   1. ONE SENTINEL, NOT ONE PER LEVEL. However deep the overlay stack goes, we own
//      exactly one history entry. Depth is tracked in `stack` (plain memory), which
//      costs nothing and cannot interleave. There is no per-level entry to rewind, so
//      there is no cleanup-driven `history.back()` to race a sibling's `pushState`.
//
//   2. RECONCILE ON A MICROTASK, NEVER INSIDE A CLEANUP. Every mutation marks the
//      controller dirty; one `reconcile()` runs after the commit has finished. This is
//      what makes the drawer's own hand-off correct: `closeDrawerAndOpen` closes the
//      drawer and opens the child IN THE SAME COMMIT, so a synchronous reconciler
//      would see an empty stack mid-commit, fire `history.back()`, and then have that
//      queued pop land on the entry the child had just pushed — the identical failure,
//      relocated. Batched, the close and the open net out to no history traffic at all.
//
// The effect below deliberately depends on `active` ONLY. `onBack` rides a ref, so a
// re-render never tears the registration down and rebuilds it — the other half of what
// made the first attempt fragile.
//
// SCOPE: phones, and Studio drawers. `PanelSheet` registers itself when it is a bottom
// sheet (`useIsPhone`), and `StudioDrawer` registers twice — once for the sheet, once
// for an open door. Desktop and tablet never register, so history stays untouched
// there, which is what the issue's acceptance check #5 requires. Present, the guided
// tour, `MetricDetail` and the Playground sheets are deliberately NOT wired (decided
// with the product owner, 2026-07-28) — they keep today's behavior.
import * as React from 'react';

type Entry = { onBack: () => void };

/** Open overlay levels, innermost LAST. Plain memory — not history entries. */
let stack: Entry[] = [];
/** Do we currently own a history entry? */
let sentinel = false;
/** `popstate` events WE caused, still in flight, to be swallowed. */
let pendingPops = 0;
let listening = false;
let dirty = false;

/** Marks our entry so it can be attributed after a reload — see `adopt()`. */
const STATE_KEY = '__latticeOverlayBack';

/**
 * A page can RELOAD while a panel is open — a pull-to-refresh, a tab discard, or the
 * Studio's own `location.reload()` after Privacy & Data clears a workspace
 * (`WorkspaceSheet` fires that with the sheet still up). The document is new, so this
 * module's state is empty — but the history entry we pushed SURVIVES, marked, and is
 * still the current entry.
 *
 * Adopt it instead of pushing a second one. Without this the module treats a marked,
 * demonstrably-ours entry as "a genuine page navigation" (`sentinel` is false, so
 * `onPopState` returns early), and the counts then drift: the next panel to open pushes
 * a SECOND entry on top of the orphan, and every open/close cycle after the reload
 * leaves one more behind.
 *
 * KNOWN RESIDUAL, stated because it is a real cost and not a hypothetical: adopting
 * does not remove the orphan, so if the user presses back with nothing open, that press
 * is spent closing a panel that is no longer there. Consuming it eagerly here is the
 * obvious alternative and it is worse — measured in WebKit at iPhone 15 Pro, traversing
 * to the previous entry is a FULL document load (3 loads across reload → back → back),
 * so eager consumption would reload the whole Studio a second time every time this
 * happens, to save a gesture the user may never make. The honest fix is to restore the
 * panel that was open rather than the history around it, which needs a per-surface id
 * this module does not have; that is panel deep-linking, not a back guard.
 */
function adopt(): void {
	if (typeof window === 'undefined' || sentinel) return;
	if (history.state?.[STATE_KEY]) sentinel = true;
}


function reconcile(): void {
	dirty = false;
	// Cheap and idempotent, so it runs here rather than once at init: `listen()` fires
	// only when something registers, and a reconcile is the first moment the answer to
	// "do we already own an entry?" is actually consulted.
	adopt();
	const want = stack.length > 0;
	if (want && !sentinel) {
		// No URL argument: the address bar must not change. This only adds an entry.
		history.pushState({ [STATE_KEY]: true }, '');
		sentinel = true;
	} else if (!want && sentinel) {
		// Everything closed by X / scrim / Escape — consume the entry we own so a later
		// back behaves as if the drawer had never opened (acceptance check #3).
		sentinel = false;
		pendingPops += 1;
		history.back();
	}
}

function schedule(): void {
	if (dirty || typeof window === 'undefined') return;
	dirty = true;
	queueMicrotask(reconcile);
}

function onPopState(): void {
	// A pop we asked for. Swallow it — it is bookkeeping, not a user gesture.
	if (pendingPops > 0) {
		pendingPops -= 1;
		return;
	}
	// Not our entry: a genuine page navigation. Let it happen.
	if (!sentinel) return;
	// The browser has consumed the entry we owned. Pop ONE logical level; whatever
	// remains open re-arms on the next reconcile.
	sentinel = false;
	stack[stack.length - 1]?.onBack();
	schedule();
}

function listen(): void {
	if (listening || typeof window === 'undefined') return;
	listening = true;
	window.addEventListener('popstate', onPopState);
}

/**
 * Register one overlay level with the back stack.
 *
 * While `active`, the browser/OS back gesture calls `onBack` instead of navigating.
 * The innermost registered level goes first, so a drawer that has pushed a door pops
 * the door before it closes the drawer.
 */
export function useOverlayBack(active: boolean, onBack: () => void): void {
	const cb = React.useRef(onBack);
	// Assigned during render on purpose: the effect must not depend on `onBack`, or
	// every re-render with a fresh closure would unregister and re-register this level.
	cb.current = onBack;
	React.useEffect(() => {
		if (!active || typeof window === 'undefined') return;
		const entry: Entry = { onBack: () => cb.current() };
		stack.push(entry);
		listen();
		schedule();
		return () => {
			stack = stack.filter((e) => e !== entry);
			schedule();
		};
	}, [active]);
}

/** Test seam — resets module state between cases. Not used by the app. */
export function __resetOverlayBack(): void {
	stack = [];
	sentinel = false;
	pendingPops = 0;
	dirty = false;
}
