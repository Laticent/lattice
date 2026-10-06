// A Tavola session: the handshake (signed hello → knock → admit / deny), the roster, and the gate
// that decides who may send and receive the document and awareness streams.
// See engineering/decisions/2026-10-06-studio-live-collaboration.md §4.
//
// THE GATE, in one sentence: a stream message is sent only to admitted members and applied only
// from admitted members, and a document update is applied only from a member who may edit. Every
// honest browser enforces it, so a peer that holds the link but was never admitted gets a
// connection and nothing over it, and a view-only member's edits land nowhere.
//
// THE HOST is whoever signs a hello with the key whose fingerprint is in the link (hostkey.ts).
// Nothing else makes a peer the host: not answering first, not answering while the real host is
// away. A host that reloads keeps its key, so its new peer id is accepted and members re-admit by
// token without a knock.
//
// SYNC, and why there is a `sync` request: when two members learn of each other they each send
// their full state. Roster updates reach them at different moments, so the first one's state can
// arrive before the second knows the first is a member — and is dropped. Sending a `sync` request
// alongside the state closes that window: whoever learns LATER asks, and the other answers. A link
// that forms late or comes back (onPeerJoin) exchanges state again for the same reason.
//
// THE SESSION CLOCK is the host's. Device clocks drift apart by seconds, sometimes minutes, so a
// session never compares two of them: every member estimates its offset to the host's clock by
// Cristian's algorithm — send `ping`, the host answers its time, offset = host time + half the
// round trip − our time — keeping the sample with the SHORTEST round trip (the tightest bound),
// and `now()` returns host time on every browser. Time zones never enter: the value is epoch ms;
// each viewer formats it in its own zone.
//
// A PEER ID IS NOT AN IDENTITY. Transport ids are self-declared in signaling, so once a peer's link
// drops, anyone holding the link can reconnect under its old id (red-team round 2, finding 1). So a
// guest stops trusting the host's id the moment that link drops, and trusts it again only after a
// fresh signed hello on the new link; and a member whose link drops is dropped from every roster
// at once, so a squatter under its id is a stranger until the host admits it again.

import { type HostKey, signHello, verifyHello } from './hostkey';
import { randomBytes, toBase64Url } from './link';
import { type Control, cleanName, decodeControl, encodeControl, frame, PROTOCOL_VERSION, TAG_AWARENESS, TAG_CONTROL, TAG_DOC, TAG_POST } from './protocol';
import type { Clock, Color, Invite, Knock, Member, PeerId, Role, SessionState, Stream, Transport } from './types';

/** A rejoin token and the member it re-admits — what a host carries across its own reload. */
export type TokenEntry = [token: string, member: { name: string; role: Exclude<Role, 'host'>; color: Color }];

export type HostOptions = {
	name: string;
	invite: Invite;
	/** The host's signing key; its fingerprint is the link's third part. */
	key: HostKey;
	autoAdmit?: boolean;
	linkRole?: 'edit' | 'view';
	/** Tokens from `exportTokens()` before a reload: the members they name walk back in without a knock. */
	tokens?: TokenEntry[];
};

export type SessionOptions = {
	transport: Transport;
	/** Present → this browser hosts. Absent → it joins as a guest, and `hostFingerprint` is required. */
	host?: HostOptions;
	/** Guest: the link's host fingerprint. Only a hello signed by that key is believed. */
	hostFingerprint?: string;
	doc: Stream;
	awareness?: Stream;
	/** Guest: a token from an earlier admission, so a rejoin skips the knock. */
	token?: string;
	/** The awareness client id this browser speaks for. The host binds each member's client id in
	 *  the roster, so an app can drop presence a member sends for anyone else's id. */
	client?: number;
	/** App posts (chat, say): bytes from an admitted member, with its peer id. Never from a stranger. */
	onPost?: (data: Uint8Array, from: PeerId) => void;
	/** Guest: knock automatically under this name as soon as the host says hello. */
	autoKnockName?: string;
	/** Most people in a session, host included. The owner's number: 4 (and never more than 4). */
	cap?: number;
	/** Guest: how long to wait for the host's hello before `host-absent`. */
	lobbyTimeoutMs?: number;
	clock?: Clock;
	newToken?: () => string;
};

export type Session = {
	getState(): SessionState;
	subscribe(cb: () => void): () => void;
	/** Guest: ask to join under `name`. */
	knock(name: string): void;
	/** Guest: after `host-absent`, wait for the host again. */
	retry(): void;
	admit(id: PeerId): void;
	deny(id: PeerId): void;
	remove(id: PeerId): void;
	setRole(id: PeerId, role: 'edit' | 'view'): void;
	setAutoAdmit(on: boolean): void;
	setLinkRole(role: 'edit' | 'view'): void;
	setInvite(invite: Invite): void;
	/** Send app bytes to every member, or to one. Nothing is sent before this browser is live. */
	post(data: Uint8Array, to?: PeerId): void;
	/** Host: the rejoin tokens, to hand to `HostOptions.tokens` after a reload. */
	exportTokens(): TokenEntry[];
	/** Host: end the session for everyone. */
	end(): void;
	/** Leave this session (a guest leaving, or a host closing without ending). */
	leave(): void;
	/** The session clock: the host's time in epoch ms, on every member (see the header). Before
	 *  the first sample, this browser's own clock. */
	now(): number;
	/** Resolves once this session's asynchronous work (signing, verifying, ordered control
	 *  handling) has finished. For tests and tools that need a quiet point; the app never waits. */
	idle(): Promise<void>;
};

export const DEFAULT_CAP = 4;
const DEFAULT_LOBBY_TIMEOUT = 12_000;
/** A member re-measures the session clock this often (and three times, quickly, on joining). */
export const CLOCK_RESYNC_MS = 30_000;
/** Bytes. A deck plus its history is far below this; anything larger is dropped unread. */
export const MAX_MESSAGE = 4 * 1024 * 1024;
/** Knocks the host holds at once. Past this, a knock is ignored until one is answered. */
export const MAX_WAITING = 8;

const realClock: Clock = {
	now: () => Date.now(),
	setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
	clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function createSession(opts: SessionOptions): Session {
	const t = opts.transport;
	const clock = opts.clock ?? realClock;
	const newToken = opts.newToken ?? (() => toBase64Url(randomBytes(18)));
	// Four session colors, so never more than four people, whatever a caller asks for.
	const cap = Math.min(opts.cap ?? DEFAULT_CAP, 4);
	const isHost = !!opts.host;
	if (!isHost && !opts.hostFingerprint) throw new Error("tavola: a guest needs the link's host fingerprint");
	const listeners = new Set<() => void>();
	const hostName = cleanName(opts.host?.name ?? '');
	const client = opts.client;
	const self = (role: Role): Member => ({ id: t.selfId, name: hostName, role, color: 1, ...(client !== undefined ? { client } : {}) });

	let state: SessionState = {
		isHost,
		stage: isHost ? 'live' : 'connecting',
		selfId: t.selfId,
		me: isHost ? self('host') : null,
		members: isHost ? [self('host')] : [],
		waiting: [],
		invite: isHost ? (opts.host?.invite ?? null) : null,
		hostAway: false,
		autoAdmit: opts.host?.autoAdmit ?? false,
		linkRole: opts.host?.linkRole ?? 'edit',
		cap,
		token: opts.token ?? null,
	};
	const set = (patch: Partial<SessionState>) => {
		state = { ...state, ...patch };
		for (const cb of listeners) cb();
	};

	// ── shared bookkeeping ──────────────────────────────────────────────────
	const connected = new Set<PeerId>();
	/** Host: token → the member it re-admits (name, role, color survive a reconnect). */
	const tokens = new Map<string, { name: string; role: Exclude<Role, 'host'>; color: Color }>();
	for (const [tok, m] of opts.host?.tokens ?? []) tokens.set(tok, m);
	/** Host: member id → its token. */
	const tokenOf = new Map<PeerId, string>();
	/** Host: peers denied or removed this session. Their knocks are ignored. */
	const blocked = new Set<PeerId>();
	/** Host: the client id each waiting knocker claimed, bound when it is admitted. */
	const claims = new Map<PeerId, number | undefined>();
	/** Guest: the peer whose signed hello made it the host. */
	let hostId: PeerId | null = null;
	/** Guest: the hello from `hostId` was verified on its CURRENT link. False from the moment that
	 *  link drops, so a squatter under the host's old id is obeyed in nothing. */
	let hostTrusted = false;
	let pendingName: string | null = opts.autoKnockName ?? null;
	let lobbyTimer: unknown = null;
	let closed = false;
	/** Host: `end()` was called; the transport leaves a beat later, and nobody new gets in meanwhile. */
	let ending = false;
	/** Guest: control messages are handled strictly in order, because a hello is verified asynchronously. */
	let controlChain: Promise<void> = Promise.resolve();
	/** Every link's generation: bumped on each join and leave of a peer, so an answer that took a
	 *  while (a hello being verified) can tell whether it still belongs to the link it came on. */
	const epoch = new Map<PeerId, number>();
	const bump = (id: PeerId) => epoch.set(id, (epoch.get(id) ?? 0) + 1);
	/** Member: offset from our clock to the host's, from the tightest ping so far. */
	let clockOffset = 0;
	let bestRtt = Number.POSITIVE_INFINITY;
	let pingN = 0;
	const pingsOut = new Map<number, number>();
	let pingTimer: unknown = null;
	const ping = () => {
		if (isHost || closed || !hostId || !hostTrusted || !isLive()) return;
		const n = ++pingN;
		pingsOut.set(n, clock.now());
		if (pingsOut.size > 8) pingsOut.delete(pingsOut.keys().next().value as number);
		sendControl(hostId, { t: 'ping', n });
	};
	/** Three quick samples now, then one every CLOCK_RESYNC_MS. A new host link starts afresh:
	 *  the old best sample was taken over a route that is gone. */
	const startClock = () => {
		bestRtt = Number.POSITIVE_INFINITY;
		if (pingTimer !== null) clock.clearTimeout(pingTimer);
		let quick = 3;
		const tick = () => {
			ping();
			pingTimer = clock.setTimeout(tick, --quick > 0 ? 300 : CLOCK_RESYNC_MS);
		};
		tick();
	};
	const onPong = (msg: Extract<Control, { t: 'pong' }>) => {
		const sent = pingsOut.get(msg.n);
		if (sent === undefined) return;
		pingsOut.delete(msg.n);
		const got = clock.now();
		const rtt = got - sent;
		if (rtt < 0 || rtt > bestRtt) return;
		bestRtt = rtt;
		clockOffset = msg.at + rtt / 2 - got;
	};
	/** Host: hellos being signed. */
	const signing = new Set<Promise<unknown>>();

	const memberOf = (id: PeerId) => state.members.find((m) => m.id === id);
	const isLive = () => state.stage === 'live';
	const send = (to: PeerId, data: Uint8Array) => {
		// Nothing goes to the host's id while it is unverified: whoever is on it may not be the host.
		if (!closed && connected.has(to) && (isHost || to !== hostId || hostTrusted)) t.send(data, to);
	};
	const sendControl = (to: PeerId, msg: Control) => send(to, encodeControl(msg));
	const others = () => state.members.filter((m) => m.id !== t.selfId);

	/** Send our full state to `peer`, and ask for theirs. */
	const syncWith = (peer: PeerId) => {
		answerSync(peer);
		sendControl(peer, { t: 'sync' });
	};
	const answerSync = (peer: PeerId) => {
		if (state.me?.role !== 'view') send(peer, frame(TAG_DOC, opts.doc.encodeAll()));
		if (opts.awareness) send(peer, frame(TAG_AWARENESS, opts.awareness.encodeAll()));
	};
	const forget = (peer: PeerId) => {
		opts.doc.forget?.(peer);
		opts.awareness?.forget?.(peer);
	};

	// ── local changes go to every member (a viewer's document edits go nowhere) ──
	const unDoc = opts.doc.onLocal((u) => {
		if (!isLive() || state.me?.role === 'view') return;
		const f = frame(TAG_DOC, u);
		for (const m of others()) send(m.id, f);
	});
	const unAw = opts.awareness?.onLocal((u) => {
		if (!isLive()) return;
		const f = frame(TAG_AWARENESS, u);
		for (const m of others()) send(m.id, f);
	});

	// ── host ────────────────────────────────────────────────────────────────
	const sayHello = (to: PeerId) => {
		const key = opts.host?.key;
		if (!key) return;
		const p = signHello(key, t.selfId, to).then((sig) => {
			if (closed || ending || memberOf(to) || !connected.has(to)) return;
			sendControl(to, { t: 'hello', v: PROTOCOL_VERSION, invite: state.invite as Invite, key: toBase64Url(key.publicRaw), sig });
		});
		signing.add(p);
		void p.finally(() => signing.delete(p));
	};
	const nextColor = (): Color => {
		const used = new Set(state.members.map((m) => m.color));
		return ([1, 2, 3, 4] as const).find((c) => !used.has(c)) ?? 4;
	};
	const broadcastRoster = () => {
		const msg: Control = { t: 'roster', members: state.members };
		for (const m of others()) sendControl(m.id, msg);
	};
	const admitAs = (id: PeerId, name: string, role: Exclude<Role, 'host'>, color: Color, token: string, claimed?: number) => {
		tokens.set(token, { name, role, color });
		tokenOf.set(id, token);
		// A client id another member already speaks for is not bound: the newcomer's presence is
		// then dropped everywhere, which is safer than letting it speak as someone else.
		const bound = claimed !== undefined && !state.members.some((m) => m.client === claimed) ? { client: claimed } : {};
		set({ members: [...state.members, { id, name, role, color, ...bound }], waiting: state.waiting.filter((w) => w.id !== id) });
		sendControl(id, { t: 'admit', role, color, token, members: state.members });
		broadcastRoster();
		syncWith(id);
	};
	const hostOnKnock = (from: PeerId, name: string, token?: string, claimed?: number) => {
		if (memberOf(from) || blocked.has(from)) return;
		const known = token ? tokens.get(token) : undefined;
		if (known && token) {
			// A member reconnecting (under a new peer id, or the same one after a blip): same name and
			// role. A token whose member is STILL connected is a replay, not a reconnect — refused, so
			// a copied token cannot evict the real member. It counts against the cap, and its old color
			// is reused only if still free.
			const stale = state.members.find((m) => tokenOf.get(m.id) === token);
			if (stale && connected.has(stale.id)) {
				sendControl(from, { t: 'deny', reason: 'denied' });
				return;
			}
			const rest = state.members.filter((m) => m.id !== stale?.id);
			if (rest.length >= cap) {
				sendControl(from, { t: 'deny', reason: 'full' });
				return;
			}
			if (stale) {
				tokenOf.delete(stale.id);
				set({ members: rest });
				forget(stale.id);
			}
			const color = state.members.some((m) => m.color === known.color) ? nextColor() : known.color;
			admitAs(from, known.name, known.role, color, token, claimed);
			return;
		}
		if (state.members.length >= cap) {
			sendControl(from, { t: 'deny', reason: 'full' });
			return;
		}
		if (state.autoAdmit) {
			admitAs(from, name, state.linkRole, nextColor(), newToken(), claimed);
			return;
		}
		if (state.waiting.some((w) => w.id === from) || state.waiting.length >= MAX_WAITING) return;
		claims.set(from, claimed);
		set({ waiting: [...state.waiting, { id: from, name, at: clock.now() } satisfies Knock] });
	};

	// ── guest ───────────────────────────────────────────────────────────────
	const armLobbyTimer = () => {
		if (lobbyTimer !== null) clock.clearTimeout(lobbyTimer);
		lobbyTimer = clock.setTimeout(() => {
			lobbyTimer = null;
			if (state.stage === 'connecting') set({ stage: 'host-absent' });
		}, opts.lobbyTimeoutMs ?? DEFAULT_LOBBY_TIMEOUT);
	};
	/** Knock. `quietly` keeps a live member on screen while it re-knocks after the host came back. */
	const sendKnock = (name: string, quietly = false) => {
		if (!hostId) return;
		sendControl(hostId, { t: 'knock', name: cleanName(name), ...(state.token ? { token: state.token } : {}), ...(client !== undefined ? { client } : {}) });
		if (!quietly) set({ stage: 'waiting' });
	};
	const guestOnHello = async (from: PeerId, msg: Extract<Control, { t: 'hello' }>) => {
		// Another version's hello cannot be checked, so it proves nothing; but staying on "Connecting…"
		// until the lobby gives up would blame the network for a stale tab. Say so, and keep listening:
		// a hello this version can verify still takes the guest on.
		if (msg.v !== PROTOCOL_VERSION) {
			if (state.stage === 'connecting' || state.stage === 'host-absent') set({ stage: 'outdated' });
			return;
		}
		const link = epoch.get(from);
		if (!(await verifyHello(opts.hostFingerprint as string, msg.key, msg.sig, from, t.selfId))) return;
		// The link the hello came on dropped while we verified: whoever is on that id now may not be
		// the host (checker round 3, finding 2).
		if (closed || epoch.get(from) !== link || !connected.has(from)) return;
		if (hostId !== null && hostId !== from) {
			// The host came back under a new id (it reloaded). Its OLD id is nobody now: drop it, or a
			// squatter on it would be a trusted member (checker round 3, finding 1).
			const old = hostId;
			if (memberOf(old)) set({ members: state.members.filter((m) => m.id !== old) });
			forget(old);
		}
		hostId = from;
		hostTrusted = true;
		set({ invite: msg.invite, hostAway: false });
		if (lobbyTimer !== null) {
			clock.clearTimeout(lobbyTimer);
			lobbyTimer = null;
		}
		// A hello while live means the host no longer counts us as a member: it reloaded, or the link
		// between us blipped (Trystero keeps the same ids). The signature proved it is the host, so
		// re-knock with the token, staying on screen; the host re-admits without asking.
		if (isLive()) {
			if (state.token) sendKnock(state.me?.name ?? pendingName ?? 'Guest', true);
			return;
		}
		if (state.stage === 'connecting' || state.stage === 'host-absent' || state.stage === 'outdated') {
			if (pendingName || state.token) sendKnock(pendingName ?? 'Guest');
			else set({ stage: 'lobby' });
		}
	};
	const guestOnControl = async (from: PeerId, msg: Control) => {
		if (msg.t === 'hello') return guestOnHello(from, msg);
		if (from !== hostId || !hostTrusted) {
			// Members may ask each other for state; nothing else is accepted from a non-host.
			if (msg.t === 'sync' && isLive() && memberOf(from) && from !== hostId) answerSync(from);
			return;
		}
		switch (msg.t) {
			case 'admit': {
				// The member list rides on the admission, so the gate knows the host (and everyone else)
				// from the first message on — a document that arrives right behind it is not dropped.
				const me: Member = msg.members.find((m) => m.id === t.selfId) ?? { id: t.selfId, name: cleanName(state.me?.name ?? pendingName ?? 'Guest'), role: msg.role, color: msg.color, ...(client !== undefined ? { client } : {}) };
				const before = new Set(state.members.map((m) => m.id));
				set({ stage: 'live', token: msg.token, me, members: msg.members });
				for (const m of msg.members) if (m.id !== t.selfId && !before.has(m.id)) syncWith(m.id);
				startClock();
				return;
			}
			case 'deny':
				if (isLive()) {
					// A refused quiet re-knock: the host no longer counts us (our seat was taken while our
					// link was down, or our token was refused). Staying "live" would edit into a void —
					// checker round 2, finding 3 — so say so and stop.
					for (const m of others()) forget(m.id);
					set({ stage: msg.reason === 'full' ? 'full' : 'denied', members: [], me: null, token: null });
					shutdown();
					return;
				}
				set({ stage: msg.reason === 'full' ? 'full' : 'denied' });
				return;
			case 'roster': {
				const before = new Map(state.members.map((m) => [m.id, m]));
				const me = msg.members.find((m) => m.id === t.selfId) ?? state.me;
				const wasRole = state.me?.role;
				set({ members: msg.members, me });
				for (const m of msg.members) {
					if (m.id === t.selfId) continue;
					const was = before.get(m.id);
					// A new member, or one whose role changed (a promoted viewer's edits were never
					// sent and later ones depend on them): exchange full state.
					if ((!was && m.id !== hostId) || (was && was.role !== m.role)) syncWith(m.id);
				}
				if (me && wasRole && wasRole !== me.role) for (const m of msg.members) if (m.id !== t.selfId) syncWith(m.id);
				for (const id of before.keys()) if (!msg.members.some((m) => m.id === id)) forget(id);
				return;
			}
			case 'removed':
				set({ stage: 'removed', members: [], me: null, token: null });
				shutdown();
				return;
			case 'end':
				set({ stage: 'ended' });
				shutdown();
				return;
			case 'sync':
				if (isLive()) answerSync(from);
				return;
			default:
				return;
		}
	};

	// ── transport wiring ────────────────────────────────────────────────────
	t.onPeerJoin((id) => {
		connected.add(id);
		bump(id);
		if (isHost) {
			if (ending) return;
			if (memberOf(id)) {
				// A join for a member we still count: the transport replaced the link without telling us
				// it left. Treat it as a fresh link — the member re-knocks with its token on our hello.
				set({ members: state.members.filter((m) => m.id !== id) });
				broadcastRoster();
				forget(id);
			}
			sayHello(id);
			return;
		}
		// A member's link formed late or came back: whatever either side sent before it existed
		// was dropped, so exchange full state now (the roster-time sync only covers a NEW member).
		if (isLive() && memberOf(id) && id !== hostId) syncWith(id);
		// A peer we dropped when its link to us went down (below) came back: the host says whether it
		// is still a member, and the roster that answers re-adds and resyncs it.
		else if (isLive() && hostTrusted && hostId && id !== hostId) sendControl(hostId, { t: 'roster?' });
	});
	t.onPeerLeave((id) => {
		connected.delete(id);
		bump(id);
		if (isHost) {
			claims.delete(id);
			if (state.waiting.some((w) => w.id === id)) set({ waiting: state.waiting.filter((w) => w.id !== id) });
			if (memberOf(id)) {
				set({ members: state.members.filter((m) => m.id !== id) });
				broadcastRoster();
			}
		} else if (id === hostId) {
			hostTrusted = false;
			if (isLive()) set({ hostAway: true });
			else if (state.stage === 'lobby' || state.stage === 'waiting') {
				// The host left before letting us in. Say so, and accept the next signed hello.
				hostId = null;
				set({ stage: 'host-absent' });
			}
		} else if (memberOf(id)) {
			// Drop the leaver here, without waiting for the host's roster: until the host vouches for it
			// again (`roster?` on its return), whoever next connects under this id is a stranger.
			set({ members: state.members.filter((m) => m.id !== id) });
		}
		forget(id);
	});
	t.onMessage((data, from) => {
		if (closed || data.length === 0 || data.length > MAX_MESSAGE) return;
		const tag = data[0];
		const body = data.subarray(1);
		if (tag === TAG_CONTROL) {
			const msg = decodeControl(body);
			if (!msg) return;
			if (isHost) {
				if (ending) return;
				if (msg.t === 'knock') hostOnKnock(from, msg.name, msg.token, msg.client);
				else if (msg.t === 'sync' && memberOf(from)) answerSync(from);
				else if (msg.t === 'roster?' && memberOf(from)) sendControl(from, { t: 'roster', members: state.members });
				else if (msg.t === 'ping' && memberOf(from)) sendControl(from, { t: 'pong', n: msg.n, at: clock.now() });
				return;
			}
			// A pong is timed on ARRIVAL, ahead of the ordered chain: queueing it behind a hello being
			// verified would add that wait to the round trip and skew the clock.
			if (msg.t === 'pong') {
				if (from === hostId && hostTrusted) onPong(msg);
				return;
			}
			controlChain = controlChain.then(() => guestOnControl(from, msg)).catch(() => {});
			return;
		}
		// THE GATE.
		if (!isLive()) return;
		const sender = memberOf(from);
		if (!sender) return;
		if (!isHost && from === hostId && !hostTrusted) return;
		try {
			if (tag === TAG_POST) {
				opts.onPost?.(body, from);
			} else if (tag === TAG_DOC) {
				if (sender.role === 'view') return;
				opts.doc.applyRemote(body, from);
			} else if (tag === TAG_AWARENESS) {
				opts.awareness?.applyRemote(body, from);
			}
		} catch {
			// A malformed update from a member is dropped; the session carries on.
		}
	});

	if (!isHost) armLobbyTimer();

	function shutdown() {
		if (closed) return;
		closed = true;
		if (lobbyTimer !== null) clock.clearTimeout(lobbyTimer);
		if (pingTimer !== null) clock.clearTimeout(pingTimer);
		unDoc();
		unAw?.();
		void t.leave();
	}

	const hostOnly = (fn: () => void) => () => {
		if (isHost && !closed && !ending) fn();
	};

	return {
		getState: () => state,
		subscribe(cb) {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
		knock(name) {
			if (isHost || closed) return;
			pendingName = cleanName(name);
			sendKnock(pendingName);
		},
		retry() {
			if (isHost || closed || state.stage !== 'host-absent') return;
			set({ stage: 'connecting' });
			armLobbyTimer();
		},
		admit(id) {
			hostOnly(() => {
				const k = state.waiting.find((w) => w.id === id);
				if (!k) return;
				const claimed = claims.get(id);
				claims.delete(id);
				if (state.members.length >= cap) {
					set({ waiting: state.waiting.filter((w) => w.id !== id) });
					sendControl(id, { t: 'deny', reason: 'full' });
					return;
				}
				admitAs(id, k.name, state.linkRole, nextColor(), newToken(), claimed);
			})();
		},
		deny(id) {
			hostOnly(() => {
				if (!state.waiting.some((w) => w.id === id)) return;
				blocked.add(id);
				claims.delete(id);
				set({ waiting: state.waiting.filter((w) => w.id !== id) });
				sendControl(id, { t: 'deny', reason: 'denied' });
			})();
		},
		remove(id) {
			hostOnly(() => {
				const m = memberOf(id);
				if (!m || m.role === 'host') return;
				const tok = tokenOf.get(id);
				if (tok) tokens.delete(tok);
				tokenOf.delete(id);
				blocked.add(id);
				sendControl(id, { t: 'removed' });
				set({ members: state.members.filter((x) => x.id !== id) });
				broadcastRoster();
				forget(id);
			})();
		},
		setRole(id, role) {
			hostOnly(() => {
				const m = memberOf(id);
				if (!m || m.role === 'host' || m.role === role) return;
				const tok = tokenOf.get(id);
				if (tok) tokens.set(tok, { name: m.name, role, color: m.color });
				set({ members: state.members.map((x) => (x.id === id ? { ...x, role } : x)) });
				broadcastRoster();
				syncWith(id);
			})();
		},
		setAutoAdmit(on) {
			hostOnly(() => set({ autoAdmit: on }))();
		},
		setLinkRole(role) {
			hostOnly(() => set({ linkRole: role }))();
		},
		setInvite(invite) {
			hostOnly(() => set({ invite }))();
		},
		post(data, to) {
			if (closed || ending || !isLive()) return;
			const f = frame(TAG_POST, data);
			if (to !== undefined) {
				if (memberOf(to) && to !== t.selfId) send(to, f);
			} else for (const m of others()) send(m.id, f);
		},
		exportTokens: () => [...tokens.entries()],
		end() {
			hostOnly(() => {
				ending = true;
				for (const w of state.waiting) sendControl(w.id, { t: 'deny', reason: 'denied' });
				for (const m of others()) sendControl(m.id, { t: 'end' });
				set({ stage: 'ended', waiting: [] });
				// Leave a beat later: closing the connections at once can drop the `end` messages
				// still in flight, and then guests never learn the session is over.
				unDoc();
				unAw?.();
				clock.setTimeout(shutdown, 500);
			})();
		},
		leave() {
			shutdown();
		},
		now: () => clock.now() + clockOffset,
		async idle() {
			await Promise.all([controlChain, ...signing]);
		},
	};
}
