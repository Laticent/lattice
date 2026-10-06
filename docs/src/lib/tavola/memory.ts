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
	join(room: string, secret: string): Transport;
	/** Run every queued delivery, including ones queued while draining. */
	settle(): Promise<void>;
	/** Drop a peer as if its network vanished (no goodbye), for host-away tests. */
	drop(id: PeerId): void;
};

export function createMemoryNetwork(): MemoryNetwork {
	const peers: Peer[] = [];
	const queue: Array<() => void> = [];
	let n = 0;
	const later = (fn: () => void) => queue.push(fn);

	const depart = (p: Peer) => {
		if (p.gone) return;
		p.gone = true;
		for (const q of peers) if (q !== p && !q.gone && q.key === p.key) later(() => q.onLeave(p.id));
	};

	return {
		join(room, secret) {
			const id = `peer${++n}`;
			const key = `${room}\u0000${secret}`;
			const me: Peer = { id, key, onMessage: () => {}, onJoin: () => {}, onLeave: () => {}, gone: false };
			// Peers see each other once both have registered handlers, so announce on the next tick.
			later(() => {
				for (const q of peers) {
					if (q === me || q.gone || q.key !== key) continue;
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
					if (!target) return;
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
			for (let guard = 0; queue.length > 0 && guard < 100_000; guard++) {
				const fn = queue.shift();
				fn?.();
				if (guard % 64 === 0) await Promise.resolve();
			}
		},
		drop(id) {
			const p = peers.find((q) => q.id === id);
			if (p) depart(p);
		},
	};
}
