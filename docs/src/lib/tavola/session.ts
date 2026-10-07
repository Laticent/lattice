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
// round trip − our time — keeping, of the last five samples, the one with the SHORTEST round trip
// (the tightest bound),
// and `now()` returns host time on every browser. Time zones never enter: the value is epoch ms;
// each viewer formats it in its own zone.
//
// SUCCESSION — a regency, not an abdication. The host names an HEIR: the first member, in
// admission order, who may edit and is connected. It certifies the heir's own key with a RANGE of
// terms above its own (hostkey.ts: a cert's `term`, and a ceiling `max` its key can never pass),
// and hands it what hosting needs: the rejoin tokens BY ID (their SHA-256, so the heir can check a
// knock but never knock with one), the blocked ids and the settings. When the host's link drops,
// the heir waits HANDOFF_GRACE_MS (a reload or a blip is back well inside it), asks the other
// editors whether THEIR link to the host is up (if one says yes, the heir is the one cut off, and
// it waits again, for at most MAX_POLL_ROUNDS), and then hosts as REGENT: it says a hello, signed
// with its certified key, to everyone, and the members re-knock with their tokens exactly as after
// a host reload. The highest term wins: a guest follows a strictly higher term, a member refuses
// one below the roster's term (the floor, which the app persists across a reload: `minTerm`), and
// a regent that hears a higher term steps down (`moved`) and rejoins with its own token.
//
// THE SESSION'S FIRST HOST — the key the link names — NEVER steps down. When it hears a higher
// term (it came back, from a reload or a frozen tab, or an heir challenged it), it certifies itself
// above that key's whole range and says hello again; the regent steps down, hands back the tokens
// it issued meanwhile (`handback`), and everyone follows the first host again. So the person who
// shared the link always gets the session back, however their browser left it (inversion review,
// 2026-10-07). An heir that challenges a first host which still has members is never named heir
// again. A withdrawn heir (it left, was removed or made view-only) cannot come back: the host
// certifies itself above the withdrawn range, and that range's ceiling binds every key it signs.
//
// What this trusts: the current heir can take the session whenever it likes, until the first host
// is back. The host extends that only to editors, who can already rewrite the whole deck, and the
// Studio names the heir in the host's panel.
//
// A PEER ID IS NOT AN IDENTITY. Transport ids are self-declared in signaling, so once a peer's link
// drops, anyone holding the link can reconnect under its old id (red-team round 2, finding 1). So a
// guest stops trusting the host's id the moment that link drops, and trusts it again only after a
// fresh signed hello on the new link; and a member whose link drops is dropped from every roster
// at once, so a squatter under its id is a stranger until the host admits it again.

import { type Cert, createHostKey, type HostKey, MAX_CHAIN, ROOT_MAX, signCert, signHello, tokenId, verifyChain, verifyHostHello } from './hostkey';
import { randomBytes, toBase64Url } from './link';
import { type Control, cleanName, decodeControl, encodeControl, frame, PROTOCOL_VERSION, TAG_AWARENESS, TAG_CONTROL, TAG_DOC, TAG_POST, type TokenEntry } from './protocol';
import type { Clock, Color, Invite, Knock, LinkPath, Member, PeerId, Role, SessionState, Stream, Transport } from './types';

export type { TokenEntry };

/** Where a host stands in the succession: the link's key (`root`, with its `fingerprint`), the
 *  chain of certs from it to this host's key (`chain`; the first `base` certify this key, any after
 *  is this host's own self-cert), and the highest term it has issued (`top`). A host that took over
 *  carries one across its reload; the session's first host needs none. */
export type Succession = { root: string; fingerprint: string; chain: Cert[]; base: number; top: number; issued?: string[] };

export type HostOptions = {
	name: string;
	invite: Invite;
	/** The host's signing key; its fingerprint is the link's third part. */
	key: HostKey;
	autoAdmit?: boolean;
	linkRole?: 'edit' | 'view';
	/** Token ids from `exportTokens()` before a reload: the members they name walk back in without a knock. */
	tokens?: TokenEntry[];
	/** From `succession()` before a reload. Required when `key` is not the link's own key. */
	succession?: Succession;
	/** This host's own rejoin token, from `succession()` before a reload: if a later host takes over,
	 *  this browser rejoins under it as a member. */
	selfToken?: string;
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
	/** Media from admitted members only (a call's audio): `add` when a member's stream arrives or
	 *  when a peer whose stream arrived first is admitted; `drop` when it leaves or is removed. */
	media?: { add(stream: MediaStream, from: PeerId): void; drop(from: PeerId): void };
	/** Guest: knock automatically under this name as soon as the host says hello. */
	autoKnockName?: string;
	/** Most people in a session, host included. The owner's number: 4 (and never more than 4). */
	cap?: number;
	/** Guest: how long to wait for the host's hello before `host-absent`. */
	lobbyTimeoutMs?: number;
	clock?: Clock;
	newToken?: () => string;
	/** Heir: how long the host's link stays down before the heir takes over. */
	handoffGraceMs?: number;
	/** Guest: the lowest host term to follow, persisted from `getState().minTerm` before a reload,
	 *  so a withdrawn heir cannot catch this browser in the moment before the host says hello. */
	minTerm?: number;
	/** Heir: how long it waits for the others to say whether they still reach the host. */
	hostPollMs?: number;
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
	/** Host: the rejoin tokens BY ID (`tokenId`), to hand to `HostOptions.tokens` after a reload. */
	exportTokens(): TokenEntry[];
	/** Host: whether `id` is a member this host once certified as heir (it may hand back a regency). */
	wasHeir(id: PeerId): boolean;
	/** Host: the id (`tokenId`) of a member's rejoin token — the identity it keeps across reconnects and reloads, which
	 *  a peer id does not. For the app to bind what a member owns (its chat ids) to who it is. */
	memberToken(id: PeerId): string | undefined;
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
	/** Host: what a reload needs to keep hosting (the signing key, the succession, and this host's own
	 *  rejoin token). Null on a guest. */
	succession(): (Succession & { key: HostKey; selfToken: string }) | null;
	/** The network path to each member this browser is connected to (empty when the transport cannot
	 *  say). For a "how are we connected" readout, and for the two-network check. */
	paths(): Promise<Record<PeerId, LinkPath>>;
	/** Send `stream`'s tracks to every admitted member, and to each one admitted later; never to a
	 *  stranger. Null stops sending. A transport without media ignores it. */
	setMedia(stream: MediaStream | null): void;
	/** Whether the transport carries media at all. */
	readonly hasMedia: boolean;
};

export const DEFAULT_CAP = 4;
const DEFAULT_LOBBY_TIMEOUT = 12_000;
/** A member re-measures the session clock this often (and three times, quickly, on joining). */
export const CLOCK_RESYNC_MS = 30_000;
/** Bytes. A deck plus its history is far below this; anything larger is dropped unread. */
export const MAX_MESSAGE = 4 * 1024 * 1024;
/** Knocks the host holds at once. Past this, a knock is ignored until one is answered. */
export const MAX_WAITING = 8;
/** How long the host's link stays down before the heir takes over. A reload is back in about 6 s. */
export const HANDOFF_GRACE_MS = 20_000;
/** How long the heir waits for the other members to say whether their link to the host is up. */
export const HOST_POLL_MS = 1_500;
/** Rounds the heir waits on an editor who still reaches the host, before it hosts anyway: the first
 *  host reclaims when the cut heals, so a regency that should not have happened is undone. */
export const MAX_POLL_ROUNDS = 3;
/** The range of terms the first host gives each heir it certifies. */
const HEIR_SPAN = 1 << 20;

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
	let isHost = !!opts.host;
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
		heir: null,
		minTerm: opts.minTerm ?? 0,
	};
	const set = (patch: Partial<SessionState>) => {
		state = { ...state, ...patch };
		if (patch.members || patch.stage) syncMedia();
		for (const cb of listeners) cb();
	};

	// ── media: the same gate as the document ───────────────────────────────
	// Tracks go only to admitted members and come in only from them. Every change to the roster or
	// the stage re-derives who should hear us; a stream that arrived from a peer before it was
	// admitted is held, and handed on only if it is admitted.
	let localMedia: MediaStream | null = null;
	/** Peer → the tracks we are sending it. */
	const sentTo = new Map<PeerId, MediaStreamTrack[]>();
	/** Peer → the stream it sends us, and whether the app has it. */
	const heard = new Map<PeerId, { stream: MediaStream; given: boolean }>();
	function syncMedia() {
		if (!t.addTrack) return;
		const live = state.stage === 'live' && !closed;
		const want = new Set(live ? state.members.filter((m) => m.id !== t.selfId && connected.has(m.id)).map((m) => m.id) : []);
		const tracks = localMedia?.getTracks() ?? [];
		for (const [peer, sent] of [...sentTo]) {
			if (want.has(peer) && sent.length === tracks.length && sent.every((x, i) => x === tracks[i])) continue;
			if (connected.has(peer)) for (const tr of sent) t.removeTrack?.(tr, peer);
			sentTo.delete(peer);
		}
		if (localMedia)
			for (const peer of want) {
				if (sentTo.has(peer)) continue;
				for (const tr of tracks) t.addTrack(tr, localMedia, peer);
				sentTo.set(peer, tracks);
			}
		for (const [peer, h] of heard) {
			if (!h.given && want.has(peer)) {
				h.given = true;
				opts.media?.add(h.stream, peer);
			} else if (h.given && !want.has(peer)) {
				h.given = false;
				opts.media?.drop(peer);
			}
		}
	}

	// ── shared bookkeeping ──────────────────────────────────────────────────
	const connected = new Set<PeerId>();
	/** Host: token id (`tokenId`) → the member it re-admits (name, role, color survive a reconnect). */
	const tokens = new Map<string, { name: string; role: Exclude<Role, 'host'>; color: Color }>();
	for (const [id, m] of opts.host?.tokens ?? []) tokens.set(id, m);
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
	/** The last few samples; the offset is the one with the shortest round trip among them. A window,
	 *  not one best-ever sample, so a lucky early sample cannot pin the clock for good. */
	let samples: Array<{ rtt: number; offset: number }> = [];
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
		samples = [];
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
		if (rtt < 0) return;
		samples = [...samples, { rtt, offset: msg.at + rtt / 2 - got }].slice(-5);
		clockOffset = samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).offset;
	};
	/** Host: hellos and certs being signed. */
	const signing = new Set<Promise<unknown>>();
	const track = (p: Promise<unknown>) => {
		signing.add(p);
		void p.finally(() => signing.delete(p));
	};

	// ── succession state (see the header) ───────────────────────────────────
	const succ0 = opts.host?.succession;
	/** The key this browser signs hellos with while it hosts. */
	let signer: HostKey | null = opts.host?.key ?? null;
	/** The link's key (base64url). A guest learns it from the first hello it believes. */
	let root: string | null = succ0?.root ?? (opts.host ? toBase64Url(opts.host.key.publicRaw) : null);
	const linkFp = (succ0?.fingerprint ?? opts.host?.key.fingerprint ?? opts.hostFingerprint) as string;
	/** Host: the certs that make this key a host, and the chain it presents (those, plus a self-cert). */
	let baseChain: Cert[] = succ0 ? succ0.chain.slice(0, succ0.base) : [];
	let chain: Cert[] = succ0?.chain ?? [];
	const termOf = (c: Cert[]) => (c.length ? c[c.length - 1].term : 0);
	/** Host: its term, raised at once on a withdrawal (the self-cert that proves it is signed after). */
	let myTerm = termOf(chain);
	/** Host: the ceiling of its own key (none for the first host). */
	let myMax = baseChain.length ? baseChain[baseChain.length - 1].max : ROOT_MAX;
	let top = Math.max(succ0?.top ?? 0, myTerm);
	/** Host: token ids of the members it ever certified (only they may hand a regency back). */
	const issuedTo = new Set<string>(succ0?.issued ?? []);
	/** Host: peers that challenged a first host that still had members; never heir again. */
	const distrusted = new Set<PeerId>();
	/** Host: the token each waiting knocker gave that this host did not know, so a handback can let it in. */
	const knockIds = new Map<PeerId, string>();
	/** Regent that stepped down: the tokens it issued, handed back once the next host admits it. */
	let handbackDue: TokenEntry[] | null = null;
	/** Certs are signed in order, so the chain a hello carries is never older than its term. */
	let chainReady: Promise<void> = Promise.resolve();
	let selfToken = opts.host?.selfToken ?? newToken();
	/** Host: the member chosen as heir, whether a cert went out to it, and the chain it was given. */
	let heirId: PeerId | null = null;
	let issued = false;
	let heirChain: Cert[] | null = null;
	const heirPubs = new Map<PeerId, string>();
	/** Guest: the term of the host it follows, and the lowest term it accepts (from the roster). */
	let hostTerm = 0;
	let minTerm = opts.minTerm ?? 0;
	/** Guest: this browser's own key, made when the host first asks it to be heir. */
	let heirKey: Promise<HostKey> | null = null;
	/** Guest: what the host handed this browser as its heir. */
	let heirCred: Extract<Control, { t: 'heir' }> | null = null;
	let graceTimer: unknown = null;
	let pollTimer: unknown = null;
	let pollUp = false;
	let pollRounds = 0;
	/** Host: when each non-member last asked for a hello. */
	const helloAsked = new Map<PeerId, number>();

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
		// A peer still connected (re-admitted in a moment, after a takeover or a blip) keeps its
		// stream: it sends no new track, so syncMedia hands this one on again (checker, 2026-10-07).
		const h = heard.get(peer);
		if (!connected.has(peer)) heard.delete(peer);
		if (h?.given) {
			h.given = false;
			opts.media?.drop(peer);
		}
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
	/** `force`: to a member too (a first host reclaiming, so members that followed someone else return). */
	const sayHello = (to: PeerId, force = false) => {
		const key = signer;
		if (!key || !root) return;
		const p = chainReady
			.then(() => signHello(key, t.selfId, to))
			.then((sig) => {
				if (closed || ending || !isHost || signer !== key || (memberOf(to) && !force) || !connected.has(to)) return;
				sendControl(to, { t: 'hello', v: PROTOCOL_VERSION, invite: state.invite as Invite, key: root as string, chain, sig });
			});
		track(p);
	};
	const nextColor = (): Color => {
		const used = new Set(state.members.map((m) => m.color));
		return ([1, 2, 3, 4] as const).find((c) => !used.has(c)) ?? 4;
	};
	const broadcastRoster = () => {
		if (isHost) updateHeir();
		const msg: Control = { t: 'roster', members: state.members, term: myTerm, ...(heirId ? { heir: heirId } : {}) };
		for (const m of others()) sendControl(m.id, msg);
	};

	// ── host: choosing and certifying the heir ─────────────────────────────
	/** A notify without a state change: a cert finished signing, so the app saves the succession. */
	const touch = () => {
		for (const cb of listeners) cb();
	};
	/** Room left to certify an heir: a range, plus a term above it to withdraw it with, and two more
	 *  links in the chain (the heir's cert and its later self-cert). */
	const canIssue = () => myMax - top >= 4 && chain.length + 2 <= MAX_CHAIN;
	const pickHeir = () => (canIssue() ? (state.members.find((m) => m.id !== t.selfId && m.role === 'edit' && connected.has(m.id) && !distrusted.has(m.id))?.id ?? null) : null);
	/** Withdraw every cert issued so far: certify ourselves above them. */
	const withdraw = () => {
		const key = signer;
		if (!key) return;
		if (top + 1 > myMax) return;
		const term = ++top;
		myTerm = term;
		const base = baseChain;
		const max = myMax;
		const p = (chainReady = chainReady.then(async () => {
			const self = await signCert(key, toBase64Url(key.publicRaw), term, max);
			if (signer === key) chain = [...base, self];
			touch();
		}));
		track(p);
	};
	const issue = (id: PeerId, pub: string) => {
		const key = signer;
		if (!key) return;
		if (!canIssue()) return;
		issued = true;
		const tid = tokenOf.get(id);
		if (tid) issuedTo.add(tid);
		// The heir's range sits wholly above our term; we keep everything above it for withdrawing.
		const term = top + 1;
		const max = myMax === ROOT_MAX ? top + HEIR_SPAN : top + Math.floor((myMax - top) / 2);
		top = max;
		const p = (chainReady = chainReady.then(async () => {
			const cert = await signCert(key, pub, term, max);
			touch();
			if (heirId !== id || signer !== key) return;
			heirChain = [...chain, cert];
			sendHeir();
		}));
		track(p);
	};
	const sendHeir = () => {
		const me = state.me;
		if (!isHost || !heirId || !heirChain || !me) return;
		sendControl(heirId, { t: 'heir', chain: heirChain, tokens: [...tokens.entries()], self: [tokenId(selfToken), { name: me.name, role: 'edit', color: me.color }], blocked: [...blocked], autoAdmit: state.autoAdmit, linkRole: state.linkRole, invite: state.invite as Invite });
	};
	const updateHeir = () => {
		const next = pickHeir();
		if (next === heirId) {
			sendHeir();
			return;
		}
		if (issued) withdraw();
		heirId = next;
		issued = false;
		heirChain = null;
		if (state.heir !== heirId) set({ heir: heirId });
		if (!heirId) return;
		const pub = heirPubs.get(heirId);
		if (pub) issue(heirId, pub);
		else sendControl(heirId, { t: 'heir?' });
	};

	/** A host that hears a later host gives the role up and rejoins it as a member, keeping its seat
	 *  on screen (`live`, host away) while it re-knocks with its own token. */
	const stepDown = (term: number) => {
		const me = state.me as Member;
		handbackDue = [...tokens.entries()];
		for (const m of others()) sendControl(m.id, { t: 'moved' });
		for (const m of others()) forget(m.id);
		isHost = false;
		signer = null;
		heirId = null;
		issued = false;
		heirChain = null;
		hostId = null;
		hostTrusted = false;
		hostTerm = 0;
		minTerm = Math.max(minTerm, term);
		tokens.clear();
		tokenOf.clear();
		claims.clear();
		knockIds.clear();
		pendingName = me.name;
		const member: Member = { ...me, role: 'edit' };
		set({ isHost: false, stage: 'live', me: member, members: [member], waiting: [], hostAway: true, token: selfToken, heir: null, minTerm });
	};
	const hostOnHello = async (from: PeerId, msg: Extract<Control, { t: 'hello' }>) => {
		if (msg.v !== PROTOCOL_VERSION || msg.key !== root) return;
		const link = epoch.get(from);
		const heard = await verifyHostHello(linkFp, msg.key, msg.chain, msg.sig, from, t.selfId);
		if (heard === null || closed || ending || !isHost || epoch.get(from) !== link || !connected.has(from) || heard.term <= myTerm) return;
		if (baseChain.length === 0) {
			// The first host reclaims: above the challenger's whole range, then a hello to everyone,
			// members included, so whoever followed the challenger comes back.
			if (others().some((m) => connected.has(m.id))) distrusted.add(from);
			top = Math.max(top, heard.max);
			withdraw();
			if (heirId === from || distrusted.has(from)) broadcastRoster();
			for (const id of connected) sayHello(id, true);
			return;
		}
		stepDown(heard.term);
		await guestOnHello(from, msg);
	};
	const admitAs = (id: PeerId, name: string, role: Exclude<Role, 'host'>, color: Color, token: string, claimed?: number) => {
		const tid = tokenId(token);
		tokens.set(tid, { name, role, color });
		tokenOf.set(id, tid);
		knockIds.delete(id);
		// A client id another member already speaks for is not bound: the newcomer's presence is
		// then dropped everywhere, which is safer than letting it speak as someone else.
		const bound = claimed !== undefined && !state.members.some((m) => m.client === claimed) ? { client: claimed } : {};
		set({ members: [...state.members, { id, name, role, color, ...bound }], waiting: state.waiting.filter((w) => w.id !== id) });
		sendControl(id, { t: 'admit', role, color, token, members: state.members });
		broadcastRoster();
		syncWith(id);
	};
	const hostOnKnock = (from: PeerId, name: string, token?: string, claimed?: number) => {
		if (blocked.has(from)) return;
		const tid = token ? tokenId(token) : undefined;
		const member = memberOf(from);
		if (member) {
			// A member re-knocking with its own token: it followed another host for a moment (a challenge
			// we answered) and lost our roster. Confirm its seat again.
			if (token && tid === tokenOf.get(from) && member.role !== 'host') {
				sendControl(from, { t: 'admit', role: member.role, color: member.color, token, members: state.members });
				syncWith(from);
			}
			return;
		}
		const known = tid ? tokens.get(tid) : undefined;
		if (known && token) {
			// A member reconnecting (under a new peer id, or the same one after a blip): same name and
			// role. A token whose member is STILL connected is a replay, not a reconnect — refused, so
			// a copied token cannot evict the real member. It counts against the cap, and its old color
			// is reused only if still free.
			const stale = state.members.find((m) => tokenOf.get(m.id) === tid);
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
		// A token this host does not know yet may be one a regent issued: a handback can let it in.
		if (tid && token) knockIds.set(from, token);
		set({ waiting: [...state.waiting, { id: from, name, at: clock.now() } satisfies Knock] });
	};

	// ── heir: taking over ──────────────────────────────────────────────────
	const clearGrace = () => {
		if (graceTimer !== null) clock.clearTimeout(graceTimer);
		if (pollTimer !== null) clock.clearTimeout(pollTimer);
		graceTimer = pollTimer = null;
	};
	const armGrace = () => {
		if (!heirCred || graceTimer !== null || pollTimer !== null) return;
		graceTimer = clock.setTimeout(() => {
			graceTimer = null;
			pollMembers();
		}, opts.handoffGraceMs ?? HANDOFF_GRACE_MS);
	};
	/** Before taking over, ask the others: if anyone still reaches the host, the cut is ours. */
	const pollMembers = () => {
		if (closed || isHost || hostTrusted || !heirCred || !isLive()) return;
		const asked = others().filter((m) => m.id !== hostId && connected.has(m.id));
		if (asked.length === 0) {
			void promote();
			return;
		}
		pollUp = false;
		for (const m of asked) sendControl(m.id, { t: 'host?' });
		pollTimer = clock.setTimeout(() => {
			pollTimer = null;
			if (pollUp && ++pollRounds < MAX_POLL_ROUNDS) armGrace();
			else void promote();
		}, opts.hostPollMs ?? HOST_POLL_MS);
	};
	const promote = async () => {
		const cred = heirCred;
		if (closed || isHost || !cred || !heirKey || hostTrusted || !isLive()) return;
		// A cert below the floor would be refused by every member: hosting on it strands everyone.
		if (termOf(cred.chain) < minTerm) {
			heirCred = null;
			return;
		}
		const key = await heirKey;
		if (closed || isHost || heirCred !== cred || hostTrusted || !isLive()) return;
		const me = state.me as Member;
		isHost = true;
		signer = key;
		baseChain = cred.chain;
		chain = cred.chain;
		myTerm = termOf(chain);
		myMax = chain[chain.length - 1].max;
		top = myTerm;
		issuedTo.clear();
		tokens.clear();
		for (const [tid, m] of [...cred.tokens, cred.self]) tokens.set(tid, m);
		if (state.token) tokens.delete(tokenId(state.token));
		selfToken = state.token ?? newToken();
		tokenOf.clear();
		blocked.clear();
		for (const b of cred.blocked) blocked.add(b);
		claims.clear();
		heirCred = null;
		clearGrace();
		pollRounds = 0;
		if (pingTimer !== null) clock.clearTimeout(pingTimer);
		pingTimer = null;
		pingsOut.clear();
		hostId = null;
		for (const m of others()) forget(m.id);
		const self: Member = { id: t.selfId, name: me.name, role: 'host', color: me.color, ...(client !== undefined ? { client } : {}) };
		set({ isHost: true, stage: 'live', me: self, members: [self], waiting: [], hostAway: false, token: null, autoAdmit: cred.autoAdmit, linkRole: cred.linkRole, invite: cred.invite, heir: null });
		for (const id of connected) sayHello(id);
	};
	/** The host's link is gone (it dropped, or the host said it moved on). */
	const hostGone = () => {
		hostTrusted = false;
		if (isLive()) {
			set({ hostAway: true });
			armGrace();
		}
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
		const heard = await verifyHostHello(linkFp, msg.key, msg.chain, msg.sig, from, t.selfId);
		if (heard === null) return;
		const term = heard.term;
		// The link the hello came on dropped while we verified: whoever is on that id now may not be
		// the host (checker round 3, finding 2).
		if (closed || isHost || epoch.get(from) !== link || !connected.has(from)) return;
		// SUCCESSION: which host to follow. Never one below the floor (a withdrawn heir), never an
		// older term than the host we have, and a different host only on a strictly higher term while
		// ours is still here (the same term from a new id is our host back from a reload).
		if (term < minTerm || (hostId === from && term < hostTerm)) return;
		if (hostId !== null && hostId !== from) {
			const present = hostTrusted && connected.has(hostId);
			if (present ? term <= hostTerm : term < hostTerm) return;
		}
		if (hostId !== null && hostId !== from) {
			// The host came back under a new id (it reloaded). Its OLD id is nobody now: drop it, or a
			// squatter on it would be a trusted member (checker round 3, finding 1).
			const old = hostId;
			if (memberOf(old)) set({ members: state.members.filter((m) => m.id !== old) });
			forget(old);
		}
		hostId = from;
		hostTrusted = true;
		hostTerm = term;
		minTerm = Math.max(minTerm, term);
		root = msg.key;
		clearGrace();
		pollRounds = 0;
		set({ invite: msg.invite, hostAway: false, minTerm });
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
		} else if (state.stage === 'waiting') sendKnock(pendingName ?? 'Guest');
	};
	const guestOnControl = async (from: PeerId, msg: Control) => {
		if (msg.t === 'hello') return guestOnHello(from, msg);
		if (from !== hostId || !hostTrusted) {
			// Members may ask each other for state, and the heir may ask whether the host is still
			// here; nothing else is accepted from a non-host. `host?` is answered to ANY peer in the
			// room: the host drops an heir whose own link to it broke from every roster, and that heir
			// is exactly the one that must hear "the host is still here" (the answer is one bit).
			if (!isLive() || from === hostId) return;
			if (msg.t === 'host?') sendControl(from, { t: 'host!', up: hostTrusted && hostId !== null && connected.has(hostId) });
			if (!memberOf(from)) return;
			if (msg.t === 'sync') answerSync(from);
			// Only an editor's word counts: a viewer could otherwise hold the handoff off forever.
			else if (msg.t === 'host!' && msg.up && pollTimer !== null && memberOf(from)?.role !== 'view') pollUp = true;
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
				// A regent that stepped down hands the tokens it issued to the host that took over.
				if (handbackDue) {
					sendControl(from, { t: 'handback', tokens: handbackDue });
					handbackDue = null;
				}
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
				minTerm = Math.max(minTerm, msg.term);
				if (msg.heir !== t.selfId || (heirCred && termOf(heirCred.chain) < minTerm)) heirCred = null;
				set({ members: msg.members, me, heir: msg.heir ?? null, minTerm });
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
			case 'heir?': {
				if (!isLive() || state.me?.role !== 'edit') return;
				heirKey ??= createHostKey({ extractable: false });
				const k = await heirKey;
				if (from === hostId && hostTrusted) sendControl(from, { t: 'heir-key', pub: toBase64Url(k.publicRaw) });
				return;
			}
			case 'heir': {
				if (!heirKey || !root || !isLive()) return;
				const k = await heirKey;
				const end = await verifyChain(linkFp, root, msg.chain);
				// The chain must end at OUR key, above the host's own term.
				if (!end || end.pub !== toBase64Url(k.publicRaw) || end.term <= hostTerm || from !== hostId || !hostTrusted) return;
				heirCred = msg;
				return;
			}
			case 'moved':
				// The host heard a later host and stepped down: ask everyone for a hello; the later host answers.
				hostGone();
				for (const id of connected) if (id !== from) sendControl(id, { t: 'hello?' });
				return;
			default:
				return;
		}
	};

	// ── transport wiring ────────────────────────────────────────────────────
	t.onPeerJoin((id) => {
		connected.add(id);
		bump(id);
		// A new link carries none of our tracks: sync sends them again (after the roster logic below).
		queueMicrotask(syncMedia);
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
		queueMicrotask(syncMedia);
		heirPubs.delete(id);
		if (isHost) {
			claims.delete(id);
			knockIds.delete(id);
			if (state.waiting.some((w) => w.id === id)) set({ waiting: state.waiting.filter((w) => w.id !== id) });
			if (memberOf(id)) {
				set({ members: state.members.filter((m) => m.id !== id) });
				broadcastRoster();
			}
		} else if (id === hostId) {
			hostTrusted = false;
			if (isLive()) hostGone();
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
	t.onTrack?.((_track, stream, from) => {
		if (closed) return;
		// Held until (unless) the sender is an admitted member: syncMedia hands it on. A peer that
		// sends again (it re-added its tracks after a roster change) replaces what the app holds.
		if (heard.get(from)?.given) opts.media?.drop(from);
		heard.set(from, { stream, given: false });
		syncMedia();
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
				else if (msg.t === 'roster?' && memberOf(from)) sendControl(from, { t: 'roster', members: state.members, term: myTerm, ...(heirId ? { heir: heirId } : {}) });
				// Session time, not this device's: a host that took over keeps the clock everyone had.
				else if (msg.t === 'ping' && memberOf(from)) sendControl(from, { t: 'pong', n: msg.n, at: clock.now() + clockOffset });
				else if (msg.t === 'heir-key' && memberOf(from)) {
					if (!heirPubs.has(from)) heirPubs.set(from, msg.pub);
					if (from === heirId && !issued) issue(from, heirPubs.get(from) as string);
				} else if (msg.t === 'hello?' && !memberOf(from)) {
					if (clock.now() - (helloAsked.get(from) ?? Number.NEGATIVE_INFINITY) >= 2000) {
						helloAsked.set(from, clock.now());
						sayHello(from);
					}
				} else if (msg.t === 'handback' && memberOf(from) && issuedTo.has(tokenOf.get(from) ?? '')) {
					// Only a member this host once certified: let in the people its regency admitted.
					for (const [tid, m] of msg.tokens) if (!tokens.has(tid)) tokens.set(tid, m);
					for (const w of [...state.waiting]) {
						const tok = knockIds.get(w.id);
						if (tok && tokens.has(tokenId(tok))) {
							set({ waiting: state.waiting.filter((x) => x.id !== w.id) });
							hostOnKnock(w.id, w.name, tok, claims.get(w.id));
						}
					}
					sendHeir();
				} else if (msg.t === 'hello') controlChain = controlChain.then(() => hostOnHello(from, msg)).catch(() => {});
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
	// A host back from a save with a cert still out above its own term (it reloaded while it had an
	// heir): withdraw it before the first hello, or that heir could out-rank it (red team, 2026-10-07).
	if (isHost && top > myTerm) withdraw();

	function shutdown() {
		if (closed) return;
		closed = true;
		if (lobbyTimer !== null) clock.clearTimeout(lobbyTimer);
		if (pingTimer !== null) clock.clearTimeout(pingTimer);
		clearGrace();
		for (const [peer, h] of heard) if (h.given) opts.media?.drop(peer);
		heard.clear();
		sentTo.clear();
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
				sendHeir();
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
			hostOnly(() => {
				set({ autoAdmit: on });
				sendHeir();
			})();
		},
		setLinkRole(role) {
			hostOnly(() => {
				set({ linkRole: role });
				sendHeir();
			})();
		},
		setInvite(invite) {
			hostOnly(() => {
				set({ invite });
				sendHeir();
			})();
		},
		post(data, to) {
			if (closed || ending || !isLive()) return;
			const f = frame(TAG_POST, data);
			if (to !== undefined) {
				if (memberOf(to) && to !== t.selfId) send(to, f);
			} else for (const m of others()) send(m.id, f);
		},
		exportTokens: () => [...tokens.entries()],
		wasHeir: (id) => isHost && issuedTo.has(tokenOf.get(id) ?? ''),
		memberToken: (id) => (isHost ? tokenOf.get(id) : undefined),
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
		succession: () => (isHost && signer && root ? { key: signer, root, fingerprint: linkFp, chain, base: baseChain.length, top, issued: [...issuedTo], selfToken } : null),
		setMedia(stream) {
			localMedia = stream;
			// Every peer gets the new tracks: drop what we sent, then sync sends the new set.
			for (const [peer, sent] of [...sentTo]) {
				if (connected.has(peer)) for (const tr of sent) t.removeTrack?.(tr, peer);
				sentTo.delete(peer);
			}
			syncMedia();
		},
		hasMedia: !!t.addTrack && !!t.onTrack,
		async paths() {
			const all = (await t.paths?.().catch(() => ({}) as Record<PeerId, LinkPath>)) ?? {};
			return Object.fromEntries(Object.entries(all).filter(([id]) => memberOf(id) && id !== t.selfId));
		},
	};
}
