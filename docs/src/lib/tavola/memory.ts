// An in-memory network: every Transport joined to the same room (and secret) on one network
// can reach the others. Delivery is queued, not synchronous, so tests see the same ordering
// hazards a real network has; `settle()` drains the queue. Used by Tavola's tests and by any
// app that wants a session without a network (a demo, a tour).

import type { PeerId, Transport } from './types';

type Peer = {
	id: PeerId;
	key: string;
	onMessage: (data: Uint8Array, from: PeerId) => void;
	onJoin: (id: PeerId) => void;
	onLeave: (id: PeerId) => void;
	gone: boolean;
};

export type MemoryNetwork = {
	/** `id` reuses a peer id whose owner is gone — what a link holder can do on a real transport,
	 *  where ids are self-declared (the squat tests). */
	join(room: string, secret: string, id?: PeerId): Transport;
	/** Run every queued delivery, including ones queued while draining. */
	settle(): Promise<void>;
	/** Deliveries still queued. */
	pending(): number;
	/** Drop a peer as if its network vanished (no goodbye), for host-away tests. */
	drop(id: PeerId): void;
	/** Break the direct link between two peers (each sees the other leave) until `heal`. */
	cut(a: PeerId, b: PeerId): void;
	/** Restore a cut link: each sees the other join again, under the SAME ids (a network blip). */
	heal(a: PeerId, b: PeerId): void;
};

export function createMemoryNetwork(): MemoryNetwork {
	const peers: Peer[] = [];
	const cuts = new Set<string>();
	const pair = (a: PeerId, b: PeerId) => (a < b ? `${a}|${b}` : `${b}|${a}`);
	const linked = (a: Peer, b: Peer) => !cuts.has(pair(a.id, b.id));
	const queue: Array<() => void> = [];
	let n = 0;
	const later = (fn: () => void) => queue.push(fn);

	const depart = (p: Peer) => {
		if (p.gone) return;
		p.gone = true;
		for (const q of peers) if (q !== p && !q.gone && q.key === p.key) later(() => q.onLeave(p.id));
	};

	return {
		join(room, secret, reuse) {
			if (reuse !== undefined && peers.some((q) => q.id === reuse && !q.gone)) throw new Error(`memory: ${reuse} is still connected`);
			const id = reuse ?? `peer${++n}`;
			const key = `${room}\u0000${secret}`;
			const me: Peer = { id, key, onMessage: () => {}, onJoin: () => {}, onLeave: () => {}, gone: false };
			// Peers see each other once both have registered handlers, so announce on the next tick.
			later(() => {
				for (const q of peers) {
					if (q === me || q.gone || q.key !== key || !linked(q, me)) continue;
					q.onJoin(me.id);
					me.onJoin(q.id);
				}
			});
			peers.push(me);
			return {
				selfId: id,
				send(data, to) {
					if (me.gone) return;
					const target = peers.find((q) => q.id === to && !q.gone && q.key === key);
					if (!target || !linked(me, target)) return;
					const copy = data.slice();
					later(() => {
						if (!target.gone && !me.gone) target.onMessage(copy, me.id);
					});
				},
				onMessage(cb) {
					me.onMessage = cb;
				},
				onPeerJoin(cb) {
					me.onJoin = cb;
				},
				onPeerLeave(cb) {
					me.onLeave = cb;
				},
				leave() {
					depart(me);
				},
			};
		},
		async settle() {
			// Drain, then give the platform a few turns: signing and verifying a hello are WebCrypto
			// promises that resolve off the microtask queue, and they queue more deliveries when done.
			for (let idle = 0, guard = 0; idle < 3 && guard < 100_000; guard++) {
				if (queue.length > 0) {
					idle = 0;
					const fn = queue.shift();
					fn?.();
					if (guard % 64 === 0) await Promise.resolve();
				} else {
					idle++;
					await new Promise((r) => setTimeout(r, 2));
				}
			}
		},
		pending: () => queue.length,
		drop(id) {
			const p = peers.find((q) => q.id === id);
			if (p) depart(p);
		},
		cut(a, b) {
			const pa = peers.find((q) => q.id === a);
			const pb = peers.find((q) => q.id === b);
			if (!pa || !pb || cuts.has(pair(a, b))) return;
			cuts.add(pair(a, b));
			later(() => {
				pa.onLeave(b);
				pb.onLeave(a);
			});
		},
		heal(a, b) {
			const pa = peers.find((q) => q.id === a);
			const pb = peers.find((q) => q.id === b);
			if (!pa || !pb || !cuts.delete(pair(a, b))) return;
			later(() => {
				if (pa.gone || pb.gone) return;
				pa.onJoin(b);
				pb.onJoin(a);
			});
		},
	};
}
