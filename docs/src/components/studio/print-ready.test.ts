import { describe, expect, it } from 'vitest';
import { whenPrintReady } from './PrintOptionsPanel';

// WHEN THE PRINT DIALOG MAY CAPTURE THE PAGE.
//
// `buildSrcdoc` hides `.lattice` until the FIT agent reveals it, and that reveal now
// waits for the document's faces to settle (lib/core/preview-font-gate.mjs). Printing
// before it prints BLANK PAGES — silently, into a file the author keeps. The old flat
// 450ms beat was written before the gate existed and would have fired first on a cold
// cache or a stalled face; these arms pin the policy that replaced it.
//
// A fake timer queue rather than vitest's: the assertions are about ORDER and DELAY,
// and running the queue by hand makes "did anything run before the gate resolved?" a
// direct question instead of a clock-advance dance.
function harness() {
	const queue: { fn: () => void; ms: number }[] = [];
	const timer = (fn: () => void, ms: number) => {
		queue.push({ fn, ms });
		return queue.length;
	};
	let ran = 0;
	const run = () => {
		ran++;
	};
	return {
		timer,
		run,
		ranCount: () => ran,
		delays: () => queue.map((q) => q.ms),
		/** Fire every queued timer whose delay is <= ms. */
		advance: (ms: number) => {
			for (const q of [...queue]) if (q.ms <= ms) q.fn();
		},
	};
}

/** Two microtask drains — `whenPrintReady` chains one `.then`, so its continuation
 *  lands one turn after the promise we resolve here. */
const drain = () => Promise.resolve().then(() => {}).then(() => {});

describe('whenPrintReady', () => {
	it('with NO gate, keeps the pre-gate 450ms beat', () => {
		const h = harness();
		whenPrintReady(undefined, h.run, h.timer);
		expect(h.delays()).toEqual([450]);
		h.advance(450);
		expect(h.ranCount()).toBe(1);
	});

	it('with a gate, does NOT print before the faces settle', async () => {
		// The regression this file exists for: a 450ms timer firing ahead of a reveal
		// gated on fonts, printing a document whose every element computes to hidden.
		const h = harness();
		let release!: () => void;
		const gate = new Promise<void>((res) => {
			release = res;
		});
		whenPrintReady(gate, h.run, h.timer);
		expect(h.delays(), 'the only timer before the gate resolves is the 3s bound').toEqual([3000]);
		h.advance(450); // nothing at 450 to fire — and nothing may print
		expect(h.ranCount()).toBe(0);

		release();
		await drain();
		expect(h.delays()).toEqual([3000, 120]);
		expect(h.ranCount(), 'still not printed — the post-gate beat has not elapsed').toBe(0);
		h.advance(120);
		expect(h.ranCount()).toBe(1);
	});

	it('prints anyway when the gate never resolves', async () => {
		// The gate races its own backstop so this should not happen — but "should not"
		// is not a reason to leave an author with a spinner and no print dialog.
		const h = harness();
		whenPrintReady(new Promise<void>(() => {}), h.run, h.timer);
		h.advance(3000);
		await drain();
		h.advance(120);
		expect(h.ranCount()).toBe(1);
	});

	it('prints when the gate REJECTS', async () => {
		const h = harness();
		const gate = Promise.reject(new Error('fonts blew up'));
		gate.catch(() => {});
		whenPrintReady(gate, h.run, h.timer);
		await drain();
		h.advance(120);
		expect(h.ranCount()).toBe(1);
	});

	it('prints exactly ONCE when the gate resolves AND the bound fires', async () => {
		// Both paths call the same arming function; without the `fired` latch a slow
		// gate would open the dialog twice.
		const h = harness();
		let release!: () => void;
		const gate = new Promise<void>((res) => {
			release = res;
		});
		whenPrintReady(gate, h.run, h.timer);
		h.advance(3000);
		release();
		await drain();
		h.advance(120);
		expect(h.ranCount()).toBe(1);
	});
});
