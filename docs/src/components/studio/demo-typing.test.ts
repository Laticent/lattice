import { describe, expect, it } from 'vitest';
import { buildTypeOps, type TypingHost } from './demo-typing';

// The typing channel's WIRING — every path that writes the document also follows it.
//
// This tier exists because the desktop `set` path cannot be reached from a real surface: `runner.ts`
// routes four cases through it (an `instant: true` beat, the `still` motion tier, an insert over
// ~1600 chars, the prefix reset) and no shipped tour takes any of them, so driving it end to end
// would mean inventing a tour or a test hook in the shell. The behavior it depends on — that the
// reveal actually scrolls the view — IS verified on the real thing, on two engines
// (docs/e2e/demo-mobile.spec.ts). What is left over is this: does each sink get called, with what,
// and is the follow wired to it. That is a unit question, and it used to have no answer at all — the
// desktop `set` shipped with no follow, and nothing could have caught it.

function spyHost(controlled: boolean) {
	const source: string[] = [];
	const tail: string[] = [];
	let follows = 0;
	const host: TypingHost = {
		controlled,
		setSource: (t) => source.push(t),
		typeTail: (t) => tail.push(t),
		follow: () => {
			follows++;
		},
	};
	return { host, source, tail, follows: () => follows };
}

describe('the controlled channel (a phone, or an editor that has not mounted)', () => {
	it('writes the whole document and follows it, on set AND on append', () => {
		const rec = spyHost(true);
		const ops = buildTypeOps(rec.host);
		ops.set('# One\n');
		ops.append('alpha');
		ops.append(' beta');
		// Every write is the WHOLE value — the prop takes nothing less — and each one is followed.
		expect(rec.source).toEqual(['# One\n', '# One\nalpha', '# One\nalpha beta']);
		expect(rec.follows(), 'a controlled write moves no caret, so an unfollowed one leaves the view behind').toBe(3);
		expect(rec.tail, 'the controlled channel must never reach the native insert — that is the race it exists to avoid').toEqual([]);
	});

	it('a set REPLACES the accumulator rather than adding to it', () => {
		// The defect this pins: if `set` did not reset `acc`, the next append would re-send the old
		// document's head in front of the new one — a garbled slide, on the channel a phone uses for
		// every keystroke.
		const rec = spyHost(true);
		const ops = buildTypeOps(rec.host);
		ops.set('aaa');
		ops.set('b');
		ops.append('c');
		expect(rec.source).toEqual(['aaa', 'b', 'bc']);
	});
});

describe('the native channel (desktop, editor mounted)', () => {
	it('appends natively with no follow — a real insert carries its own reveal', () => {
		const rec = spyHost(false);
		const ops = buildTypeOps(rec.host);
		ops.append('alpha');
		expect(rec.tail).toEqual(['alpha']);
		expect(rec.source, 'a native append must not also write through the React value — that is the drop-characters race').toEqual([]);
		expect(rec.follows()).toBe(0);
	});

	it('but its `set` is a CONTROLLED write, so it follows too', () => {
		// The gap this closes. `set` is not a per-keystroke path on desktop — it carries an instant
		// beat, the `still` tier, an insert over ~1600 chars, or a prefix reset — which is exactly
		// when a whole slide lands in the document at once, and being left at the top matters most.
		// It shipped with no follow because no tour reaches it and no test looked.
		const rec = spyHost(false);
		const ops = buildTypeOps(rec.host);
		ops.set('# A whole slide, at once\n');
		expect(rec.source).toEqual(['# A whole slide, at once\n']);
		expect(rec.follows(), 'the desktop `set` dropped a screenful of text in and left the view at the top').toBe(1);
		expect(rec.tail).toEqual([]);
	});
});
