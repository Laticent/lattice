import type { Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { cleanName, createHostKey, createSession, formatLink, fromBase64Url, type HostKey, hostKeyFrom, mintLink, parseFragment, type Session, type SessionState, type TokenEntry, toBase64Url } from '@/lib/tavola';
import { trysteroTransport } from '@/lib/tavola/adapters/trystero';
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

type Linked = { deckId?: string; token?: string };
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
type HostSealed = { secret: string; tokens: TokenEntry[]; chat?: ChatLine[] };
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

/** A chat line as every browser keeps it. `name` and `color` are the roster's when it arrived. */
type ChatLine = { id: string; peer: string; name: string; color: LiveColor; text: string; at: number };
/** Posts on Tavola's app channel: a line, a request for the history, and the host's answer. */
type Post = { k: 'chat'; n: number; text: string } | { k: 'history?' } | { k: 'history'; lines: ChatLine[] };
const enc = new TextEncoder();
const dec = new TextDecoder();
const isColor = (c: unknown): c is LiveColor => c === 1 || c === 2 || c === 3 || c === 4;
/** A history line from the host, kept only in the shape a line has. */
const cleanLine = (x: unknown): ChatLine | null => {
	const l = x as Partial<ChatLine> | null;
	if (!l || typeof l !== 'object' || typeof l.id !== 'string' || typeof l.peer !== 'string' || typeof l.name !== 'string' || typeof l.text !== 'string' || !isColor(l.color) || typeof l.at !== 'number') return null;
	return { id: l.id.slice(0, 120), peer: l.peer.slice(0, 120), name: cleanName(l.name), color: l.color, text: l.text.slice(0, CHAT_MAX), at: l.at };
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
	/** This browser's chat counter (a line's id is `<sender peer>:<n>`). */
	chatN: number;
	/** The host's document has arrived (a guest may not open the deck before it has). */
	gotDoc: boolean;
	disposers: Array<() => void>;
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
				this.wire({ room: hosting.room, secret: opened.secret, key, host: { name: hosting.name, tokens: opened.tokens, doc: hosting.doc }, startedAt: hosting.startedAt, release });
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
		if (this.rt) return;
		this.wire({ room: parts.room, secret: parts.secret, hostFingerprint: parts.host, token });
		this.host.rerender();
	}

	private wire(args: { room: string; secret: string; key?: HostKey; hostFingerprint?: string; host?: { name: string; tokens?: TokenEntry[]; doc?: string }; token?: string; startedAt?: number; release?: () => void }) {
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
		const session = createSession({
			transport: trysteroTransport(args.room, args.secret),
			doc: docStream,
			awareness: awStream,
			...(args.host && key ? { host: { name: args.host.name, key, tokens: args.host.tokens, invite: { title: d.deckTitle, hostName: args.host.name, slides: d.slideCount, theme: d.theme } } } : { hostFingerprint: args.hostFingerprint }),
			...(args.token ? { token: args.token } : {}),
			client: aw.clientID,
			onPost: (data, from) => this.onPost(data, from),
		});
		// The binding brings its own undo manager, scoped to THIS browser's changes, in place of
		// CodeMirror's history (which would put everyone's edits on your undo stack).
		const ext = [yCollab(ytext, aw, { undoManager: new Y.UndoManager(ytext) }), keymap.of(yUndoManagerKeymap)];
		const fingerprint = key?.fingerprint ?? (args.hostFingerprint as string);
		// The link is this page's address WITHOUT its query: a query can carry anything the host's
		// address bar happened to hold (inversion round 2, item 6).
		rt = { session, doc, ytext, aw, room: args.room, secret: args.secret, link: formatLink(location.origin + location.pathname, { room: args.room, secret: args.secret, host: fingerprint }), startedAt: args.startedAt ?? Date.now(), ext, key, owner, chatN: 0, gotDoc: !!args.host, disposers: [] };
		if (args.release) rt.disposers.push(args.release);
		this.rt = rt;
		const r = rt;

		let prev: SessionState = session.getState();
		r.disposers.push(
			session.subscribe(() => {
				const s = session.getState();
				const before = new Map(prev.members.map((m) => [m.id, m]));
				if (prev.stage === 'live' && s.stage === 'live') {
					for (const m of s.members) if (!before.has(m.id) && m.id !== s.selfId) this.sys(`${m.name} joined${m.role === 'view' ? ' · can view' : ''}`);
					// Someone left or was removed: the host saves now, not a second later, so a reload
					// right after a removal cannot bring back the token it revoked (red-team round 2).
					if (s.isHost && [...before.keys()].some((id) => !s.members.some((x) => x.id === id))) void this.saveHost();
					for (const [id, m] of before) if (!s.members.some((x) => x.id === id) && id !== s.selfId) this.sys(`${m.name} left`);
					for (const m of s.members) {
						const was = before.get(m.id);
						if (was && was.role !== m.role) this.sys(`${m.name} ${m.role === 'view' ? 'can now only view' : 'can now edit'}`);
					}
				}
				if (s.token && s.token !== prev.token) {
					const tok = s.token;
					void seal(tok).then(
						(sealed) => writeLink(r.room, { token: sealed }),
						() => {},
					);
				}
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
			const t = Date.now();
			if (t - lastEdit < 1000) return;
			lastEdit = t;
			aw.setLocalStateField('editingAt', t);
		};
		ytext.observe(onLocalEdit);
		r.disposers.push(() => ytext.unobserve(onLocalEdit));
		// Hosting survives a reload: keep the session's state in this tab's sessionStorage.
		const onDocUpdate = () => this.saveHostSoon();
		doc.on('update', onDocUpdate);
		r.disposers.push(() => doc.off('update', onDocUpdate));
		this.ticker = setInterval(() => {
			this.now = Date.now();
			if (this.rt?.session.getState().stage === 'live') this.host.rerender();
		}, 1000);
		this.host.rerender();
	}

	private teardown(how: 'leave' | 'end') {
		const r = this.rt;
		if (!r) return;
		this.tearing = true;
		try {
			this.teardownNow(r, how);
		} finally {
			this.tearing = false;
		}
	}

	private teardownNow(r: Runtime, how: 'leave' | 'end') {
		// `end()` owns its own shutdown (it leaves the transport a beat later so the `end` messages get
		// out). Running `leave()` here too would close the connections first — red-team finding 2.
		if (how === 'end') r.session.end();
		else r.session.leave();
		for (const d of r.disposers) d();
		r.aw.destroy();
		this.rt = null;
		this.systemLines = [];
		this.fromY.clear();
		this.chat = [];
		this.lastSealed = null;
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
		this.systemLines = [...this.systemLines, { kind: 'system', id: `s${Math.random().toString(36).slice(2)}`, text, at: Date.now() }];
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
			sealed = await seal(JSON.stringify({ secret: r.secret, tokens: r.session.exportTokens(), chat: this.chat } satisfies HostSealed));
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

	// ── stage transitions that need the Studio (guests) ─────────────────────
	private onStage(from: SessionState['stage'], s: SessionState) {
		// Our own teardown moves the session to `ended`; that is not the host ending it on us.
		if (this.tearing) return;
		if (s.stage === 'live' && !s.isHost) {
			// Chat history lives with the host: ask for it on every admission (a reload included).
			this.post({ k: 'history?' }, s.members.find((m) => m.role === 'host')?.id);
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
				if (Date.now() - myEdit < TYPING_MS) this.host.notifyAction(`The host is on slide ${slide + 1}`, { label: 'Go', onClick: () => this.host.goToSlide(slide) });
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

	/** The chat: every line's author is the member its post ARRIVED from (Tavola's gate), as the
	 *  roster named them then. */
	private chatLines(): LiveChatLine[] {
		return this.chat.map((l) => ({ kind: 'message', id: l.id, from: l.name, color: l.color, text: l.text, at: l.at }));
	}

	private addLines(lines: ChatLine[]) {
		const have = new Set(this.chat.map((l) => l.id));
		const fresh = lines.filter((l) => !have.has(l.id));
		if (!fresh.length) return;
		this.chat = [...this.chat, ...fresh].sort((a, b) => a.at - b.at).slice(-CHAT_KEEP);
		this.saveHostSoon();
		this.host.rerender();
	}

	private post(p: Post, to?: string) {
		this.rt?.session.post(enc.encode(JSON.stringify(p)), to);
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
		if (p.k === 'chat' && typeof p.text === 'string' && Number.isSafeInteger(p.n) && sender.role !== 'view') {
			this.addLines([{ id: `${from}:${p.n}`, peer: from, name: sender.name, color: sender.color, text: p.text.slice(0, CHAT_MAX), at: Date.now() }]);
		} else if (p.k === 'history?' && s.isHost) {
			this.post({ k: 'history', lines: this.chat }, from);
		} else if (p.k === 'history' && sender.role === 'host' && Array.isArray(p.lines)) {
			this.addLines(p.lines.slice(-CHAT_KEEP).map(cleanLine).filter((l): l is ChatLine => !!l));
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
			return { id: m.id, name: m.name, color: m.color, role: m.role, me, slide: me ? this.deps.activeSlide : (st?.slide ?? null), editing: !!st?.editingAt && this.now - st.editingAt < TYPING_MS, mic: 'off' };
		});
		return {
			status: 'live',
			isHost: s.isHost,
			startedAt: r.startedAt,
			link: r.link,
			linkRole: s.linkRole,
			autoAdmit: s.autoAdmit,
			people,
			waiting: s.waiting,
			cap: s.cap,
			chat: [...this.chatLines(), ...this.systemLines].sort((a, b) => a.at - b.at),
			following: this.following,
			hostAway: s.hostAway,
			audio: false,
			canChat: s.me?.role !== 'view',
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
		remove: (id) => this.rt?.session.remove(id),
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
		toggleMic: () => {},
		end: () => {
			this.teardown('end');
			this.host.notify('Live session ended. The deck stays as it is.');
		},
		leave: () => {
			this.teardown('leave');
			this.host.notify('You left the live session. Your copy of the deck stays.');
		},
		sendChat: (text) => {
			const r = this.rt;
			const s = r?.session.getState();
			if (!r || !s?.me || s.me.role === 'view') return;
			const n = ++r.chatN;
			const line = text.slice(0, CHAT_MAX);
			this.post({ k: 'chat', n, text: line });
			this.addLines([{ id: `${s.selfId}:${n}`, peer: s.selfId, name: s.me.name, color: s.me.color, text: line, at: Date.now() }]);
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
