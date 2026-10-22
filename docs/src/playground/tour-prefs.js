// Guided-tour preference — the single source of truth for whether the docs
// workspaces show their tours. Deliberately tiny and dependency-free (no
// tour-engine import) so every page can read it cheaply and the Drawing Board
// settings drawer can import it without dragging the tour engine into the
// settings bundle.
//
// The flag is global, not per-page: turning tours off in the Drawing Board
// settings hides them on the Playground and Workbench too. Same-page listeners
// let the Drawing Board flip its "Tour" button live; other pages read the flag
// on load.
const KEY = 'lattice-tour-enabled';
const listeners = new Set();

export function toursEnabled() {
	try {
		return localStorage.getItem(KEY) !== 'off';
	} catch {
		return true;
	}
}

export function setToursEnabled(on) {
	try {
		localStorage.setItem(KEY, on ? 'on' : 'off');
	} catch {}
	for (const fn of listeners) {
		try {
			fn(on);
		} catch {}
	}
}

/** Subscribe to same-page changes. Returns an unsubscribe fn. */
export function onToursEnabledChange(fn) {
	listeners.add(fn);
	return () => listeners.delete(fn);
}
