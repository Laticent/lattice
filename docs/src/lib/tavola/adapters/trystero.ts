// The Trystero transport: peers find each other over public Nostr relays (Trystero's default
// strategy) and then talk over WebRTC. The link secret is Trystero's room password, so the
// relays carry only encrypted offers. Measured 2026-10-06 on trystero@0.26.0: 5/5 joins, median
// 973 ms from opening the link to a synced document (the note's §7).
//
// This is the ONE file in Tavola allowed to import a third-party package (checkTavolaBoundary).
// The version is pinned exactly: 0.26 changed the action API, so a minor bump is a code change.

import { joinRoom, selfId } from 'trystero/nostr';
import type { Transport } from '../types';

/** Namespaces every Tavola room on the relays, so it never meets another app's room. */
export const TAVOLA_APP_ID = 'laticent-tavola-v1';

export type TrysteroOptions = {
	appId?: string;
	/** Override the relay list (tests, or a self-hosted relay). */
	relayUrls?: string[];
	rtcConfig?: RTCConfiguration;
};

export function trysteroTransport(room: string, secret: string, opts: TrysteroOptions = {}): Transport {
	const r = joinRoom({ appId: opts.appId ?? TAVOLA_APP_ID, password: secret, ...(opts.relayUrls ? { relayUrls: opts.relayUrls } : {}), ...(opts.rtcConfig ? { rtcConfig: opts.rtcConfig } : {}) }, room);
	const wire = r.makeAction<Uint8Array>('tavola');
	return {
		selfId,
		send(data, to) {
			void wire.send(data, { target: to }).catch(() => {});
		},
		onMessage(cb) {
			wire.onMessage = (data, ctx) => cb(data instanceof Uint8Array ? data : new Uint8Array(data as unknown as ArrayBuffer), ctx.peerId);
		},
		onPeerJoin(cb) {
			r.onPeerJoin = cb;
		},
		onPeerLeave(cb) {
			r.onPeerLeave = cb;
		},
		leave() {
			return r.leave();
		},
	};
}
