import type { Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { createHostKey, createSession, formatLink, fromBase64Url, type HostKey, hostKeyFrom, mintLink, parseFragment, type Session, type SessionState, type TokenEntry, toBase64Url } from '@/lib/tavola';
import { trysteroTransport } from '@/lib/tavola/adapters/trystero';
import { IDLE_VIEW, type LiveActions, type LiveChatLine, type LiveColor, type LivePerson, type LiveView, type LobbyActions, type LobbyView, liveColor, liveColorLight } from './live-model';
import { clearJoinIntent, HOST_KEY, type LiveCollab, type LiveDeps, type LiveHost, readSealedJoin, saveName, storedLiveName, storeSealedJoin, takeFreshJoin } from './live-store';
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
// NOTHING A PEER SAYS ABOUT ITSELF IS TRUSTED for presence or chat (red-team, 2026-10-06). An
// awareness entry belongs to the peer it first ARRIVED from, its name and color are rebuilt from
// the host's roster, a "summon" counts only from the host, and a chat line's author is the peer
// whose document client wrote it — never the `from` field it carries.

/** localStorage: room → { deckId, token }, so a guest's linked copy and rejoin token survive a
 *  reload. The token is a credential, so it is stored SEALED (secret-box.ts). */
const LINKS_KEY = 'lattice-live-links';
const TYPING_MS = 2500;
const CHAT_MAX = 1000;

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

type ChatMsg = { id: string; from: string; text: string; at: number };
type AwState = { peer?: string; user?: { name: string; color: string; colorLight: string }; slide?: number; editingAt?: number; summon?: { slide: number; n: number } };

type Runtime = {
	session: Session;
	doc: Y.Doc;
	ytext: Y.Text;
	ychat: Y.Array<ChatMsg>;
	aw: Awareness;
	room: string;
	secret: string;
	link: string;
	startedAt: number;
	ext: Extension;
	key: HostKey | null;
	/** Awareness client id → the peer it first arrived from (a doc's clientID is its awareness id). */
	owner: Map<number, string>;
	/** The host's document has arrived (a guest may not open the deck before it has). */
	gotDoc: boolean;
	disposers: Array<() => void>;
};

/**
 * The edit that turns `base` into `next`, located in `cur` (which may have moved on since `base`).
 * The changed span is found by the unchanged text on either side of it. When that text is gone and
 * the edit would DELETE something, the edit is refused (null) rather than guessed: guessing either
 * deletes text the writer never saw or inserts the new text beside the old and doubles it.
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
	let at = -1;
	if (needle.length > 0) {
		let best = Number.POSITIVE_INFINITY;
		for (let i = cur.indexOf(needle); i !== -1; i = cur.indexOf(needle, i + 1)) {
			const d = Math.abs(i - (p - before.length));
			if (d < best) {
				best = d;
				at = i;
			}
		}
	}
	if (at !== -1) {
		const from = at + before.length;
		return { from, to: from + removed.length, insert };
	}
	if (removed.length > 0) return null;
	const from = Math.min(p, cur.length);
	return { from, to: from, insert };
}

/**
 * Rewrite an incoming awareness update so it says only what `from` may say: entries for clients
 * another peer owns are dropped, and each state's `peer`, `user` (name and color, from the roster)
 * and `summon` (host only) are rebuilt rather than believed. Returns null when nothing survives.
 */
export function sanitizeAwareness(update: Uint8Array, from: string, owner: Map<number, string>, member: { name: string; color: LiveColor; role: string } | undefined): Uint8Array | null {
	if (!member) return null;
	const dec = decoding.createDecoder(update);
	const n = decoding.readVarUint(dec);
	const out: Array<[number, number, string]> = [];
	for (let i = 0; i < n; i++) {
		const client = decoding.readVarUint(dec);
		const clock = decoding.readVarUint(dec);
		const raw = decoding.readVarString(dec);
		const own = owner.get(client);
		if (own !== undefined && own !== from) continue;
		owner.set(client, from);
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
			// y-codemirror reads the caret from `cursor` (relative positions); keep it as given.
			if (st.cursor !== undefined) (clean as Record<string, unknown>).cursor = st.cursor;
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
	private failed = false;
	private systemLines: LiveChatLine[] = [];
	private fromY = new Set<string>();
	private prevSource: string;
	private boundDeck: string | null = null;
	private ticker: ReturnType<typeof setInterval> | null = null;
	private lastSummon = 0;
	private followJump = false;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private seenAt = new Map<string, number>();
	now = Date.now();

	constructor(
		private host: LiveHost,
		deps: LiveDeps,
	) {
		this.deps = deps;
		this.prevSource = deps.source;
	}

	// ── lifecycle ──────────────────────────────────────────────────────────
	/** Resume what this tab was doing before a reload: hosting, or a join (link or carried intent). */
	async resume(): Promise<void> {
		const hosting = readHostSave();
		if (hosting && hosting.deckId === this.deps.deckId) {
			try {
				const opened = JSON.parse((await unseal(hosting.sealed)) ?? 'null') as { secret: string; tokens: TokenEntry[] } | null;
				const priv = await getHostPrivateKey(hosting.room);
				if (!opened || !priv) throw new Error('nothing to resume');
				const key = await hostKeyFrom(priv, fromBase64Url(hosting.pub));
				this.wire({ room: hosting.room, secret: opened.secret, key, host: { name: hosting.name, tokens: opened.tokens, doc: hosting.doc }, startedAt: hosting.startedAt });
				this.bound = true;
				this.boundDeck = hosting.deckId;
				this.host.notify('Your live session is back. People who were in rejoin without knocking.');
			} catch {
				clearHostSave();
			}
			this.host.rerender();
			return;
		}
		if (hosting) clearHostSave();
		const fresh = takeFreshJoin();
		const raw = fresh ?? (await unseal(readSealedJoin()));
		if (fresh) storeSealedJoin(await seal(fresh));
		if (!raw) {
			clearJoinIntent();
			return;
		}
		const parts = parseFragment(`live=${raw}`);
		this.lobbyOpen = true;
		if (!parts) {
			this.failed = true;
			clearJoinIntent();
			this.host.rerender();
			return;
		}
		this.wire({ room: parts.room, secret: parts.secret, hostFingerprint: parts.host, token: (await unseal(readLinks()[parts.room]?.token)) ?? undefined });
		this.host.rerender();
	}

	private wire(args: { room: string; secret: string; key?: HostKey; hostFingerprint?: string; host?: { name: string; tokens?: TokenEntry[]; doc?: string }; token?: string; startedAt?: number }) {
		const d = this.deps;
		const doc = new Y.Doc();
		const ytext = doc.getText('source');
		const ychat = doc.getArray<ChatMsg>('chat');
		if (args.host?.doc) Y.applyUpdate(doc, fromB64(args.host.doc));
		else if (args.host) ytext.insert(0, d.source);
		const aw = new Awareness(doc);
		const REMOTE = Symbol('tavola-remote');
		const owner = new Map<number, string>();
		owner.set(doc.clientID, 'self');
		let rt: Runtime | null = null;
		const memberOf = (peer: string) => rt?.session.getState().members.find((m) => m.id === peer);
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
			encodeAll: () => encodeAwarenessUpdate(aw, [doc.clientID]),
			applyRemote: (u: Uint8Array, from: string) => {
				const clean = sanitizeAwareness(u, from, owner, memberOf(from));
				if (clean) applyAwarenessUpdate(aw, clean, from);
			},
			onLocal(cb: (u: Uint8Array) => void) {
				const h = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
					if (origin !== 'local') return;
					const mine = [...added, ...updated, ...removed].filter((c) => c === doc.clientID);
					if (mine.length) cb(encodeAwarenessUpdate(aw, mine));
				};
				aw.on('update', h);
				return () => aw.off('update', h);
			},
			forget(peer: string) {
				const ids = [...owner].filter(([, p]) => p === peer).map(([c]) => c);
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
		});
		// The binding brings its own undo manager, scoped to THIS browser's changes, in place of
		// CodeMirror's history (which would put everyone's edits on your undo stack).
		const ext = [yCollab(ytext, aw, { undoManager: new Y.UndoManager(ytext) }), keymap.of(yUndoManagerKeymap)];
		const fingerprint = key?.fingerprint ?? (args.hostFingerprint as string);
		rt = { session, doc, ytext, ychat, aw, room: args.room, secret: args.secret, link: formatLink(location.href, { room: args.room, secret: args.secret, host: fingerprint }), startedAt: args.startedAt ?? Date.now(), ext, key, owner, gotDoc: !!args.host, disposers: [] };
		this.rt = rt;
		const r = rt;

		let prev: SessionState = session.getState();
		r.disposers.push(
			session.subscribe(() => {
				const s = session.getState();
				const before = new Map(prev.members.map((m) => [m.id, m]));
				if (prev.stage === 'live' && s.stage === 'live') {
					for (const m of s.members) if (!before.has(m.id) && m.id !== s.selfId) this.sys(`${m.name} joined${m.role === 'view' ? ' · can view' : ''}`);
					for (const [id, m] of before) if (!s.members.some((x) => x.id === id) && id !== s.selfId) this.sys(`${m.name} left`);
					for (const m of s.members) {
						const was = before.get(m.id);
						if (was && was.role !== m.role) this.sys(`${m.name} ${m.role === 'view' ? 'can now only view' : 'can now edit'}`);
					}
				}
				if (s.token && s.token !== prev.token) {
					const tok = s.token;
					void seal(tok).then((sealed) => writeLink(r.room, { token: sealed }));
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
		const onChat = () => this.host.rerender();
		ychat.observe(onChat);
		r.disposers.push(() => ychat.unobserve(onChat));
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
		// `end()` owns its own shutdown (it leaves the transport a beat later so the `end` messages get
		// out). Running `leave()` here too would close the connections first — red-team finding 2.
		if (how === 'end') r.session.end();
		else r.session.leave();
		for (const d of r.disposers) d();
		r.aw.destroy();
		this.rt = null;
		this.systemLines = [];
		this.fromY.clear();
		this.seenAt.clear();
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
	dispose(): void {
		const r = this.rt;
		if (!r) return;
		void this.saveHost();
		r.session.leave();
		for (const d of r.disposers) d();
		if (this.ticker) clearInterval(this.ticker);
	}

	private sys(text: string) {
		this.systemLines = [...this.systemLines, { kind: 'system', id: `s${Math.random().toString(36).slice(2)}`, text, at: Date.now() }];
	}

	private saveHostSoon() {
		if (this.saveTimer) return;
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			void this.saveHost();
		}, 1000);
	}
	private async saveHost() {
		const r = this.rt;
		const s = r?.session.getState();
		if (!r?.key || !s?.isHost || s.stage !== 'live') return;
		const sealed = await seal(JSON.stringify({ secret: r.secret, tokens: r.session.exportTokens() }));
		const save: HostSave = { room: r.room, sealed, pub: toBase64Url(r.key.publicRaw), name: s.me?.name ?? 'Host', deckId: this.boundDeck ?? this.deps.deckId, doc: toB64(Y.encodeStateAsUpdate(r.doc)), startedAt: r.startedAt };
		if (this.rt !== r) return;
		try {
			sessionStorage.setItem(HOST_KEY, JSON.stringify(save));
		} catch {}
	}

	// ── stage transitions that need the Studio (guests) ─────────────────────
	private onStage(from: SessionState['stage'], s: SessionState) {
		if (s.stage === 'live' && !s.isHost) {
			this.maybeOpenShared();
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
			if (client === r.doc.clientID) continue;
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
	/** True when leaving the current deck is fine, after asking if it would end or leave a session. */
	mayLeaveDeck(): boolean {
		const s = this.rt?.session.getState();
		if (!this.bound || !s || s.stage !== 'live') return true;
		const others = s.members.length - 1;
		return window.confirm(s.isHost ? (others > 0 ? `End the live session for ${others === 1 ? 'the other person' : `the ${others} other people`}?` : 'End the live session?') : 'Leave the live session?');
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

	/** The chat, authored by whoever's document client WROTE each line, not by what it claims. */
	private chatLines(s: SessionState): LiveChatLine[] {
		const r = this.rt;
		if (!r) return [];
		const byPeer = new Map(s.members.map((m) => [m.id, m]));
		const lines: LiveChatLine[] = [];
		// biome-ignore lint/suspicious/noExplicitAny: Yjs exposes item ids only on its internal linked list.
		for (let item: any = (r.ychat as any)._start; item; item = item.right) {
			if (item.deleted) continue;
			const client: number = item.id.client;
			const peer = client === r.doc.clientID ? s.selfId : r.owner.get(client);
			const author = peer ? byPeer.get(peer) : undefined;
			const contents: unknown[] = item.content.getContent();
			contents.forEach((m, i) => {
				const msg = m as Partial<ChatMsg>;
				if (typeof msg?.text !== 'string') return;
				const key = `${client}:${item.id.clock + i}`;
				if (!this.seenAt.has(key)) this.seenAt.set(key, Date.now());
				lines.push({ kind: 'message', id: key, from: author?.name ?? `${String(msg.from ?? 'Someone').slice(0, 40)} (left)`, color: author?.color ?? 1, text: msg.text.slice(0, CHAT_MAX), at: this.seenAt.get(key) as number });
			});
		}
		return lines;
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
			chat: [...this.chatLines(s), ...this.systemLines].sort((a, b) => a.at - b.at),
			following: this.following,
			hostAway: s.hostAway,
			audio: false,
			canChat: s.me?.role !== 'view',
		};
	}

	lobby(): LobbyView | null {
		if (!this.lobbyOpen && !this.failed) return null;
		const s = this.rt?.session.getState();
		const map: Record<SessionState['stage'], LobbyView['stage'] | null> = { connecting: 'connecting', lobby: 'ready', waiting: 'waiting', live: 'connecting', 'host-absent': 'host-absent', denied: 'denied', full: 'full', removed: 'denied', ended: null };
		const stage = this.failed ? 'failed' : s ? map[s.stage] : 'connecting';
		if (!stage) return null;
		return { stage, title: s?.invite?.title ?? null, hostName: s?.invite?.hostName ?? null, slides: s?.invite?.slides ?? null, theme: s?.invite?.theme ?? null, name: this.lobbyName };
	}

	private copy(link: string) {
		void navigator.clipboard?.writeText(link).then(
			() => this.host.notify('Invite link copied. Anyone you send it to will knock first.'),
			() => this.host.notify('Copy the invite link from the Live panel.'),
		);
	}

	readonly actions: LiveActions = {
		start: (name: string) => {
			const n = name.trim() || 'Host';
			saveName(n);
			void (async () => {
				try {
					// The private key never leaves WebCrypto: non-extractable, stored as a CryptoKey object.
					const key = await createHostKey({ extractable: false });
					const parts = mintLink(key.fingerprint);
					await putHostPrivateKey(parts.room, key.privateKey).catch(() => {});
					this.wire({ room: parts.room, secret: parts.secret, key, host: { name: n } });
					this.bound = true;
					this.boundDeck = this.deps.deckId;
					await this.saveHost();
					if (this.rt) this.copy(this.rt.link);
					this.host.rerender();
				} catch {
					this.host.notify("Couldn't start a live session in this browser.");
				}
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
			r.ychat.push([{ id: `${s.selfId}-${Date.now().toString(36)}`, from: s.me.name, text: text.slice(0, CHAT_MAX), at: Date.now() }]);
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
			this.failed = false;
			this.lobbyOpen = false;
			this.host.rerender();
		},
		retry: () => {
			this.failed = false;
			this.rt?.session.retry();
			this.host.rerender();
		},
	};
}
