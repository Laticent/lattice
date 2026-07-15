import { describe, expect, it, vi } from 'vitest';
import { createFrameScheduler } from './frame-scheduler';

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('createFrameScheduler', () => {
	it('renders once on the next frame, coalescing a burst into a single render', async () => {
		const render = vi.fn(async () => ({ heavy: false }));
		const s = createFrameScheduler({ render });

		// A burst of edits in one frame.
		s.schedule();
		s.schedule();
		s.schedule();
		// Synchronously, before the frame fires: nothing rendered yet.
		expect(render).toHaveBeenCalledTimes(0);
		// Next frame: exactly ONE render.
		await tick(40);
		expect(render).toHaveBeenCalledTimes(1);
	});

	it('applies backpressure — a schedule mid-render does not overlap; it renders once the in-flight one settles', async () => {
		let release: () => void = () => {};
		const render = vi.fn(
			() =>
				new Promise<{ heavy: boolean }>((res) => {
					release = () => res({ heavy: false });
				}),
		);
		const s = createFrameScheduler({ render });

		s.schedule();
		await tick(40); // first render starts, hangs
		expect(render).toHaveBeenCalledTimes(1);

		s.schedule(); // arrives mid-render
		await tick(40);
		expect(render).toHaveBeenCalledTimes(1); // must NOT overlap

		release(); // in-flight render settles → pending change paints
		await tick(40);
		expect(render).toHaveBeenCalledTimes(2);
	});

	it('adaptive: after a HEAVY render the next schedule coalesces on the timer, not the next frame', async () => {
		const render = vi.fn(async () => ({ heavy: true }));
		const s = createFrameScheduler({ render, heavyCoalesceMs: 80 });

		s.schedule();
		await tick(40); // first render (rAF), reports heavy
		expect(render).toHaveBeenCalledTimes(1);

		s.schedule();
		await tick(40); // a frame has passed — a NON-heavy host would have rendered by now
		expect(render).toHaveBeenCalledTimes(1); // still coalescing on the 80ms timer
		await tick(70);
		expect(render).toHaveBeenCalledTimes(2); // fired after the coalesce window
	});

	it('cancel() drops a pending frame', async () => {
		const render = vi.fn(async () => ({ heavy: false }));
		const s = createFrameScheduler({ render });
		s.schedule();
		s.cancel();
		await tick(40);
		expect(render).toHaveBeenCalledTimes(0);
	});

	it('a rejected render clears the guard so later edits still render', async () => {
		let fail = true;
		const render = vi.fn(async () => {
			if (fail) throw new Error('boom');
			return { heavy: false };
		});
		const s = createFrameScheduler({ render });
		s.schedule();
		await tick(40);
		expect(render).toHaveBeenCalledTimes(1); // rejected
		fail = false;
		s.schedule();
		await tick(40);
		expect(render).toHaveBeenCalledTimes(2); // guard cleared, renders again
	});
});
