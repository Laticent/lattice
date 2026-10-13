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
};

const TIMELINE_MAX = 300;
/** Samples keep their own ring, so a long session's samples never push out the first connection attempt. */
const SAMPLES_MAX = 60;
/** How often a connected link's round-trip time is sampled into the timeline. */
export const SAMPLE_EVERY_MS = 10_000;

/**
 * One candidate as text: its type, protocol and which kind of address it has (`ipv4`, `ipv6`, `mdns` for a hidden
 * .local name, or `hidden`), and NEVER the address itself: the log is pasted into bug reports, and a public address
 * (a server-reflexive candidate is one) names an ISP and a city. Pure, exported for its test.
 */
export function describeCandidate(c: Record<string, string | number | boolean | undefined> | undefined): string {
	if (!c) return '?';
	const addr = String(c.address ?? c.ip ?? '');
	const family = !addr ? 'hidden' : addr.endsWith('.local') ? 'mdns' : addr.includes(':') ? 'ipv6' : 'ipv4';
	return `${c.candidateType ?? '?'}/${c.protocol ?? '?'} ${family}`;
}

/** What kind of candidate an ICE candidate line is: `host` (and `mdns` when its address is a hidden .local name), `srflx`, `relay` or `prflx`. Pure, exported for its test. */
export function candidateKind(line: string): string {
	const typ = /\btyp (\w+)/.exec(line)?.[1] ?? '?';
	return typ === 'host' && /\.local\b/.test(line) ? 'mdns' : typ;
}

type Note = (peer: string, what: string) => void;

/**
 * Wrap `window.RTCPeerConnection` so every connection made from now on reports to `note`, from creation: the
 * connections that NEVER open are exactly the ones the peer-join log cannot see ("Nobody answered"). Logging only: it
 * hands the browser the real connection object. Returns the function that puts the original constructor back.
 */
function wrapPeerConnection(note: Note): () => void {
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

/** Every open transport's `note`. ONE wrapper serves them all, so two transports closing in either order cannot leave a stale wrapper behind. */
const spyNotes = new Set<Note>();
let spyRestore: (() => void) | null = null;

/** Start reporting every new RTCPeerConnection to `note`; returns the function that stops. Exported for its test. */
export function installPcSpy(note: Note): () => void {
	spyNotes.add(note);
	if (!spyRestore) {
		spyRestore = wrapPeerConnection((peer, what) => {
			for (const n of spyNotes) n(peer, what);
		});
	}
	return () => {
		spyNotes.delete(note);
		if (spyNotes.size === 0 && spyRestore) {
			spyRestore();
			spyRestore = null;
		}
	};
}

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
	const samples: LinkEvent[] = [];
	const stamp = (peer: string, what: string): LinkEvent => ({ at: Date.now() - started, peer: peer.slice(0, 6), what });
	const note = (peer: string, what: string) => {
		events.push(stamp(peer, what));
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
				samples.push(stamp(id, `sample rtt ${rtt} · ${loc?.candidateType ?? '?'}→${rem?.candidateType ?? '?'}`));
				if (samples.length > SAMPLES_MAX) samples.shift();
			} catch {}
		}
	};
	const sampler = typeof setInterval === 'function' ? setInterval(() => void sample(), SAMPLE_EVERY_MS) : null;
	const unspy = installPcSpy(note);
	const onOnline = () => note('-', 'browser online');
	const onOffline = () => note('-', 'browser offline');
	const onVisible = () => {
		if (document.visibilityState === 'visible') note('-', 'tab visible');
	};
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
				cb(id);
			};
		},
		onPeerLeave(cb) {
			r.onPeerLeave = (id) => {
				note(id, 'left');
				cb(id);
			};
		},
		timeline: () => [...events, ...samples].sort((a, b) => a.at - b.at),
		async pairs() {
			const out: string[] = [];
			for (const [id, pc] of Object.entries(r.getPeers())) {
				try {
					const stats = [...(await pc.getStats()).values()] as Array<Record<string, string | number | boolean | undefined>>;
					const byId = new Map(stats.map((s) => [String(s.id), s]));
					for (const p of stats.filter((s) => s.type === 'candidate-pair')) {
						const rtt = typeof p.currentRoundTripTime === 'number' ? ` rtt ${Math.round(p.currentRoundTripTime * 1000)} ms` : '';
						out.push(`${id.slice(0, 6)}  ${String(p.state).padEnd(11)}${p.nominated ? ' nominated' : '          '}  ${describeCandidate(byId.get(String(p.localCandidateId)))} → ${describeCandidate(byId.get(String(p.remoteCandidateId)))}${rtt}`);
					}
				} catch {}
			}
			return out;
		},
		leave() {
			if (typeof window !== 'undefined') {
				window.removeEventListener('online', onOnline);
				window.removeEventListener('offline', onOffline);
				document.removeEventListener('visibilitychange', onVisible);
			}
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
