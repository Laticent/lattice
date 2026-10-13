import { describe, expect, it } from 'vitest';
import { audioStatsFrom, candidateKind, capBitrate, describeCandidate, installPcSpy } from './trystero';

// Trystero's addTrack resolves before the offer and answer, and a browser may have no encodings to
// set until negotiation is done (checker, PR #2594). The cap must land once it settles, not never.

function fakePc(encodingsAtFirst: boolean) {
	const track = { kind: 'audio' } as unknown as MediaStreamTrack;
	const params: { encodings: Array<{ maxBitrate?: number }> } = { encodings: encodingsAtFirst ? [{}] : [] };
	const set: Array<number | undefined> = [];
	const sender = {
		track,
		getParameters: () => ({ encodings: params.encodings.map((e) => ({ ...e })) }),
		setParameters: async (p: { encodings: Array<{ maxBitrate?: number }> }) => {
			params.encodings = p.encodings;
			set.push(p.encodings[0]?.maxBitrate);
		},
	};
	const pc = new EventTarget() as EventTarget & { signalingState: string; connectionState: string; getSenders: () => unknown[] };
	pc.signalingState = 'have-local-offer';
	pc.connectionState = 'new';
	pc.getSenders = () => [sender];
	const settle = () => {
		params.encodings = params.encodings.length ? params.encodings : [{}];
		pc.signalingState = 'stable';
		pc.dispatchEvent(new Event('signalingstatechange'));
	};
	return { pc: pc as unknown as RTCPeerConnection, track, set, settle };
}

describe('capBitrate', () => {
	it('caps at once when the sender already has an encoding (Chromium)', () => {
		const f = fakePc(true);
		capBitrate(f.pc, f.track, 64000);
		expect(f.set).toEqual([64000]);
	});

	it('waits for negotiation to settle when the sender has no encodings yet, then caps once', () => {
		const f = fakePc(false);
		capBitrate(f.pc, f.track, 64000);
		expect(f.set).toEqual([]);
		f.settle();
		expect(f.set).toEqual([64000]);
		// A later renegotiation finds the cap in place and leaves it.
		f.settle();
		expect(f.set).toEqual([64000]);
	});
});

describe('audioStatsFrom', () => {
	const inbound = (o: Record<string, number>) => ({ type: 'inbound-rtp', kind: 'audio', ...o });
	const outbound = (o: Record<string, number>) => ({ type: 'outbound-rtp', kind: 'audio', ...o });

	it('reports the running loss and jitter on a first read, with no rate yet', () => {
		const { stats } = audioStatsFrom([inbound({ bytesReceived: 8000, packetsReceived: 995, packetsLost: 5, jitter: 0.018 })], undefined, 1000);
		expect(stats.lostPct).toBeCloseTo(0.5, 5);
		expect(stats.jitterMs).toBeCloseTo(18, 5);
		expect(stats.inKbps).toBeUndefined();
	});

	it('turns byte and packet totals into rates over the time since the last read', () => {
		const first = audioStatsFrom([inbound({ bytesReceived: 0, packetsReceived: 0, packetsLost: 0 }), outbound({ bytesSent: 0 })], undefined, 0);
		const { stats } = audioStatsFrom([inbound({ bytesReceived: 40_000, packetsReceived: 249, packetsLost: 1, jitter: 0.004 }), outbound({ bytesSent: 40_000 })], first.counters, 5000);
		expect(stats.inKbps).toBeCloseTo(64, 5);
		expect(stats.sendKbps).toBeCloseTo(64, 5);
		expect(stats.lostPct).toBeCloseTo(0.4, 5);
	});

	it('ignores video, and says nothing when the connection carries no audio', () => {
		expect(audioStatsFrom([{ type: 'inbound-rtp', kind: 'video', bytesReceived: 9e6 }], undefined, 0).stats).toEqual({});
	});
});

describe('describeCandidate (a candidate as log text)', () => {
	it('names the kind of address and never shows the address itself', () => {
		expect(describeCandidate({ candidateType: 'host', protocol: 'udp', address: '192.168.1.42' })).toBe('host/udp ipv4');
		expect(describeCandidate({ candidateType: 'srflx', protocol: 'udp', address: '203.0.113.9' })).toBe('srflx/udp ipv4');
		expect(describeCandidate({ candidateType: 'host', protocol: 'udp', address: 'a1b2-c3d4.local' })).toBe('host/udp mdns');
		expect(describeCandidate({ candidateType: 'srflx', protocol: 'udp', address: '2001:db8::1' })).toBe('srflx/udp ipv6');
		expect(describeCandidate({ candidateType: 'srflx', protocol: 'udp' })).toBe('srflx/udp hidden');
		expect(describeCandidate(undefined)).toBe('?');
		expect(describeCandidate({ candidateType: 'srflx', protocol: 'udp', address: '203.0.113.9' })).not.toMatch(/203/);
	});
});

describe('candidateKind (what an ICE candidate line is)', () => {
	it('tells host, mDNS-hidden host, server-reflexive and relay apart', () => {
		expect(candidateKind('candidate:1 1 udp 2113937151 192.168.1.5 55555 typ host generation 0')).toBe('host');
		expect(candidateKind('candidate:2 1 udp 2113937151 a1b2c3d4-e5f6.local 55555 typ host generation 0')).toBe('mdns');
		expect(candidateKind('candidate:3 1 udp 1677729535 203.0.113.9 41000 typ srflx raddr 0.0.0.0 rport 0')).toBe('srflx');
		expect(candidateKind('candidate:4 1 udp 33562623 198.51.100.7 3478 typ relay raddr 0.0.0.0 rport 0')).toBe('relay');
		expect(candidateKind('garbage')).toBe('?');
	});
});

describe('installPcSpy (the one RTCPeerConnection wrapper)', () => {
	/** A stand-in browser: `window.RTCPeerConnection` is a class we can compare by identity. */
	function withFakeWindow<T>(fn: (win: { RTCPeerConnection: unknown }, Native: unknown) => T): T {
		class Native {
			listeners: Record<string, Array<(e?: unknown) => void>> = {};
			addEventListener(t: string, cb: (e?: unknown) => void) {
				(this.listeners[t] ??= []).push(cb);
			}
		}
		const win = { RTCPeerConnection: Native as unknown };
		const g = globalThis as unknown as { window?: unknown };
		const had = g.window;
		g.window = win;
		try {
			return fn(win, Native);
		} finally {
			g.window = had;
		}
	}
	it('reports a new connection to every open transport, and still hands back an instance of the original class', () =>
		withFakeWindow((win, Native) => {
			const a: string[] = [];
			const b: string[] = [];
			const stopA = installPcSpy((p, w) => a.push(`${p} ${w}`));
			const stopB = installPcSpy((p, w) => b.push(`${p} ${w}`));
			const pc = new (win.RTCPeerConnection as new () => object)();
			expect(pc instanceof (Native as new () => object)).toBe(true);
			expect(a).toEqual(['pc1 created']);
			expect(b).toEqual(['pc1 created']);
			stopA();
			stopB();
		}));
	it('puts the original class back whichever order two transports close in', () =>
		withFakeWindow((win, Native) => {
			const stopA = installPcSpy(() => {});
			const stopB = installPcSpy(() => {});
			expect(win.RTCPeerConnection).not.toBe(Native);
			stopA(); // the first to open closes first: the case that leaked a wrapper before
			expect(win.RTCPeerConnection).not.toBe(Native); // B is still open and still being served
			stopB();
			expect(win.RTCPeerConnection).toBe(Native);
		}));
});
