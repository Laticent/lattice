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
	/** The site's light or dark mode, frozen with the palette into the session's look. */
	mode: 'light' | 'dark';
	activeSlide: number;
	/** This browser's own Library records the open deck uses now. A host shares only the ones the deck
	 *  used when sharing started, and asks before any other (2026-10-20 note §6, rule 6). */
	records: LiveRecords;
	/** This browser's site palette as a saved theme, when it is one: what a host may offer to share
	 *  as the session's look (§5.1). */
	siteTheme: LiveTheme | null;
	/** What this browser is doing, as presence carries it: the open panel (the AI Chat panel never
	 *  shows), the view, and whether it is presenting (§7.6). */
	panel: 'coach' | 'lenses' | 'library' | 'live' | null;
	view: 'compose' | 'fabricate' | 'article';
	presenting: boolean;
	/** An AI chat turn is in flight here (shown as "asking the AI"; never what is asked). */
	asking: boolean;
	/** The comments on the open deck (slice 6): what is not shared yet is offered to share. */
	comments: Array<{ id: string; slide: number; body: string; createdAt: number; author: string }>;
};

/** A saved theme as a session carries it: its name and its CSS. */
export type LiveTheme = { name: string; css: string };
/** A saved finish as a session carries it: its recipe, never its CSS (each browser regenerates it). */
export type LiveFinish = { name: string; label: string; recipe: unknown };
/** The Library records a deck uses: themes and finishes travel; custom components travel by name
 *  only, so a member can say why those slides fall back. */
export type LiveRecords = { themes: LiveTheme[]; finishes: LiveFinish[]; components: string[] };
export const NO_RECORDS: LiveRecords = { themes: [], finishes: [], components: [] };

/** The look every member's preview gives a deck that names no `theme:`. The host freezes it when the
 *  session starts and it does not change after that, through a host drop or a takeover
 *  (engineering/decisions/2026-10-20-live-uniform-experience.md §5.1). `palette` is a built-in name, or
 *  null when the host's own palette is a saved theme, which is not shared: members then use the default. */
export type LiveLook = { palette: string | null; mode: 'light' | 'dark' };

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
	/** Follow: open the panel and view of the person followed. The shell decides what fits its width
	 *  (a phone follows the slide only). Optional: a shell without panels follows slides alone. */
	followDoing?: (d: { panel: 'coach' | 'lenses' | 'library' | 'live' | null; view: 'compose' | 'fabricate' | 'article' }) => void;
	/** Whether this shell mirrors a panel and view at its current width (a phone or tablet does not). */
	canFollowDoing?: () => boolean;
	/** Whether the one action toast slot holds something Follow must not replace (an Undo the person just earned). */
	actionBusy?: () => boolean;
	/** Present together (§7.2): open Present following the presenter, or close a Present the room opened. */
	openRoomPresent?: () => void;
	closeRoomPresent?: () => void;
	/** Show me together (§7.5): start this shipped tour now, on a practice deck. */
	startTour?: (tourId: string) => void;
	/** Comments (slice 6): put shared comments on this browser's copy of `deckId`, and take deleted ones off. */
	applyComments?: (deckId: string, set: Array<{ id: string; slide: number; author: string; body: string; createdAt: number; resolved: boolean; owner: string; sharedBy?: string }>, del: Array<{ id: string; owner: string }>, me: string | null) => void;
};

/** What the editor needs to bind to the shared text. `key` changes when it must rebuild. */
/** `undo` / `redo` step this browser's own changes in the session (the binding's Y.UndoManager), for
 *  the Studio root's ⌘Z when focus is outside the editor (Filo note §6.2). */
export type LiveCollab = { extension: Extension; key: string; readOnly: boolean; seed: () => string; look: LiveLook | null; records: LiveRecords; undo: () => boolean; redo: () => boolean };

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
 * If the address bar carries a `#live=` link, take it into memory, without loading any session code
 * (`scrubLiveFragment` takes it out of the address bar once the session code has it). Nothing is written in the
 * clear: the session code seals it before it reaches sessionStorage. Returns whether this tab has
 * anything live to resume: a link, a carried join, or a session it was hosting.
 */
export function takeLiveIntent(): boolean {
	if (typeof location === 'undefined') return false;
	const m = LIVE_FRAGMENT.exec(location.hash);
	if (m) {
		try {
			freshJoin = decodeURIComponent(m[1]);
		} catch {
			freshJoin = m[1];
		}
	}
	return !!(freshJoin || read(sessionStorage, JOIN_KEY) || read(sessionStorage, HOST_KEY));
}

/** Whether the address bar carries a `#live=` link right now (a link pasted into an open tab). */
export const hasLiveFragment = (): boolean => typeof location !== 'undefined' && LIVE_FRAGMENT.test(location.hash);

/** Take the `#live=` link out of the address bar. The session code calls this once the link is in
 *  its memory, so a failed load leaves the link where a reload can find it. */
export function scrubLiveFragment(): void {
	if (typeof location === 'undefined' || !LIVE_FRAGMENT.test(location.hash)) return;
	try {
		history.replaceState(history.state, '', location.pathname + location.search);
	} catch {}
}

/** The link taken this page load, once. */
export const takeFreshJoin = (): string | null => {
	const j = freshJoin;
	freshJoin = null;
	return j;
};
/** Whether a link taken from the address bar is still waiting for the session code. */
export const hasFreshJoin = (): boolean => freshJoin !== null;
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
