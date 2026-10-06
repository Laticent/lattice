import type { Extension } from '@codemirror/state';

// The always-loaded part of the Studio's live session: the types the shell speaks, and the few
// storage reads the shell needs before deciding whether to load the session code at all. Keep it
// tiny — everything here ships with the Studio's first paint (docs/route-budget, check-route-budget).

const NAME_KEY = 'lattice-live-name';
/** sessionStorage: the link's `live=` value, SEALED (secret-box.ts), so a join survives OAuth and a reload. */
export const JOIN_KEY = 'lattice-live-join';
/** sessionStorage: a hosting session, so a reload resumes it (live-controller.ts writes it). */
export const HOST_KEY = 'lattice-live-host';

export type LiveDeps = {
	source: string;
	deckId: string;
	deckTitle: string;
	slideCount: number;
	theme: string;
	activeSlide: number;
};

/** What the session code calls back into the shell for. */
export type LiveHost = {
	/** Mirror the shared text into the Studio's source (not a deck switch). */
	setSource: (next: string) => void;
	goToSlide: (fullIndex: number) => void;
	/** Guest: open (or re-open) the linked copy of the shared deck. Returns its deck id. */
	openSharedDeck: (opts: { deckId?: string; title: string; source: string }) => string;
	notify: (message: string) => void;
	notifyAction: (message: string, opts: { label: string; onClick: () => void }) => void;
	rerender: () => void;
};

/** What the editor needs to bind to the shared text. `key` changes when it must rebuild. */
export type LiveCollab = { extension: Extension; key: string; readOnly: boolean; seed: () => string };

const read = (s: Storage, k: string): string | null => {
	try {
		return s.getItem(k);
	} catch {
		return null;
	}
};

export const storedLiveName = (): string => read(localStorage, NAME_KEY) ?? '';
export const saveName = (name: string) => {
	try {
		localStorage.setItem(NAME_KEY, name);
	} catch {}
};

const LIVE_FRAGMENT = /(?:^#|&)live=([^&]*)/;

/** A link taken from the address bar this page load, held in memory until the session code seals it. */
let freshJoin: string | null = null;

/**
 * If the address bar carries a `#live=` link, take it into memory and scrub it from the address
 * bar (screenshots, a shared screen), without loading any session code. Nothing is written in the
 * clear: the session code seals it before it reaches sessionStorage. Returns whether this tab has
 * anything live to resume: a link, a carried join, or a session it was hosting.
 */
export function takeLiveIntent(): boolean {
	if (typeof location === 'undefined') return false;
	const m = LIVE_FRAGMENT.exec(location.hash);
	if (m) {
		freshJoin = decodeURIComponent(m[1]);
		history.replaceState(history.state, '', location.pathname + location.search);
	}
	return !!(freshJoin || read(sessionStorage, JOIN_KEY) || read(sessionStorage, HOST_KEY));
}

/** The link taken this page load, once. */
export const takeFreshJoin = (): string | null => {
	const j = freshJoin;
	freshJoin = null;
	return j;
};
/** A sealed join carried from an earlier page load (OAuth, a reload). */
export const readSealedJoin = (): string | null => (typeof sessionStorage === 'undefined' ? null : read(sessionStorage, JOIN_KEY));
export const storeSealedJoin = (sealed: string) => {
	try {
		sessionStorage.setItem(JOIN_KEY, sealed);
	} catch {}
};
export const clearJoinIntent = () => {
	try {
		sessionStorage.removeItem(JOIN_KEY);
	} catch {}
};
