import type { Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { type AudioStats, cleanName, createHostKey, createSession, formatFragment, formatLink, fromBase64Url, type HostKey, hostKeyFrom, type LinkEvent, type LinkPath, linkKind, mintLink, parseFragment, type Session, type SessionState, type Succession, type TokenEntry, toBase64Url, tokenId } from '@/lib/tavola';
import { trysteroTransport } from '@/lib/tavola/adapters/trystero';
import { type FieldCleaner, sanitizeAwarenessUpdate, type YjsAwareness, yjsAwareness } from '@/lib/tavola/adapters/yjs';
import { BUILTIN_PALETTES } from '@/lib/theme-catalog.generated';
import { coerceRecipe } from '../finish-generate';
import { RESERVED_FINISH_NAMES } from '../finish-library';
import { refuseImportedTheme } from '../import-gate';
import { RESERVED_THEME_NAMES } from '../library/reserved-names';
import { TOURS } from '../tours';
import { followBus, type PresentPlace } from './follow-bus';
import { changedWords, describeMove, type FollowMove, placeOf, placeWords, settingsMoves, VIEW_KEYS, viewOf } from './follow-keys';
import { CALL_BITRATE, HIGH_FIDELITY_BITRATE, LiveAudio } from './live-audio';
import { LIVE_TURN } from './live-ice';
import { IDLE_VIEW, type LiveActions, type LiveChatLine, type LiveClip, type LiveColor, type LiveDoing, type LiveNote, type LivePerson, type LivePointer, type LivePointerSource, type LivePresent, type LiveShare, type LiveTransport, type LiveUnshared, type LiveView, type LobbyActions, type LobbyView, liveColor, liveColorLight } from './live-model';
import { clearJoinIntent, HOST_KEY, hasFreshJoin, type LiveCollab, type LiveDeps, type LiveFinish, type LiveHost, type LiveLook, type LiveRecords, type LiveTheme, NO_RECORDS, readSealedJoin, saveName, scrubLiveFragment, storedLiveName, storeSealedJoin, takeFreshJoin } from './live-store';
import { WakeKeeper } from './live-wake';
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
/** sessionStorage: what this person shares (cursor, slide, typing), so a reload keeps it. */
const SHARE_KEY = 'lattice-live-share';
const readShare = (): LiveShare => {
	const all = { cursor: true, slide: true, typing: true, doing: true, pointer: true };
	try {
		const raw = JSON.parse(sessionStorage.getItem(SHARE_KEY) || '{}') as Partial<LiveShare>;
		return { cursor: raw.cursor !== false, slide: raw.slide !== false, typing: raw.typing !== false, doing: raw.doing !== false, pointer: raw.pointer !== false };
	} catch {
		return all;
	}
};
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
type HostSave = { room: string; sealed: string; pub: string; name: string; deckId: string; doc: string; startedAt: number; look?: LiveLook | null };

/** The session's look as this browser would freeze it: a saved theme is not shared, so it freezes as
 *  null (the default palette), never by name. */
const freezeLook = (d: LiveDeps): LiveLook => ({ palette: BUILTIN_PALETTES.includes(d.theme) ? d.theme : null, mode: d.mode === 'dark' ? 'dark' : 'light' });
/** A look as a peer sent it, or null when it is not one: only a built-in palette name and a mode. */
const cleanLook = (v: unknown, known: (name: string) => boolean = () => false): LiveLook | null => {
	if (!v || typeof v !== 'object') return null;
	const { palette, mode } = v as { palette?: unknown; mode?: unknown };
	if (mode !== 'light' && mode !== 'dark') return null;
	if (palette !== null && (typeof palette !== 'string' || !(BUILTIN_PALETTES.includes(palette) || known(palette)))) return null;
	return { palette, mode };
};

// ── Library records (slice 1b, 2026-10-20 note §5.2 and §6 rules 5, 6, 8) ─────────────────────────────
/** A record's key in the host's shared set: `t:` a theme, `f:` a finish. */
const themeKey = (name: string) => `t:${name}`;
const finishKey = (name: string) => `f:${name}`;
const componentKey = (name: string) => `c:${name}`;
const LOOK_KEY = 'look';
const keysOf = (r: LiveRecords) => [...r.themes.map((t) => themeKey(t.name)), ...r.finishes.map((f) => finishKey(f.name)), ...r.components.map(componentKey)];
/** Bounds on what a member takes, so one message stays far under Tavola's 4 MB and nothing grows unbounded. */
const MAX_THEMES = 8;
const MAX_THEME_CSS = 128 * 1024;
/** All themes in one message, in characters. UTF-8 takes at most 3 bytes a character, so this keeps a
 *  records message near 2.3 MB at worst, under Tavola's 4 MB MAX_MESSAGE, which would drop it whole. */
const MAX_THEMES_CSS = 768 * 1024;
const MAX_FINISHES = 16;
const MAX_COMPONENTS = 50;
const THEME_NAME = /^[a-z][a-z0-9-]{0,63}$/;
const FINISH_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const COMPONENT_NAME = /^[a-z][a-z0-9-]{0,63}$/;
/** A member remembers this many gate verdicts, so a theme sent again is not checked again. */
const VERDICTS_KEPT = 64;
/** A member says at most this many things about records, and about components at most this often. */
const RECORD_NOTES_KEPT = 100;
const COMPONENT_NOTE_EVERY_MS = 30_000;
/** Whether the deck's front matter names a theme of its own (then the session's look does not apply). */
const deckNamesTheme = (source: string): boolean => /^theme:[ \t]*\S/m.test(/^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] ?? '');
/** What `HostSave.sealed` opens to. Chat is in here because people paste things into chat. */
type HostSealed = { secret: string; tokens: TokenEntry[]; chat?: ChatLine[]; cmts?: SessionComment[]; sids?: Array<[sid: string, owner: string]>; succession?: Succession; selfToken?: string; shared?: string[]; lookTheme?: LiveTheme };
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
type ChatLine = { seq: number; id: string; peer: string; name: string; color: LiveColor; text: string; at: number; note?: LiveNote };
/** A line this browser sent that the host has not echoed back yet ("Sending…"). */
type Pending = { id: string; text: string; at: number; tries?: number; note?: LiveNote };
/** A waiting line given up on after this many resends (about 1.5 min), with a note: one the host can
 *  never take (its id belongs to an old rejoin token) must not say "Sending…" forever. */
const MAX_TRIES = 6;
/**
 * Posts on Tavola's app channel. Chat goes THROUGH the host:
 *   member → host  `say`    a line, with an id the member chose (the host drops a repeat)
 *   host → all     `line`   that line, numbered and stamped
 *   member → host  `since`  "I have everything up to `seq`" — on admission, return, or a gap
 *   host → member  `lines`  everything after it, plus the session's start time
 *   host → member  `tip`    the latest number, so a returning member knows whether to ask, and
 *                           the session's frozen look
 * plus `typing` and `bye`, which are not chat and go to everyone directly.
 */
type Post =
	| { k: 'say'; id: string; text: string; have?: number; note?: LiveNote }
	| { k: 'gone'; id: string; name: string; color: LiveColor }
	| { k: 'line'; line: ChatLine }
	| { k: 'since'; seq: number }
	| { k: 'lines'; lines: ChatLine[]; startedAt: number; look?: LiveLook }
	| { k: 'tip'; seq: number; startedAt: number; look?: LiveLook }
	| { k: 'typing' }
	| { k: 'bye' }
	/** host → all: presenting to everyone (`on`) and where (rendered slide `i`, page `p`, lens `l`), or stopped */
	| { k: 'present'; on: boolean; i?: number; p?: number; l?: string; h?: string }
	/** Narration clips (§7.3). Member → host: the clip of the sentence whose text hashes to `h`. Host → that
	 *  member: the clip (`d` base64 of compressed audio, `m` its type, `l` its lead-in) or, with no `d`, "not yet". */
	| { k: 'cw'; h: string }
	| { k: 'clip'; h: string; m?: string; l?: number; d?: string }
	/** Show me together (§7.5): a shipped tour's id and when to start it, on the session clock. */
	| { k: 'tour'; id: string; at: number }
	/** Comments (slice 6). Member → host: an operation the host checks against who may do it. Host → all:
	 *  the comment as it now is, a deletion, or (to a newcomer) every shared comment. */
	| { k: 'cmt'; op: 'add'; id: string; slide: number; body: string; at?: number; by?: string }
	| { k: 'cmt'; op: 'resolve'; id: string; resolved: boolean }
	| { k: 'cmt'; op: 'del'; id: string }
	| { k: 'cmtset'; c: SessionComment }
	| { k: 'cmtdel'; id: string }
	| { k: 'cmts'; list: SessionComment[] }
	/** a member's pointer over the slide it is on, in the slide's coordinates; `off` when it left the slide */
	| { k: 'ptr'; s?: number; x?: number; y?: number; c?: 1; off?: 1 }
	/** host → member: the Library records the deck uses that the host shares (themes, finish recipes,
	 *  and custom component NAMES only). A member takes them only from the host, through the import gate. */
	| { k: 'records'; themes: LiveTheme[]; finishes: LiveFinish[]; components: string[] }
	/** a member's own microphone state (about itself only; who is SPEAKING is measured, never said) */
	| { k: 'mic'; on: boolean }
	/** host → its heir: who owns each chat-id prefix, by rejoin token, so the chat keeps its owners
	 *  when the heir takes over (the host's own lines under its own rejoin token). */
	| { k: 'sids'; sids: Array<[sid: string, owner: string]>; look?: LiveLook }
	/** a regent that stepped down → the host that took the session back: the lines it numbered
	 *  meanwhile, and the chat-id owners it learned. Taken only from a member that host certified. */
	| { k: 'handback'; lines: ChatLine[]; sids: Array<[sid: string, owner: string]> };
/** How long a dropped member shows as reconnecting before the chat says they left. A phone that
 *  backgrounds a tab drops its connection within seconds and comes back when the tab returns. */
const AWAY_GRACE_MS = 60_000;
/** With the slide hidden, a "Bring everyone" stays in presence this long, then is withdrawn. */
const SUMMON_SHOWN_MS = 6000;
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
// ── History size ─────────────────────────────────────────────────────────────────────────────────────
// Tavola drops a message past 4 MB, so a history reply that grows past it reaches nobody (checker, slice 5:
// 160 shared AI turns made a newcomer's `lines` 4.4 MB and the newcomer got no chat at all). Every message
// carrying history is held under a byte budget, newest kept; the sealed save, which a browser's
// sessionStorage holds beside everything else, under a smaller one.
const HISTORY_BYTES = 3_000_000;
/** Chat and comments each get this much of the sealed save (about 2.1M characters together, sealed). */
const SAVED_BYTES = 800_000;
const bytesOf = (v: unknown): number => new TextEncoder().encode(JSON.stringify(v)).length;
/** The newest items that fit `budget` bytes, in their order. */
function newestWithin<T>(items: T[], budget: number): T[] {
	let total = 2;
	let i = items.length;
	while (i > 0) {
		const b = bytesOf(items[i - 1]) + 1;
		if (total + b > budget) break;
		total += b;
		i--;
	}
	return items.slice(i);
}
/** Items split into runs that each fit `budget` bytes (an item larger than the budget goes alone). */
function chunksWithin<T>(items: T[], budget: number): T[][] {
	const out: T[][] = [];
	let run: T[] = [];
	let total = 2;
	for (const it of items) {
		const b = bytesOf(it) + 1;
		if (run.length && total + b > budget) {
			out.push(run);
			run = [];
			total = 2;
		}
		run.push(it);
		total += b;
	}
	if (run.length) out.push(run);
	return out;
}

// ── Comments (slice 6, 2026-10-20 note §4 tier 5) ─────────────────────────────────────────────────────
/** A slide comment as a session holds it. `owner` is the writer's rejoin-token id (a one-way hash of a
 *  secret, so it identifies without letting anyone rejoin as them): who may delete it. */
export type SessionComment = { id: string; slide: number; author: string; body: string; createdAt: number; resolved: boolean; owner: string; sharedBy?: string };
/** The same limits a comment has anywhere, and how many one session holds. */
const COMMENT_BODY_MAX = 2000;
const COMMENTS_MAX = 500;
const COMMENT_ID = /^[A-Za-z0-9_-]{1,80}$/;
/** A shared comment as the host sent it, or null. */
const cleanComment = (x: unknown): SessionComment | null => {
	const c = x as Partial<SessionComment> | null;
	if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !COMMENT_ID.test(c.id) || !Number.isInteger(c.slide) || (c.slide as number) < 1 || (c.slide as number) > POINTER_MAX_SLIDE) return null;
	if (typeof c.body !== 'string' || !c.body.trim() || typeof c.author !== 'string' || typeof c.owner !== 'string' || c.owner.length > 128 || typeof c.resolved !== 'boolean' || typeof c.createdAt !== 'number' || !Number.isFinite(c.createdAt) || Math.abs(c.createdAt) > 1e14) return null;
	if (c.sharedBy !== undefined && typeof c.sharedBy !== 'string') return null;
	return { id: c.id, slide: c.slide as number, author: cleanName(c.author), body: c.body.slice(0, COMMENT_BODY_MAX), createdAt: c.createdAt, resolved: c.resolved, owner: c.owner, ...(c.sharedBy ? { sharedBy: cleanName(c.sharedBy) } : {}) };
};

/** An AI turn shared into the chat is capped like a long message: the question short, the answer longer. */
const NOTE_ASK_MAX = 600;
const NOTE_ANSWER_MAX = 4000;
/** A note as a peer sent it, or null; `undefined` in, `undefined` out (a plain line). Plain strings and
 *  slide numbers only: the receiver writes every word around them, so a note cannot claim to be anything else. */
const cleanNote = (x: unknown): LiveNote | null | undefined => {
	if (x === undefined) return undefined;
	const n = x as Record<string, unknown> | null;
	if (!n || typeof n !== 'object') return null;
	if (n.k === 'ai-edit' && Array.isArray(n.slides)) {
		const slides = [...new Set(n.slides.filter((v): v is number => Number.isInteger(v) && v >= 1 && v <= POINTER_MAX_SLIDE))].slice(0, 12);
		return { k: 'ai-edit', slides };
	}
	if (n.k === 'ai-turn' && typeof n.ask === 'string' && typeof n.answer === 'string' && n.answer.trim()) return { k: 'ai-turn', ask: n.ask.slice(0, NOTE_ASK_MAX), answer: n.answer.slice(0, NOTE_ANSWER_MAX) };
	return null;
};
const cleanLine = (x: unknown): ChatLine | null => {
	const l = x as Partial<ChatLine> | null;
	if (!l || typeof l !== 'object' || !Number.isSafeInteger(l.seq) || (l.seq as number) < 1 || typeof l.id !== 'string' || typeof l.peer !== 'string' || typeof l.name !== 'string' || typeof l.text !== 'string' || !isColor(l.color) || typeof l.at !== 'number' || !Number.isFinite(l.at) || Math.abs(l.at) > 1e14) return null;
	const note = cleanNote(l.note);
	if (note === null) return null;
	return { seq: l.seq as number, id: l.id.slice(0, 120), peer: l.peer.slice(0, 120), name: cleanName(l.name), color: l.color, text: l.text.slice(0, CHAT_MAX), at: l.at, ...(note ? { note } : {}) };
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
type AwState = { peer?: string; user?: { name: string; color: string; colorLight: string }; slide?: number; slideHidden?: boolean; editingAt?: number; summon?: { slide: number; n: number }; cursor?: { anchor: unknown; head: unknown }; doing?: LiveDoing };
/** The panels and views presence may name (live-model.ts types them; the lists live here, with the lazy code). */
const LIVE_PANELS: readonly LiveDoing['panel'][] = ['coach', 'lenses', 'library', 'live'];
const LIVE_VIEWS: readonly LiveDoing['view'][] = ['compose', 'fabricate', 'article'];
/** A `doing` field as a peer sent it, or undefined: a panel and a view from the fixed lists, and a boolean. */
export const cleanDoing = (v: unknown): LiveDoing | undefined => {
	if (!v || typeof v !== 'object') return undefined;
	const { panel, view, presenting } = v as Record<string, unknown>;
	if (panel !== null && !(LIVE_PANELS as readonly unknown[]).includes(panel)) return undefined;
	if (!(LIVE_VIEWS as readonly unknown[]).includes(view)) return undefined;
	return { panel: panel as LiveDoing['panel'], view: view as LiveDoing['view'], presenting: presenting === true, ...((v as Record<string, unknown>).asking === true ? { asking: true } : {}) };
};
/** This browser's activity from its Studio state. */
const doingOf = (d: LiveDeps): LiveDoing => ({ panel: d.panel, view: d.view, presenting: d.presenting, ...(d.asking ? { asking: true } : {}) });
/** A settings report counts as this person's own move only within this long of a press, tap or key. */
const GESTURE_MS = 700;
/** A Present the person closed stays closed until the leader's Present has been gone this long (then a new one is a new one). */
const PRESENT_GONE_MS = 3000;
/** How long "Amina changed Theme" stays on her row. */
const CHANGED_SHOW_MS = 20_000;
/** Pointers: at most this many a second leave this browser; one arriving faster from a peer is dropped,
 *  and one that has not moved for this long disappears. */
const POINTER_EVERY_MS = 100;
const POINTER_MIN_GAP_MS = 30;
const POINTER_IDLE_MS = 6000;
/** A presentation started this soon after the last one is not obeyed: a host toggling fast moves nobody. */
const PRESENT_RESTART_MS = 2000;
/** Show me together: everyone starts this long after the host presses, so the start reaches each member
 *  before its moment; a start further off than the most a link can lag is pulled in to it. */
const TOUR_LEAD_MS = 700;
const TOUR_MAX_WAIT_MS = 3000;
/** A tour started this soon after the last one is not obeyed: a host pressing fast restarts nobody. */
const TOUR_RESTART_MS = 5000;
/** The host's Present reports where it is within this long of a start; past it the start goes out as is. */
const PRESENT_START_WAIT_MS = 600;
/** A host stepping fast sends its position at most this often (the last one always goes). */
const PRESENT_EVERY_MS = 100;
/** A transport as a host sent it, or null. */
const cleanTransport = (p: { i?: unknown; p?: unknown; l?: unknown; h?: unknown; v?: unknown }): LiveTransport | null => {
	const ok = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 10_000;
	if (!ok(p.i) || !ok(p.p) || typeof p.l !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(p.l)) return null;
	return { idx: p.i, page: p.p, lens: p.l, ...(typeof p.h === 'string' && /^[0-9a-f]{1,8}$/.test(p.h) ? { hash: p.h } : {}), ...(p.v === 1 ? { voice: true } : {}) };
};
/** A transport as a `present` post carries it. */
const transportPost = (t: LiveTransport) => ({ i: t.idx, p: t.page, l: t.lens, ...(t.hash ? { h: t.hash } : {}), ...(t.voice ? { v: 1 } : {}) });
/** Narration clips a member holds for one presentation, and the most one clip may carry. A clip is mp3 at
 *  64 kbps, about 8 KB a second of speech, so these are a few minutes of talk and several times a
 *  sentence's real size. The size a clip may be for its text is `clipLimit`. */
const CLIP_KEEP = 96;
const CLIP_BYTES_KEEP = 24 * 1024 * 1024;
const CLIP_MAX_BYTES = 1536 * 1024;
const CLIP_HASH = /^[0-9a-f]{16}$/;
/** A member asks again this often while a clip has not come (the presenter may not have made it yet), and gives up after. */
const CLIP_RETRY_MS = 1500;
const CLIP_TRIES = 10;
/** The host answers one member at most this many requests in CLIP_WINDOW_MS; a flood of asks buys no flood of bytes. */
const CLIP_RATE = 4;
const CLIP_WINDOW_MS = 1000;
/** The host keeps this many answered clips for the run, so four members asking costs one compression. */
const CLIP_SERVED_KEEP = 128;
/** What an mp3's first frame header says, or null for anything that is not MPEG audio layer III at a rate a
 *  voice clip has. A member reads this before it decodes: a clip is bounded by its bitrate and length, not by its
 *  bytes, and 1.5 MB at 8 kbps decodes to 25 minutes of audio (about 265 MB). */
const mp3Header = (b: Uint8Array): { kbps: number } | null => {
	let i = 0;
	// An ID3v2 tag may come first: skip it, bounded.
	if (b.length > 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) i = 10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f));
	if (i > 4096 || i + 4 > b.length) return null;
	if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
	const version = (b[i + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2 (0 is 2.5, 1 reserved)
	const layer = (b[i + 1] >> 1) & 3; // 1 = layer III
	const bitrate = b[i + 2] >> 4;
	const rate = (b[i + 2] >> 2) & 3;
	if ((version !== 3 && version !== 2) || layer !== 1 || bitrate === 0 || bitrate === 15 || rate === 3) return null;
	const kbpsV1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
	const kbpsV2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
	const hz = (version === 3 ? [44100, 48000, 32000] : [22050, 24000, 16000])[rate];
	const kbps = (version === 3 ? kbpsV1 : kbpsV2)[bitrate];
	return hz >= 22050 && kbps >= 24 ? { kbps } : null;
};
/** The longest a sentence's clip may run: speech is about 15 characters a second, so this is three times that
 *  pace and a few seconds over. */
const clipSeconds = (chars: number) => chars / 5 + 4;
/** A clip already sent to a member is not sent to them again this soon: a retry on a slow link must not
 *  queue a second copy behind the first on the one channel everything shares. */
const CLIP_RESEND_MS = 8000;
/** Speech is about 15 characters a second, so a sentence's clip of that many characters should be about
 *  540 bytes a character at 64 kbps; allow ample slack, and a floor for a short one. A clip far over
 *  this is not that sentence (a 4 MB clip decodes to about 800 MB, §6 rule 8). */
const clipLimit = (chars: number) => Math.min(CLIP_MAX_BYTES, 24_000 + chars * 2000);
/** A click is drawn at most this often per member; a flood of clicks is dropped like a flood of moves. */
const POINTER_CLICK_GAP_MS = 150;
/** No deck has this many slides; a pointer naming a slide past it is dropped. */
const POINTER_MAX_SLIDE = 10_000;
/** Whether the person is typing in a text field outside the editor (a chat prompt, a search): Follow waits. */
const typingInAField = (): boolean => {
	if (typeof document === 'undefined') return false;
	const el = document.activeElement as HTMLElement | null;
	if (!el || el.closest('.cm-editor')) return false;
	// Any input that takes typed characters (number and password too: a half-typed value is lost when the panel moves).
	return el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !/^(checkbox|radio|range|button|submit|reset|file|color|image|hidden)$/.test(el.type)) || el.isContentEditable;
};

type Runtime = {
	session: Session;
	/** What this browser shows about where it is, and what the others show (Tavola's view over awareness). */
	view: YjsAwareness['view'];
	doc: Y.Doc;
	ytext: Y.Text;
	aw: Awareness;
	room: string;
	secret: string;
	link: string;
	startedAt: number;
	ext: Extension;
	/** This browser's undo in the session: the binding's, so the Studio root's ⌘Z can reach it too. */
	um: Y.UndoManager;
	key: HostKey | null;
	/** Awareness client id → the peer whose state we accepted for it (the roster bound them). */
	owner: ReadonlyMap<number, string>;
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
export function cleanRelPos(x: unknown): Record<string, unknown> | null {
	if (!x || typeof x !== 'object') return null;
	const p = x as Record<string, unknown>;
	const id = (v: unknown): { client: number; clock: number } | null => {
		const o = v as { client?: unknown; clock?: unknown } | null;
		return o && typeof o === 'object' && Number.isSafeInteger(o.client) && Number.isSafeInteger(o.clock) ? { client: o.client as number, clock: o.clock as number } : null;
	};
	const item = id(p.item);
	const type = id(p.type);
	const tname = typeof p.tname === 'string' ? p.tname.slice(0, 64) : null;
	if (!item && !type && tname === null) return null;
	// Yjs reads an absent id as `null` and throws on `undefined`: a caret at the end of the document has
	// `item: null`, and a viewer that dropped the key lost every remote caret to the thrown TypeError.
	return { type, tname, item, assoc: Number.isInteger(p.assoc) ? p.assoc : 0 };
}

/**
 * What this app lets a member say about itself in awareness, one cleaner per field. Tavola's Yjs adapter
 * (`@/lib/tavola/adapters/yjs`) owns the rest of the gate: it refuses a message over 8 KB, an entry over 4 KB
 * or more than 64 entries before any parse, keeps only the one client the host's roster binds to the sender,
 * writes `peer` and `user` itself (a cleaner cannot name them), handles the clock and the rate, and drops a
 * field no cleaner names. A cleaner sees who sent the value, so a `summon` counts only from the host.
 */
const AWARENESS_FIELDS: Readonly<Record<string, FieldCleaner>> = {
	slide: (v) => (Number.isInteger(v) && (v as number) >= 0 ? v : undefined),
	slideHidden: (v) => (v === true ? true : undefined),
	editingAt: (v) => (typeof v === 'number' ? v : undefined),
	summon: (v, sender) => {
		const sm = v as { slide?: unknown; n?: unknown } | undefined;
		return sender.role === 'host' && sm && Number.isInteger(sm.slide) && Number.isInteger(sm.n) ? { slide: sm.slide as number, n: sm.n as number } : undefined;
	},
	cursor: (v) => {
		const cur = v as { anchor?: unknown; head?: unknown } | undefined;
		const anchor = cleanRelPos(cur?.anchor);
		const head = cleanRelPos(cur?.head);
		return anchor && head ? { anchor, head } : undefined;
	},
	doing: (v) => cleanDoing(v),
};
/** The name and color a member shows under, from the roster: never from what the peer sent. */
const awarenessIdentity = (m: { name: string; color: LiveColor }) => ({ user: { name: m.name, color: liveColor(m.color), colorLight: liveColorLight(m.color) } });

/** Rewrite an incoming awareness update so it says only what `from` may say (the gate above, as bytes). */
export function sanitizeAwareness(update: Uint8Array, from: string, ownerOf: (client: number) => string | undefined, member: { name: string; color: LiveColor; role: string } | undefined): Uint8Array | null {
	if (!member) return null;
	return sanitizeAwarenessUpdate(update, from, { ownerOf, member: { id: from, name: member.name, color: member.color, role: member.role as 'host' | 'edit' | 'view' }, identity: awarenessIdentity, fields: AWARENESS_FIELDS });
}

export class LiveController {
	private rt: Runtime | null = null;
	private deps: LiveDeps;
	/** View keys the gate dropped because a value failed its list, by key. A schema mistake must be visible, not a quiet "Follow does not do that". */
	private viewDrops = new Map<string, number>();
	private followingId: string | null = null;
	/** Whoever this browser follows. Setting it tells screens who they should mark (`syncLeader`). */
	private get following(): string | null {
		return this.followingId;
	}
	private set following(id: string | null) {
		if (this.followingId !== id && this.presentFollow === 'open') followBus.apply('present', null);
		if (this.followingId !== id) {
			this.presentFollow = 'idle';
			this.presentGoneAt = 0;
		}
		this.followingId = id;
		this.followName = (id && this.rt?.session.getState().members.find((m) => m.id === id)?.name) || '';
		this.syncLeader();
	}
	/** Raise a Go or Join prompt, unless the one action slot holds something the person just earned (their Undo):
	 *  it is raised at the next awareness change once the slot is free, and returns whether it was raised. */
	private prompt(message: string, action: { label: string; onClick: () => void }): boolean {
		if (this.host.actionBusy?.()) return false;
		this.host.notifyAction(message, action);
		return true;
	}
	/** A follow that ends other than by the person pressing Stop says so: it must never just stop. */
	private endFollow(why: 'moved' | 'left') {
		if (!this.following) return;
		const name = this.followName || 'them';
		this.following = null;
		this.host.notify(why === 'left' ? `${name} left, so you stopped following.` : `You stopped following ${name}.`);
	}
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
	/** The session's look (§5.1 of the 2026-10-20 note): frozen by the host that started the session,
	 *  carried in the host save, and taken by a member only from the current host's `tip`. A member
	 *  that takes over keeps the one it holds, so a takeover never re-skins anyone's deck. */
	private look: LiveLook | null = null;
	/** Present together (§7.2). Host: whether it presents to everyone, and where its Present is. Member: the
	 *  host's presentation it follows, and when the last one started (a host toggling fast is not obeyed). */
	private presentingToAll = false;
	/** The stream mixed into this browser's call (its narration while it presents to everyone). */
	private callMix: MediaStream | null = null;
	private transport: LiveTransport = { idx: 0, page: 0, lens: 'full' };
	private roomPresent: LivePresent | null = null;
	private roomPresentHost: string | null = null;
	private roomPresentAt = 0;
	/** Narration clips (§7.3). Host: how to answer a request, what it answered for this run, and each member's
	 *  recent request times. Member: the clips held for this presentation, and the sentences it waits on. */
	private clipServer: ((hash: string) => Promise<LiveClip | null>) | null = null;
	private clipServed = new Map<string, Promise<Extract<Post, { k: 'clip' }> | null>>();
	private clipAsks = new Map<string, number[]>();
	private clipSentAt = new Map<string, number>();
	/** Serving is one at a time: an encode is synchronous work on the presenter's own thread. */
	private clipBusy = false;
	private clipHave = new Map<string, LiveClip>();
	private clipHaveBytes = 0;
	private clipWait = new Map<string, { len: number; subs: Array<(c: LiveClip | null) => void>; tries: number; timer: ReturnType<typeof setTimeout> | null }>();
	/** Comments shared in this session (slice 6), by id. Every member holds them all, so an heir has them. */
	private cmts = new Map<string, SessionComment>();
	/** Comment actions taken while the host was away, sent when it is back. */
	private cmtQueue: Array<Extract<Post, { k: 'cmt' }>> = [];
	/** Show me together: when the last tour reached this browser, and the start waiting for its moment. */
	private tourAt = 0;
	private tourLater: ReturnType<typeof setTimeout> | null = null;
	/** Host: a start waiting for its Present's first position, the repeat that reaches a member who dropped
	 *  the first start inside its restart window, and the trailing send of a fast run of steps. */
	private presentStartDue = false;
	private presentTimers: ReturnType<typeof setTimeout>[] = [];
	private presentSentAt = 0;
	private presentLater: ReturnType<typeof setTimeout> | null = null;
	/** Pointers: the others', by peer, and who wants them (the overlay, outside React's render). */
	private pointers = new Map<string, LivePointer & { at: number }>();
	private pointerSubs = new Set<(p: LivePointer[]) => void>();
	private pointerSent = 0;
	private pointerLater: ReturnType<typeof setTimeout> | null = null;
	private pointerNext: { slide: number; x: number; y: number; click?: boolean } | null = null;
	private pointerSweep: ReturnType<typeof setInterval> | null = null;
	/** Follow: the panel and view this browser was moved to, so a change it made itself stops following. */
	private followedDoing: { panel: LiveDoing['panel']; view: LiveDoing['view'] } | null = null;
	private followAsked = -1;
	private slideAsked = -1;
	/** Who we follow, by name, for the notice when a follow ends. */
	private followName = '';
	/** When this person last pressed, tapped or typed anywhere: a report from a screen is theirs only just after one. */
	private lastGestureAt = 0;
	private presentOpenedAt = 0;
	private presentGoneAt = 0;
	private followPending: { panel: LiveDoing['panel']; view: LiveDoing['view']; moves: FollowMove[]; panelMoves: boolean } | null = null;
	private lastApplyAt = 0;
	private applying = false;
	private presentAsked = -1;
	/** Following into Present: no Present of ours opened by Follow, one we opened that way, or one we closed ourselves
	 *  (not reopened until the leader's Present ends and a new one starts). */
	private presentFollow: 'idle' | 'open' | 'declined' = 'idle';
	private followTo(target: { panel: LiveDoing['panel']; view: LiveDoing['view']; moves: FollowMove[]; panelMoves: boolean }) {
		if (!this.following) return;
		this.followAsked = -1;
		this.followPending = null;
		this.lastApplyAt = Date.now();
		if (target.panelMoves) {
			this.followedDoing = { panel: target.panel, view: target.view };
			this.host.followDoing?.({ panel: target.panel, view: target.view });
		}
		// A screen that moves reports where it is, and that report is awareness again: do not follow our own echo.
		this.applying = true;
		try {
			for (const [key, value] of target.moves) followBus.apply(key, value);
		} finally {
			this.applying = false;
		}
	}
	/** Show the settings panel's place beside the rest of the view (a screen reports it through the bus). */
	private publishBus() {
		const r = this.rt;
		if (!r) return;
		for (const key of ['inspector', 'section', 'present', 'focus', 'shown', 'setupTab', 'changed'] as const) {
			const v = followBus.getLocal(key);
			if (v === null) r.view.clear(key);
			else if (!r.view.set(key, v)) this.viewDrops.set(key, (this.viewDrops.get(key) ?? 0) + 1);
		}
	}
	/** Settings rows other people changed lately, by peer: the counter last seen, when, and which row. A counter seen
	 *  for the first time is history (a late joiner), not news. */
	private changedSeen = new Map<string, { n: number; at: number; what: string | null }>();
	private changedTimer: ReturnType<typeof setTimeout> | null = null;
	/** Look at everyone's `changed` counter after an awareness change: a new count is news, the first one seen is not. */
	private scanChanged(peers: Iterable<string>) {
		const r = this.rt;
		if (!r) return;
		let news = false;
		for (const peer of peers) {
			const view = r.view.of(peer).all();
			const c = view.changed as { n?: number } | undefined;
			const n = c && typeof c.n === 'number' ? c.n : 0;
			const seen = this.changedSeen.get(peer);
			// A person first seen with a counter already running is history (a late joiner); one first seen without
			// any has a counter of 0, so their first change is news.
			if (!seen) this.changedSeen.set(peer, { n, at: 0, what: null });
			else if (seen.n !== n && n > 0) {
				this.changedSeen.set(peer, { n, at: Date.now(), what: changedWords(view) });
				news = true;
			}
		}
		if (!news) return;
		this.host.rerender();
		if (this.changedTimer) clearTimeout(this.changedTimer);
		this.changedTimer = setTimeout(() => this.host.rerender(), CHANGED_SHOW_MS + 100);
	}
	/** Where a person is in the settings, and the row they changed lately, from the view they show. */
	private placeOfPeer(peer: string): { at?: string; changed?: string } {
		const r = this.rt;
		if (!r) return {};
		const at = placeWords(r.view.of(peer).all());
		const seen = this.changedSeen.get(peer);
		const changed = seen?.what && Date.now() - seen.at < CHANGED_SHOW_MS ? seen.what : undefined;
		return { ...(at ? { at } : {}), ...(changed ? { changed } : {}) };
	}
	/** Tell screens where the person we follow is looking, so a settings row can mark it. */
	private syncLeader() {
		const r = this.rt;
		const who = this.followingId;
		if (!r || !who) {
			followBus.setLeader(null);
			return;
		}
		const name = r.session.getState().members.find((m) => m.id === who)?.name;
		const lead = r.view.of(who);
		const focus = lead.get('focus');
		const inspector = lead.get('inspector');
		const theirSlide = (r.aw.getStates().get([...r.owner].find(([, p]) => p === who)?.[0] ?? -1) as AwState | undefined)?.slide;
		followBus.setLeader(name ? { name, focus: typeof focus === 'string' ? focus : null, inspector: inspector === 'deck' || inspector === 'slide' ? inspector : null, sameSlide: theirSlide !== undefined && theirSlide === this.deps.activeSlide } : null);
	}
	/** Follow into Present (design note 2026-10-21 §7.4). The leader's Present is a place; ours opens at it, quietly,
	 *  unless we are typing (then a Join), already in a Present of our own, or the room is presenting (that wins). */
	private followPresent(r: Runtime, s: SessionState, mirrors: boolean) {
		const who = this.following;
		if (!who) return;
		const place = r.view.of(who).get('present') as PresentPlace | undefined;
		const name = s.members.find((m) => m.id === who)?.name ?? 'They';
		if (!place || !mirrors || this.roomPresent) {
			if (this.presentFollow === 'open') {
				followBus.apply('present', null);
				this.presentFollow = 'idle';
			}
			// A Present the person closed stays closed through a short absence (a throttled tab, a share switch, a width
			// change); only a leader who has been gone for a while and comes back is starting a new one.
			if (this.presentFollow === 'declined') this.presentGoneAt ||= Date.now();
			else this.presentFollow = 'idle';
			return;
		}
		if (this.presentFollow === 'declined') {
			if (!this.presentGoneAt || Date.now() - this.presentGoneAt < PRESENT_GONE_MS) {
				this.presentGoneAt = 0;
				return;
			}
			this.presentFollow = 'idle';
			this.presentGoneAt = 0;
		}
		// We opened it and it is no longer open, though no render has said so yet: the person closed it.
		if (this.presentFollow === 'open' && !this.deps.presenting && Date.now() - this.presentOpenedAt > 1500) {
			this.presentFollow = 'declined';
			this.presentGoneAt = 0;
			return;
		}
		if (this.presentFollow === 'idle' && this.deps.presenting) return;
		const next = { ...place, by: name };
		if (this.presentFollow === 'open') {
			if (JSON.stringify(followBus.lastApplied('present')) !== JSON.stringify(next)) followBus.apply('present', next);
			return;
		}
		const open = () => {
			if (this.following !== who || this.deps.presenting || this.roomPresent) return;
			const now = r.view.of(who).get('present') as PresentPlace | undefined;
			if (!now) return;
			this.presentFollow = 'open';
			this.presentOpenedAt = Date.now();
			this.lastApplyAt = Date.now();
			this.applying = true;
			try {
				followBus.apply('present', { ...now, by: name });
			} finally {
				this.applying = false;
			}
		};
		if (r.session.now() - this.myEditAt < TYPING_MS || typingInAField()) {
			if (this.presentAsked !== this.myEditAt && this.prompt(`${name} is presenting`, { label: 'Join', onClick: open })) this.presentAsked = this.myEditAt;
		} else open();
	}
	/** Member (and an heir): the host's records, validated, held in memory for the session only. */
	private received: LiveRecords = NO_RECORDS;
	private recordsSeq = 0;
	/** Member: a look that names a theme whose record has not passed the gate yet. */
	private pendingLook: unknown = null;
	/** Host: which of ITS OWN records it shares — the ones the deck used when sharing started, plus any
	 *  it agreed to since. An heir starts with none of its own. Kept in the sealed host save. */
	private shared = new Set<string>();
	/** Host: the records it has already asked about, so an edit does not ask twice. */
	private asked = new Set<string>();
	private sentRecords = '';
	/** Host: the saved theme it shared as the session's look, captured when it said yes, so changing its
	 *  site palette later never takes the record away from the others. */
	private lookTheme: LiveTheme | null = null;
	/** Member: what it has already said about records it could not show, and when it last named components. */
	private recordNotes = new Set<string>();
	private componentNoteAt = 0;
	/** Member: the import gate's verdicts by name and CSS, so a theme sent again (or a hostile host sending the
	 *  same heavy sheet over and over) is checked once. */
	private verdicts = new Map<string, boolean>();
	/** The theme the lobby names: the session's frozen look, never the host's palette now (a saved theme's
	 *  name is not shared, so it shows none). A heir that holds no look names none either. */
	private inviteTheme(): string {
		const p = this.look?.palette;
		return p && BUILTIN_PALETTES.includes(p) ? p : '';
	}
	/** Take the look a host message carried, if it is one and differs from ours. */
	private takeLook(v: unknown) {
		const look = cleanLook(v, (n) => this.received.themes.some((t) => t.name === n));
		// A look naming a saved theme whose record is still being checked: hold it until the record lands.
		if (!look && cleanLook(v, () => true)) {
			const { palette, mode } = v as LiveLook;
			if (typeof palette === 'string' && THEME_NAME.test(palette)) this.pendingLook = { palette, mode };
			return;
		}
		this.pendingLook = null;
		if (look && (look.palette !== this.look?.palette || look.mode !== this.look?.mode)) {
			this.look = look;
			this.host.rerender();
		}
	}
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
	private quality: Record<string, AudioStats> = {};
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
	/** A microphone capture is in flight (`joinCall`), the latest request made meanwhile, and whether Leave call was pressed. */
	private joining = false;
	private queuedJoin: { deviceId?: string; highFidelity?: boolean } | null = null;
	private leaveAfterJoin = false;
	/** Whether the call's send is stalled, as the panel last drew it (a redraw only when it changes). */
	private stalledShown = false;
	/** What this person lets the others see of them. Theirs to withhold; kept for this tab, not saved. */
	/** The host name the lobby invite last carried, so a rename reaches the lobby too. */
	private invitedAs: string | undefined;
	/** What you share, kept for this tab (sessionStorage), so a reload does not quietly publish what you hid. */
	private share: LiveShare = readShare();
	/** When this person last edited the source, in session time: the "don't move me while I type" check must not depend on what they share. */
	private myEditAt = 0;
	private timeline: () => LinkEvent[] = () => [];
	/** The screen wake lock held while a session is live (live-wake.ts). */
	private readonly wake = new WakeKeeper();
	private pairs: () => Promise<string[]> = () => Promise.resolve([]);
	private outDevices: Array<{ id: string; label: string }> = [];
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
				this.cmts = new Map((opened.cmts ?? []).map(cleanComment).filter((c): c is SessionComment => !!c).map((c) => [c.id, c]));
				this.seq = this.chat.reduce((m, l) => Math.max(m, l.seq), 0);
				this.sidOwner = new Map((opened.sids ?? []).filter((e) => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string'));
				this.wire({ room: hosting.room, secret: opened.secret, key, host: { name: hosting.name, tokens: opened.tokens, doc: hosting.doc, succession: opened.succession, selfToken: opened.selfToken, look: 'look' in hosting ? cleanLook(hosting.look, (n) => n === opened.lookTheme?.name) : undefined, shared: opened.shared ?? [], lookTheme: opened.lookTheme ?? null }, startedAt: hosting.startedAt, release });
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

	private wire(args: { room: string; secret: string; key?: HostKey; hostFingerprint?: string; host?: { name: string; tokens?: TokenEntry[]; doc?: string; succession?: Succession; selfToken?: string; look?: LiveLook | null; shared?: string[]; lookTheme?: LiveTheme | null }; token?: string; minTerm?: number; startedAt?: number; release?: () => void }) {
		const d = this.deps;
		// A host freezes the look now, or keeps the one its save carried. A member waits for the host's.
		this.look = args.host ? (args.host.look === undefined ? freezeLook(d) : args.host.look) : null;
		// A fresh session shares what the deck uses now; a resumed one, what its save says it shared.
		this.shared = new Set(args.host ? (args.host.shared ?? keysOf(d.records)) : []);
		this.lookTheme = args.host?.lookTheme ?? null;
		this.asked = new Set(this.shared);
		const doc = new Y.Doc();
		const ytext = doc.getText('source');
		if (args.host?.doc) Y.applyUpdate(doc, fromB64(args.host.doc));
		else if (args.host) ytext.insert(0, d.source);
		const aw = new Awareness(doc);
		// What this person shares is theirs to withhold, and presence leaves this browser at exactly one place:
		// `setLocalStateField`. A field they have turned off never reaches the awareness state, so it never
		// reaches anyone (the receiving side rebuilds each state from a whitelist, so it cannot be forged either).
		const setField = aw.setLocalStateField.bind(aw);
		aw.setLocalStateField = (field: string, value: unknown) => {
			if (field === 'cursor' && !this.share.cursor) return;
			if (field === 'editingAt' && !this.share.typing) return;
			if (field === 'slide' && !this.share.slide) return;
			if (field === 'doing' && !this.share.doing) return;
			if (field === 'view' && !this.share.doing) return;
			setField(field, value);
		};
		const REMOTE = Symbol('tavola-remote');
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
		// Awareness goes through Tavola's Yjs adapter: the one hardened gate (bounds before the parse, identity from
		// the roster, the clock, the rate) with this app's field cleaners.
		const presence = yjsAwareness(aw, { ownerOf, memberOf: (peer) => memberOf(peer), identity: awarenessIdentity, fields: AWARENESS_FIELDS, view: { keys: VIEW_KEYS }, allow: (k) => this.share.doing && (k !== 'present' || this.share.slide), onDrop: (_from, keys) => { for (const k of keys) this.viewDrops.set(k, (this.viewDrops.get(k) ?? 0) + 1); } });
		const awStream = presence.stream;
		const owner = presence.owner;
		const key = args.key ?? null;
		const audio = new LiveAudio(() => this.host.rerender());
		this.audio = audio;
		const transport = trysteroTransport(args.room, args.secret, { turnConfig: LIVE_TURN });
		this.timeline = () => transport.timeline?.() ?? [];
		this.pairs = () => transport.pairs?.().catch(() => []) ?? Promise.resolve([]);
		const session = createSession({
			media: { add: (stream, from) => {
				audio.addRemote(from, stream);
				this.startSpeaking();
				// Their stream is (back) here: tell them our microphone state too, since after a blip or a
				// takeover neither side sees the other as a newcomer (checker, 2026-10-07).
				if (audio.inCall) this.post({ k: 'mic', on: !audio.isMuted }, from);
			}, drop: (from) => audio.dropRemote(from) },
			transport: transport,
			doc: docStream,
			awareness: awStream,
			...(args.host && key ? { host: { name: args.host.name, key, tokens: args.host.tokens, ...(args.host.succession ? { succession: args.host.succession } : {}), ...(args.host.selfToken ? { selfToken: args.host.selfToken } : {}), invite: { title: d.deckTitle, hostName: args.host.name, slides: d.slideCount, theme: this.inviteTheme() } } } : { hostFingerprint: args.hostFingerprint }),
			...(args.token ? { token: args.token } : {}),
			...(args.minTerm !== undefined ? { minTerm: args.minTerm } : {}),
			client: aw.clientID,
			onPost: (data, from) => this.onPost(data, from),
		});
		// The binding brings its own undo manager, scoped to THIS browser's changes, in place of
		// CodeMirror's history (which would put everyone's edits on your undo stack).
		const um = new Y.UndoManager(ytext);
		const ext = [yCollab(ytext, aw, { undoManager: um }), keymap.of(yUndoManagerKeymap)];
		// The LINK's fingerprint: a host that took over signs with its own key, certified by the link's.
		const fingerprint = args.host?.succession?.fingerprint ?? key?.fingerprint ?? (args.hostFingerprint as string);
		// The link is this page's address WITHOUT its query: a query can carry anything the host's
		// address bar happened to hold (inversion round 2, item 6).
		rt = { session, view: presence.view, doc, ytext, aw, room: args.room, secret: args.secret, link: formatLink(location.origin + location.pathname, { room: args.room, secret: args.secret, host: fingerprint }), startedAt: args.startedAt ?? Date.now(), ext, um, key, owner, chatN: 0, ...newSid(args.room), gotDoc: !!args.host, disposers: [], release: args.release ?? null };
		rt.disposers.push(() => {
			rt?.release?.();
			if (rt) rt.release = null;
		});
		this.rt = rt;
		// A session started in a tab that already chose what to hide (a reload, or a second session): make the presence match.
		if (!(this.share.cursor && this.share.slide && this.share.typing && this.share.doing)) this.applyShare();
		else this.publishDoing(d);
		const r = rt;
		// A screen reports where it is (the settings panel and its section); show that, and tell a change a person made
		// from one Follow made (a value just applied is not theirs).
		r.disposers.push(
			followBus.onLocal((key, value) => {
				this.publishBus();
				// A screen reports a new value for many reasons (a panel finishing its lazy load, a tab falling back); only one
				// that comes just after a press, tap or key, and not right after Follow moved it, is this person's own move.
				if ((key === 'inspector' || key === 'section') && value !== null && this.following && Date.now() - this.lastApplyAt > 800 && Date.now() - this.lastGestureAt < GESTURE_MS && value !== followBus.lastApplied(key)) {
					this.endFollow('moved');
					this.host.rerender();
				}
			}),
		);

		const gesture = () => {
			this.lastGestureAt = Date.now();
		};
		if (typeof window !== 'undefined') {
			const events = ['pointerdown', 'keydown', 'touchstart'] as const;
			for (const ev of events) window.addEventListener(ev, gesture, true);
			r.disposers.push(() => {
				for (const ev of events) window.removeEventListener(ev, gesture, true);
			});
		}

		let prev: SessionState = session.getState();
		r.disposers.push(
			session.subscribe(() => {
				const s = session.getState();
				this.wake.keep(s.stage === 'live');
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
								if (this.rt !== r) return;
								// The records first: a look naming a shared theme is taken only once its record is here.
								this.sendRecords(to);
								// Every shared comment, before the newcomer can act on any.
								for (const list of chunksWithin([...this.cmts.values()], HISTORY_BYTES / 2)) this.post({ k: 'cmts', list }, to);
								this.post({ k: 'tip', seq: this.seq, startedAt: r.startedAt, ...(this.look ? { look: this.look } : {}) }, to);
								// A presentation in progress: the newcomer joins it where it is.
								if (this.presentingToAll) this.post({ k: 'present', on: true, ...transportPost(this.transport) }, to);
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
						if (this.pointers.delete(id)) this.emitPointers();
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
						this.post({ k: 'handback', lines: newestWithin(this.chat, HISTORY_BYTES), sids: [...this.sidOwner].map(([sid, owner]): [string, string] => [sid, owner === 'host' ? (this.lastSelfId ?? owner) : owner]) }, to);
					}
				}
				if (s.isHost && s.heir !== prev.heir) this.sentSids = '';
				if (s.isHost) this.sendSids();
				if (prev.stage !== s.stage) this.onStage(prev.stage, s);
				// Someone else hosts now (the presenter dropped and an heir took over): its presentation is over.
				// A host only briefly missing from the roster (a network blip) keeps presenting.
				if (this.roomPresentHost && s.members.some((m) => m.role === 'host' && m.id !== this.roomPresentHost)) {
					const by = this.roomPresent?.by;
					this.roomPresent = null;
					this.resetClips();
					this.roomPresentHost = null;
					this.host.closeRoomPresent?.();
					if (by) this.host.notify(`${by}'s presentation ended: they are no longer hosting.`);
				}
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
			this.myEditAt = t;
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
				// Call numbers only while this browser is on the call; the transport keeps no state otherwise to read.
				if (this.audio?.inCall) {
					void r.session.audioStats().then((q) => {
						if (this.rt === r) this.quality = q;
					});
				} else this.quality = {};
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
		// `leave()` moves no stage, so the subscribe tick never says "not live": release the screen here (checker, 2026-10-13).
		this.wake.keep(false);
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
		this.cmts.clear();
		this.cmtQueue = [];
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
		this.quality = {};
		this.heirSids = [];
		this.sentSids = '';
		this.handbackDue = false;
		this.lastSelfId = null;
		this.hostStartedAt = null;
		this.look = null;
		this.received = NO_RECORDS;
		this.recordsSeq++;
		this.pendingLook = null;
		this.shared = new Set();
		this.asked = new Set();
		this.sentRecords = '';
		this.recordNotes = new Set();
		this.componentNoteAt = 0;
		this.verdicts = new Map();
		this.lookTheme = null;
		this.pointers.clear();
		this.emitPointers();
		if (this.pointerLater) clearTimeout(this.pointerLater);
		this.pointerLater = null;
		this.pointerNext = null;
		this.followedDoing = null;
		if (this.presentFollow === 'open') followBus.apply('present', null);
		this.presentFollow = 'idle';
		this.presentGoneAt = 0;
		followBus.forgetApplied();
		if (this.roomPresent) this.host.closeRoomPresent?.();
		this.presentingToAll = false;
		this.resetClips();
		this.clearPresentTimers();
		if (this.tourLater) clearTimeout(this.tourLater);
		this.tourLater = null;
		this.roomPresent = null;
		this.resetClips();
		this.roomPresentHost = null;
		this.transport = { idx: 0, page: 0, lens: 'full' };
		this.callMix = null;
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
		this.wake.keep(false);
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
			sealed = await seal(JSON.stringify({ secret: r.secret, tokens: r.session.exportTokens(), chat: newestWithin(this.chat, SAVED_BYTES), cmts: newestWithin([...this.cmts.values()], SAVED_BYTES), sids: [...this.sidOwner], succession, selfToken: succ?.selfToken, shared: [...this.shared], ...(this.lookTheme ? { lookTheme: this.lookTheme } : {}) } satisfies HostSealed));
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
		const save: HostSave = { room: r.room, sealed: this.lastSealed.sealed, pub: toBase64Url(r.key.publicRaw), name: s.me?.name ?? 'Host', deckId: this.boundDeck ?? this.deps.deckId, doc: toB64(Y.encodeStateAsUpdate(r.doc)), startedAt: r.startedAt, look: this.look };
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

	/**
	 * Capture the microphone (or switch to another one, or turn High fidelity on or off) and send it
	 * to every member. One capture at a time: a second request made while the browser is still
	 * answering the first (a double tap on the switch, or a permission prompt left open) waits and
	 * runs after it with the latest choice, so the last tap wins; and Leave call during a capture
	 * leaves once it lands, rather than being undone by it.
	 */
	private async joinCall(deviceId?: string, highFidelity?: boolean) {
		const a = this.audio;
		const r = this.rt;
		if (!a || !r) return;
		if (this.joining) {
			this.queuedJoin = { deviceId, highFidelity };
			return;
		}
		this.joining = true;
		this.leaveAfterJoin = false;
		try {
			const stream = await a.join(deviceId, highFidelity);
			if (this.rt !== r || this.leaveAfterJoin) {
				a.leave();
				this.leaveAfterJoin = false;
				this.queuedJoin = null;
				return;
			}
			this.micDenied = false;
			r.session.setMedia(stream, { maxBitrate: a.highFidelity ? HIGH_FIDELITY_BITRATE : CALL_BITRATE });
			this.post({ k: 'mic', on: !a.isMuted });
			this.micDevices = await a.devices();
			this.outDevices = await a.outputs();
			this.startSpeaking();
		} catch (e) {
			const denied = (e as { name?: string })?.name === 'NotAllowedError' || (e as { name?: string })?.name === 'SecurityError';
			this.micDenied = denied;
			// Name the reason: a device answer we never saw on a desktop run is diagnosable from a phone screenshot.
			const why = (e as { name?: string; message?: string })?.name || (e as { message?: string })?.message || 'unknown error';
			this.host.notify(denied ? 'The browser blocked the microphone. Allow it in the address bar, then try again.' : `Couldn't start the microphone (${why}).`);
		} finally {
			this.joining = false;
		}
		this.onAirTitle();
		this.host.rerender();
		const next = this.queuedJoin;
		this.queuedJoin = null;
		if (next && this.rt === r) await this.joinCall(next.deviceId, next.highFidelity);
	}

	private leaveCall() {
		const a = this.audio;
		this.queuedJoin = null;
		if (this.joining) this.leaveAfterJoin = true;
		if (!a?.inCall) return;
		a.leave();
		this.micDevices = [];
		this.stalledShown = false;
		this.rt?.session.setMedia(null);
		this.post({ k: 'mic', on: false });
		this.onAirTitle();
		this.host.rerender();
	}

	/** The speaking rings: levels read ~7 times a second, a redraw only when someone starts or stops. */
	private startSpeaking() {
		if (this.speakTimer) return;
		this.speakTimer = setInterval(() => {
			// A suspended audio context silences what we send: try to bring it back, and tell the panel while it is down.
			const stalled = this.audio?.heal() ?? false;
			if (stalled !== this.stalledShown) {
				this.stalledShown = stalled;
				this.host.rerender();
			}
			const now = this.audio?.speaking() ?? new Set<string>();
			if (now.size === this.speakingNow.size && [...now].every((x) => this.speakingNow.has(x))) return;
			this.speakingNow = now;
			this.host.rerender();
		}, 150);
	}

	/** Make the presence this tab is already sending match what the person now shares. */
	private applyShare() {
		const r = this.rt;
		if (!r) return;
		const st = { ...(r.aw.getLocalState() as Record<string, unknown> | null) };
		if (!this.share.cursor) delete st.cursor;
		if (!this.share.typing) delete st.editingAt;
		if (this.share.doing) st.doing = doingOf(this.deps);
		else {
			delete st.doing;
			delete st.view;
		}
		if (this.share.slide) {
			delete st.slideHidden;
			st.slide = this.deps.activeSlide;
		} else {
			delete st.slide;
			st.slideHidden = true;
		}
		r.aw.setLocalState(st);
		// On: show it again. Off: let the view forget what it last sent, so turning it back on writes it afresh.
		if (this.share.doing) this.publishDoing(this.deps);
		else r.view.flush();
	}

	/** Show where this browser is: the declared view, and `doing` beside it for one release so a tab that
	 *  has not updated still follows (it reads only `doing`). */
	private publishDoing(d: LiveDeps) {
		const r = this.rt;
		if (!r) return;
		r.aw.setLocalStateField('doing', doingOf(d));
		const v = viewOf(doingOf(d));
		for (const k of Object.keys(v)) r.view.set(k, v[k]);
		if (!d.asking) r.view.clear('asking');
		this.publishBus();
		r.view.flush();
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
		this.outDevices = [];
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
		this.post({ k: 'sids', sids, ...(this.look ? { look: this.look } : {}) }, s.heir);
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
		// The presentation was the old host's: it has stopped.
		if (this.roomPresent) this.host.closeRoomPresent?.();
		this.roomPresent = null;
		this.resetClips();
		this.roomPresentHost = null;
		// The heir relays the records it received; none of its OWN until it agrees to each (§6 rule 6).
		this.shared = new Set();
		this.asked = new Set();
		this.sentRecords = '';
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
		this.presentingToAll = false;
		this.resetClips();
		this.clearPresentTimers();
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
		if (s.me && this.share.slide && (r.aw.getLocalState() as AwState | null)?.slide !== deps.activeSlide) r.aw.setLocalStateField('slide', deps.activeSlide);
		if (s.me) {
			const local = r.aw.getLocalState() as AwState | null;
			if (local?.user?.name !== s.me.name || local?.user?.color !== liveColor(s.me.color)) r.aw.setLocalStateField('user', { name: s.me.name, color: liveColor(s.me.color), colorLight: liveColorLight(s.me.color) });
		}
		// My own navigation stops following; a follow jump does not.
		if (prev.activeSlide !== deps.activeSlide) {
			if (this.followJump) this.followJump = false;
			else if (this.following) this.endFollow('moved');
		}
		// So does opening another panel or view of my own; following there does not.
		if (prev.panel !== deps.panel || prev.view !== deps.view) {
			const moved = this.followedDoing;
			if (this.following && !(moved && moved.panel === deps.panel && moved.view === deps.view)) this.endFollow('moved');
			this.followedDoing = null;
		}
		// Closing a Present that Follow opened is a choice: it stays closed until the leader's Present ends and another starts.
		// (Or a Present of our own: closing it while the leader still presents is not a request to open theirs.)
		if (prev.presenting && !deps.presenting && this.following && this.presentFollow !== 'declined') {
			this.presentFollow = 'declined';
			this.presentGoneAt = 0;
		}
		// Activity: what I am doing, when I share it.
		if (s.me && (prev.panel !== deps.panel || prev.view !== deps.view || prev.presenting !== deps.presenting || prev.asking !== deps.asking)) this.publishDoing(deps);
		// The host keeps the lobby invite current.
		if (s.isHost && (prev.deckTitle !== deps.deckTitle || prev.slideCount !== deps.slideCount || prev.theme !== deps.theme || this.invitedAs !== s.me?.name)) {
			this.invitedAs = s.me?.name;
			r.session.setInvite({ title: deps.deckTitle, hostName: s.me?.name ?? '', slides: deps.slideCount, theme: this.inviteTheme() });
		}
		// The host's records: ask about any the deck newly names, and send what changed.
		if (s.isHost && s.stage === 'live' && prev.records !== deps.records) {
			for (const u of this.unshared()) if (u.kind !== 'look') this.offer(u);
			this.sendRecords();
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
		this.scanChanged(byPeer.keys());
		this.syncLeader();
		if (this.following && !this.applying) {
			const slide = byPeer.get(this.following)?.slide;
			if (!s.members.some((m) => m.id === this.following)) {
				// A leader who reconnects comes back under a new id, and nothing here can tell that member from another
				// who takes the same name and color, so the follow ends, and says so (design note §13).
				this.endFollow('left');
				return;
			}
			if (!this.following) return;
			else if (slide !== undefined && slide !== this.deps.activeSlide) {
				// The same typing gate as every other thing Follow applies (design note §7.1): a typist is told
				// where the leader went, once per burst, and keeps their place.
				if (r.session.now() - this.myEditAt < TYPING_MS || typingInAField()) {
					if (this.slideAsked !== this.myEditAt) {
						const who = this.following;
						const name = s.members.find((m) => m.id === who)?.name ?? 'They';
						const asked = this.prompt(`${name} is on slide ${slide + 1}`, {
							label: 'Go',
							onClick: () => {
								const now = who ? this.awByPeer().get(who)?.slide : undefined;
								if (this.following === who && now !== undefined) {
									this.followJump = true;
									this.host.goToSlide(now);
								}
							},
						});
						if (asked) this.slideAsked = this.myEditAt;
					}
				} else {
					this.followJump = true;
					this.host.goToSlide(slide);
				}
			}
			const doing = this.following ? placeOf(r.view.of(this.following).all(), byPeer.get(this.following)?.doing) : undefined;
			// Fabricate is a workspace of one's own, never mirrored: leaving it would throw away the follower's work.
			const view = doing && doing.view !== 'fabricate' && this.deps.view !== 'fabricate' ? doing.view : this.deps.view;
			const mirrors = !!this.host.canFollowDoing?.();
			const rawMoves = mirrors && this.following ? settingsMoves(r.view.of(this.following).all(), { inspector: followBus.getLocal('inspector'), section: followBus.getLocal('section') }) : [];
			// A move is applied once per value; but a section id both panels have (`look`) rides along with a panel change.
			const panelChanges = rawMoves.some(([k, v]) => k === 'inspector' && followBus.lastApplied('inspector') !== v);
			const moves = rawMoves.filter(([k, v]) => (k === 'section' && panelChanges) || followBus.lastApplied(k) !== v);
			const panelMoves = !!(doing && this.host.followDoing && mirrors && (doing.panel !== this.deps.panel || view !== this.deps.view));
			if (doing && (panelMoves || moves.length)) {
				const target = { panel: doing.panel, view, moves, panelMoves };
				const name = s.members.find((m) => m.id === this.following)?.name ?? 'They';
				// Nobody is moved while typing (design note §5.3, §12.3), in the editor or any other field: say where
				// they went, once per burst of typing, with a Go that takes you to wherever they are when you press it.
				if (r.session.now() - this.myEditAt < TYPING_MS || typingInAField()) {
					this.followPending = target;
					if (this.followAsked !== this.myEditAt) {
						const who = this.following;
						if (this.prompt(`${name} ${describeMove(target, moves)}`, { label: 'Go', onClick: () => this.following === who && this.followPending && this.followTo(this.followPending) })) this.followAsked = this.myEditAt;
					}
				} else this.followTo(target);
			}
			this.followPresent(r, s, mirrors);
		}
		if (!s.isHost) {
			const hostId = s.members.find((m) => m.role === 'host')?.id;
			const summon = hostId ? byPeer.get(hostId)?.summon : undefined;
			if (summon && summon.n !== this.lastSummon) {
				const first = this.lastSummon === 0;
				this.lastSummon = summon.n;
				// The first summon seen on joining is history, not a request.
				if (first && !this.bound) return;
				const myEdit = this.myEditAt;
				const slide = summon.slide;
				if (r.session.now() - myEdit < TYPING_MS || typingInAField()) this.host.notifyAction(`The host is on slide ${slide + 1}`, { label: 'Go', onClick: () => this.host.goToSlide(slide) });
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
		return { extension: r.ext, key: `${r.room}:${s.me.role === 'view' ? 'view' : 'edit'}`, readOnly: s.me.role === 'view', seed: () => r.ytext.toString(), look: this.look, records: this.received, undo: () => !!r.um.undo(), redo: () => !!r.um.redo() };
	}

	/** The chat in the host's order. A line's author is the member its `say` ARRIVED from at the
	 *  host (Tavola's gate), as the roster named them then; lines still waiting go last. */
	private chatLines(): LiveChatLine[] {
		const s = this.rt?.session.getState();
		const me = s?.me;
		// Mine: sent from this browser, or (after a reload, under a new peer id) under my name and color.
		// Mine: written under one of this tab's chat-id prefixes (this page's, or an earlier load's).
		const mine = this.mySids();
		const lines: LiveChatLine[] = this.chat.map((l) => ({ kind: 'message', id: `c${l.seq}`, from: l.name, color: l.color, text: l.text, at: l.at, mine: l.peer === s?.selfId || mine.has(sidOf(l.id)), ...(l.note ? { note: l.note } : {}) }));
		for (const p of this.pending) lines.push({ kind: 'message', id: `p${p.id}`, from: me?.name ?? '', color: me?.color ?? 1, text: p.text, at: p.at, mine: true, pending: true, ...(p.note ? { note: p.note } : {}) });
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
		for (const p of next) this.post({ k: 'say', id: p.id, text: p.text, have: this.seq, ...(p.note ? { note: p.note } : {}) }, host);
		const ops = this.cmtQueue;
		this.cmtQueue = [];
		for (const op of ops) this.post(op, host);
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
	private hostTake(id: string, peer: string, member: { name: string; color: LiveColor }, text: string, note?: LiveNote) {
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
		const line: ChatLine = { seq: this.seq + 1, id, peer, name: member.name, color: member.color, text: text.slice(0, CHAT_MAX), at: r.session.now(), ...(note ? { note } : {}) };
		this.addLines([line]);
		this.post({ k: 'line', line });
		// Seal now, not a second later: a reload restores the numbering from this save.
		void this.saveHost();
	}

	/** Host: what it sends — the records it relays (an heir's, received from the first host), its own that
	 *  it shares, and the saved theme it shared as the look. Nothing of its own leaves without a yes (§6 rule 6). */
	private outgoing(): LiveRecords {
		const own = this.deps.records;
		const themes = new Map(this.received.themes.map((t) => [t.name, t]));
		for (const t of own.themes) if (this.shared.has(themeKey(t.name)) && t.css.length <= MAX_THEME_CSS) themes.set(t.name, t);
		if (this.lookTheme) themes.set(this.lookTheme.name, this.lookTheme);
		const finishes = new Map(this.received.finishes.map((f) => [f.name, f]));
		for (const f of own.finishes) if (this.shared.has(finishKey(f.name))) finishes.set(f.name, f);
		const components = new Set(this.received.components);
		for (const c of own.components) if (this.shared.has(componentKey(c))) components.add(c);
		let total = 0;
		const fit = [...themes.values()].slice(0, MAX_THEMES).filter((t) => (total += t.css.length) <= MAX_THEMES_CSS);
		return { themes: fit, finishes: [...finishes.values()].slice(0, MAX_FINISHES), components: [...components].slice(0, MAX_COMPONENTS) };
	}
	/** Host: send the records to one newcomer, or to everyone when they changed. The signature reads
	 *  names and the CSS by length and ends, so a keystroke does not stringify every sheet. */
	private sendRecords(to?: string) {
		const s = this.rt?.session.getState();
		if (!s?.isHost || s.stage !== 'live') return;
		const out = this.outgoing();
		const empty = !out.themes.length && !out.finishes.length && !out.components.length;
		if (to) {
			if (!empty) this.post({ k: 'records', ...out }, to);
			return;
		}
		const sig = [...out.themes.map((t) => `t:${t.name}:${t.css.length}:${t.css.slice(0, 64)}:${t.css.slice(-64)}`), ...out.finishes.map((f) => `f:${f.name}:${f.label}:${JSON.stringify(f.recipe)}`), ...out.components.map(componentKey)].join('\n');
		if (sig === this.sentRecords || (!this.sentRecords && empty)) return;
		this.sentRecords = sig;
		this.post({ k: 'records', ...out });
	}
	/** Host: its records the deck uses that the session does not have — the list the panel shows, with a
	 *  Share button each, until they are shared. A record it relays under the same name is not listed. */
	private unshared(): LiveUnshared[] {
		const s = this.rt?.session.getState();
		if (!s?.isHost || s.stage !== 'live') return [];
		const own = this.deps.records;
		const out: LiveUnshared[] = [];
		for (const t of own.themes) if (!this.shared.has(themeKey(t.name)) && !this.received.themes.some((x) => x.name === t.name) && this.lookTheme?.name !== t.name) out.push({ key: themeKey(t.name), kind: 'theme', name: t.name, ...(t.css.length > MAX_THEME_CSS || !THEME_NAME.test(t.name) ? { tooLarge: true } : {}) });
		for (const f of own.finishes) if (!this.shared.has(finishKey(f.name)) && !this.received.finishes.some((x) => x.name === f.name)) out.push({ key: finishKey(f.name), kind: 'finish', name: f.label || f.name });
		for (const c of own.components) if (!this.shared.has(componentKey(c)) && !this.received.components.includes(c)) out.push({ key: componentKey(c), kind: 'component', name: c });
		const st = this.siteLookOffer();
		if (st) out.unshift({ key: LOOK_KEY, kind: 'look', name: st.name, ...(st.css.length > MAX_THEME_CSS || !THEME_NAME.test(st.name) ? { tooLarge: true } : {}) });
		return out;
	}
	/** Host: its saved site palette, when the session's look fell back to the default because of it and
	 *  the deck names no theme of its own (§5.1). */
	private siteLookOffer(): LiveTheme | null {
		const st = this.deps.siteTheme;
		if (!st || this.lookTheme || !this.look || this.look.palette !== null || deckNamesTheme(this.deps.source)) return null;
		return st;
	}
	/** Host: share one record. A component is shared by name; the look takes the theme captured now. */
	private shareRecord(key: string) {
		const r = this.rt;
		const s = r?.session.getState();
		if (!r || !s?.isHost || s.stage !== 'live') return;
		const item = this.unshared().find((u) => u.key === key);
		if (!item || item.tooLarge) return;
		if (item.kind === 'look') {
			const st = this.siteLookOffer();
			if (!st || !this.look) return;
			this.lookTheme = { name: st.name, css: st.css };
			this.look = { palette: st.name, mode: this.look.mode };
			// The record first, then the look that names it, to everyone.
			this.sendRecords();
			this.post({ k: 'tip', seq: this.seq, startedAt: r.startedAt, look: this.look });
		} else {
			this.shared.add(key);
			this.sendRecords();
		}
		void this.saveHost();
		this.host.rerender();
	}
	/** Host: a record the deck newly names. The panel lists it until it is shared; this toast only points
	 *  there, once per record, and says whether this browser or someone else made the change. */
	private offer(item: LiveUnshared) {
		if (this.asked.has(item.key)) return;
		this.asked.add(item.key);
		const what = item.kind === 'theme' ? `your saved theme "${item.name}"` : item.kind === 'finish' ? `your saved finish "${item.name}"` : `your custom component "${item.name}"`;
		const who = this.rt && this.rt.session.now() - this.myEditAt < 2000 ? 'You changed the deck to use' : 'Someone in the session changed the deck to use';
		if (item.tooLarge) {
			this.host.notify(`${who} ${what}. It's too large to share in a live session, so the others see a fallback.`);
			return;
		}
		this.host.notifyAction(`${who} ${what}, which the others don't have. It's listed in the Live panel until you share it.`, { label: 'Share', onClick: () => this.shareRecord(item.key) });
	}
	/** Host, on starting: a saved site palette is not shared without a yes (§5.1). The panel lists it; this
	 *  says so once. Without the theme's record at hand (the Library still loading) it can only say why. */
	private offerSiteTheme() {
		if (!this.look || this.look.palette !== null || deckNamesTheme(this.deps.source)) return;
		const st = this.siteLookOffer();
		if (!st) {
			this.host.notify("Your saved theme isn't shared in a live session yet, so everyone sees this deck in the default theme.");
			return;
		}
		this.asked.add(LOOK_KEY);
		this.host.notifyAction(`Your theme "${st.name}" isn't shared yet, so everyone sees this deck in the default theme. Share it from the Live panel, or here.`, { label: 'Share', onClick: () => this.shareRecord(LOOK_KEY) });
	}
	/** Member: take the host's records through the gates, and hold them in memory. A later message
	 *  replaces an earlier one; a slow check never lands over a newer one, and stops as soon as one arrives. */
	private async takeRecords(v: unknown, r: Runtime, hostName: string) {
		const n = ++this.recordsSeq;
		const p = v as Partial<LiveRecords>;
		const themes: LiveTheme[] = [];
		for (const t of (Array.isArray(p.themes) ? p.themes : []).slice(0, MAX_THEMES)) {
			if (this.rt !== r || n !== this.recordsSeq) return;
			if (!t || typeof t.name !== 'string' || !THEME_NAME.test(t.name) || RESERVED_THEME_NAMES.has(t.name) || typeof t.css !== 'string' || t.css.length > MAX_THEME_CSS) continue;
			const vkey = `${t.name}\u0000${t.css}`;
			let ok = this.verdicts.get(vkey);
			if (ok === undefined) {
				// The same gate as a theme in a file from someone else: an off-device fetch is refused.
				const refused = await refuseImportedTheme(t.css, t.name).catch(() => ({ name: t.name, why: 'it could not be checked' }));
				ok = !refused;
				if (this.verdicts.size >= VERDICTS_KEPT) this.verdicts.delete(this.verdicts.keys().next().value as string);
				this.verdicts.set(vkey, ok);
				if (refused) this.noteRecord(`theme:${t.name}`, `${hostName}'s theme "${t.name}" isn't shown here: ${refused.why}`);
			}
			if (ok) themes.push({ name: t.name, css: t.css });
		}
		// A finish travels as its recipe; coercing it keeps every value in the generator's vocabulary. A
		// shipped finish's name is refused, as a saved one could never take it.
		const finishes: LiveFinish[] = (Array.isArray(p.finishes) ? p.finishes : [])
			.slice(0, MAX_FINISHES)
			.filter((f) => f && typeof f.name === 'string' && FINISH_NAME.test(f.name) && !RESERVED_FINISH_NAMES.has(f.name))
			.map((f) => ({ name: f.name, label: typeof f.label === 'string' ? cleanName(f.label).slice(0, 60) || f.name : f.name, recipe: coerceRecipe(f.recipe) }));
		const components = (Array.isArray(p.components) ? p.components : []).filter((c): c is string => typeof c === 'string' && COMPONENT_NAME.test(c)).slice(0, MAX_COMPONENTS);
		if (this.rt !== r || n !== this.recordsSeq) return;
		this.received = { themes, finishes, components };
		if (this.pendingLook) this.takeLook(this.pendingLook);
		const unseen = components.filter((c) => !this.recordNotes.has(`component:${c}`));
		if (unseen.length && Date.now() - this.componentNoteAt > COMPONENT_NOTE_EVERY_MS && this.recordNotes.size < RECORD_NOTES_KEPT) {
			this.componentNoteAt = Date.now();
			for (const c of unseen) this.recordNotes.add(`component:${c}`);
			this.host.notify(`This deck uses ${unseen.length === 1 ? `a custom component from ${hostName}'s Library ("${unseen[0]}")` : `${unseen.length} custom components from ${hostName}'s Library`}. Custom components aren't shared in a live session yet, so those slides may look different here.`);
		}
		this.host.rerender();
	}
	private noteRecord(key: string, message: string) {
		if (this.recordNotes.has(key) || this.recordNotes.size >= RECORD_NOTES_KEPT) return;
		this.recordNotes.add(key);
		this.host.notify(message);
	}

	/** The pointer overlay's way in: the others' pointers as they move, and this browser's own to send.
	 *  It runs outside React's render, so ten moves a second never re-render the Studio. */
	readonly pointerSource: LivePointerSource = {
		subscribe: (cb) => {
			this.pointerSubs.add(cb);
			cb(this.pointerList());
			this.pointerSweep ??= setInterval(() => this.sweepPointers(), 1000);
			return () => {
				this.pointerSubs.delete(cb);
				if (!this.pointerSubs.size && this.pointerSweep) {
					clearInterval(this.pointerSweep);
					this.pointerSweep = null;
				}
			};
		},
		send: (p) => this.sendPointer(p),
	};
	private pointerList(): LivePointer[] {
		return [...this.pointers.values()].map(({ at: _at, ...p }) => p);
	}
	private emitPointers() {
		const list = this.pointerList();
		for (const cb of this.pointerSubs) cb(list);
	}
	private sweepPointers() {
		const now = Date.now();
		let gone = false;
		for (const [id, p] of this.pointers) if (now - p.at > POINTER_IDLE_MS) gone = this.pointers.delete(id) || gone;
		if (gone) this.emitPointers();
	}
	/** Send this browser's pointer: at most one a second every POINTER_EVERY_MS (the last position wins), a
	 *  click at once, and `null` when it leaves the slide. Nothing at all when the person hides it. */
	private sendPointer(p: { slide: number; x: number; y: number; click?: boolean } | null) {
		const s = this.rt?.session.getState();
		// A pointer names its slide, so a person who hides their slide sends none (it would say where they are).
		if (!s || s.stage !== 'live' || !this.share.pointer || !this.share.slide) return;
		if (!p) {
			this.pointerNext = null;
			if (this.pointerLater) clearTimeout(this.pointerLater);
			this.pointerLater = null;
			this.post({ k: 'ptr', off: 1 });
			return;
		}
		this.pointerNext = p;
		const wait = this.pointerSent + POINTER_EVERY_MS - Date.now();
		if (p.click || wait <= 0) this.flushPointer();
		else this.pointerLater ??= setTimeout(() => this.flushPointer(), wait);
	}
	private flushPointer() {
		if (this.pointerLater) clearTimeout(this.pointerLater);
		this.pointerLater = null;
		const p = this.pointerNext;
		this.pointerNext = null;
		if (!p) return;
		this.pointerSent = Date.now();
		const round = (n: number) => Math.round(n * 1000) / 1000;
		this.post({ k: 'ptr', s: p.slide, x: round(p.x), y: round(p.y), ...(p.click ? { c: 1 as const } : {}) });
	}
	/** A member's pointer: theirs only (Tavola names the sender), on a slide, inside it; a flood is dropped. */
	private takePointer(from: string, sender: { name: string; color: LiveColor }, p: Extract<Post, { k: 'ptr' }>) {
		if (p.off) {
			if (this.pointers.delete(from)) this.emitPointers();
			return;
		}
		const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
		if (!Number.isInteger(p.s) || (p.s as number) < 0 || (p.s as number) > POINTER_MAX_SLIDE || !ok(p.x) || !ok(p.y)) return;
		const now = Date.now();
		const was = this.pointers.get(from);
		// Moves are gated against the last post, clicks against the last click, so a click right after a move lands.
		if (was && (p.c ? now - was.clickAt < POINTER_CLICK_GAP_MS : now - was.at < POINTER_MIN_GAP_MS)) return;
		this.pointers.set(from, { id: from, name: sender.name, color: sender.color, slide: p.s as number, x: p.x, y: p.y, clickAt: p.c ? now : (was?.clickAt ?? 0), at: now });
		this.emitPointers();
	}

	/** Member: the host presents to everyone, moves, or stops. Joining is automatic for someone idle; someone
	 *  typing is asked (nobody is moved while typing). A Present the room opened closes when it stops. */
	private takePresent(p: Extract<Post, { k: 'present' }>, from: string, name: string, r: Runtime) {
		if (!p.on) {
			if (!this.roomPresent) return;
			this.roomPresent = null;
			this.resetClips();
			this.roomPresentHost = null;
			this.host.closeRoomPresent?.();
			// A host toggling fast says nothing: a stop right after a start is not news.
			if (Date.now() - this.roomPresentAt >= PRESENT_RESTART_MS) this.host.notify(`${name} stopped presenting.`);
			this.host.rerender();
			return;
		}
		const t = cleanTransport(p);
		if (!t) return;
		const starting = !this.roomPresent || this.roomPresentHost !== from;
		if (starting && Date.now() - this.roomPresentAt < PRESENT_RESTART_MS) return;
		this.roomPresent = { ...t, by: name };
		this.roomPresentHost = from;
		if (starting) {
			this.roomPresentAt = Date.now();
			if (r.session.now() - this.myEditAt < TYPING_MS || typingInAField()) this.host.notifyAction(`${name} is presenting to everyone`, { label: 'Join', onClick: () => this.roomPresent && this.host.openRoomPresent?.() });
			else this.host.openRoomPresent?.();
		}
		this.host.rerender();
	}

	/** A line in the people chat, typed or a note (§5.3). It goes through the host, which numbers it. */
	private sendLine(text: string, note?: LiveNote) {
		const r = this.rt;
		const s = r?.session.getState();
		if (!r || !s?.me || s.me.role === 'view') return;
		const id = `${r.sid}:${++r.chatN}`;
		const line = text.slice(0, CHAT_MAX);
		this.lastTypingPost = 0;
		if (s.isHost) {
			this.hostTake(id, s.selfId, s.me, line, note);
			return;
		}
		// Shown at once as "Sending…"; the host's echo replaces it. If the host is away, it waits.
		this.setPending([...this.pending, { id, text: line, at: r.session.now(), ...(note ? { note } : {}) }]);
		this.host.rerender();
		const host = this.hostId();
		if (host && !s.hostAway) this.post({ k: 'say', id, text: line, have: this.seq, ...(note ? { note } : {}) }, host);
	}

	/** Who owns what `peer` writes: its rejoin token's id, the identity that survives a reload and a takeover. */
	private ownerOf(peer: string, r: Runtime): string | null {
		const s = r.session.getState();
		if (peer === s.selfId) return this.myOwner();
		return r.session.memberToken(peer) ?? null;
	}
	/** This browser's own owner id: a host's from its succession, a member's from its token. */
	private myOwner(): string | null {
		const r = this.rt;
		const s = r?.session.getState();
		if (!r || !s) return null;
		const t = s.isHost ? r.session.succession()?.selfToken : s.token;
		return t ? tokenId(t) : null;
	}

	/** Host: a comment operation from a member or from this browser, held to who may do it (owner's
	 *  answer, 2026-10-20): anyone who can edit adds and resolves; only the writer deletes, or the host. */
	private hostComment(p: Extract<Post, { k: 'cmt' }>, from: string, sender: { name: string; role: string }, r: Runtime) {
		if (sender.role === 'view' || typeof p.id !== 'string' || !COMMENT_ID.test(p.id)) return;
		const owner = this.ownerOf(from, r);
		if (!owner) return;
		const had = this.cmts.get(p.id);
		if (p.op === 'add') {
			const body = typeof p.body === 'string' ? p.body.trim().slice(0, COMMENT_BODY_MAX) : '';
			if (had || !body || !Number.isInteger(p.slide) || p.slide < 1 || p.slide > POINTER_MAX_SLIDE || this.cmts.size >= COMMENTS_MAX) return;
			const now = r.session.now();
			// A comment written before it was shared keeps its own time, if that time is a believable past one.
			const createdAt = typeof p.at === 'number' && Number.isFinite(p.at) && p.at <= now && p.at > now - 10 * 365 * 86_400_000 ? p.at : now;
			// Someone else's comment kept from an earlier session is shown as theirs, shared by this person: the
			// host never takes a sender's word for whose name a comment carries.
			// The writer's name and the sharer's travel as two fields, each a name of its own, so neither can be
			// cut to look like the other (checker, slice 6: one joined label lost its "shared by" at 40 characters).
			const by = typeof p.by === 'string' ? cleanName(p.by) : '';
			const shared = !!by && by !== 'You' && by !== cleanName(sender.name);
			const c: SessionComment = { id: p.id, slide: p.slide, author: shared ? by : cleanName(sender.name), body, createdAt, resolved: false, owner, ...(shared ? { sharedBy: cleanName(sender.name) } : {}) };
			this.putComments([c], []);
			this.post({ k: 'cmtset', c });
		} else if (p.op === 'resolve' && had && typeof p.resolved === 'boolean') {
			if (had.resolved === p.resolved) return;
			const c = { ...had, resolved: p.resolved };
			this.putComments([c], []);
			this.post({ k: 'cmtset', c });
		} else if (p.op === 'del' && had && (had.owner === owner || from === r.session.getState().selfId)) {
			this.putComments([], [p.id]);
			this.post({ k: 'cmtdel', id: p.id });
		}
	}

	/** Take comments into the session's set and onto this browser's copy of the deck. */
	private putComments(set: SessionComment[], del: string[]) {
		for (const c of set) {
			if (!this.cmts.has(c.id) && this.cmts.size >= COMMENTS_MAX) continue;
			this.cmts.set(c.id, c);
		}
		// A deletion names the owner the session knew, so a copy held under another owner stays.
		const gone = del.flatMap((id) => {
			const c = this.cmts.get(id);
			this.cmts.delete(id);
			return c ? [{ id, owner: c.owner }] : [];
		});
		const deck = this.boundDeck;
		const mine = this.myOwner();
		// "You" where this person wrote it, or shared it; never over someone else's name.
		const local = (c: SessionComment) => (c.owner !== mine ? c : c.sharedBy ? { ...c, sharedBy: 'You' } : { ...c, author: 'You' });
		if (deck) this.host.applyComments?.(deck, set.filter((c) => this.cmts.has(c.id)).map(local), gone, mine);
		if (this.rt?.session.getState().isHost) this.saveHostSoon();
		this.host.rerender();
	}

	/** This person's comments on the deck that the session does not have yet (§7.1's "Not shared yet"). */
	private unsharedComments() {
		return this.bound ? this.deps.comments.filter((c) => !this.cmts.has(c.id) && COMMENT_ID.test(c.id)) : [];
	}

	/** A comment operation from this browser: the host applies its own; a member's goes to the host. */
	private commentOp(op: Extract<Post, { k: 'cmt' }>) {
		const r = this.rt;
		const s = r?.session.getState();
		if (!r || !s?.me || s.stage !== 'live' || !this.bound || s.me.role === 'view') return;
		if (s.isHost) this.hostComment(op, s.selfId, s.me, r);
		else {
			const host = this.hostId();
			// While the host is away, it waits and goes when the host is back (`catchUp`).
			if (host && !s.hostAway) this.post(op, host);
			else this.cmtQueue = [...this.cmtQueue, op].slice(-200);
		}
	}

	/** Member: the host started a tour for everyone. Only a shipped tour's id is obeyed: it is code that
	 *  ships with Lattice and plays on a practice deck, so a peer can start it but cannot write it (§7.5).
	 *  Someone idle starts at the host's moment; someone typing is asked, as with Present. */
	private takeTour(p: Extract<Post, { k: 'tour' }>, name: string, r: Runtime) {
		const tour = TOURS.find((t) => t.id === p.id);
		if (!tour || typeof p.at !== 'number' || !Number.isFinite(p.at)) return;
		if (Date.now() - this.tourAt < TOUR_RESTART_MS) return;
		this.tourAt = Date.now();
		if (this.tourLater) clearTimeout(this.tourLater);
		this.tourLater = null;
		// Someone typing, or watching a presentation, is asked: a tour played under Present is a tour nobody sees.
		if (this.roomPresent || r.session.now() - this.myEditAt < TYPING_MS || typingInAField()) {
			this.host.notifyAction(`${name} is showing “${tour.label}”`, { label: 'Watch', onClick: () => this.host.startTour?.(tour.id) });
			return;
		}
		const wait = Math.max(0, Math.min(TOUR_MAX_WAIT_MS, p.at - r.session.now()));
		this.tourLater = setTimeout(() => {
			this.tourLater = null;
			if (this.rt === r) this.host.startTour?.(tour.id);
		}, wait);
	}

	/** Forget every narration clip, and tell anyone still waiting on one that none is coming. The presentation
	 *  they belonged to has ended (§6 rule 5: clips are held in memory for the run only). */
	private resetClips() {
		this.clipServed.clear();
		this.clipAsks.clear();
		this.clipSentAt.clear();
		this.clipHave.clear();
		this.clipHaveBytes = 0;
		const waits = [...this.clipWait.values()];
		this.clipWait.clear();
		for (const w of waits) {
			if (w.timer) clearTimeout(w.timer);
			for (const f of w.subs) f(null);
		}
	}

	/** Member: send the host a request for this clip, and ask again until it comes or the tries run out. */
	private askClipNow(h: string) {
		const w = this.clipWait.get(h);
		const host = this.roomPresentHost;
		if (!w) return;
		if (!this.roomPresent || !host || w.tries >= CLIP_TRIES) {
			this.clipWait.delete(h);
			for (const f of w.subs) f(null);
			return;
		}
		w.tries++;
		this.post({ k: 'cw', h }, host);
		w.timer = setTimeout(() => this.askClipNow(h), CLIP_RETRY_MS);
	}

	/** Member: the host's answer to a request. Only what was asked for, from the presenter, bounded. */
	private takeClip(p: Extract<Post, { k: 'clip' }>) {
		if (typeof p.h !== 'string' || !CLIP_HASH.test(p.h) || typeof p.d !== 'string') return;
		const w = this.clipWait.get(p.h);
		if (!w || typeof p.m !== 'string' || !/^audio\/(mpeg|mp3)$/.test(p.m)) return;
		// The text's length bounds the base64 before it is decoded: nothing larger than the limit is parsed.
		const limit = clipLimit(w.len);
		if (p.d.length > Math.ceil(limit / 3) * 4 + 4) return;
		let bytes: Uint8Array;
		try {
			bytes = fromB64(p.d);
		} catch {
			return;
		}
		if (bytes.length === 0 || bytes.length > limit) return;
		// Its own header decides how long it will play, before any decoder sees it.
		const head = mp3Header(bytes);
		if (!head || (bytes.length * 8) / (head.kbps * 1000) > clipSeconds(w.len)) return;
		const lead = Number.isFinite(p.l) && (p.l as number) >= 0 && (p.l as number) <= 2000 ? (p.l as number) : undefined;
		const clip: LiveClip = { bytes, mime: p.m, ...(lead !== undefined ? { lead } : {}) };
		while (this.clipHave.size && (this.clipHave.size >= CLIP_KEEP || this.clipHaveBytes + bytes.length > CLIP_BYTES_KEEP)) {
			const oldest = this.clipHave.keys().next().value as string;
			this.clipHaveBytes -= this.clipHave.get(oldest)?.bytes.length ?? 0;
			this.clipHave.delete(oldest);
		}
		this.clipHave.set(p.h, clip);
		this.clipHaveBytes += bytes.length;
		this.clipWait.delete(p.h);
		if (w.timer) clearTimeout(w.timer);
		for (const f of w.subs) f(clip);
	}

	/** Host: a member asks for the clip of one sentence. Answered only while presenting to everyone, only from
	 *  what this device already holds (the serve function never synthesizes), and at a bounded rate. */
	private serveClip(from: string, h: unknown) {
		if (typeof h !== 'string' || !CLIP_HASH.test(h) || !this.presentingToAll || !this.clipServer) return;
		const now = Date.now();
		const recent = (this.clipAsks.get(from) ?? []).filter((t) => now - t < CLIP_WINDOW_MS);
		if (recent.length >= CLIP_RATE) return;
		recent.push(now);
		this.clipAsks.set(from, recent);
		let answer = this.clipServed.get(h);
		if (!answer && this.clipBusy) return;
		if (!answer) {
			const serve = this.clipServer;
			this.clipBusy = true;
			answer = serve(h)
				.then((c): Extract<Post, { k: 'clip' }> | null => (c && c.bytes.length > 0 && c.bytes.length <= CLIP_MAX_BYTES ? { k: 'clip', h, m: c.mime, ...(c.lead !== undefined ? { l: c.lead } : {}), d: toB64(c.bytes) } : null))
				.catch(() => null);
			this.clipServed.set(h, answer);
			void answer.finally(() => {
				this.clipBusy = false;
			});
			// A miss is not remembered: the presenter may have the clip a moment later.
			void answer.then((a) => {
				if (!a && this.clipServed.get(h) === answer) this.clipServed.delete(h);
			});
			while (this.clipServed.size > CLIP_SERVED_KEEP) this.clipServed.delete(this.clipServed.keys().next().value as string);
		}
		const to = from;
		void answer.then((a) => {
			if (!this.presentingToAll || !this.rt?.session.getState().members.some((m) => m.id === to)) return;
			if (a) {
				const key = `${to}|${h}`;
				const sent = this.clipSentAt.get(key);
				if (sent !== undefined && Date.now() - sent < CLIP_RESEND_MS) return;
				this.clipSentAt.set(key, Date.now());
				if (this.clipSentAt.size > CLIP_SERVED_KEEP * 8) this.clipSentAt.delete(this.clipSentAt.keys().next().value as string);
			}
			this.post(a ?? { k: 'clip', h }, to);
		});
	}

	/** Host: the start, once; then the same again just past a member's restart window, so one who dropped
	 *  the first (the host stopped and started again quickly) still joins. */
	private sendPresentStart() {
		if (!this.presentStartDue || !this.presentingToAll) return;
		this.presentStartDue = false;
		this.presentSentAt = Date.now();
		this.post({ k: 'present', on: true, ...transportPost(this.transport) });
		this.presentTimers.push(
			setTimeout(() => {
				if (this.presentingToAll) this.post({ k: 'present', on: true, ...transportPost(this.transport) });
			}, PRESENT_RESTART_MS + 200),
		);
	}

	/** Host: a step goes out at once, or at the end of a fast run of steps. */
	private sendPresentSoon() {
		if (this.presentLater) return;
		const wait = this.presentSentAt + PRESENT_EVERY_MS - Date.now();
		const send = () => {
			this.presentLater = null;
			if (!this.presentingToAll) return;
			this.presentSentAt = Date.now();
			this.post({ k: 'present', on: true, ...transportPost(this.transport) });
		};
		if (wait <= 0) send();
		else this.presentLater = setTimeout(send, wait);
	}

	private clearPresentTimers() {
		for (const t of this.presentTimers) clearTimeout(t);
		this.presentTimers = [];
		if (this.presentLater) clearTimeout(this.presentLater);
		this.presentLater = null;
		this.presentStartDue = false;
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
		} else if (p.k === 'ptr') {
			this.takePointer(from, sender, p);
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
				const note = cleanNote(p.note);
				if (note === null) return;
				this.hostTake(p.id, from, sender, p.text, note);
			} else if (p.k === 'cw') {
				this.serveClip(from, p.h);
			} else if (p.k === 'cmt') {
				this.hostComment(p, from, sender, r);
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
							this.post({ k: 'lines', lines: newestWithin(this.chat.filter((l) => l.seq > p.seq), HISTORY_BYTES), startedAt: r.startedAt, ...(this.look ? { look: this.look } : {}) }, from);
						}, wait);
					}
					return;
				}
				this.sinceAt.set(from, Date.now());
				// A member holding a number past ours means our save was older than the session (a
				// reload): never hand those numbers out again. Bounded, so nobody can push it far.
				this.post({ k: 'lines', lines: newestWithin(this.chat.filter((l) => l.seq > p.seq), HISTORY_BYTES), startedAt: r.startedAt, ...(this.look ? { look: this.look } : {}) }, from);
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
				this.takeLook(p.look);
				this.addLines(p.lines.slice(-CHAT_KEEP).map(cleanLine).filter((l): l is ChatLine => !!l));
			} else if (p.k === 'sids' && Array.isArray(p.sids)) {
				// Kept whether or not we know yet that we are the heir: it can arrive before the roster.
				this.takeLook(p.look);
				this.heirSids = p.sids.filter((e): e is [string, string] => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string').slice(0, 2000);
			} else if (p.k === 'present' && typeof p.on === 'boolean') {
				this.takePresent(p, from, sender.name, r);
			} else if (p.k === 'clip' && from === this.roomPresentHost && this.roomPresent) {
				this.takeClip(p);
			} else if (p.k === 'tour') {
				this.takeTour(p, sender.name, r);
			} else if (p.k === 'cmtset') {
				const c = cleanComment(p.c);
				if (c) this.putComments([c], []);
			} else if (p.k === 'cmtdel' && typeof p.id === 'string') {
				this.putComments([], [p.id]);
			} else if (p.k === 'cmts' && Array.isArray(p.list)) {
				this.putComments(p.list.slice(0, COMMENTS_MAX).map(cleanComment).filter((c): c is SessionComment => !!c), []);
			} else if (p.k === 'records') {
				void this.takeRecords(p, r, sender.name);
			} else if (p.k === 'tip' && Number.isSafeInteger(p.seq)) {
				if (typeof p.startedAt === 'number') this.hostStartedAt = p.startedAt;
				this.takeLook(p.look);
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
			return { id: m.id, name: m.name, color: m.color, role: m.role, me, slide: me ? this.deps.activeSlide : (st?.slide ?? null), ...(!me && st?.slideHidden ? { slideHidden: true } : {}), ...(!me && st?.doing ? { doing: st.doing } : {}), ...(!me && this.rt ? this.placeOfPeer(m.id) : {}), editing: !!st?.editingAt && this.now - st.editingAt < TYPING_MS && st.editingAt < this.now + 5000, mic: this.micOf(m.id, me), ...(!me && this.audio?.inCall && this.audio.hasStream(m.id) ? { volume: this.audio.volume(m.id) } : {}), ...(!me && this.audio?.inCall && this.audio.hasStream(m.id) && Object.keys(this.quality[m.id] ?? {}).length ? { quality: this.quality[m.id] } : {}), ...(!me && this.paths[m.id] ? { link: { kind: linkKind(this.paths[m.id]), detail: `${this.paths[m.id].local}→${this.paths[m.id].remote} (${this.paths[m.id].protocol})` } } : {}) };
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
			share: this.share,
			call: { inCall: !!this.audio?.inCall, muted: !!this.audio?.isMuted, denied: this.micDenied, devices: this.micDevices, device: this.audio?.device ?? null, highFidelity: !!this.audio?.highFidelity, micLevel: this.audio?.micLevel ?? 1, canShapeMic: !!this.audio?.canShapeMic, stalled: this.stalledShown, masterVolume: this.audio?.masterVolume ?? 1, outputs: this.outDevices, output: this.audio?.output || null, canPickOutput: LiveAudio.canPickOutput() },
			canChat: s.me?.role !== 'view',
			typing,
			unshared: this.unshared(),
			unsharedComments: s?.me?.role === 'view' ? 0 : this.unsharedComments().length,
			presentingToAll: s.isHost && this.presentingToAll,
			present: s.isHost ? null : this.roomPresent,
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

	/** The connection timeline as text, for a bug report: what this browser is, the wake lock, each event, the paths. */
	private async logText(): Promise<string> {
		const lines = [`Lattice Live connection log · ${new Date().toISOString()}`, `browser: ${navigator.userAgent}`, `role: ${this.rt?.session.getState().isHost ? 'host' : 'guest'}`, `screen wake lock: ${this.wake.state}`, `online: ${navigator.onLine} · visible: ${document.visibilityState}`];
		const paths: Record<string, LinkPath> = (await this.rt?.session.paths().catch(() => ({}))) ?? {};
		for (const [id, p] of Object.entries(paths)) lines.push(`path ${id.slice(0, 6)}: ${p.local}→${p.remote} (${p.protocol})`);
		if (this.viewDrops.size) lines.push(`dropped view values: ${[...this.viewDrops].map(([k, n]) => `${k} ${n}`).join(', ')}`);
		const pairs = await this.pairs();
		if (pairs.length) lines.push('candidate pairs (every connection check each link tried):', ...pairs.map((p) => `  ${p}`));
		for (const e of this.timeline()) lines.push(`${(e.at / 1000).toFixed(1).padStart(7)}s  ${e.peer.padEnd(6)}  ${e.what}`);
		return lines.join('\n');
	}

	/** Copies the log. The clipboard write starts in the tap itself, holding a promise for the text: Safari refuses a
	 *  write that begins after an `await`, because the tap's permission to write is gone by then (checker, 2026-10-13). */
	private copyLog(): Promise<boolean> {
		if (!navigator.clipboard) return Promise.resolve(false);
		const text = this.logText();
		const write =
			typeof ClipboardItem !== 'undefined' && navigator.clipboard.write
				? navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) })])
				: text.then((t) => navigator.clipboard.writeText(t));
		return write.then(
			() => {
				this.host.notify('Connection log copied.');
				return true;
			},
			() => false,
		);
	}

	/** Resolves whether the link reached the clipboard, so a button can show "Copied" only when it did. */
	private copy(link: string, caveat: string | null = null): Promise<boolean> {
		const tail = caveat ?? '';
		const done = (m: string) => this.host.notify(m + tail);
		if (!navigator.clipboard) {
			done('Copy the invite link from the Live panel.');
			return Promise.resolve(false);
		}
		return navigator.clipboard.writeText(link).then(
			() => {
				done('Invite link copied. Anyone you send it to will knock first.');
				return true;
			},
			() => {
				done('Copy the invite link from the Live panel.');
				return false;
			},
		);
	}

	readonly actions: LiveActions = {
		shareRecord: (key: string) => this.shareRecord(key),
		joinPresent: () => {
			if (this.roomPresent) this.host.openRoomPresent?.();
		},
		presentToEveryone: (on: boolean) => {
			const s = this.rt?.session.getState();
			if (!s?.isHost || s.stage !== 'live' || on === this.presentingToAll) return;
			this.presentingToAll = on;
			this.clearPresentTimers();
			if (on) {
				// The start carries where the host's Present is, so it waits for that Present's first report
				// (it may be opening now) rather than send where the last presentation ended.
				this.presentStartDue = true;
				this.presentTimers.push(setTimeout(() => this.sendPresentStart(), PRESENT_START_WAIT_MS));
			} else {
				this.post({ k: 'present', on: false });
				this.resetClips();
			}
			this.host.rerender();
		},
		commentAdded: (c: { id: string; slide: number; body: string; createdAt: number }) => this.commentOp({ k: 'cmt', op: 'add', id: c.id, slide: c.slide, body: c.body, at: c.createdAt }),
		commentResolved: (id: string, resolved: boolean) => this.commentOp({ k: 'cmt', op: 'resolve', id, resolved }),
		commentDeleted: (id: string) => this.commentOp({ k: 'cmt', op: 'del', id }),
		mayDeleteComment: (id: string) => {
			const c = this.cmts.get(id);
			const s = this.rt?.session.getState();
			if (!c || !s || s.stage !== 'live') return true;
			return !!s.isHost || c.owner === this.myOwner();
		},
		shareComments: () => {
			for (const c of this.unsharedComments()) this.commentOp({ k: 'cmt', op: 'add', id: c.id, slide: c.slide, body: c.body, at: c.createdAt, by: c.author });
		},
		tourForEveryone: (tourId: string) => {
			const r = this.rt;
			const s = r?.session.getState();
			if (!r || !s?.isHost || s.stage !== 'live' || !this.bound || s.members.length < 2 || !TOURS.some((t) => t.id === tourId)) return 'solo';
			// While presenting to everyone, the room is watching Present: the tour waits for it to end.
			if (this.presentingToAll) return 'presenting';
			// The host keeps the same window its members do, so it never plays a tour the room dropped.
			if (Date.now() - this.tourAt < TOUR_RESTART_MS) return 'wait';
			this.tourAt = Date.now();
			const at = r.session.now() + TOUR_LEAD_MS;
			this.post({ k: 'tour', id: tourId, at });
			// The host starts at the same moment its members do.
			if (this.tourLater) clearTimeout(this.tourLater);
			this.tourLater = setTimeout(() => {
				this.tourLater = null;
				if (this.rt === r) this.host.startTour?.(tourId);
			}, TOUR_LEAD_MS);
			return 'sent';
		},
		serveClips: (serve) => {
			this.clipServer = serve;
			if (!serve) this.clipServed.clear();
		},
		askClip: (hash: string, textLen: number, signal?: AbortSignal) => {
			if (!CLIP_HASH.test(hash) || !this.roomPresent || !Number.isFinite(textLen) || textLen <= 0) return Promise.resolve(null);
			const have = this.clipHave.get(hash);
			if (have) return Promise.resolve(have);
			if (signal?.aborted) return Promise.resolve(null);
			return new Promise<LiveClip | null>((resolve) => {
				let w = this.clipWait.get(hash);
				if (!w) {
					w = { len: Math.floor(textLen), subs: [], tries: 0, timer: null };
					this.clipWait.set(hash, w);
					w.subs.push(resolve);
					this.askClipNow(hash);
				} else w.subs.push(resolve);
				signal?.addEventListener(
					'abort',
					() => {
						const cur = this.clipWait.get(hash);
						if (!cur) return;
						cur.subs = cur.subs.filter((f) => f !== resolve);
						if (!cur.subs.length) {
							if (cur.timer) clearTimeout(cur.timer);
							this.clipWait.delete(hash);
						}
						resolve(null);
					},
					{ once: true },
				);
			});
		},
		mixIntoCall: (stream: MediaStream | null) => {
			if (this.callMix && this.callMix !== stream) this.audio?.unmix(this.callMix);
			this.callMix = stream;
			if (stream) this.audio?.mixIntoSend(stream);
		},
		presentTransport: (t: LiveTransport) => {
			const clean = cleanTransport(transportPost(t));
			if (!clean) return;
			const same = clean.idx === this.transport.idx && clean.page === this.transport.page && clean.lens === this.transport.lens && clean.hash === this.transport.hash && clean.voice === this.transport.voice;
			this.transport = clean;
			if (!this.presentingToAll || !this.rt?.session.getState().isHost) return;
			if (this.presentStartDue) this.sendPresentStart();
			else if (!same) this.sendPresentSoon();
		},
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
				// A saved theme stays in this browser's Library, so the session's look falls back to the
				// default for everyone, this browser included. Say so once, where the host can act on it.
				if (this.rt) this.offerSiteTheme();
				this.boundDeck = this.deps.deckId;
				const keyKept = await putHostPrivateKey(parts.room, key.privateKey).then(
					() => true,
					() => false,
				);
				const saved = await this.saveHost();
				const live = this.rt as Runtime | null;
				if (live) void this.copy(live.link, keyKept && saved ? null : " This browser can't keep the session across a reload, so keep this tab open.");
				this.host.rerender();
			})();
		},
		copyLink: () => (this.rt ? this.copy(this.rt.link) : Promise.resolve(false)),
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
		rename: (name) => this.rt?.session.rename(name),
		follow: (id) => {
			// A new follow starts from nothing applied, so the first sync moves this screen to where they are.
			followBus.forgetApplied();
			this.following = id;
			this.onAwareness();
			this.host.rerender();
		},
		bringEveryone: () => {
			const r = this.rt;
			if (!r) return;
			const prevN = (r.aw.getLocalState() as AwState | null)?.summon?.n ?? 0;
			const n = prevN + 1;
			r.aw.setLocalStateField('summon', { slide: this.deps.activeSlide, n });
			// With your slide hidden the summon is the one place it still leaves: say it once, then take it back, so a
			// late joiner or a presence renewal never carries it (checker, 2026-10-13).
			if (!this.share.slide) {
				setTimeout(() => {
					const st = { ...(r.aw.getLocalState() as Record<string, unknown> | null) };
					if ((st.summon as { n?: number } | undefined)?.n !== n) return;
					delete st.summon;
					r.aw.setLocalState(st);
				}, SUMMON_SHOWN_MS);
			}
			this.sys(`You brought everyone to slide ${this.deps.activeSlide + 1}`);
			this.host.rerender();
		},
		toggleMic: () => void this.toggleMic(),
		leaveCall: () => this.leaveCall(),
		// Only on a live call: picking a microphone off the call would JOIN it and open the microphone.
		pickMic: (id) => {
			if (this.audio?.inCall) void this.joinCall(id);
		},
		// A new capture, because the browser fixes voice processing when the microphone is opened.
		setHighFidelity: (on) => {
			// Only on a live call: toggling it off the call would JOIN it, which nobody asked for.
			if (this.audio?.inCall) void this.joinCall(this.audio.device ?? undefined, on);
		},
		setVolume: (id, v) => this.audio?.setVolume(id, v),
		setMicLevel: (v) => this.audio?.setMicLevel(v),
		setMasterVolume: (v) => this.audio?.setMasterVolume(v),
		copyLog: () => this.copyLog(),
		setShare: (patch) => {
			if ((patch.pointer === false || patch.slide === false) && this.share.pointer && this.share.slide) this.sendPointer(null);
			this.share = { ...this.share, ...patch };
			try {
				sessionStorage.setItem(SHARE_KEY, JSON.stringify(this.share));
			} catch {}
			this.applyShare();
			this.host.rerender();
		},
		pickOutput: (id) => void this.audio?.setOutput(id).then(() => this.host.rerender()),
		inputLevel: () => this.audio?.inputLevel() ?? 0,
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
		sendChat: (text) => this.sendLine(text),
		noteAiEdit: (slides: number[]) => {
			const note = cleanNote({ k: 'ai-edit', slides });
			if (note) this.sendLine('', note);
		},
		shareAiTurn: (turn: { ask: string; answer: string }) => {
			const note = cleanNote({ k: 'ai-turn', ask: turn.ask, answer: turn.answer });
			if (note) this.sendLine('', note);
		},
		chatTyping: () => {
			const t = Date.now();
			if (!this.share.typing || t - this.lastTypingPost < TYPING_POST_MS || this.rt?.session.getState().me?.role === 'view') return;
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
