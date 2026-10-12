// The Trystero transport: peers find each other over public Nostr relays (Trystero's default
// strategy) and then talk over WebRTC. The link secret is Trystero's room password, so the
// relays carry only encrypted offers. Measured 2026-10-06 on trystero@0.26.0: 5/5 joins, median
// 973 ms from opening the link to a synced document (the note's §7).
//
// This is the ONE file in Tavola allowed to import a third-party package (checkTavolaBoundary).
// The version is pinned exactly: 0.26 changed the action API, so a minor bump is a code change.

import { joinRoom, selfId } from 'trystero/nostr';
import type { AudioStats, LinkEvent, LinkPath, Transport } from '../types.js';

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
	/** Asked each time a connection could be recovered: restart its ICE when it goes `disconnected`, when the
	 *  browser comes back online, and when the tab returns to the foreground, instead of waiting for Trystero
	 *  to close it (it does after 5 s `disconnected`) and rediscover the peer over the relays. Off unless this
	 *  returns true. Experimental: first tried on a phone hotspot (2026-10-12). */
	recover?: () => boolean;
};

/** How long a connection may stay `disconnected` before this asks it to restart (a blip heals itself first). */
export const RECOVER_AFTER_MS = 1000;
const TIMELINE_MAX = 300;

/**
 * Who restarts a connection's ICE: the side with the smaller id, so two sides never offer at once. Either side's
 * restart renegotiates both sides' candidates. Pure, exported for its test.
 */
/** How often a connected link's round-trip time is sampled into the timeline. */
export const SAMPLE_EVERY_MS = 10_000;

/** One candidate as text: its type, protocol and an address with the last octet hidden (`hidden` when the browser hides it, `mdns` for a .local name). Pure, exported for its test. */
export function describeCandidate(c: Record<string, string | number | boolean | undefined> | undefined): string {
	if (!c) return '?';
	const addr = String(c.address ?? c.ip ?? '');
	const shown = !addr ? 'hidden' : addr.endsWith('.local') ? 'mdns' : addr.includes(':') ? 'ipv6' : addr.replace(/\.\d+$/, '.x');
	return `${c.candidateType ?? '?'}/${c.protocol ?? '?'} ${shown}`;
}

/** What kind of candidate an ICE candidate line is: `host` (and `mdns` when its address is a hidden .local name), `srflx`, `relay` or `prflx`. Pure, exported for its test. */
export function candidateKind(line: string): string {
	const typ = /\btyp (\w+)/.exec(line)?.[1] ?? '?';
	return typ === 'host' && /\.local\b/.test(line) ? 'mdns' : typ;
}

/**
 * Record every RTCPeerConnection made while a transport is open, from creation: the connections that NEVER open are
 * exactly the ones the peer-join log cannot see ("Nobody answered"). Per connection it notes each ICE state change, how
 * many candidates of each kind it gathered, and any STUN/TURN error. Logging only: it hands the browser the real
 * connection object. Returns the function that puts the original constructor back.
 */
function spyPeerConnections(note: (peer: string, what: string) => void): () => void {
	const Native = typeof window !== 'undefined' ? window.RTCPeerConnection : undefined;
	if (!Native) return () => {};
	let n = 0;
	// biome-ignore lint/complexity/useArrowFunction: it is called with `new`, which an arrow cannot be.
	const Spy = function (this: unknown, ...args: ConstructorParameters<typeof RTCPeerConnection>) {
		const pc = new Native(...args);
		const label = `pc${++n}`;
		const gathered: Record<string, number> = {};
		const t0 = Date.now();
		note(label, 'created');
		pc.addEventListener('icecandidate', (e) => {
			if (!e.candidate) return;
			const k = candidateKind(e.candidate.candidate);
			gathered[k] = (gathered[k] ?? 0) + 1;
		});
		pc.addEventListener('icegatheringstatechange', () => {
			if (pc.iceGatheringState === 'complete') note(label, `gathered ${Object.entries(gathered).map(([k, v]) => `${k}×${v}`).join(' ') || 'nothing'} in ${Date.now() - t0} ms`);
		});
		pc.addEventListener('icecandidateerror', (e) => {
			const ev = e as RTCPeerConnectionIceErrorEvent;
			note(label, `ICE server error ${ev.errorCode} ${String(ev.url ?? '').slice(0, 40)} ${String(ev.errorText ?? '').slice(0, 60)}`.trim());
		});
		pc.addEventListener('iceconnectionstatechange', () => note(label, `ice ${pc.iceConnectionState} after ${Date.now() - t0} ms`));
		return pc;
	} as unknown as typeof RTCPeerConnection;
	Spy.prototype = Native.prototype;
	Object.setPrototypeOf(Spy, Native);
	window.RTCPeerConnection = Spy;
	return () => {
		if (window.RTCPeerConnection === Spy) window.RTCPeerConnection = Native;
	};
}

export const restartsIce = (selfId: string, peerId: string): boolean => selfId < peerId;

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

/** The counters `audioStatsFrom` carries from one read to the next, to turn totals into rates. */
export type AudioCounters = { at: number; bytesIn: number; bytesOut: number; packetsIn: number; packetsLost: number };
type Rtp = Record<string, number | string | undefined>;

/**
 * Turn one `getStats()` read into call-audio numbers. Rates and loss cover the time since `prev`
 * (the last read of this connection), so a bad minute shows now rather than averaged into a good
 * hour; with no `prev` loss is the running total and rates are absent. Pure, exported for its test.
 */
export function audioStatsFrom(reports: Iterable<Rtp>, prev: AudioCounters | undefined, now: number): { stats: AudioStats; counters: AudioCounters } {
	let inbound: Rtp | undefined;
	let outbound: Rtp | undefined;
	for (const r of reports) {
		if (r.kind !== 'audio' && r.mediaType !== 'audio') continue;
		if (r.type === 'inbound-rtp') inbound = r;
		else if (r.type === 'outbound-rtp') outbound = r;
	}
	const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
	const counters: AudioCounters = { at: now, bytesIn: num(inbound?.bytesReceived), bytesOut: num(outbound?.bytesSent), packetsIn: num(inbound?.packetsReceived), packetsLost: num(inbound?.packetsLost) };
	const stats: AudioStats = {};
	const secs = prev ? (now - prev.at) / 1000 : 0;
	if (inbound) {
		const got = counters.packetsIn - (prev?.packetsIn ?? 0);
		const lost = Math.max(0, counters.packetsLost - (prev?.packetsLost ?? 0));
		if (got + lost > 0) stats.lostPct = (lost / (got + lost)) * 100;
		if (typeof inbound.jitter === 'number') stats.jitterMs = inbound.jitter * 1000;
		if (secs > 0) stats.inKbps = ((counters.bytesIn - (prev as AudioCounters).bytesIn) * 8) / secs / 1000;
	}
	if (outbound && secs > 0) stats.sendKbps = ((counters.bytesOut - (prev as AudioCounters).bytesOut) * 8) / secs / 1000;
	return { stats, counters };
}

export function trysteroTransport(room: string, secret: string, opts: TrysteroOptions = {}): Transport {
	const r = joinRoom({ appId: opts.appId ?? TAVOLA_APP_ID, password: secret, ...(opts.relayUrls ? { relayUrls: opts.relayUrls } : {}), ...(opts.rtcConfig ? { rtcConfig: opts.rtcConfig } : {}), ...(opts.turnConfig?.length ? { turnConfig: opts.turnConfig } : {}) }, room);
	const counters = new Map<string, AudioCounters>();
	const wire = r.makeAction<Uint8Array>('tavola');
	const started = Date.now();
	const events: LinkEvent[] = [];
	const note = (peer: string, what: string) => {
		events.push({ at: Date.now() - started, peer: peer.slice(0, 6), what });
		if (events.length > TIMELINE_MAX) events.shift();
	};
	/** Sample each connected link's round-trip time, so a slow stretch shows in the log as numbers. */
	const sample = async () => {
		for (const [id, pc] of Object.entries(r.getPeers())) {
			if (pc.connectionState !== 'connected') continue;
			try {
				const stats = [...(await pc.getStats()).values()] as Array<Record<string, string | number | boolean | undefined>>;
				const pair = stats.find((s) => s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated);
				if (!pair) continue;
				const rtt = typeof pair.currentRoundTripTime === 'number' ? `${Math.round(pair.currentRoundTripTime * 1000)} ms` : '?';
				const loc = stats.find((s) => s.id === pair.localCandidateId);
				const rem = stats.find((s) => s.id === pair.remoteCandidateId);
				note(id, `sample rtt ${rtt} · ${loc?.candidateType ?? '?'}→${rem?.candidateType ?? '?'}`);
			} catch {}
		}
	};
	const sampler = typeof setInterval === 'function' ? setInterval(() => void sample(), SAMPLE_EVERY_MS) : null;
	const unspy = spyPeerConnections(note);
	const watched = new Set<string>();
	const timers = new Map<string, ReturnType<typeof setTimeout>>();
	/** Ask one connection to restart its ICE, if recovery is on and this side is the one that offers. A
	 *  connection that reads `connected` is left alone unless `healthyToo` (the network itself changed). */
	const kick = (id: string, why: string, healthyToo = false) => {
		const pc = r.getPeers()[id] as RTCPeerConnection | undefined;
		if (!pc || pc.connectionState === 'closed' || (!healthyToo && pc.connectionState === 'connected') || typeof pc.restartIce !== 'function') return;
		if (!opts.recover?.()) return note(id, `${why}: recovery off`);
		if (!restartsIce(selfId, id)) return note(id, `${why}: the other side restarts`);
		note(id, `${why}: restart ICE`);
		pc.restartIce();
	};
	const watch = (id: string) => {
		const pc = r.getPeers()[id] as RTCPeerConnection | undefined;
		if (!pc || watched.has(id)) return;
		watched.add(id);
		note(id, `link up (${pc.connectionState}, ice ${pc.iceConnectionState})`);
		let last = '';
		const onState = () => {
			const s = `${pc.connectionState}/${pc.iceConnectionState}`;
			if (s === last) return;
			last = s;
			note(id, `state ${s}`);
			const t = timers.get(id);
			if (t) clearTimeout(t);
			if (pc.connectionState === 'disconnected' || pc.iceConnectionState === 'disconnected') {
				timers.set(id, setTimeout(() => kick(id, `still disconnected after ${RECOVER_AFTER_MS} ms`), RECOVER_AFTER_MS));
			} else if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
				watched.delete(id);
			}
		};
		pc.addEventListener('connectionstatechange', onState);
		pc.addEventListener('iceconnectionstatechange', onState);
	};
	const kickAll = (why: string, healthyToo = false) => {
		for (const id of Object.keys(r.getPeers())) kick(id, why, healthyToo);
	};
	// The network changed (a hotspot reconnecting, wifi to cellular), or the tab came back from the background.
	const onOnline = () => {
		note('-', 'browser online');
		// The network changed under every link: even one that still reads `connected` may hold a dead address.
		setTimeout(() => kickAll('online', true), 500);
		setTimeout(() => kickAll('online (retry)'), 3500);
	};
	const onVisible = () => {
		if (document.visibilityState !== 'visible') return;
		note('-', 'tab visible');
		kickAll('tab visible');
	};
	const onOffline = () => note('-', 'browser offline');
	if (typeof window !== 'undefined') {
		window.addEventListener('online', onOnline);
		window.addEventListener('offline', onOffline);
		document.addEventListener('visibilitychange', onVisible);
	}
	return {
		selfId,
		send(data, to) {
			void wire.send(data, { target: to }).catch(() => {});
		},
		onMessage(cb) {
			wire.onMessage = (data, ctx) => cb(data instanceof Uint8Array ? data : new Uint8Array(data as unknown as ArrayBuffer), ctx.peerId);
		},
		onPeerJoin(cb) {
			r.onPeerJoin = (id) => {
				note(id, 'joined');
				watch(id);
				cb(id);
			};
		},
		onPeerLeave(cb) {
			r.onPeerLeave = (id) => {
				note(id, 'left');
				watched.delete(id);
				const t = timers.get(id);
				if (t) clearTimeout(t);
				cb(id);
			};
		},
		timeline: () => events.slice(),
		async pairs() {
			const out: string[] = [];
			for (const [id, pc] of Object.entries(r.getPeers())) {
				const stats = [...(await pc.getStats()).values()] as Array<Record<string, string | number | boolean | undefined>>;
				const byId = new Map(stats.map((s) => [String(s.id), s]));
				for (const p of stats.filter((s) => s.type === 'candidate-pair')) {
					const rtt = typeof p.currentRoundTripTime === 'number' ? ` rtt ${Math.round(p.currentRoundTripTime * 1000)} ms` : '';
					out.push(`${id.slice(0, 6)}  ${String(p.state).padEnd(11)}${p.nominated ? ' nominated' : '          '}  ${describeCandidate(byId.get(String(p.localCandidateId)))} → ${describeCandidate(byId.get(String(p.remoteCandidateId)))}${rtt}`);
				}
			}
			return out;
		},
		leave() {
			if (typeof window !== 'undefined') {
				window.removeEventListener('online', onOnline);
				window.removeEventListener('offline', onOffline);
				document.removeEventListener('visibilitychange', onVisible);
			}
			for (const t of timers.values()) clearTimeout(t);
			timers.clear();
			if (sampler) clearInterval(sampler);
			unspy();
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
		async audioStats() {
			const out: Record<string, AudioStats> = {};
			for (const [id, pc] of Object.entries(r.getPeers())) {
				if (pc.connectionState !== 'connected') continue;
				const { stats, counters: next } = audioStatsFrom((await pc.getStats()).values() as Iterable<Rtp>, counters.get(id), Date.now());
				counters.set(id, next);
				out[id] = stats;
			}
			for (const id of counters.keys()) if (!(id in out)) counters.delete(id);
			return out;
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
