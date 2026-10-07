// Tavola's public types. Tavola knows peers and bytes; the app knows screens.
// See engineering/decisions/2026-10-06-studio-live-collaboration.md §4 and §7.1.

/** A peer's id on the transport. Changes every time a browser joins. */
export type PeerId = string;

/** What a person may do. `host` shared the link; `view` cannot change the document. */
export type Role = 'host' | 'edit' | 'view';

/** One of the four session colors, by admission order. The app maps it to a token. */
export type Color = 1 | 2 | 3 | 4;

/** `client` is the awareness client id the member speaks for, bound by the host from its knock:
 *  presence for any other client id is not theirs to send. */
export type Member = { id: PeerId; name: string; role: Role; color: Color; client?: number };

/**
 * Bytes between browsers. Tavola multiplexes its own channels on top, so a transport only
 * moves opaque `Uint8Array`s. The Trystero adapter (`adapters/trystero.ts`) and the in-memory
 * network (`memory.ts`) both implement it.
 */
export interface Transport {
	readonly selfId: PeerId;
	send(data: Uint8Array, to: PeerId): void;
	onMessage(cb: (data: Uint8Array, from: PeerId) => void): void;
	onPeerJoin(cb: (id: PeerId) => void): void;
	onPeerLeave(cb: (id: PeerId) => void): void;
	leave(): void | Promise<void>;
	/** Optional: the network path each open connection took, for a "how are we connected" readout.
	 *  A transport without real connections (the in-memory one) leaves it out. */
	paths?(): Promise<Record<PeerId, LinkPath>>;
}

/**
 * The ICE candidate pair a connection settled on. `host` is a device's own address (the two are on
 * one network), `srflx` / `prflx` an address a router mapped (a direct connection across networks),
 * `relay` a TURN server in the middle.
 */
export type LinkPath = { local: string; remote: string; protocol: string };

/** What a path means to a person: one network, direct across networks, or through a relay. */
export type LinkKind = 'local' | 'direct' | 'relay';

export function linkKind(p: LinkPath): LinkKind {
	if (p.local === 'relay' || p.remote === 'relay') return 'relay';
	if (p.local === 'host' && p.remote === 'host') return 'local';
	return 'direct';
}

/**
 * A replicated stream the app owns — the document (Yjs updates) or awareness (cursor and
 * presence updates). Tavola never parses these bytes; it only decides who may send and
 * receive them. Yjs stays a dependency of the app, not of Tavola.
 */
export interface Stream {
	/** Everything this side has, as one update a newcomer can apply. */
	encodeAll(): Uint8Array;
	/** Apply bytes that arrived from `from`. */
	applyRemote(update: Uint8Array, from: PeerId): void;
	/** Subscribe to changes made HERE; Tavola forwards them. Returns an unsubscribe. */
	onLocal(cb: (update: Uint8Array) => void): () => void;
	/** A peer left or was removed — drop anything held for it (awareness uses this). */
	forget?(peer: PeerId): void;
}

/** What the host shows a guest in the lobby before admission (§4.2). Nothing else leaks. */
export type Invite = { title: string; hostName: string; slides?: number; theme?: string };

/**
 * Where this browser stands.
 *  - `connecting`  — joined the transport, no host heard yet (guest).
 *  - `lobby`       — the host's hello arrived; the guest can knock.
 *  - `waiting`     — knocked; the host has not answered.
 *  - `live`        — in the session (the host is always live).
 *  - `host-absent` — nobody answered within the lobby timeout.
 *  - `outdated`    — a host answered in another protocol version (a stale tab on one side).
 *  - `denied` / `full` / `removed` / `ended` — terminal for this join. A member whose rejoin is
 *    refused (its seat was taken while its link was down) lands in `denied` / `full` too.
 */
export type Stage = 'connecting' | 'lobby' | 'waiting' | 'live' | 'host-absent' | 'outdated' | 'denied' | 'full' | 'removed' | 'ended';

export type Knock = { id: PeerId; name: string; at: number };

export type SessionState = {
	isHost: boolean;
	stage: Stage;
	selfId: PeerId;
	/** This browser's own member row, once live. */
	me: Member | null;
	/** Everyone admitted, host included, in admission order. */
	members: Member[];
	/** Host only: knocks not yet answered. */
	waiting: Knock[];
	/** Guest only: what the host shared in its hello. */
	invite: Invite | null;
	/** Guest only: the host's connection dropped; members keep editing. */
	hostAway: boolean;
	autoAdmit: boolean;
	linkRole: 'edit' | 'view';
	cap: number;
	/** Guest only: the token that lets this browser rejoin without knocking again. */
	token: string | null;
	/** Who becomes host if the host's link stays down (the host names it in the roster). */
	heir: PeerId | null;
	/** Guest: the lowest host term this browser follows. Persist it with the rejoin token and pass
	 *  it back as `SessionOptions.minTerm` after a reload. */
	minTerm: number;
};

export type Clock = {
	now(): number;
	setTimeout(fn: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
};
