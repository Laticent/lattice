import { describe, expect, it } from 'vitest';
import { audioStatsFrom, capBitrate, RECOVER_AFTER_MS, restartsIce } from './trystero';

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

describe('restartsIce (who offers an ICE restart)', () => {
	it('exactly one of two peers restarts, whichever way round they are asked', () => {
		for (const [a, b] of [['aaa', 'bbb'], ['zzz', 'aaa'], ['Q1', 'q1']]) expect(restartsIce(a, b) !== restartsIce(b, a)).toBe(true);
	});
	it('nobody restarts a connection to itself, and the blip allowance stays under Trystero\'s 5 s close', () => {
		expect(restartsIce('same', 'same')).toBe(false);
		expect(RECOVER_AFTER_MS).toBeLessThan(5000);
	});
});
