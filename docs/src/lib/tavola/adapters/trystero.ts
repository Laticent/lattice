// The Trystero transport: peers find each other over public Nostr relays (Trystero's default
// strategy) and then talk over WebRTC. The link secret is Trystero's room password, so the
// relays carry only encrypted offers. Measured 2026-10-06 on trystero@0.26.0: 5/5 joins, median
// 973 ms from opening the link to a synced document (the note's §7).
//
// This is the ONE file in Tavola allowed to import a third-party package (checkTavolaBoundary).
// The version is pinned exactly: 0.26 changed the action API, so a minor bump is a code change.

import { joinRoom, selfId } from 'trystero/nostr';
import type { LinkPath, Transport } from '../types.js';

/** Namespaces every Tavola room on the relays, so it never meets another app's room. */
export const TAVOLA_APP_ID = 'laticent-tavola-v1';

export type TrysteroOptions = {
	appId?: string;
	/** Override the relay list (tests, or a self-hosted relay). */
	relayUrls?: string[];
	rtcConfig?: RTCConfiguration;
	/** TURN servers, added after Trystero's public STUN servers (an `rtcConfig.iceServers` would
	 *  replace those instead). Empty by default: the Studio's slot is `live-ice.ts`. */
	turnConfig?: Array<{ urls: string | string[]; username?: string; credential?: string }>;
};

/** Cap the bitrate `track` is sent at on `pc` (best-effort: a browser that refuses keeps its default). */
/**
 * Cap the bitrate `track` is sent at on `pc` (best-effort: a browser that refuses keeps its default).
 * Trystero's addTrack resolves straight after `pc.addTrack`, before the offer and answer, and a
 * browser may have no encodings to set until negotiation is done. So: try now, and if the sender
 * is not capped yet, try again each time negotiation settles (`stable`), until it is or the
 * connection closes. Exported for its test.
 */
export function capBitrate(pc: RTCPeerConnection | undefined, track: MediaStreamTrack, maxBitrate: number): void {
	if (!pc) return;
	const apply = (): boolean => {
		const sender = pc.getSenders().find((s) => s.track === track);
		if (!sender) return true; // the track was taken back meanwhile: nothing left to cap
		const params = sender.getParameters();
		if (!params.encodings?.length) return false;
		if (params.encodings[0].maxBitrate === maxBitrate) return true;
		params.encodings[0].maxBitrate = maxBitrate;
		sender.setParameters(params).catch(() => {});
		return true;
	};
	if (apply()) return;
	const retry = () => {
		const done = pc.connectionState === 'closed' || (pc.signalingState === 'stable' && apply());
		if (done) pc.removeEventListener('signalingstatechange', retry);
	};
	pc.addEventListener('signalingstatechange', retry);
}

export function trysteroTransport(room: string, secret: string, opts: TrysteroOptions = {}): Transport {
	const r = joinRoom({ appId: opts.appId ?? TAVOLA_APP_ID, password: secret, ...(opts.relayUrls ? { relayUrls: opts.relayUrls } : {}), ...(opts.rtcConfig ? { rtcConfig: opts.rtcConfig } : {}), ...(opts.turnConfig?.length ? { turnConfig: opts.turnConfig } : {}) }, room);
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
		addTrack(track, stream, to, opts) {
			const sent = r.addTrack(track, stream, { target: to });
			for (const p of sent) void p.catch(() => {});
			// The sender exists once these settle; capBitrate waits out negotiation if it has to.
			if (opts?.maxBitrate) void Promise.allSettled(sent).then(() => capBitrate(r.getPeers()[to], track, opts.maxBitrate as number));
		},
		removeTrack(track, to) {
			try {
				r.removeTrack(track, { target: to });
			} catch {}
		},
		onTrack(cb) {
			r.onPeerTrack = (track, stream, peerId) => cb(track, stream, peerId);
		},
		async paths() {
			const out: Record<string, LinkPath> = {};
			for (const [id, pc] of Object.entries(r.getPeers())) {
				if (pc.connectionState !== 'connected') continue;
				const stats = [...(await pc.getStats()).values()] as Array<Record<string, string | boolean | undefined>>;
				const pair = stats.find((s) => s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated);
				if (!pair) continue;
				const local = stats.find((s) => s.id === pair.localCandidateId);
				const remote = stats.find((s) => s.id === pair.remoteCandidateId);
				out[id] = { local: String(local?.candidateType ?? '?'), remote: String(remote?.candidateType ?? '?'), protocol: String(local?.protocol ?? '?') };
			}
			return out;
		},
	};
}
