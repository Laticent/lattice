// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the engine: the adapter's job is WIRING (single-flight start, active state, root
// injection, onStop reset, unmount teardown), not the run itself (which the unit tier + the
// Studio e2e cover). A fake handle lets us drive the terminal path deterministically.
const runMock = vi.fn();
vi.mock('./index', () => ({ run: (opts: unknown) => runMock(opts) }));

import { useLazyWalkthrough, useWalkthrough } from './react';

type FakeHandle = { active: boolean; stop: () => void };
/** Wire runMock to return a controllable handle and capture the merged onStop. */
function primeRun(): { handle: FakeHandle; fireStop: (reason?: string) => void; opts: () => Record<string, unknown> } {
	let captured: Record<string, unknown> = {};
	const handle: FakeHandle = {
		active: true,
		stop: vi.fn(() => {
			handle.active = false;
		}),
	};
	runMock.mockImplementation((opts: Record<string, unknown>) => {
		captured = opts;
		return handle;
	});
	return {
		handle,
		fireStop: (reason = 'complete') => (captured.onStop as (r: string) => void)?.(reason),
		opts: () => captured,
	};
}

afterEach(() => {
	runMock.mockReset();
});

describe('useWalkthrough — the React lifecycle adapter', () => {
	const rootRef = () => ({ current: document.createElement('div') });

	it('start() runs with the ref root + a config, and flips active true', () => {
		primeRun();
		const configure = vi.fn(() => ({ actions: {}, play: async () => {} }));
		const ref = rootRef();
		const { result } = renderHook(() => useWalkthrough(ref, configure));

		expect(result.current.active).toBe(false);
		act(() => result.current.start());
		expect(runMock).toHaveBeenCalledTimes(1);
		expect(runMock.mock.calls[0][0].root).toBe(ref.current); // root injected from the ref
		expect(result.current.active).toBe(true);
	});

	it('is single-flight — a second start() while active is a no-op', () => {
		primeRun();
		const ref = rootRef();
		const { result } = renderHook(() => useWalkthrough(ref, () => ({ actions: {}, play: async () => {} })));
		act(() => result.current.start());
		act(() => result.current.start());
		expect(runMock).toHaveBeenCalledTimes(1);
	});

	it('does not start when the root is unmounted', () => {
		primeRun();
		const { result } = renderHook(() => useWalkthrough({ current: null }, () => ({ actions: {}, play: async () => {} })));
		act(() => result.current.start());
		expect(runMock).not.toHaveBeenCalled();
	});

	it('does not start when configure returns null', () => {
		primeRun();
		const { result } = renderHook(() => useWalkthrough(rootRef(), () => null));
		act(() => result.current.start());
		expect(runMock).not.toHaveBeenCalled();
	});

	it('onStop resets active to false AND calls the host onStop (after teardown)', () => {
		const rig = primeRun();
		const hostOnStop = vi.fn();
		const { result } = renderHook(() => useWalkthrough(rootRef(), () => ({ actions: {}, play: async () => {}, onStop: hostOnStop })));
		act(() => result.current.start());
		expect(result.current.active).toBe(true);

		act(() => rig.fireStop('takeover'));
		expect(result.current.active).toBe(false);
		expect(hostOnStop).toHaveBeenCalledWith('takeover');
	});

	it('stop() forwards to the handle', () => {
		const rig = primeRun();
		const { result } = renderHook(() => useWalkthrough(rootRef(), () => ({ actions: {}, play: async () => {} })));
		act(() => result.current.start());
		act(() => result.current.stop());
		expect(rig.handle.stop).toHaveBeenCalled();
	});

	it('tears a live run down on unmount', () => {
		const rig = primeRun();
		const { result, unmount } = renderHook(() => useWalkthrough(rootRef(), () => ({ actions: {}, play: async () => {} })));
		act(() => result.current.start());
		unmount();
		expect(rig.handle.stop).toHaveBeenCalled();
	});

	// A THROWN `run()` IS A TERMINAL PATH TOO, and it is the one the rest of this file cannot
	// see: every other case reaches `onStop`, which is what clears `active`. `run()` has two
	// documented synchronous throws — the single-flight latch and an accent `resolveTheme`
	// refuses — and on either one no handle is ever assigned, so nothing else can ever unlatch
	// the hook. Before the fix this left `active: true` for the life of the component, with
	// `stop()` powerless to clear it, which in the shipped consumer means a "Watch the demo"
	// button that is disabled forever.
	it('unlatches when run() throws, and lets the throw reach the host', () => {
		runMock.mockImplementation(() => {
			throw new Error('vetrina: a walkthrough is already running (single-flight)');
		});
		const { result } = renderHook(() => useWalkthrough(rootRef(), () => ({ actions: {}, play: async () => {} })));
		expect(result.current.active).toBe(false);
		// CAUGHT INSIDE THE ACT, which is the shape that actually bites. A host catches this
		// throw — the shipped exemplar catches the unsafe-accent one by hand — so React commits
		// the `setActive(true)` that ran just before it and the flag sticks. Letting the throw
		// escape `act()` instead makes React discard the pending update, and the defect hides.
		let caught: unknown = null;
		act(() => {
			try {
				result.current.start();
			} catch (err) {
				caught = err;
			}
		});
		expect(String(caught)).toMatch(/single-flight/);
		expect(result.current.active).toBe(false);
	});

	it('can start again after a throw — the failed start is not sticky', () => {
		runMock.mockImplementationOnce(() => {
			throw new Error('vetrina: unsafe accent color');
		});
		const { result } = renderHook(() => useWalkthrough(rootRef(), () => ({ actions: {}, play: async () => {} })));
		act(() => {
			try {
				result.current.start();
			} catch {}
		});
		const rig = primeRun();
		act(() => result.current.start());
		expect(result.current.active).toBe(true);
		expect(rig.handle.stop).not.toHaveBeenCalled();
	});
});

describe('useLazyWalkthrough — the engine loads on first start', () => {
	const rootRef = () => ({ current: document.createElement('div') });
	const config = () => ({ actions: {}, play: async () => {} });
	/** A load the test settles by hand, handing back the mocked engine. */
	function deferredLoad() {
		let release: () => void = () => {};
		let fail: (e: unknown) => void = () => {};
		const load = vi.fn(
			() =>
				new Promise<{ run: typeof runMock }>((res, rej) => {
					release = () => res({ run: (o: unknown) => runMock(o) } as never);
					fail = rej;
				}),
		);
		return { load, release: () => release(), fail: (e: unknown) => fail(e) };
	}

	it('is active from the call, runs once the engine arrives, and a second start while loading is a no-op', async () => {
		primeRun();
		const { load, release } = deferredLoad();
		const { result } = renderHook(() => useLazyWalkthrough(rootRef(), config, load as never));
		let p1: Promise<void> = Promise.resolve();
		act(() => {
			p1 = result.current.start();
			void result.current.start();
		});
		expect(result.current.active).toBe(true);
		expect(load).toHaveBeenCalledTimes(1);
		expect(runMock).not.toHaveBeenCalled();
		await act(async () => {
			release();
			await p1;
		});
		expect(runMock).toHaveBeenCalledTimes(1);
	});

	it('stop() while the engine loads cancels the start', async () => {
		primeRun();
		const { load, release } = deferredLoad();
		const { result } = renderHook(() => useLazyWalkthrough(rootRef(), config, load as never));
		let p: Promise<void> = Promise.resolve();
		act(() => {
			p = result.current.start();
		});
		act(() => result.current.stop());
		expect(result.current.active).toBe(false);
		await act(async () => {
			release();
			await p;
		});
		expect(runMock).not.toHaveBeenCalled();
	});

	it('a failed load rejects start() and unlatches, so a later start can try again', async () => {
		primeRun();
		const { load, fail } = deferredLoad();
		const { result } = renderHook(() => useLazyWalkthrough(rootRef(), config, load as never));
		let p: Promise<void> = Promise.resolve();
		act(() => {
			p = result.current.start();
		});
		await act(async () => {
			fail(new Error('chunk 404'));
			await expect(p).rejects.toThrow('chunk 404');
		});
		expect(result.current.active).toBe(false);
		act(() => {
			void result.current.start();
		});
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('a load that fails after stop() settles quietly — the cancelled start is nobody’s to report', async () => {
		primeRun();
		const { load, fail } = deferredLoad();
		const { result } = renderHook(() => useLazyWalkthrough(rootRef(), config, load as never));
		let p: Promise<void> = Promise.resolve();
		act(() => {
			p = result.current.start();
		});
		act(() => result.current.stop());
		await act(async () => {
			fail(new Error('late 404'));
			await expect(p).resolves.toBeUndefined();
		});
		expect(result.current.active).toBe(false);
	});

	it('unmounting while the engine loads never starts a run', async () => {
		primeRun();
		const { load, release } = deferredLoad();
		const { result, unmount } = renderHook(() => useLazyWalkthrough(rootRef(), config, load as never));
		let p: Promise<void> = Promise.resolve();
		act(() => {
			p = result.current.start();
		});
		unmount();
		release();
		await p;
		expect(runMock).not.toHaveBeenCalled();
	});

	it('a run() that throws rejects start() and unlatches active', async () => {
		runMock.mockImplementation(() => {
			throw new Error('one run at a time');
		});
		const { load, release } = deferredLoad();
		const { result } = renderHook(() => useLazyWalkthrough(rootRef(), config, load as never));
		let p: Promise<void> = Promise.resolve();
		act(() => {
			p = result.current.start();
		});
		await act(async () => {
			release();
			await expect(p).rejects.toThrow('one run at a time');
		});
		expect(result.current.active).toBe(false);
	});
});

