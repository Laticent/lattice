// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the engine: the adapter's job is WIRING (single-flight start, active state, root
// injection, onStop reset, unmount teardown), not the run itself (which the unit tier + the
// Studio e2e cover). A fake handle lets us drive the terminal path deterministically.
const runMock = vi.fn();
vi.mock('./index', () => ({ run: (opts: unknown) => runMock(opts) }));

import { useWalkthrough } from './react';

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
});
