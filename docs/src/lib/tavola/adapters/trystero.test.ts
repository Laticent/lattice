import { describe, expect, it } from 'vitest';
import { capBitrate } from './trystero';

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
