// The view model the Live panel, lobby and header pill draw from. Pure data, so the same
// components can render a real Tavola session or a test fixture.
// See engineering/decisions/2026-10-06-studio-live-collaboration.md §4–§5.

/** A person's role. `host` is the one who shared the link. */
export type LiveRole = 'host' | 'edit' | 'view';

/** One of the four session colors, by admission order — `var(--chart-cat<N>)`. */
export type LiveColor = 1 | 2 | 3 | 4;

export type LivePerson = {
	id: string;
	name: string;
	color: LiveColor;
	role: LiveRole;
	/** This browser's own row. */
	me?: boolean;
	/** 0-based index into the full deck, or null before the first report. */
	slide: number | null;
	/** Typed in the last couple of seconds. */
	editing: boolean;
	mic: 'off' | 'on' | 'speaking';
	/** Their connection dropped a moment ago and they have not come back yet (a phone that
	 *  backgrounded the tab, a network blip). Shown dimmed, not removed: "left" is for leaving. */
	away?: boolean;
	/** How this browser reaches them: one network, direct across networks, or through a relay.
	 *  `detail` is the raw candidate pair ("srflx→host (udp)"). Absent until the first read. */
	link?: { kind: 'local' | 'direct' | 'relay'; detail: string };
};

export type LiveKnock = { id: string; name: string; at: number };

export type LiveChatLine =
	/** `at` is session time (the host's clock, Tavola `now()`), shown in the viewer's own zone. */
	| { kind: 'message'; id: string; from: string; color: LiveColor; text: string; at: number; mine: boolean; pending?: boolean }
	| { kind: 'system'; id: string; text: string; at: number };

export type LiveView = {
	/** `idle` = no session; `live` = in one. (The guest's pre-admission states belong to the lobby.) */
	status: 'idle' | 'live';
	isHost: boolean;
	startedAt: number | null;
	link: string | null;
	linkRole: 'edit' | 'view';
	autoAdmit: boolean;
	people: LivePerson[];
	waiting: LiveKnock[];
	cap: number;
	chat: LiveChatLine[];
	/** The id this browser is following, if any. */
	following: string | null;
	/** The host dropped; guests keep editing but nobody new can join until it returns or the heir
	 *  takes over. */
	hostAway: boolean;
	/** Who hosts while the host's connection is down (until the host is back): a name, 'you', or
	 *  null (nobody can: no other member may edit). */
	heir: string | null;
	/** Whether calls exist yet (S4). False hides every mic control rather than showing dead ones. */
	audio: boolean;
	/** View-only members read the chat but cannot post (their document changes are never sent). */
	canChat: boolean;
	/** Names of the people typing a chat message right now (never this browser). */
	typing: string[];
};

export type LiveActions = {
	start: (name: string) => void;
	copyLink: () => void;
	setLinkRole: (r: 'edit' | 'view') => void;
	setAutoAdmit: (on: boolean) => void;
	admit: (id: string) => void;
	deny: (id: string) => void;
	remove: (id: string) => void;
	setRole: (id: string, r: 'edit' | 'view') => void;
	follow: (id: string | null) => void;
	bringEveryone: () => void;
	toggleMic: () => void;
	end: () => void;
	leave: () => void;
	sendChat: (text: string) => void;
	/** The chat draft changed: tells the others you are typing (throttled by the controller). */
	chatTyping: () => void;
	goToSlide: (index: number) => void;
};

/** What the guest sees before the host lets them in (§4.2). */
export type LobbyView = {
	stage: 'connecting' | 'ready' | 'waiting' | 'denied' | 'host-absent' | 'outdated' | 'full' | 'bad-link';
	title: string | null;
	hostName: string | null;
	slides: number | null;
	theme: string | null;
	name: string;
};

export type LobbyActions = {
	setName: (name: string) => void;
	knock: () => void;
	cancel: () => void;
	retry: () => void;
};

export const IDLE_VIEW: LiveView = {
	status: 'idle',
	isHost: false,
	startedAt: null,
	link: null,
	linkRole: 'edit',
	autoAdmit: false,
	people: [],
	waiting: [],
	cap: 4,
	chat: [],
	following: null,
	hostAway: false,
	heir: null,
	audio: false,
	canChat: true,
	typing: [],
};

/** The CSS color for a session color. The chart categorical hues are the palette's own, so a
 *  person's color re-themes with the deck's palette and mode (HARD RULE #3). */
const LIVE_COLOR_VAR: Record<LiveColor, string> = { 1: 'var(--chart-cat1)', 2: 'var(--chart-cat2)', 3: 'var(--chart-cat3)', 4: 'var(--chart-cat4)' };
export const liveColor = (c: LiveColor) => LIVE_COLOR_VAR[c];
/** The same color washed for a selection highlight behind text. */
const LIVE_COLOR_LIGHT: Record<LiveColor, string> = {
	1: 'color-mix(in srgb, var(--chart-cat1) 28%, transparent)',
	2: 'color-mix(in srgb, var(--chart-cat2) 28%, transparent)',
	3: 'color-mix(in srgb, var(--chart-cat3) 28%, transparent)',
	4: 'color-mix(in srgb, var(--chart-cat4) 28%, transparent)',
};
export const liveColorLight = (c: LiveColor) => LIVE_COLOR_LIGHT[c];

/** "Sharmarke" → "S", "Amina Hassan" → "AH". */
export function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	return (parts.length === 1 ? parts[0].slice(0, 1) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "slide 6", "#6" → 5 (0-based); used to turn chat text into jump chips. */
export const SLIDE_REF = /(?:\bslide\s+|#)(\d{1,3})\b/gi;

export function elapsed(since: number, now: number): string {
	const s = Math.max(0, Math.floor((now - since) / 1000));
	const hh = Math.floor(s / 3600);
	const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
	const ss = String(s % 60).padStart(2, '0');
	return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}
