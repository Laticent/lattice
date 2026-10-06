// A Tavola session: the handshake (hello → knock → admit / deny), the roster, and the gate
// that decides who may send and receive the document and awareness streams.
// See engineering/decisions/2026-10-06-studio-live-collaboration.md §4.
//
// THE GATE, in one sentence: a stream message is sent only to admitted members and applied
// only from admitted members, and a document update is applied only from a member who may edit.
// Every honest browser enforces it, so a peer that holds the link but was never admitted gets a
// connection and nothing over it, and a view-only member's edits land nowhere.
//
// SYNC, and why there is a `sync` request: when two members learn of each other they each send
// their full state. Roster updates reach them at different moments, so the first one's state can
// arrive before the second knows the first is a member — and is dropped. Sending a `sync` request
// alongside the state closes that window: whoever learns LATER asks, and the other answers.

import { randomBytes, toBase64Url } from './link';
import { type Control, cleanName, decodeControl, encodeControl, frame, PROTOCOL_VERSION, TAG_AWARENESS, TAG_CONTROL, TAG_DOC } from './protocol';
import type { Clock, Color, Invite, Knock, Member, PeerId, Role, SessionState, Stream, Transport } from './types';

export type HostOptions = {
	name: string;
	invite: Invite;
	autoAdmit?: boolean;
	linkRole?: 'edit' | 'view';
};

export type SessionOptions = {
	transport: Transport;
	/** Present → this browser hosts. Absent → it joins as a guest. */
	host?: HostOptions;
	doc: Stream;
	awareness?: Stream;
	/** Guest: a token from an earlier admission, so a reload rejoins without a new knock. */
	token?: string;
	/** Guest: knock automatically under this name as soon as the host says hello. */
	autoKnockName?: string;
	/** Most people in a session, host included. The owner's number: 4. */
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
	/** Host: end the session for everyone. */
	end(): void;
	/** Leave this session (a guest leaving, or a host closing without ending). */
	leave(): void;
};

export const DEFAULT_CAP = 4;
const DEFAULT_LOBBY_TIMEOUT = 12_000;

const realClock: Clock = {
	now: () => Date.now(),
	setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
	clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

export function createSession(opts: SessionOptions): Session {
	const t = opts.transport;
	const clock = opts.clock ?? realClock;
	const newToken = opts.newToken ?? (() => toBase64Url(randomBytes(18)));
	const cap = opts.cap ?? DEFAULT_CAP;
	const isHost = !!opts.host;
	const listeners = new Set<() => void>();

	let state: SessionState = {
		isHost,
		stage: isHost ? 'live' : 'connecting',
		selfId: t.selfId,
		me: isHost ? { id: t.selfId, name: cleanName(opts.host?.name ?? ''), role: 'host', color: 1 } : null,
		members: isHost ? [{ id: t.selfId, name: cleanName(opts.host?.name ?? ''), role: 'host', color: 1 }] : [],
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
	/** Host: member id → its token. */
	const tokenOf = new Map<PeerId, string>();
	/** Guest: the peer that said hello. */
	let hostId: PeerId | null = null;
	let pendingName: string | null = opts.autoKnockName ?? null;
	let lobbyTimer: unknown = null;
	let closed = false;

	const memberOf = (id: PeerId) => state.members.find((m) => m.id === id);
	const isLive = () => state.stage === 'live';
	const send = (to: PeerId, data: Uint8Array) => {
		if (!closed && connected.has(to)) t.send(data, to);
	};
	const sendControl = (to: PeerId, msg: Control) => send(to, encodeControl(msg));
	const others = () => state.members.filter((m) => m.id !== t.selfId);

	/** Send our full state to `peer`, and ask for theirs. */
	const syncWith = (peer: PeerId) => {
		send(peer, frame(TAG_DOC, opts.doc.encodeAll()));
		if (opts.awareness) send(peer, frame(TAG_AWARENESS, opts.awareness.encodeAll()));
		sendControl(peer, { t: 'sync' });
	};
	const answerSync = (peer: PeerId) => {
		send(peer, frame(TAG_DOC, opts.doc.encodeAll()));
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
	const nextColor = (): Color => {
		const used = new Set(state.members.map((m) => m.color));
		return ([1, 2, 3, 4] as const).find((c) => !used.has(c)) ?? 4;
	};
	const broadcastRoster = () => {
		const msg: Control = { t: 'roster', members: state.members };
		for (const m of others()) sendControl(m.id, msg);
	};
	const admitAs = (id: PeerId, name: string, role: Exclude<Role, 'host'>, color: Color, token: string) => {
		tokens.set(token, { name, role, color });
		tokenOf.set(id, token);
		set({ members: [...state.members, { id, name, role, color }], waiting: state.waiting.filter((w) => w.id !== id) });
		sendControl(id, { t: 'admit', role, color, token });
		broadcastRoster();
		syncWith(id);
	};
	const hostOnKnock = (from: PeerId, name: string, token?: string) => {
		if (memberOf(from)) return;
		const known = token ? tokens.get(token) : undefined;
		if (known && token) {
			// A member reconnecting under a new peer id: same name, role and color. Drop the old id.
			const stale = state.members.find((m) => tokenOf.get(m.id) === token);
			if (stale) {
				tokenOf.delete(stale.id);
				set({ members: state.members.filter((m) => m.id !== stale.id) });
				forget(stale.id);
			}
			admitAs(from, known.name, known.role, known.color, token);
			return;
		}
		if (state.members.length >= cap) {
			sendControl(from, { t: 'deny', reason: 'full' });
			return;
		}
		if (state.autoAdmit) {
			admitAs(from, name, state.linkRole, nextColor(), newToken());
			return;
		}
		if (state.waiting.some((w) => w.id === from)) return;
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
	const sendKnock = (name: string) => {
		if (!hostId) return;
		sendControl(hostId, { t: 'knock', name: cleanName(name), ...(state.token ? { token: state.token } : {}) });
		set({ stage: 'waiting' });
	};
	const guestOnControl = (from: PeerId, msg: Control) => {
		if (msg.t === 'hello') {
			if (msg.v !== PROTOCOL_VERSION) return;
			// The first hello names the host. A second host-looking peer is ignored, except that
			// after the host dropped, a hello is the host coming back.
			if (hostId && hostId !== from && !state.hostAway) return;
			const returning = hostId !== null && hostId !== from && state.hostAway;
			hostId = from;
			set({ invite: msg.invite, hostAway: false });
			if (lobbyTimer !== null) {
				clock.clearTimeout(lobbyTimer);
				lobbyTimer = null;
			}
			if (returning && state.token) {
				sendKnock(state.me?.name ?? pendingName ?? 'Guest');
				return;
			}
			if (state.stage === 'connecting' || state.stage === 'host-absent') {
				if (pendingName || state.token) sendKnock(pendingName ?? 'Guest');
				else set({ stage: 'lobby' });
			}
			return;
		}
		if (from !== hostId) {
			// Members may ask each other for state; nothing else is accepted from a non-host.
			if (msg.t === 'sync' && isLive() && memberOf(from)) answerSync(from);
			return;
		}
		switch (msg.t) {
			case 'admit': {
				const me: Member = { id: t.selfId, name: cleanName(pendingName ?? state.me?.name ?? 'Guest'), role: msg.role, color: msg.color };
				set({ stage: 'live', token: msg.token, me });
				syncWith(from);
				return;
			}
			case 'deny':
				set({ stage: msg.reason === 'full' ? 'full' : 'denied' });
				return;
			case 'roster': {
				const before = new Set(state.members.map((m) => m.id));
				const me = msg.members.find((m) => m.id === t.selfId) ?? state.me;
				set({ members: msg.members, me });
				for (const m of msg.members) if (m.id !== t.selfId && m.id !== hostId && !before.has(m.id)) syncWith(m.id);
				for (const id of before) if (!msg.members.some((m) => m.id === id)) forget(id);
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
		if (isHost && !memberOf(id)) sendControl(id, { t: 'hello', v: PROTOCOL_VERSION, invite: state.invite as Invite });
	});
	t.onPeerLeave((id) => {
		connected.delete(id);
		if (isHost) {
			if (state.waiting.some((w) => w.id === id)) set({ waiting: state.waiting.filter((w) => w.id !== id) });
			if (memberOf(id)) {
				set({ members: state.members.filter((m) => m.id !== id) });
				broadcastRoster();
			}
		} else if (id === hostId) {
			if (isLive()) set({ hostAway: true });
		} else if (memberOf(id) && state.hostAway) {
			// With the host away nobody sends a roster, so drop the leaver here.
			set({ members: state.members.filter((m) => m.id !== id) });
		}
		forget(id);
	});
	t.onMessage((data, from) => {
		if (closed || data.length === 0) return;
		const tag = data[0];
		const body = data.subarray(1);
		if (tag === TAG_CONTROL) {
			const msg = decodeControl(body);
			if (!msg) return;
			if (isHost) {
				if (msg.t === 'knock') hostOnKnock(from, msg.name, msg.token);
				else if (msg.t === 'sync' && memberOf(from)) answerSync(from);
				return;
			}
			guestOnControl(from, msg);
			return;
		}
		// THE GATE.
		if (!isLive()) return;
		const sender = memberOf(from);
		if (!sender) return;
		if (tag === TAG_DOC) {
			if (sender.role === 'view') return;
			opts.doc.applyRemote(body, from);
		} else if (tag === TAG_AWARENESS) {
			opts.awareness?.applyRemote(body, from);
		}
	});

	if (!isHost) armLobbyTimer();

	function shutdown() {
		if (closed) return;
		closed = true;
		if (lobbyTimer !== null) clock.clearTimeout(lobbyTimer);
		unDoc();
		unAw?.();
		void t.leave();
	}

	const hostOnly = (fn: () => void) => () => {
		if (isHost && !closed) fn();
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
				if (state.members.length >= cap) {
					set({ waiting: state.waiting.filter((w) => w.id !== id) });
					sendControl(id, { t: 'deny', reason: 'full' });
					return;
				}
				admitAs(id, k.name, state.linkRole, nextColor(), newToken());
			})();
		},
		deny(id) {
			hostOnly(() => {
				if (!state.waiting.some((w) => w.id === id)) return;
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
		end() {
			hostOnly(() => {
				for (const m of others()) sendControl(m.id, { t: 'end' });
				set({ stage: 'ended' });
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
	};
}
