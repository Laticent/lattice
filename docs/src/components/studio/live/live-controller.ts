import type { Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { cleanName, createHostKey, createSession, formatFragment, formatLink, fromBase64Url, type HostKey, hostKeyFrom, type LinkPath, linkKind, mintLink, parseFragment, type Session, type SessionState, type Succession, type TokenEntry, toBase64Url, tokenId } from '@/lib/tavola';
import { trysteroTransport } from '@/lib/tavola/adapters/trystero';
import { LiveAudio } from './live-audio';
import { LIVE_TURN } from './live-ice';
import { IDLE_VIEW, type LiveActions, type LiveChatLine, type LiveColor, type LivePerson, type LiveView, type LobbyActions, type LobbyView, liveColor, liveColorLight } from './live-model';
import { clearJoinIntent, HOST_KEY, hasFreshJoin, type LiveCollab, type LiveDeps, type LiveHost, readSealedJoin, saveName, scrubLiveFragment, storedLiveName, storeSealedJoin, takeFreshJoin } from './live-store';
import { deleteHostPrivateKey, getHostPrivateKey, putHostPrivateKey, seal, unseal } from './secret-box';

// The Studio's side of a live session, loaded only when a session starts or a link is opened
// (use-live-session.ts holds the tiny always-loaded half). It turns a Tavola session plus a Yjs
// document into the Live view model and hands the editor a CodeMirror binding.
// See engineering/decisions/2026-10-06-studio-live-collaboration.md §4–§6.
//
// ONE SOURCE OF TRUTH while live: the shared `Y.Text`. The editor binds to it directly; every
// OTHER writer of the Studio's `source` (Compose, AI apply, settings, fix-all, restore) lands in
// React state first, and `update()` rebases that change onto the shared text. The editor skips its
// own `value` sync while bound, so a change is never applied twice.
//
// NOTHING A PEER SAYS ABOUT ITSELF IS TRUSTED for presence or chat (red-team, 2026-10-06 and round
// 2). An awareness entry counts only for the client id the host's roster binds to the peer that
// sent it, its name and color are rebuilt from the roster, a "summon" counts only from the host,
// and chat rides Tavola's post channel, so a line's author is the transport sender — never a field
// it carries, and never a Yjs client id (which any editor can forge inside a document update).

/** localStorage: room → { deckId, token }, so a guest's linked copy and rejoin token survive a
 *  reload. The token is a credential, so it is stored SEALED (secret-box.ts). */
const LINKS_KEY = 'lattice-live-links';
const TYPING_MS = 2500;
const CHAT_MAX = 1000;
/** Lines a browser keeps, and the host hands a newcomer. */
const CHAT_KEEP = 500;

/** `minTerm`: the lowest host term this browser follows (Tavola `SessionState.minTerm`), kept so a
 *  reload is not caught by a withdrawn heir before the host says hello. Not a secret. */
type Linked = { deckId?: string; token?: string; minTerm?: number };
const readLinks = (): Record<string, Linked> => {
	try {
		return JSON.parse(localStorage.getItem(LINKS_KEY) || '{}');
	} catch {
		return {};
	}
};
const writeLink = (room: string, patch: Linked) => {
	try {
		const all = readLinks();
		all[room] = { ...all[room], ...patch };
		localStorage.setItem(LINKS_KEY, JSON.stringify(all));
	} catch {}
};

/** What a hosting tab keeps in sessionStorage. The secret and the tokens are sealed; the signing key
 *  lives in IndexedDB as a non-extractable CryptoKey (`putHostPrivateKey`), never in this record. */
type HostSave = { room: string; sealed: string; pub: string; name: string; deckId: string; doc: string; startedAt: number };
/** What `HostSave.sealed` opens to. Chat is in here because people paste things into chat. */
type HostSealed = { secret: string; tokens: TokenEntry[]; chat?: ChatLine[]; sids?: Array<[sid: string, owner: string]>; succession?: Succession; selfToken?: string };
const toB64 = (u: Uint8Array) => {
	let s = '';
	for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
	return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const readHostSave = (): HostSave | null => {
	try {
		return JSON.parse(sessionStorage.getItem(HOST_KEY) || 'null');
	} catch {
		return null;
	}
};
const clearHostSave = () => {
	try {
		sessionStorage.removeItem(HOST_KEY);
	} catch {}
};

/**
 * A chat line as the HOST ordered it. The host is the chat's one authority, as it is the session
 * clock's (Tavola `now()`): `seq` is the session's order (1, 2, 3…, the same on every browser),
 * `at` is session time, and `name` / `color` are the roster's when the host took the line in.
 */
type ChatLine = { seq: number; id: string; peer: string; name: string; color: LiveColor; text: string; at: number };
/** A line this browser sent that the host has not echoed back yet ("Sending…"). */
type Pending = { id: string; text: string; at: number; tries?: number };
/** A waiting line given up on after this many resends (about 1.5 min), with a note: one the host can
 *  never take (its id belongs to an old rejoin token) must not say "Sending…" forever. */
const MAX_TRIES = 6;
/**
 * Posts on Tavola's app channel. Chat goes THROUGH the host:
 *   member → host  `say`    a line, with an id the member chose (the host drops a repeat)
 *   host → all     `line`   that line, numbered and stamped
 *   member → host  `since`  "I have everything up to `seq`" — on admission, return, or a gap
 *   host → member  `lines`  everything after it, plus the session's start time
 *   host → member  `tip`    the latest number, so a returning member knows whether to ask
 * plus `typing` and `bye`, which are not chat and go to everyone directly.
 */
type Post =
	| { k: 'say'; id: string; text: string; have?: number }
	| { k: 'gone'; id: string; name: string; color: LiveColor }
	| { k: 'line'; line: ChatLine }
	| { k: 'since'; seq: number }
	| { k: 'lines'; lines: ChatLine[]; startedAt: number }
	| { k: 'tip'; seq: number; startedAt: number }
	| { k: 'typing' }
	| { k: 'bye' }
	/** a member's own microphone state (about itself only; who is SPEAKING is measured, never said) */
	| { k: 'mic'; on: boolean }
	/** host → its heir: who owns each chat-id prefix, by rejoin token, so the chat keeps its owners
	 *  when the heir takes over (the host's own lines under its own rejoin token). */
	| { k: 'sids'; sids: Array<[sid: string, owner: string]> }
	/** a regent that stepped down → the host that took the session back: the lines it numbered
	 *  meanwhile, and the chat-id owners it learned. Taken only from a member that host certified. */
	| { k: 'handback'; lines: ChatLine[]; sids: Array<[sid: string, owner: string]> };
/** How long a dropped member shows as reconnecting before the chat says they left. A phone that
 *  backgrounds a tab drops its connection within seconds and comes back when the tab returns. */
const AWAY_GRACE_MS = 60_000;
/** A "typing" post counts for this long; the typist re-sends at most every TYPING_POST_MS. */
const TYPING_SHOW_MS = 4000;
const TYPING_POST_MS = 2000;
/** sessionStorage: a member's lines still waiting for the host, sealed, so a reload keeps them. */
const PENDING_KEY = 'lattice-live-pending';
/** A dropped member is remembered by name AND color: names repeat ("Guest"), and a rejoin by token
 *  keeps both (checker round 3, finding 4). */
const awayKey = (m: { name: string; color: LiveColor }) => `${m.color}|${m.name}`;
/** sessionStorage: every chat-id prefix this tab has used in a room, so "mine" survives a reload. */
const MY_SIDS_KEY = 'lattice-live-sids';
const sidOf = (id: string) => id.split(':')[0] ?? '';
/** A fresh prefix for this page load, remembered so an earlier load's lines still read as mine. */
const newSid = (room: string): { sid: string; mine: Set<string> } => {
	const sid = Math.random().toString(36).slice(2, 10);
	let sids: string[] = [];
	try {
		const saved = JSON.parse(sessionStorage.getItem(MY_SIDS_KEY) || 'null') as { room?: string; sids?: string[] } | null;
		sids = saved?.room === room && Array.isArray(saved.sids) ? saved.sids.filter((x) => typeof x === 'string').slice(-20) : [];
		sessionStorage.setItem(MY_SIDS_KEY, JSON.stringify({ room, sids: [...sids, sid] }));
	} catch {}
	return { sid, mine: new Set([...sids, sid]) };
};
/** A member re-sends waiting lines this often, whatever else happens (inversion round 3, item 3). */
const RESEND_MS = 15_000;
/** Seconds between reads of the network path to each member. */
const PATHS_EVERY = 5;
const enc = new TextEncoder();
const dec = new TextDecoder();
const isColor = (c: unknown): c is LiveColor => c === 1 || c === 2 || c === 3 || c === 4;
/** A history line from the host, kept only in the shape a line has. */
const cleanLine = (x: unknown): ChatLine | null => {
	const l = x as Partial<ChatLine> | null;
	if (!l || typeof l !== 'object' || !Number.isSafeInteger(l.seq) || (l.seq as number) < 1 || typeof l.id !== 'string' || typeof l.peer !== 'string' || typeof l.name !== 'string' || typeof l.text !== 'string' || !isColor(l.color) || typeof l.at !== 'number' || !Number.isFinite(l.at) || Math.abs(l.at) > 1e14) return null;
	return { seq: l.seq as number, id: l.id.slice(0, 120), peer: l.peer.slice(0, 120), name: cleanName(l.name), color: l.color, text: l.text.slice(0, CHAT_MAX), at: l.at };
};

/** This tab's hold on hosting `room` (navigator.locks): a duplicated tab copies sessionStorage and
 *  would otherwise resume as a second host of the same room (inversion round 2, item 4). Resolves
 *  to a release function, or null when another tab already hosts it. */
function holdHostLock(room: string): Promise<(() => void) | null> {
	const locks = (typeof navigator !== 'undefined' ? navigator.locks : undefined) as LockManager | undefined;
	if (!locks) return Promise.resolve(() => {});
	return new Promise((resolve) => {
		void locks
			.request(`lattice-live-host:${room}`, { ifAvailable: true }, (lock) => {
				if (!lock) {
					resolve(null);
					return;
				}
				return new Promise<void>((release) => resolve(() => release()));
			})
			.catch(() => resolve(() => {}));
	});
}
type AwState = { peer?: string; user?: { name: string; color: string; colorLight: string }; slide?: number; editingAt?: number; summon?: { slide: number; n: number }; cursor?: { anchor: unknown; head: unknown } };

type Runtime = {
	session: Session;
	doc: Y.Doc;
	ytext: Y.Text;
	aw: Awareness;
	room: string;
	secret: string;
	link: string;
	startedAt: number;
	ext: Extension;
	key: HostKey | null;
	/** Awareness client id → the peer whose state we accepted for it (the roster bound them). */
	owner: Map<number, string>;
	/** This browser's chat counter; a line's id is `<sid>:<n>`, `sid` random per session. */
	chatN: number;
	sid: string;
	/** Every prefix this tab has used in this room (read once, at wire time). */
	mine: Set<string>;
	/** The host's document has arrived (a guest may not open the deck before it has). */
	gotDoc: boolean;
	disposers: Array<() => void>;
	/** The host lock (`navigator.locks`), held while this tab hosts. */
	release: (() => void) | null;
};

/**
 * The edit that turns `base` into `next`, located in `cur` (which may have moved on since `base`).
 * The changed span is found by the unchanged text on either side of it. When that text is gone the
 * edit is refused (null) rather than guessed: a guessed delete removes text the writer never saw, a
 * guessed replace doubles it, and a guessed insert lands mid-sentence in a co-author's line
 * (red-team round 2, finding 4).
 */
export function rebase(base: string, next: string, cur: string): { from: number; to: number; insert: string } | null {
	let p = 0;
	const min = Math.min(base.length, next.length);
	while (p < min && base.charCodeAt(p) === next.charCodeAt(p)) p++;
	let s = 0;
	while (s < min - p && base.charCodeAt(base.length - 1 - s) === next.charCodeAt(next.length - 1 - s)) s++;
	const insert = next.slice(p, next.length - s);
	const removed = base.slice(p, base.length - s);
	if (cur === base) return { from: p, to: base.length - s, insert };
	const ANCHOR = 24;
	const before = base.slice(Math.max(0, p - ANCHOR), p);
	const after = base.slice(base.length - s, base.length - s + ANCHOR);
	const needle = before + removed + after;
	if (needle.length === 0) return null;
	let at = -1;
	let best = Number.POSITIVE_INFINITY;
	for (let i = cur.indexOf(needle); i !== -1; i = cur.indexOf(needle, i + 1)) {
		const d = Math.abs(i - (p - before.length));
		if (d < best) {
			best = d;
			at = i;
		}
	}
	if (at === -1) return null;
	const from = at + before.length;
	return { from, to: from + removed.length, insert };
}

/** A y-codemirror caret position, kept only in the shape y-codemirror can read: one bad field there
 *  throws inside CodeMirror and turns off everyone's remote carets (red-team round 2, finding 5). */
function cleanRelPos(x: unknown): Record<string, unknown> | null {
	if (!x || typeof x !== 'object') return null;
	const p = x as Record<string, unknown>;
	const id = (v: unknown): { client: number; clock: number } | null => {
		const o = v as { client?: unknown; clock?: unknown } | null;
		return o && typeof o === 'object' && Number.isSafeInteger(o.client) && Number.isSafeInteger(o.clock) ? { client: o.client as number, clock: o.clock as number } : null;
	};
	const out: Record<string, unknown> = {};
	const item = id(p.item);
	const type = id(p.type);
	if (item) out.item = item;
	if (type) out.type = type;
	if (typeof p.tname === 'string') out.tname = p.tname.slice(0, 64);
	if (!item && !type && out.tname === undefined) return null;
	if (Number.isInteger(p.assoc)) out.assoc = p.assoc;
	return out;
}

/** The client ids in an awareness update (one this file encoded, so it decodes). */
function awarenessClients(u: Uint8Array): number[] {
	const d = decoding.createDecoder(u);
	const n = decoding.readVarUint(d);
	const out: number[] = [];
	for (let i = 0; i < n; i++) {
		out.push(decoding.readVarUint(d));
		decoding.readVarUint(d);
		decoding.readVarString(d);
	}
	return out;
}

/**
 * Rewrite an incoming awareness update so it says only what `from` may say: an entry is kept only
 * for a client id the host's roster binds to `from` (`ownerOf`), and each state's `peer`, `user`
 * (name and color, from the roster), `summon` (host only) and `cursor` (shape-checked) are rebuilt
 * rather than believed. Returns null when nothing survives or the bytes do not decode.
 */
export function sanitizeAwareness(update: Uint8Array, from: string, ownerOf: (client: number) => string | undefined, member: { name: string; color: LiveColor; role: string } | undefined): Uint8Array | null {
	if (!member) return null;
	const entries: Array<[number, number, string]> = [];
	try {
		const dec = decoding.createDecoder(update);
		const n = decoding.readVarUint(dec);
		for (let i = 0; i < n; i++) {
			const client = decoding.readVarUint(dec);
			const clock = decoding.readVarUint(dec);
			const raw = decoding.readVarString(dec);
			if (ownerOf(client) === from) entries.push([client, clock, raw]);
		}
	} catch {
		return null;
	}
	const out: Array<[number, number, string]> = [];
	for (const [client, clock, raw] of entries) {
		let state: AwState | null = null;
		try {
			state = JSON.parse(raw);
		} catch {
			continue;
		}
		if (state !== null && typeof state === 'object') {
			const clean: AwState = { peer: from, user: { name: member.name, color: liveColor(member.color), colorLight: liveColorLight(member.color) } };
			const st = state as Record<string, unknown>;
			if (Number.isInteger(st.slide) && (st.slide as number) >= 0) clean.slide = st.slide as number;
			if (typeof st.editingAt === 'number') clean.editingAt = st.editingAt;
			const sm = st.summon as { slide?: unknown; n?: unknown } | undefined;
			if (member.role === 'host' && sm && Number.isInteger(sm.slide) && Number.isInteger(sm.n)) clean.summon = { slide: sm.slide as number, n: sm.n as number };
			const cur = st.cursor as { anchor?: unknown; head?: unknown } | undefined;
			const anchor = cleanRelPos(cur?.anchor);
			const head = cleanRelPos(cur?.head);
			if (anchor && head) clean.cursor = { anchor, head };
			state = clean;
		}
		out.push([client, clock, JSON.stringify(state)]);
	}
	if (out.length === 0) return null;
	const enc = encoding.createEncoder();
	encoding.writeVarUint(enc, out.length);
	for (const [client, clock, json] of out) {
		encoding.writeVarUint(enc, client);
		encoding.writeVarUint(enc, clock);
		encoding.writeVarString(enc, json);
	}
	return encoding.toUint8Array(enc);
}

export class LiveController {
	private rt: Runtime | null = null;
	private deps: LiveDeps;
	private following: string | null = null;
	private lobbyName = storedLiveName();
	private lobbyOpen = false;
	private bound = false;
	private systemLines: LiveChatLine[] = [];
	private fromY = new Set<string>();
	private prevSource: string;
	private boundDeck: string | null = null;
	private ticker: ReturnType<typeof setInterval> | null = null;
	/** Members whose link dropped and who have not come back, by name (a rejoin by token keeps it). */
	private away = new Map<string, { name: string; color: LiveColor; role: SessionState['members'][number]['role']; timer: ReturnType<typeof setTimeout> }>();
	/** Peers that said goodbye (Leave), so their departure is news at once. */
	private byes = new Set<string>();
	/** Members the host removed: their departure is final at once. */
	private removed = new Set<string>();
	private typingAt = new Map<string, number>();
	/** Member: lines sent but not yet echoed by the host. */
	private pending: Pending[] = [];
	/** Host: the last number given; member: the highest number held. */
	private seq = 0;
	/** Host: each chat-id prefix (`sid`) belongs to the member who first used it, by REJOIN TOKEN —
	 *  the identity the host verified, which a name and color are not (red team round 3, finding 1). */
	private sidOwner = new Map<string, string>();
	/** Host: who already moved the numbering floor since their admission, and when each last asked. */
	private floorFrom = new Set<string>();
	private sinceAt = new Map<string, number>();
	private sinceLater = new Set<string>();
	/** Member: the host's session start (session time), from its `lines` / `tip`. */
	private hostStartedAt: number | null = null;
	private lastTypingPost = 0;
	private lastSummon = 0;
	private followJump = false;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private chat: ChatLine[] = [];
	/** The last sealed host blob, so an unload can write the save without waiting on WebCrypto. */
	private lastSealed: { room: string; sealed: string } | null = null;
	/** The lobby could not read the link at all (cut off, mistyped) — not a network failure. */
	private badLink = false;
	/** A teardown is running: stage changes it causes are not news (checker round 2, finding 2). */
	private tearing = false;
	private resuming: Promise<void> | null = null;
	/** Seals finish out of order; only the newest one becomes the save. */
	private sealSeq = 0;
	/** The network path to each member, re-read every few seconds (the two-network check reads it). */
	private paths: Record<string, LinkPath> = {};
	/** Heir: the chat-id owners the host handed over, for when this browser takes over. */
	private heirSids: Array<[string, string]> = [];
	/** Host: what was last handed to the heir, so it is sent once per change. */
	private sentSids = '';
	/** The call (S4): the microphone, playback and levels. */
	private audio: LiveAudio | null = null;
	/** Peer → whether it says its microphone is on (muted is off). */
	private remoteMic = new Map<string, boolean>();
	private speakingNow = new Set<string>();
	private speakTimer: ReturnType<typeof setInterval> | null = null;
	private micDenied = false;
	private micDevices: Array<{ id: string; label: string }> = [];
	/** The tab title before "On air · " was put in front of it. */
	private plainTitle: string | null = null;
	/** A regency just ended here: hand the chat back once the returning host admits us. */
	private handbackDue = false;
	/** The id of the rejoin token this browser hosted under (its owner id for its own chat lines). */
	private lastSelfId: string | null = null;
	now = Date.now();

	constructor(
		private host: LiveHost,
		deps: LiveDeps,
	) {
		this.deps = deps;
		this.prevSource = deps.source;
	}

	// ── lifecycle ──────────────────────────────────────────────────────────
	/** Resume what this tab was doing before a reload: hosting, or a join (link or carried intent).
	 *  Safe to call twice at once (StrictMode runs the effect twice — checker round 2, finding 5), and
	 *  again later for a link pasted into this tab (`hashchange`). */
	resume(): Promise<void> {
		this.resuming ??= (async () => {
			// A link pasted while a resume runs is picked up by another pass, not dropped.
			do await this.doResume();
			while (hasFreshJoin());
		})().finally(() => {
			this.resuming = null;
		});
		return this.resuming;
	}

	private async doResume(): Promise<void> {
		const fresh = takeFreshJoin();
		if (fresh) this.badLink = false;
		// The link is in memory now; only now is it safe to take it out of the address bar (a failed
		// load before this point leaves it there, so a reload still works — inversion round 2, item 1).
		scrubLiveFragment();
		if (this.rt) {
			if (fresh) this.host.notify('Leave this live session before joining another.');
			return;
		}
		const hosting = readHostSave();
		if (!fresh && hosting && hosting.deckId === this.deps.deckId) {
			const release = await holdHostLock(hosting.room);
			if (!release) {
				clearHostSave();
				this.host.notify('This live session is already open in another tab.');
				return;
			}
			try {
				const opened = JSON.parse((await unseal(hosting.sealed)) ?? 'null') as HostSealed | null;
				const priv = await getHostPrivateKey(hosting.room);
				if (!opened || !priv) throw new Error('nothing to resume');
				const key = await hostKeyFrom(priv, fromBase64Url(hosting.pub));
				this.chat = (opened.chat ?? []).map(cleanLine).filter((l): l is ChatLine => !!l);
				this.seq = this.chat.reduce((m, l) => Math.max(m, l.seq), 0);
				this.sidOwner = new Map((opened.sids ?? []).filter((e) => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string'));
				this.wire({ room: hosting.room, secret: opened.secret, key, host: { name: hosting.name, tokens: opened.tokens, doc: hosting.doc, succession: opened.succession, selfToken: opened.selfToken }, startedAt: hosting.startedAt, release });
				this.bound = true;
				this.boundDeck = hosting.deckId;
				this.host.notify('Your live session is back. People who were in rejoin without knocking.');
			} catch {
				release();
				clearHostSave();
			}
			this.host.rerender();
			return;
		}
		if (hosting && !fresh) clearHostSave();
		let raw = fresh;
		if (fresh) {
			// Carry the join across an OAuth round trip or a reload, sealed. A browser without working
			// IndexedDB still joins; it just cannot carry the join (inversion round 2, item 5).
			try {
				storeSealedJoin(await seal(fresh));
			} catch {}
		} else raw = await unseal(readSealedJoin()).catch(() => null);
		if (!raw) {
			clearJoinIntent();
			return;
		}
		const parts = parseFragment(`live=${raw}`);
		this.lobbyOpen = true;
		if (!parts) {
			this.badLink = true;
			clearJoinIntent();
			this.host.rerender();
			return;
		}
		const token = (await unseal(readLinks()[parts.room]?.token).catch(() => null)) ?? undefined;
		let waiting: Pending[] = [];
		try {
			const saved = JSON.parse((await unseal(sessionStorage.getItem(PENDING_KEY)).catch(() => null)) ?? 'null') as { room?: string; pending?: Pending[] } | null;
			if (saved?.room === parts.room && Array.isArray(saved.pending)) waiting = saved.pending.filter((p) => typeof p?.id === 'string' && typeof p.text === 'string' && typeof p.at === 'number').slice(0, 50);
		} catch {}
		if (this.rt) return;
		const minTerm = readLinks()[parts.room]?.minTerm;
		this.wire({ room: parts.room, secret: parts.secret, hostFingerprint: parts.host, token, ...(Number.isSafeInteger(minTerm) ? { minTerm } : {}) });
		// Lines that were waiting when this tab reloaded go out on admission (catchUp).
		this.pending = waiting;
		this.host.rerender();
	}

	private wire(args: { room: string; secret: string; key?: HostKey; hostFingerprint?: string; host?: { name: string; tokens?: TokenEntry[]; doc?: string; succession?: Succession; selfToken?: string }; token?: string; minTerm?: number; startedAt?: number; release?: () => void }) {
		const d = this.deps;
		const doc = new Y.Doc();
		const ytext = doc.getText('source');
		if (args.host?.doc) Y.applyUpdate(doc, fromB64(args.host.doc));
		else if (args.host) ytext.insert(0, d.source);
		const aw = new Awareness(doc);
		const REMOTE = Symbol('tavola-remote');
		const owner = new Map<number, string>();
		let rt: Runtime | null = null;
		const memberOf = (peer: string) => rt?.session.getState().members.find((m) => m.id === peer);
		const ownerOf = (client: number) => {
			if (client === aw.clientID) return undefined;
			return rt?.session.getState().members.find((m) => m.client === client)?.id;
		};
		const docStream = {
			encodeAll: () => Y.encodeStateAsUpdate(doc),
			applyRemote: (u: Uint8Array) => {
				Y.applyUpdate(doc, u, REMOTE);
				if (rt && !rt.gotDoc) {
					rt.gotDoc = true;
					this.maybeOpenShared();
				}
			},
			onLocal(cb: (u: Uint8Array) => void) {
				const h = (u: Uint8Array, origin: unknown) => {
					if (origin !== REMOTE) cb(u);
				};
				doc.on('update', h);
				return () => doc.off('update', h);
			},
		};
		const awStream = {
			encodeAll: () => encodeAwarenessUpdate(aw, [aw.clientID]),
			applyRemote: (u: Uint8Array, from: string) => {
				const clean = sanitizeAwareness(u, from, ownerOf, memberOf(from));
				if (!clean) return;
				for (const c of awarenessClients(clean)) owner.set(c, from);
				applyAwarenessUpdate(aw, clean, from);
			},
			onLocal(cb: (u: Uint8Array) => void) {
				const h = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
					if (origin !== 'local') return;
					const mine = [...added, ...updated, ...removed].filter((c) => c === aw.clientID);
					if (mine.length) cb(encodeAwarenessUpdate(aw, mine));
				};
				aw.on('update', h);
				return () => aw.off('update', h);
			},
			forget(peer: string) {
				const ids = [...owner].filter(([, p]) => p === peer).map(([c]) => c);
				for (const c of ids) owner.delete(c);
				if (ids.length) removeAwarenessStates(aw, ids, 'tavola');
			},
		};
		const key = args.key ?? null;
		const audio = new LiveAudio(() => this.host.rerender());
		this.audio = audio;
		const session = createSession({
			media: { add: (stream, from) => {
				audio.addRemote(from, stream);
				this.startSpeaking();
				// Their stream is (back) here: tell them our microphone state too, since after a blip or a
				// takeover neither side sees the other as a newcomer (checker, 2026-10-07).
				if (audio.inCall) this.post({ k: 'mic', on: !audio.isMuted }, from);
			}, drop: (from) => audio.dropRemote(from) },
			transport: trysteroTransport(args.room, args.secret, { turnConfig: LIVE_TURN }),
			doc: docStream,
			awareness: awStream,
			...(args.host && key ? { host: { name: args.host.name, key, tokens: args.host.tokens, ...(args.host.succession ? { succession: args.host.succession } : {}), ...(args.host.selfToken ? { selfToken: args.host.selfToken } : {}), invite: { title: d.deckTitle, hostName: args.host.name, slides: d.slideCount, theme: d.theme } } } : { hostFingerprint: args.hostFingerprint }),
			...(args.token ? { token: args.token } : {}),
			...(args.minTerm !== undefined ? { minTerm: args.minTerm } : {}),
			client: aw.clientID,
			onPost: (data, from) => this.onPost(data, from),
		});
		// The binding brings its own undo manager, scoped to THIS browser's changes, in place of
		// CodeMirror's history (which would put everyone's edits on your undo stack).
		const ext = [yCollab(ytext, aw, { undoManager: new Y.UndoManager(ytext) }), keymap.of(yUndoManagerKeymap)];
		// The LINK's fingerprint: a host that took over signs with its own key, certified by the link's.
		const fingerprint = args.host?.succession?.fingerprint ?? key?.fingerprint ?? (args.hostFingerprint as string);
		// The link is this page's address WITHOUT its query: a query can carry anything the host's
		// address bar happened to hold (inversion round 2, item 6).
		rt = { session, doc, ytext, aw, room: args.room, secret: args.secret, link: formatLink(location.origin + location.pathname, { room: args.room, secret: args.secret, host: fingerprint }), startedAt: args.startedAt ?? Date.now(), ext, key, owner, chatN: 0, ...newSid(args.room), gotDoc: !!args.host, disposers: [], release: args.release ?? null };
		rt.disposers.push(() => {
			rt?.release?.();
			if (rt) rt.release = null;
		});
		this.rt = rt;
		const r = rt;

		let prev: SessionState = session.getState();
		r.disposers.push(
			session.subscribe(() => {
				const s = session.getState();
				const before = new Map(prev.members.map((m) => [m.id, m]));
				if (prev.stage === 'live' && s.stage === 'live') {
					for (const m of s.members) {
						if (before.has(m.id) || m.id === s.selfId) continue;
						// Every (re)admitted member learns the latest line number, and asks for what it lacks
						// (`since`): a member whose tab was in the background comes back to exactly the lines
						// it missed, by number — no clock is compared. A beat later, so the admission lands
						// first.
						if (s.isHost) {
							const to = m.id;
							this.floorFrom.delete(to);
							this.sinceAt.delete(to);
							setTimeout(() => {
								if (this.rt === r) this.post({ k: 'tip', seq: this.seq, startedAt: r.startedAt }, to);
							}, 400);
						}
						// A newcomer learns whether our microphone is on (who is speaking it measures itself).
						if (this.audio?.inCall) this.post({ k: 'mic', on: !this.audio.isMuted }, m.id);
						// Back from a dropped link (a backgrounded phone tab, a blip): not news.
						const back = this.away.get(awayKey(m));
						if (back) {
							clearTimeout(back.timer);
							this.away.delete(awayKey(m));
						} else this.sys(`${m.name} joined${m.role === 'view' ? ' · can view' : ''}`);
					}
					// Someone left or was removed: the host saves now, not a second later, so a reload
					// right after a removal cannot bring back the token it revoked (red-team round 2).
					// If that save fails, drop the old one: a stale save would bring a revoked token back.
					if (s.isHost && [...before.keys()].some((id) => !s.members.some((x) => x.id === id)))
						void this.saveHost().then((ok) => {
							if (!ok) clearHostSave();
						});
					for (const [id, m] of before) {
						if (s.members.some((x) => x.id === id) || id === s.selfId) continue;
						this.typingAt.delete(id);
						this.remoteMic.delete(id);
						if (this.removed.delete(id)) {
							this.sys(`${m.name} was removed`);
							continue;
						}
						if (this.byes.delete(id)) {
							this.sys(`${m.name} left`);
							continue;
						}
						// A dropped link, not a goodbye: show them as reconnecting, and say "left" only if
						// they are still gone after the grace period.
						const prevAway = this.away.get(awayKey(m));
						if (prevAway) clearTimeout(prevAway.timer);
						const timer = setTimeout(() => {
							if (this.away.get(awayKey(m))?.timer !== timer) return;
							this.away.delete(awayKey(m));
							this.sys(`${m.name} left`);
							this.host.rerender();
						}, AWAY_GRACE_MS);
						this.away.set(awayKey(m), { name: m.name, color: m.color, role: m.role, timer });
					}
					for (const m of s.members) {
						const was = before.get(m.id);
						if (!was || was.role === m.role || was.role === 'host') continue;
						// The heir took over: its own browser says so in `onTookOver`.
						if (m.role === 'host') {
							if (m.id !== s.selfId) this.sys(`${m.name} is hosting now`);
						} else this.sys(`${m.name} ${m.role === 'view' ? 'can now only view' : 'can now edit'}`);
					}
				}
				// Made view-only with lines still waiting: they can no longer be sent. Say so once.
				if (!s.isHost && prev.me && prev.me.role !== 'view' && s.me?.role === 'view' && this.pending.length) {
					this.setPending([]);
					this.sys('You can now only view, so your unsent messages were not sent.');
				}
				// The host is back (its link returned): catch up, and send what waited.
				if (!s.isHost && s.stage === 'live' && prev.hostAway && !s.hostAway) this.catchUp();
				if (s.token && s.token !== prev.token) {
					const tok = s.token;
					void seal(tok).then(
						(sealed) => writeLink(r.room, { token: sealed }),
						() => {},
					);
				}
				if (prev.stage === 'live' && s.stage === 'live') {
					if (!prev.isHost && s.isHost) this.onTookOver(r);
					else if (prev.isHost && !s.isHost) this.onSteppedDown(r);
				}
				if (!s.isHost && s.minTerm !== prev.minTerm) writeLink(r.room, { minTerm: s.minTerm });
				if (this.handbackDue && !s.isHost && s.stage === 'live' && !s.hostAway) {
					const to = s.members.find((m) => m.role === 'host')?.id;
					if (to) {
						this.handbackDue = false;
						this.post({ k: 'handback', lines: this.chat, sids: [...this.sidOwner].map(([sid, owner]): [string, string] => [sid, owner === 'host' ? (this.lastSelfId ?? owner) : owner]) }, to);
					}
				}
				if (s.isHost && s.heir !== prev.heir) this.sentSids = '';
				if (s.isHost) this.sendSids();
				if (prev.stage !== s.stage) this.onStage(prev.stage, s);
				prev = s;
				this.saveHostSoon();
				this.host.rerender();
			}),
		);
		const onAw = () => {
			this.onAwareness();
			this.host.rerender();
		};
		aw.on('change', onAw);
		r.disposers.push(() => aw.off('change', onAw));
		// Y → Studio: mirror every shared change into React state (the preview, Coach, lint…).
		const mirror = () => {
			if (!this.bound) return;
			const next = ytext.toString();
			this.fromY.add(next);
			if (next !== this.deps.source) this.host.setSource(next);
		};
		ytext.observe(mirror);
		r.disposers.push(() => ytext.unobserve(mirror));
		// My typing, for the "editing" mark.
		let lastEdit = 0;
		const onLocalEdit = (_e: unknown, tr: Y.Transaction) => {
			if (!tr.local) return;
			const t = session.now();
			if (t - lastEdit < 1000) return;
			lastEdit = t;
			// Session time, so every browser compares it against the same clock.
			aw.setLocalStateField('editingAt', t);
		};
		ytext.observe(onLocalEdit);
		r.disposers.push(() => ytext.unobserve(onLocalEdit));
		// Hosting survives a reload: keep the session's state in this tab's sessionStorage.
		const onDocUpdate = () => this.saveHostSoon();
		doc.on('update', onDocUpdate);
		r.disposers.push(() => doc.off('update', onDocUpdate));
		let resendIn = RESEND_MS;
		let pathsIn = 1;
		this.ticker = setInterval(() => {
			this.now = this.rt ? this.rt.session.now() : Date.now();
			// "Sending…" never waits on an event that may not come: retry on a timer too.
			resendIn -= 1000;
			if (resendIn <= 0) {
				resendIn = RESEND_MS;
				if (this.pending.length) this.catchUp();
			}
			if (--pathsIn <= 0) {
				pathsIn = PATHS_EVERY;
				void r.session.paths().then((p) => {
					if (this.rt === r) this.paths = p;
				});
			}
			if (this.rt?.session.getState().stage === 'live') this.host.rerender();
		}, 1000);
		this.host.rerender();
	}

	private teardown(how: 'leave' | 'end', opts: { linger?: boolean } = {}) {
		const r = this.rt;
		if (!r) return;
		this.tearing = true;
		try {
			this.teardownNow(r, how, opts.linger ?? false);
		} finally {
			this.tearing = false;
		}
	}

	private teardownNow(r: Runtime, how: 'leave' | 'end', linger: boolean) {
		// `end()` owns its own shutdown (it leaves the transport a beat later so the `end` messages get
		// out). Running `leave()` here too would close the connections first — red-team finding 2.
		if (how === 'end') r.session.end();
		// `linger`: a goodbye was just posted; close a beat later so it gets out (as `end()` does).
		else if (linger) setTimeout(() => r.session.leave(), 300);
		else r.session.leave();
		for (const d of r.disposers) d();
		r.aw.destroy();
		this.endCall();
		this.rt = null;
		this.systemLines = [];
		this.fromY.clear();
		this.chat = [];
		this.lastSealed = null;
		for (const a of this.away.values()) clearTimeout(a.timer);
		this.away.clear();
		this.byes.clear();
		this.removed.clear();
		this.sidOwner.clear();
		this.floorFrom.clear();
		this.sinceAt.clear();
		try {
			sessionStorage.removeItem(MY_SIDS_KEY);
		} catch {}
		this.typingAt.clear();
		this.pending = [];
		try {
			sessionStorage.removeItem(PENDING_KEY);
		} catch {}
		this.seq = 0;
		this.paths = {};
		this.heirSids = [];
		this.sentSids = '';
		this.handbackDue = false;
		this.lastSelfId = null;
		this.hostStartedAt = null;
		this.following = null;
		this.bound = false;
		this.boundDeck = null;
		this.lobbyOpen = false;
		if (this.ticker) clearInterval(this.ticker);
		this.ticker = null;
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = null;
		clearHostSave();
		void deleteHostPrivateKey(r.room).catch(() => {});
		clearJoinIntent();
		this.host.rerender();
	}

	/** Unmount (a reload is coming, or the Studio is going away): keep the host save, then go. */
	/** The page is going away (pagehide): write the host save now, from the last sealed blob. */
	flushSave(): void {
		if (this.rt) this.writeHostSave(this.rt);
	}

	dispose(): void {
		const r = this.rt;
		if (!r) return;
		// An unload does not wait for WebCrypto, so write the save NOW from the last sealed blob (the
		// host reseals at once on every removal, so that blob never holds a revoked token for long).
		this.writeHostSave(r);
		r.session.leave();
		for (const d of r.disposers) d();
		if (this.ticker) clearInterval(this.ticker);
	}

	private sys(text: string) {
		this.systemLines = [...this.systemLines, { kind: 'system', id: `s${Math.random().toString(36).slice(2)}`, text, at: this.rt?.session.now() ?? Date.now() }];
	}

	private saveHostSoon() {
		if (this.saveTimer || !this.rt?.session.getState().isHost) return;
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			void this.saveHost();
		}, 1000);
	}
	/** Seal the secret, tokens and chat, then write the host save. Resolves false when this browser
	 *  cannot seal (no working IndexedDB): the session still runs, it just cannot survive a reload. */
	private async saveHost(): Promise<boolean> {
		const r = this.rt;
		const s = r?.session.getState();
		if (!r?.key || !s?.isHost || s.stage !== 'live') return true;
		let sealed: string;
		const seq = ++this.sealSeq;
		try {
			// Certs still being signed would leave the saved term behind the roster's (checker, 2026-10-07).
			await r.session.idle();
			const succ = r.session.succession();
			const succession = succ ? { root: succ.root, fingerprint: succ.fingerprint, chain: succ.chain, base: succ.base, top: succ.top } : undefined;
			sealed = await seal(JSON.stringify({ secret: r.secret, tokens: r.session.exportTokens(), chat: this.chat, sids: [...this.sidOwner], succession, selfToken: succ?.selfToken } satisfies HostSealed));
		} catch {
			return false;
		}
		if (this.rt !== r || seq !== this.sealSeq) return true;
		this.lastSealed = { room: r.room, sealed };
		return this.writeHostSave(r);
	}
	private writeHostSave(r: Runtime): boolean {
		const s = r.session.getState();
		if (!r.key || !s.isHost || s.stage !== 'live' || this.lastSealed?.room !== r.room) return false;
		const save: HostSave = { room: r.room, sealed: this.lastSealed.sealed, pub: toBase64Url(r.key.publicRaw), name: s.me?.name ?? 'Host', deckId: this.boundDeck ?? this.deps.deckId, doc: toB64(Y.encodeStateAsUpdate(r.doc)), startedAt: r.startedAt };
		try {
			sessionStorage.setItem(HOST_KEY, JSON.stringify(save));
			return true;
		} catch {
			return false;
		}
	}

	// ── the call (S4) ───────────────────────────────────────────────────────
	private micOf(peer: string, me: boolean): 'off' | 'muted' | 'on' | 'speaking' {
		const a = this.audio;
		if (!a) return 'off';
		if (me) return !a.inCall ? 'off' : a.isMuted ? 'muted' : this.speakingNow.has('self') ? 'speaking' : 'on';
		const said = this.remoteMic.get(peer);
		if (!a.hasStream(peer) || said === undefined) return 'off';
		if (!said) return 'muted';
		return this.speakingNow.has(peer) ? 'speaking' : 'on';
	}

	private async toggleMic() {
		const a = this.audio;
		if (!a) return;
		if (!a.inCall) return this.joinCall();
		a.setMuted(!a.isMuted);
		this.post({ k: 'mic', on: !a.isMuted });
		this.onAirTitle();
	}

	/** Capture the microphone (or switch to another one) and send it to every member. */
	private async joinCall(deviceId?: string) {
		const a = this.audio;
		const r = this.rt;
		if (!a || !r) return;
		try {
			const stream = await a.join(deviceId);
			if (this.rt !== r) {
				a.leave();
				return;
			}
			this.micDenied = false;
			r.session.setMedia(stream);
			this.post({ k: 'mic', on: !a.isMuted });
			this.micDevices = await a.devices();
			this.startSpeaking();
		} catch (e) {
			const denied = (e as { name?: string })?.name === 'NotAllowedError' || (e as { name?: string })?.name === 'SecurityError';
			this.micDenied = denied;
			this.host.notify(denied ? 'The browser blocked the microphone. Allow it in the address bar, then try again.' : "Couldn't start the microphone.");
		}
		this.onAirTitle();
		this.host.rerender();
	}

	private leaveCall() {
		const a = this.audio;
		if (!a?.inCall) return;
		a.leave();
		this.rt?.session.setMedia(null);
		this.post({ k: 'mic', on: false });
		this.onAirTitle();
		this.host.rerender();
	}

	/** The speaking rings: levels read ~7 times a second, a redraw only when someone starts or stops. */
	private startSpeaking() {
		if (this.speakTimer) return;
		this.speakTimer = setInterval(() => {
			const now = this.audio?.speaking() ?? new Set<string>();
			if (now.size === this.speakingNow.size && [...now].every((x) => this.speakingNow.has(x))) return;
			this.speakingNow = now;
			this.host.rerender();
		}, 150);
	}

	private endCall() {
		if (this.speakTimer) clearInterval(this.speakTimer);
		this.speakTimer = null;
		this.audio?.dispose();
		this.audio = null;
		this.remoteMic.clear();
		this.speakingNow.clear();
		this.micDenied = false;
		this.micDevices = [];
		this.onAirTitle();
	}

	/** While this browser's microphone is live, the tab says so (§5.8: on-air is unmissable). */
	private onAirTitle() {
		if (typeof document === 'undefined') return;
		const onAir = !!this.audio?.inCall && !this.audio.isMuted;
		const PREFIX = 'On air · ';
		if (onAir && !document.title.startsWith(PREFIX)) {
			this.plainTitle = document.title;
			document.title = PREFIX + document.title;
		} else if (!onAir && document.title.startsWith(PREFIX)) {
			document.title = this.plainTitle ?? document.title.slice(PREFIX.length);
			this.plainTitle = null;
		}
	}

	// ── succession: the host role moved (Tavola, "SUCCESSION") ──────────────
	/** Host: hand the heir the chat-id owners, once per change. The host's own lines are owned by
	 *  'host' here; the heir gets them under the host's rejoin token, which the host rejoins with. */
	private sendSids() {
		const r = this.rt;
		const s = r?.session.getState();
		const selfToken = r?.session.succession()?.selfToken;
		if (!r || !s?.isHost || !s.heir || !selfToken) return;
		const self = tokenId(selfToken);
		const sids = [...this.sidOwner].map(([sid, owner]): [string, string] => [sid, owner === 'host' ? self : owner]);
		const key = `${s.heir}|${JSON.stringify(sids)}`;
		if (key === this.sentSids) return;
		this.sentSids = key;
		this.post({ k: 'sids', sids }, s.heir);
	}

	/** This browser took the host role over: it numbers the chat from here, keeps the session's
	 *  start, holds the host lock and saves the session like any host (with its own key). */
	private onTookOver(r: Runtime) {
		const succ = r.session.succession();
		if (!succ) return;
		r.key = succ.key;
		r.startedAt = this.hostStartedAt ?? r.startedAt;
		// Our own lines were owned by our rejoin token's id (now `selfToken`'s); a host's own are 'host'.
		const mine = tokenId(succ.selfToken);
		this.lastSelfId = mine;
		this.sidOwner = new Map(this.heirSids.map(([sid, owner]): [string, string] => [sid, owner === mine ? 'host' : owner]));
		this.heirSids = [];
		const waiting = this.pending;
		this.setPending([]);
		for (const p of waiting) this.hostTake(p.id, r.session.getState().selfId, r.session.getState().me as { name: string; color: LiveColor }, p.text);
		void putHostPrivateKey(r.room, succ.key.privateKey).catch(() => {});
		void holdHostLock(r.room).then((release) => {
			if (this.rt === r && r.session.getState().isHost) r.release = release;
			else release?.();
		});
		clearJoinIntent();
		void this.saveHost();
		this.sys('The host left, so you are hosting now');
		this.host.notify('The host left, so you are hosting the session now.');
	}

	/** A regency ended: the session's first host (or a later regent) took over from this browser.
	 *  Rejoin it as a member and hand the chat back. A reload now rejoins by link and token, in this
	 *  same deck, instead of resuming as host. */
	private onSteppedDown(r: Runtime) {
		r.release?.();
		r.release = null;
		r.key = null;
		this.hostStartedAt = r.startedAt;
		clearHostSave();
		void deleteHostPrivateKey(r.room).catch(() => {});
		const fp = parseFragment(new URL(r.link).hash)?.host;
		if (fp) {
			const raw = formatFragment({ room: r.room, secret: r.secret, host: fp }).slice('live='.length);
			void seal(raw).then(storeSealedJoin, () => {});
		}
		if (this.boundDeck) writeLink(r.room, { deckId: this.boundDeck });
		this.handbackDue = true;
		this.sys('The host is back, so you are no longer hosting');
		this.host.notify('The host is back, so you are no longer hosting. You are still in the session.');
	}

	// ── stage transitions that need the Studio (guests) ─────────────────────
	private onStage(from: SessionState['stage'], s: SessionState) {
		// Our own teardown moves the session to `ended`; that is not the host ending it on us.
		if (this.tearing) return;
		if (s.stage === 'live' && !s.isHost) {
			// The chat lives with the host: ask for what we lack on every admission (a reload, a rejoin).
			this.catchUp();
			this.maybeOpenShared();
			return;
		}
		if (from === 'live' && (s.stage === 'denied' || s.stage === 'full')) {
			// Our link dropped and, by the time it was back, our seat was gone (Tavola, round 2).
			this.host.notify(s.stage === 'full' ? 'Your connection dropped and the session filled up meanwhile. Your copy of the deck stays.' : "Your connection dropped and the host didn't let you back in. Your copy of the deck stays.");
			this.teardown('leave');
			return;
		}
		if (s.stage === 'removed' || s.stage === 'ended') {
			if (from === 'live' || this.bound) this.host.notify(s.stage === 'removed' ? 'The host removed you from the session. Your copy of the deck stays.' : 'The host ended the session. Your copy of the deck stays.');
			this.teardown('leave');
			return;
		}
		if (s.stage === 'denied' || s.stage === 'full') clearJoinIntent();
	}

	/** A guest opens the linked copy once it is admitted AND the host's document has arrived. */
	private maybeOpenShared() {
		const r = this.rt;
		const s = r?.session.getState();
		if (!r || !s || s.isHost || s.stage !== 'live' || !r.gotDoc || this.bound) return;
		const shared = r.ytext.toString();
		const deckId = this.host.openSharedDeck({ deckId: readLinks()[r.room]?.deckId, title: s.invite?.title ?? 'Shared deck', source: shared });
		writeLink(r.room, { deckId });
		// The deck switch lands in React state on the next render. Seed the rebase base and the
		// mirror set with the shared text, so that render is not mistaken for an outside write of the
		// guest's PREVIOUS deck (which would rebase that deck into everyone's document) — checker 6.
		this.prevSource = shared;
		this.fromY.add(shared);
		this.boundDeck = deckId;
		this.lobbyOpen = false;
		this.bound = true;
		this.host.notify(`You joined ${s.invite?.hostName ?? 'the host'}'s session.`);
		this.host.rerender();
	}

	// ── per-render sync from the Studio ─────────────────────────────────────
	update(deps: LiveDeps): void {
		const prev = this.deps;
		this.deps = deps;
		const r = this.rt;
		const s = r?.session.getState();
		// FIRST: leaving the bound deck ends (host) or leaves (guest). It must run before the
		// Studio → Y push below, or the deck switched TO is pushed into everyone's document
		// (red-team finding 6). The shell asked first (`mayLeaveDeck`).
		if (r && s && this.bound && this.boundDeck !== null && this.boundDeck !== deps.deckId) {
			this.host.notify(s.isHost ? 'You switched decks, so the live session ended.' : 'You switched decks, so you left the live session.');
			this.prevSource = deps.source;
			this.teardown(s.isHost ? 'end' : 'leave');
			return;
		}
		// Studio → Y: an outside write becomes one edit to the shared text, rebased onto it.
		const base = this.prevSource;
		this.prevSource = deps.source;
		if (r && this.bound && deps.source !== base) {
			const next = deps.source;
			if (this.fromY.has(next)) {
				this.fromY.clear();
				this.fromY.add(next);
			} else {
				const cur = r.ytext.toString();
				if (cur !== next) {
					if (s?.me?.role === 'view') this.host.setSource(cur);
					else {
						const edit = rebase(base, next, cur);
						if (edit) {
							r.doc.transact(() => {
								if (edit.to > edit.from) r.ytext.delete(edit.from, edit.to - edit.from);
								if (edit.insert) r.ytext.insert(edit.from, edit.insert);
							});
						} else {
							this.host.setSource(cur);
							this.host.notify('Someone edited that part at the same moment, so your change was not applied. Try it again.');
						}
					}
				}
			}
		}
		if (!r || !s) return;
		// Presence: my slide.
		if (s.me && (r.aw.getLocalState() as AwState | null)?.slide !== deps.activeSlide) r.aw.setLocalStateField('slide', deps.activeSlide);
		if (s.me) {
			const local = r.aw.getLocalState() as AwState | null;
			if (local?.user?.name !== s.me.name || local?.user?.color !== liveColor(s.me.color)) r.aw.setLocalStateField('user', { name: s.me.name, color: liveColor(s.me.color), colorLight: liveColorLight(s.me.color) });
		}
		// My own navigation stops following; a follow jump does not.
		if (prev.activeSlide !== deps.activeSlide) {
			if (this.followJump) this.followJump = false;
			else if (this.following) this.following = null;
		}
		// The host keeps the lobby invite current.
		if (s.isHost && (prev.deckTitle !== deps.deckTitle || prev.slideCount !== deps.slideCount || prev.theme !== deps.theme)) {
			r.session.setInvite({ title: deps.deckTitle, hostName: s.me?.name ?? '', slides: deps.slideCount, theme: deps.theme });
		}
	}

	// ── awareness-driven behavior: follow and summon ────────────────────────
	/** Remote presence by peer, from SANITIZED states only (`peer` was set by us, not by them). */
	private awByPeer(): Map<string, AwState> {
		const m = new Map<string, AwState>();
		const r = this.rt;
		if (!r) return m;
		for (const [client, st] of r.aw.getStates()) {
			if (client === r.aw.clientID) continue;
			const peer = r.owner.get(client);
			if (peer && (st as AwState).peer === peer) m.set(peer, st as AwState);
		}
		return m;
	}

	private onAwareness() {
		const r = this.rt;
		const s = r?.session.getState();
		if (!r || !s || s.stage !== 'live') return;
		const byPeer = this.awByPeer();
		if (this.following) {
			const slide = byPeer.get(this.following)?.slide;
			if (!s.members.some((m) => m.id === this.following)) this.following = null;
			else if (slide !== undefined && slide !== this.deps.activeSlide) {
				this.followJump = true;
				this.host.goToSlide(slide);
			}
		}
		if (!s.isHost) {
			const hostId = s.members.find((m) => m.role === 'host')?.id;
			const summon = hostId ? byPeer.get(hostId)?.summon : undefined;
			if (summon && summon.n !== this.lastSummon) {
				const first = this.lastSummon === 0;
				this.lastSummon = summon.n;
				// The first summon seen on joining is history, not a request.
				if (first && !this.bound) return;
				const myEdit = (r.aw.getLocalState() as AwState | null)?.editingAt ?? 0;
				const slide = summon.slide;
				if (r.session.now() - myEdit < TYPING_MS) this.host.notifyAction(`The host is on slide ${slide + 1}`, { label: 'Go', onClick: () => this.host.goToSlide(slide) });
				else {
					this.host.goToSlide(slide);
					this.host.notify(`The host brought everyone to slide ${slide + 1}.`);
				}
			}
		}
	}

	// ── what the Studio reads ───────────────────────────────────────────────
	/** True when leaving the current deck is fine, after asking if it would end or leave a session.
	 *  A yes ends (host) or leaves (guest) RIGHT HERE, before the caller touches the editor: a caller
	 *  that resets the document first would otherwise push that reset into everyone's copy
	 *  (checker round 2, finding 1). */
	mayLeaveDeck(): boolean {
		const s = this.rt?.session.getState();
		if (!this.bound || !s || s.stage !== 'live') return true;
		const others = s.members.length - 1;
		const ok = window.confirm(s.isHost ? (others > 0 ? `End the live session for ${others === 1 ? 'the other person' : `the ${others} other people`}?` : 'End the live session?') : 'Leave the live session?');
		if (!ok) return false;
		this.teardown(s.isHost ? 'end' : 'leave');
		this.host.notify(s.isHost ? 'Live session ended. The deck stays as it is.' : 'You left the live session. Your copy of the deck stays.');
		return true;
	}

	/** Hosting others: worth a browser prompt before the tab goes. */
	shouldWarnOnUnload(): boolean {
		const s = this.rt?.session.getState();
		return !!s && s.isHost && s.stage === 'live' && s.members.length > 1;
	}

	noteEditorWrite(next: string): void {
		this.fromY.add(next);
	}

	collab(): LiveCollab | null {
		const r = this.rt;
		const s = r?.session.getState();
		if (!r || !this.bound || !s?.me) return null;
		return { extension: r.ext, key: `${r.room}:${s.me.role === 'view' ? 'view' : 'edit'}`, readOnly: s.me.role === 'view', seed: () => r.ytext.toString() };
	}

	/** The chat in the host's order. A line's author is the member its `say` ARRIVED from at the
	 *  host (Tavola's gate), as the roster named them then; lines still waiting go last. */
	private chatLines(): LiveChatLine[] {
		const s = this.rt?.session.getState();
		const me = s?.me;
		// Mine: sent from this browser, or (after a reload, under a new peer id) under my name and color.
		// Mine: written under one of this tab's chat-id prefixes (this page's, or an earlier load's).
		const mine = this.mySids();
		const lines: LiveChatLine[] = this.chat.map((l) => ({ kind: 'message', id: `c${l.seq}`, from: l.name, color: l.color, text: l.text, at: l.at, mine: l.peer === s?.selfId || mine.has(sidOf(l.id)) }));
		for (const p of this.pending) lines.push({ kind: 'message', id: `p${p.id}`, from: me?.name ?? '', color: me?.color ?? 1, text: p.text, at: p.at, mine: true, pending: true });
		return lines;
	}

	/** The host's lines in their numbered order, with this browser's own notes (joins, role changes)
	 *  slotted in by session time, and lines still waiting at the end. */
	private mergedChat(): LiveChatLine[] {
		const lines = this.chatLines();
		const sent = lines.filter((l) => !(l.kind === 'message' && l.pending));
		const waiting = lines.filter((l) => l.kind === 'message' && l.pending);
		const notes = [...this.systemLines].sort((a, b) => a.at - b.at);
		const out: LiveChatLine[] = [];
		let i = 0;
		for (const l of sent) {
			while (i < notes.length && notes[i].at <= l.at) out.push(notes[i++]);
			out.push(l);
		}
		return [...out, ...notes.slice(i), ...waiting];
	}

	/** Take numbered lines in (from the host, or the host's own), in order, once each. A line is
	 *  the same line only when its number, sender and id all match: a host that reloaded from a save
	 *  a second old can hand out a number again, and the second line must not be taken for a copy of
	 *  the first (checker, 2026-10-06). */
	private addLines(lines: ChatLine[]) {
		// Ours: written under one of OUR chat-id prefixes — never "has my name", which anyone can take
		// (red team round 3, finding 1). A line we already hold still counts as a receipt: the host
		// re-sends one when it drops our resend.
		const mine = this.mySids();
		const echoed = new Set(lines.filter((l) => mine.has(sidOf(l.id))).map((l) => l.id));
		if (echoed.size && this.pending.some((p) => echoed.has(p.id))) {
			this.setPending(this.pending.filter((p) => !echoed.has(p.id)));
			this.host.rerender();
		}
		const key = (l: ChatLine) => `${l.seq}|${l.peer}|${l.id}`;
		const have = new Set(this.chat.map(key));
		const fresh = lines.filter((l) => !have.has(key(l)));
		if (!fresh.length) return;
		this.chat = [...this.chat, ...fresh].sort((a, b) => a.seq - b.seq || a.at - b.at).slice(-CHAT_KEEP);
		this.seq = Math.max(this.seq, ...fresh.map((l) => l.seq));
		this.saveHostSoon();
		this.host.rerender();
	}

	/** This tab's chat-id prefixes for this room: this page load's, earlier loads' (sessionStorage), and
	 *  those of lines still waiting. */
	private mySids(): Set<string> {
		const out = new Set<string>(this.rt?.mine ?? []);
		for (const p of this.pending) out.add(sidOf(p.id));
		return out;
	}

	/** Member: the lines waiting for the host, kept SEALED in this tab's sessionStorage so a reload
	 *  does not drop them (checker, 2026-10-06). */
	private setPending(next: Pending[]) {
		this.pending = next;
		const r = this.rt;
		if (!r) return;
		if (next.length === 0) {
			try {
				sessionStorage.removeItem(PENDING_KEY);
			} catch {}
			return;
		}
		void seal(JSON.stringify({ room: r.room, pending: next })).then(
			(sealed) => {
				if (this.rt !== r || this.pending !== next) return;
				try {
					sessionStorage.setItem(PENDING_KEY, sealed);
				} catch {}
			},
			() => {},
		);
	}

	private post(p: Post, to?: string) {
		this.rt?.session.post(enc.encode(JSON.stringify(p)), to);
	}

	private hostId(): string | undefined {
		return this.rt?.session.getState().members.find((m) => m.role === 'host')?.id;
	}

	/** Member: ask the host for every line after the last one held, and (re)send what waits. */
	private catchUp() {
		const s = this.rt?.session.getState();
		const host = this.hostId();
		if (!s || s.isHost || s.stage !== 'live' || s.hostAway || !host) return;
		this.post({ k: 'since', seq: this.seq }, host);
		const kept = this.pending.filter((p) => (p.tries ?? 0) < MAX_TRIES);
		if (kept.length < this.pending.length) this.sys(`${this.pending.length - kept.length === 1 ? 'A message' : 'Some messages'} could not be sent.`);
		const next = kept.map((p) => ({ ...p, tries: (p.tries ?? 0) + 1 }));
		this.setPending(next);
		for (const p of next) this.post({ k: 'say', id: p.id, text: p.text, have: this.seq }, host);
	}

	/** Host: a member holding a number past ours means our save was older than the session (a reload),
	 *  so never hand those numbers out again. Once per member per admission, and bounded, so nobody can
	 *  push the numbering far (red team round 3, finding 4). */
	private raiseFloor(from: string, seq: number) {
		if (seq <= this.seq || this.floorFrom.has(from)) return;
		this.floorFrom.add(from);
		this.seq = Math.min(seq, this.seq + CHAT_KEEP);
	}

	/** Host: number a line, keep it, and send it to everyone (the sender's copy is its receipt). */
	private hostTake(id: string, peer: string, member: { name: string; color: LiveColor }, text: string) {
		const r = this.rt;
		// A resend of a line already taken: the same MEMBER and id. Keyed by the member (name and
		// color), not its connection id, because a reload gives the tab a new connection while the
		// lines it restores keep their ids; and by member at all, so nobody can claim another member's
		// next id first and swallow their line. Each page load draws a fresh id prefix, so a NEW line
		// after a reload can never match an old one (checker round 3, finding 1).
		if (!r) return;
		// The id's prefix must belong to this member's token (first use binds it); anyone else's say
		// under it is dropped, so nobody can claim another member's line or forge their receipt.
		const owner = peer === r.session.getState().selfId ? 'host' : r.session.memberToken(peer);
		const sid = sidOf(id);
		if (!owner || !sid) return;
		const held = this.sidOwner.get(sid);
		if (held !== undefined && held !== owner) return;
		if (held === undefined) this.sidOwner.set(sid, owner);
		const taken = this.chat.find((l) => l.id === id);
		if (taken) {
			// Already numbered: send the sender its receipt again, so its "Sending…" clears.
			if (peer !== r.session.getState().selfId) this.post({ k: 'line', line: taken }, peer);
			return;
		}
		const line: ChatLine = { seq: this.seq + 1, id, peer, name: member.name, color: member.color, text: text.slice(0, CHAT_MAX), at: r.session.now() };
		this.addLines([line]);
		this.post({ k: 'line', line });
		// Seal now, not a second later: a reload restores the numbering from this save.
		void this.saveHost();
	}

	/** A post from an admitted member (Tavola dropped everyone else's). */
	private onPost(data: Uint8Array, from: string) {
		const r = this.rt;
		const s = r?.session.getState();
		const sender = s?.members.find((m) => m.id === from);
		if (!r || !s || !sender) return;
		let p: Post;
		try {
			p = JSON.parse(dec.decode(data));
		} catch {
			return;
		}
		if (!p || typeof p !== 'object') return;
		const fromHost = sender.role === 'host';
		if (p.k === 'typing' && sender.role !== 'view') {
			// At most one redraw a second per typist, however fast the posts come.
			const was = this.typingAt.get(from) ?? 0;
			this.typingAt.set(from, Date.now());
			if (Date.now() - was > 1000) this.host.rerender();
		} else if (p.k === 'mic' && typeof p.on === 'boolean') {
			this.remoteMic.set(from, p.on);
			this.host.rerender();
		} else if (p.k === 'bye') {
			this.byes.add(from);
		} else if (p.k === 'gone' && fromHost && typeof p.id === 'string' && typeof p.name === 'string') {
			this.removed.add(p.id);
			// The roster may have beaten it here: turn a "Reconnecting…" row into the removal it was.
			const k = Number.isInteger((p as { color?: unknown }).color) ? awayKey({ name: p.name, color: (p as { color: LiveColor }).color }) : null;
			const a = k ? this.away.get(k) : undefined;
			if (k && a) {
				clearTimeout(a.timer);
				this.away.delete(k);
				this.sys(`${p.name} was removed`);
				this.host.rerender();
			}
		} else if (s.isHost && p.k === 'handback' && r.session.wasHeir(from) && Array.isArray(p.lines) && Array.isArray(p.sids)) {
			// The regent's lines and owners: the session's chat stays whole across the regency.
			this.addLines(p.lines.slice(-CHAT_KEEP).map(cleanLine).filter((l): l is ChatLine => !!l));
			for (const e of p.sids.slice(0, 2000)) if (Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string' && !this.sidOwner.has(e[0])) this.sidOwner.set(e[0], e[1]);
			void this.saveHost();
		} else if (s.isHost) {
			if (p.k === 'say' && sender.role !== 'view' && typeof p.id === 'string' && p.id.length <= 80 && typeof p.text === 'string') {
				this.typingAt.delete(from);
				// The sender's highest number is a floor too, so a host restored from an old save never
				// numbers this line with a number the sender already holds.
				if (Number.isSafeInteger(p.have)) this.raiseFloor(from, p.have as number);
				this.hostTake(p.id, from, sender, p.text);
			} else if (p.k === 'since' && Number.isSafeInteger(p.seq)) {
				// One answer per member every 2 s: a 30-byte ask must not buy a megabyte reply on demand.
				// An ask inside the window is answered when it ends (once), not dropped — a member that
				// asked twice for a real reason still gets its lines.
				const wait = (this.sinceAt.get(from) ?? 0) + 2000 - Date.now();
				if (sender.role !== 'view') this.raiseFloor(from, p.seq);
				if (wait > 0) {
					if (!this.sinceLater.has(from)) {
						this.sinceLater.add(from);
						setTimeout(() => {
							this.sinceLater.delete(from);
							if (this.rt !== r || !r.session.getState().members.some((m) => m.id === from)) return;
							this.sinceAt.set(from, Date.now());
							this.post({ k: 'lines', lines: this.chat.filter((l) => l.seq > p.seq), startedAt: r.startedAt }, from);
						}, wait);
					}
					return;
				}
				this.sinceAt.set(from, Date.now());
				// A member holding a number past ours means our save was older than the session (a
				// reload): never hand those numbers out again. Bounded, so nobody can push it far.
				this.post({ k: 'lines', lines: this.chat.filter((l) => l.seq > p.seq), startedAt: r.startedAt }, from);
			}
		} else if (fromHost) {
			if (p.k === 'line') {
				const line = cleanLine(p.line);
				if (!line) return;
				const had = this.seq;
				this.typingAt.delete(line.peer);
				this.addLines([line]);
				// A number skipped: lines went by while our link was down. Ask for them.
				if (line.seq > had + 1) this.post({ k: 'since', seq: had }, from);
			} else if (p.k === 'lines' && Array.isArray(p.lines)) {
				if (typeof p.startedAt === 'number') this.hostStartedAt = p.startedAt;
				this.addLines(p.lines.slice(-CHAT_KEEP).map(cleanLine).filter((l): l is ChatLine => !!l));
			} else if (p.k === 'sids' && Array.isArray(p.sids)) {
				// Kept whether or not we know yet that we are the heir: it can arrive before the roster.
				this.heirSids = p.sids.filter((e): e is [string, string] => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string').slice(0, 2000);
			} else if (p.k === 'tip' && Number.isSafeInteger(p.seq)) {
				if (typeof p.startedAt === 'number') this.hostStartedAt = p.startedAt;
				// Ahead OR behind: a host whose number is below ours came back from an old save, and our
				// `since` is what raises its floor (checker round 3, finding 2).
				if (p.seq !== this.seq || this.pending.length) this.catchUp();
			}
		}
	}

	view(): LiveView {
		const r = this.rt;
		const s = r?.session.getState();
		if (!r || !s || s.stage !== 'live') return IDLE_VIEW;
		const byPeer = this.awByPeer();
		const people: LivePerson[] = s.members.map((m) => {
			const st = byPeer.get(m.id);
			const me = m.id === s.selfId;
			return { id: m.id, name: m.name, color: m.color, role: m.role, me, slide: me ? this.deps.activeSlide : (st?.slide ?? null), editing: !!st?.editingAt && this.now - st.editingAt < TYPING_MS && st.editingAt < this.now + 5000, mic: this.micOf(m.id, me), ...(!me && this.paths[m.id] ? { link: { kind: linkKind(this.paths[m.id]), detail: `${this.paths[m.id].local}→${this.paths[m.id].remote} (${this.paths[m.id].protocol})` } } : {}) };
		});
		for (const [k, a] of this.away) {
			if (!people.some((p) => p.name === a.name && p.color === a.color)) people.push({ id: `away:${k}`, name: a.name, color: a.color, role: a.role === 'host' && s.members.some((m) => m.role === 'host') ? 'edit' : a.role, slide: null, editing: false, mic: 'off', away: true });
		}
		const now = Date.now();
		const typing = s.members.filter((m) => m.id !== s.selfId && now - (this.typingAt.get(m.id) ?? 0) < TYPING_SHOW_MS).map((m) => m.name);
		return {
			status: 'live',
			isHost: s.isHost,
			// The session's start as the HOST stamped it, on the session clock.
			// Unknown (null, so no timer shows) until the host's start arrives, rather than 0:00 then a jump.
			startedAt: s.isHost ? r.startedAt : this.hostStartedAt,
			heir: s.heir ? (s.heir === s.selfId ? 'you' : (s.members.find((m) => m.id === s.heir)?.name ?? null)) : null,
			link: r.link,
			linkRole: s.linkRole,
			autoAdmit: s.autoAdmit,
			people,
			waiting: s.waiting,
			cap: s.cap,
			chat: this.mergedChat(),
			following: this.following,
			hostAway: s.hostAway,
			audio: !!this.audio && r.session.hasMedia && LiveAudio.supported(),
			call: { inCall: !!this.audio?.inCall, muted: !!this.audio?.isMuted, denied: this.micDenied, devices: this.micDevices, device: this.audio?.device ?? null },
			canChat: s.me?.role !== 'view',
			typing,
		};
	}

	lobby(): LobbyView | null {
		if (!this.lobbyOpen && !this.badLink) return null;
		const s = this.rt?.session.getState();
		const map: Record<SessionState['stage'], LobbyView['stage'] | null> = { connecting: 'connecting', lobby: 'ready', waiting: 'waiting', live: 'connecting', 'host-absent': 'host-absent', outdated: 'outdated', denied: 'denied', full: 'full', removed: 'denied', ended: null };
		const stage = this.badLink ? 'bad-link' : s ? map[s.stage] : 'connecting';
		if (!stage) return null;
		return { stage, title: s?.invite?.title ?? null, hostName: s?.invite?.hostName ?? null, slides: s?.invite?.slides ?? null, theme: s?.invite?.theme ?? null, name: this.lobbyName };
	}

	private copy(link: string, caveat: string | null = null) {
		const tail = caveat ?? '';
		const done = (m: string) => this.host.notify(m + tail);
		if (!navigator.clipboard) {
			done('Copy the invite link from the Live panel.');
			return;
		}
		void navigator.clipboard.writeText(link).then(
			() => done('Invite link copied. Anyone you send it to will knock first.'),
			() => done('Copy the invite link from the Live panel.'),
		);
	}

	readonly actions: LiveActions = {
		start: (name: string) => {
			const n = name.trim() || 'Host';
			saveName(n);
			void (async () => {
				if (this.rt) return;
				let parts: ReturnType<typeof mintLink>;
				let key: HostKey;
				try {
					// The private key never leaves WebCrypto: non-extractable, stored as a CryptoKey object.
					key = await createHostKey({ extractable: false });
					parts = mintLink(key.fingerprint);
				} catch {
					this.host.notify("Couldn't start a live session in this browser.");
					return;
				}
				const release = (await holdHostLock(parts.room)) ?? undefined;
				if (this.rt) {
					release?.();
					return;
				}
				// From here the session is live, whatever storage does: a storage failure costs only
				// surviving a reload, and says so (checker round 2, finding 4).
				this.wire({ room: parts.room, secret: parts.secret, key, host: { name: n }, release });
				this.bound = true;
				this.boundDeck = this.deps.deckId;
				const keyKept = await putHostPrivateKey(parts.room, key.privateKey).then(
					() => true,
					() => false,
				);
				const saved = await this.saveHost();
				const live = this.rt as Runtime | null;
				if (live) this.copy(live.link, keyKept && saved ? null : " This browser can't keep the session across a reload, so keep this tab open.");
				this.host.rerender();
			})();
		},
		copyLink: () => this.rt && this.copy(this.rt.link),
		setLinkRole: (role) => this.rt?.session.setLinkRole(role),
		setAutoAdmit: (on) => this.rt?.session.setAutoAdmit(on),
		admit: (id) => this.rt?.session.admit(id),
		deny: (id) => this.rt?.session.deny(id),
		remove: (id) => {
			const r = this.rt;
			const m = r?.session.getState().members.find((x) => x.id === id);
			if (!r || !m) return;
			// Tell the others first (same channel, so it lands before the roster), so everyone shows
			// "was removed" at once instead of 60 s of "Reconnecting…" (inversion round 3, item 2).
			this.removed.add(id);
			this.post({ k: 'gone', id, name: m.name, color: m.color });
			r.session.remove(id);
		},
		setRole: (id, role) => this.rt?.session.setRole(id, role),
		follow: (id) => {
			this.following = id;
			this.onAwareness();
			this.host.rerender();
		},
		bringEveryone: () => {
			const r = this.rt;
			if (!r) return;
			const prevN = (r.aw.getLocalState() as AwState | null)?.summon?.n ?? 0;
			r.aw.setLocalStateField('summon', { slide: this.deps.activeSlide, n: prevN + 1 });
			this.sys(`You brought everyone to slide ${this.deps.activeSlide + 1}`);
			this.host.rerender();
		},
		toggleMic: () => void this.toggleMic(),
		leaveCall: () => this.leaveCall(),
		pickMic: (id) => void this.joinCall(id),
		end: () => {
			this.teardown('end');
			this.host.notify('Live session ended. The deck stays as it is.');
		},
		leave: () => {
			// Say goodbye first, so the others show "left" at once instead of "reconnecting".
			this.post({ k: 'bye' });
			this.teardown('leave', { linger: true });
			this.host.notify('You left the live session. Your copy of the deck stays.');
		},
		sendChat: (text) => {
			const r = this.rt;
			const s = r?.session.getState();
			if (!r || !s?.me || s.me.role === 'view') return;
			const id = `${r.sid}:${++r.chatN}`;
			const line = text.slice(0, CHAT_MAX);
			this.lastTypingPost = 0;
			if (s.isHost) {
				this.hostTake(id, s.selfId, s.me, line);
				return;
			}
			// Shown at once as "Sending…"; the host's echo replaces it. If the host is away, it waits.
			this.setPending([...this.pending, { id, text: line, at: r.session.now() }]);
			this.host.rerender();
			const host = this.hostId();
			if (host && !s.hostAway) this.post({ k: 'say', id, text: line, have: this.seq }, host);
		},
		chatTyping: () => {
			const t = Date.now();
			if (t - this.lastTypingPost < TYPING_POST_MS || this.rt?.session.getState().me?.role === 'view') return;
			this.lastTypingPost = t;
			this.post({ k: 'typing' });
		},
		goToSlide: (i) => this.host.goToSlide(i),
	};

	readonly lobbyActions: LobbyActions = {
		setName: (name) => {
			this.lobbyName = name;
			this.host.rerender();
		},
		knock: () => {
			const n = this.lobbyName.trim();
			if (!n || !this.rt) return;
			saveName(n);
			this.rt.session.knock(n);
		},
		cancel: () => {
			this.teardown('leave');
			clearJoinIntent();
			this.badLink = false;
			this.lobbyOpen = false;
			this.host.rerender();
		},
		retry: () => {
			this.rt?.session.retry();
			this.host.rerender();
		},
	};
}
