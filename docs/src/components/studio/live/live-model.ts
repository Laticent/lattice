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
	/** What they are doing in the Studio, when they share it (not for this browser's own row). */
	doing?: LiveDoing;
	/** `off`: not on the call (no mic shown). `muted`: on the call, muted. */
	mic: 'off' | 'muted' | 'on' | 'speaking';
	/** Their connection dropped a moment ago and they have not come back yet (a phone that
	 *  backgrounded the tab, a network blip). Shown dimmed, not removed: "left" is for leaving. */
	away?: boolean;
	/** How this browser reaches them: one network, direct across networks, or through a relay.
	 *  `detail` is the raw candidate pair ("srflx→host (udp)"). Absent until the first read. */
	link?: { kind: 'local' | 'direct' | 'relay'; detail: string };
	/** How their call audio is doing, while both of you are on the call. Absent until it can be measured. */
	/** They chose not to share which slide they are on. */
	slideHidden?: boolean;
	/** How loud this browser plays them (1 = as it arrives, up to 2), while you are on the call and hear them. */
	volume?: number;
	quality?: { inKbps?: number; lostPct?: number; jitterMs?: number; sendKbps?: number };
};

/** "64 kbit/s · 0.4 % lost · 18 ms jitter" — what the person's menu says about the call audio they send you. */
export function qualityLine(q: NonNullable<LivePerson['quality']>): string {
	const parts: string[] = [];
	if (q.inKbps !== undefined) parts.push(`${Math.round(q.inKbps)} kbit/s`);
	if (q.lostPct !== undefined) parts.push(`${q.lostPct < 10 ? q.lostPct.toFixed(1) : Math.round(q.lostPct)} % lost`);
	if (q.jitterMs !== undefined) parts.push(`${Math.round(q.jitterMs)} ms jitter`);
	return parts.join(' · ');
}

/** `inCall`: the microphone is captured and sent. `denied`: the browser refused the microphone
 *  (the panel says how to allow it). `devices`: the microphones to pick from (labels appear once
 *  permission is given). */
/** What this person lets the others see of them. All on by default. */
export type LiveShare = { cursor: boolean; slide: boolean; typing: boolean; doing: boolean; pointer: boolean };

/** The Studio panels and views a member can be in, as presence carries them (2026-10-20-live-uniform-experience.md
 *  §7.6). The AI Chat panel is never one: what someone asks the AI is theirs. */
export type LivePanelId = 'coach' | 'lenses' | 'library' | 'live';
export type LiveViewId = 'compose' | 'fabricate' | 'article';
/** What a member is doing in the Studio: activity, shown to everyone, followed by whoever follows them. */
export type LiveDoing = { panel: LivePanelId | null; view: LiveViewId; presenting: boolean };
/** A remote pointer over the slide, in the slide's own coordinates (0..1 each way). */
export type LivePointer = { id: string; name: string; color: LiveColor; slide: number; x: number; y: number; clickAt: number };
/** What the pointer overlay reads: the others' pointers, and this browser's own to send. */
export type LivePointerSource = {
	subscribe: (cb: (pointers: LivePointer[]) => void) => () => void;
	send: (p: { slide: number; x: number; y: number; click?: boolean } | null) => void;
};

export type LiveCall = { inCall: boolean; muted: boolean; denied: boolean; devices: Array<{ id: string; label: string }>; device: string | null; highFidelity: boolean;
	/** How loud this browser sends, 0–2 (1 = as captured). */
	micLevel: number;
	/** Whether this browser can shape the send (Web Audio is there): false means the level control cannot act. */
	canShapeMic: boolean;
	/** The send has stopped flowing (the audio context was suspended, e.g. by a phone call): others hear silence. */
	stalled: boolean;
	/** One volume for everyone, 0–2 (1 = as it arrives), multiplied into each person's. */
	masterVolume: number;
	/** The speakers this browser can play to, the chosen one ('' or null = the system default), and whether it can choose at all (not Safari). */
	outputs: Array<{ id: string; label: string }>;
	output: string | null;
	canPickOutput: boolean;
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
	/** Whether calls work here (S4): the connection carries media and the browser can capture audio.
	 *  False hides every mic control rather than showing dead ones. */
	audio: boolean;
	/** This browser's side of the call. */
	call: LiveCall;
	/** What you let the others see of you. */
	share: LiveShare;
	/** View-only members read the chat but cannot post (their document changes are never sent). */
	canChat: boolean;
	/** Names of the people typing a chat message right now (never this browser). */
	typing: string[];
	/** Host: its own Library records the deck uses that the session does not have yet, each with a
	 *  Share button (2026-10-20-live-uniform-experience.md §6 rule 6). It stays until shared, so a
	 *  missed prompt is never a silent difference between screens. */
	unshared: LiveUnshared[];
	/** Host: it is presenting to everyone. Member: who presents to everyone and where they are, or null. */
	presentingToAll: boolean;
	present: LivePresent | null;
};

/** Where the presenter is in Present (§7.2): the rendered slide in their lens, the page of a split slide,
 *  and the lens. Every member renders the same deck, so the same index is the same slide. */
export type LiveTransport = { idx: number; page: number; lens: string; hash?: string };
export type LivePresent = LiveTransport & { by: string };

/** One of the host's records the others do not have: a theme, a finish, a custom component, or the
 *  host's saved site palette offered as the session's look. `tooLarge` cannot be shared. */
export type LiveUnshared = { key: string; kind: 'theme' | 'finish' | 'component' | 'look'; name: string; tooLarge?: boolean };

export type LiveActions = {
	start: (name: string) => void;
	/** Host: share one of its records (a `LiveUnshared` key) with the session. */
	shareRecord: (key: string) => void;
	/** Member: join (or rejoin) the presentation that is running. */
	joinPresent: () => void;
	/** Host: start or stop presenting to everyone. */
	presentToEveryone: (on: boolean) => void;
	/** Host, presenting to everyone: where its Present is now. */
	presentTransport: (t: LiveTransport) => void;
	/** Mix a live stream into what this browser sends on the call (the presenter's narration), or take
	 *  the last one out (null). It waits for the call if there is none yet. */
	mixIntoCall: (stream: MediaStream | null) => void;
	/** Host: play a shipped tour on every member's screen at once (§7.5). True when it went to the room;
	 *  false when there is no room to send it to, and the tour plays here only. */
	tourForEveryone: (tourId: string) => boolean;
	/** Resolves whether the link reached the clipboard. */
	copyLink: () => Promise<boolean>;
	setLinkRole: (r: 'edit' | 'view') => void;
	setAutoAdmit: (on: boolean) => void;
	admit: (id: string) => void;
	deny: (id: string) => void;
	remove: (id: string) => void;
	setRole: (id: string, r: 'edit' | 'view') => void;
	follow: (id: string | null) => void;
	bringEveryone: () => void;
	/** Join the call (first time), else mute or unmute. */
	toggleMic: () => void;
	leaveCall: () => void;
	pickMic: (deviceId: string) => void;
	/** Send this browser's audio with voice processing off and a higher rate (music, a demo). */
	setHighFidelity: (on: boolean) => void;
	/** How loud to send your own microphone, 0–2 (1 = as captured). Kept across calls in this tab. */
	setMicLevel: (level: number) => void;
	/** Choose what the others see of you: your cursor, your slide, when you are typing. Kept for this tab. */
	setShare: (patch: Partial<LiveShare>) => void;
	/** Copy the connection timeline (state changes, restarts, paths) for a bug report. Resolves whether it reached the clipboard. */
	copyLog: () => Promise<boolean>;
	/** Change the name others see (the host cleans it and may ignore a rapid second change). */
	rename: (name: string) => void;
	/** One volume for everyone you hear, 0–2. */
	setMasterVolume: (volume: number) => void;
	/** Play call audio through this speaker (where the browser allows it). */
	pickOutput: (deviceId: string) => void;
	/** The level of what you are sending now, 0–1, for the meter. Cheap: call it on a frame. */
	inputLevel: () => number;
	/** How loud to play one person, 0–2 (1 = as it arrives). Kept for this session. */
	setVolume: (id: string, volume: number) => void;
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
	share: { cursor: true, slide: true, typing: true, doing: true, pointer: true },
	call: { inCall: false, muted: false, denied: false, devices: [], device: null, highFidelity: false, micLevel: 1, canShapeMic: false, stalled: false, masterVolume: 1, outputs: [], output: null, canPickOutput: false },
	canChat: true,
	typing: [],
	unshared: [],
	presentingToAll: false,
	present: null,
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
