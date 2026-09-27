import { act, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelSheetInstantCtx } from '@/components/ui/panel';
import { lazyPanel, PanelLoader, SHEET_ENTER_MS, SHEET_EXIT_MS, useLatch, warmPanels } from './lazy-panel';

function Real({ label }: { label: string }) {
	const instant = React.useContext(PanelSheetInstantCtx);
	return <div data-testid="real" data-instant={String(instant)}>{label}</div>;
}

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const shell = (body?: React.ReactNode) => <div data-testid="shell">{body ?? 'shell'}</div>;

afterEach(() => {
	vi.useRealTimers();
});

describe('PanelLoader', () => {
	it('shows the shell while the panel loads, then the panel', async () => {
		const d = deferred<typeof Real>();
		const panel = lazyPanel('Test', () => d.promise);
		render(<PanelLoader panel={panel} shell={shell}>{(P) => <P label="hello" />}</PanelLoader>);
		expect(screen.getByTestId('shell')).toBeInTheDocument();
		await act(async () => d.resolve(Real));
		expect(screen.getByTestId('real')).toHaveTextContent('hello');
		expect(screen.queryByTestId('shell')).toBeNull();
	});

	it('never shows the shell for a panel that is already loaded', async () => {
		const panel = lazyPanel('Test', async () => Real);
		await panel.load();
		const seen: string[] = [];
		render(
			<PanelLoader panel={panel} shell={() => { seen.push('shell'); return null; }}>
				{(P) => <P label="warm" />}
			</PanelLoader>,
		);
		expect(seen).toEqual([]);
		expect(screen.getByTestId('real')).toHaveTextContent('warm');
	});

	it('holds a sheet shell until its slide-in ends, then mounts the sheet with the enter animation off', async () => {
		// `performance` too: the hold is measured from the shell's mount with performance.now().
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
		const d = deferred<typeof Real>();
		const panel = lazyPanel('Test', () => d.promise);
		const { rerender } = render(
			<PanelLoader panel={panel} sheet open shell={shell}>{(P) => <P label="sheet" />}</PanelLoader>,
		);
		await act(async () => d.resolve(Real));
		// Loaded, but the shell is still sliding in: keep it, right up to the last millisecond.
		await act(async () => vi.advanceTimersByTime(SHEET_ENTER_MS - 1));
		expect(screen.getByTestId('shell')).toBeInTheDocument();
		await act(async () => vi.advanceTimersByTime(1));
		expect(screen.getByTestId('real')).toHaveAttribute('data-instant', 'true');
		// The next close clears the flag, so the next open animates normally.
		rerender(<PanelLoader panel={panel} sheet open={false} shell={shell}>{(P) => <P label="sheet" />}</PanelLoader>);
		expect(screen.getByTestId('real')).toHaveAttribute('data-instant', 'false');
	});

	it('times the hold from a reopen, not from the first open', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
		const d = deferred<typeof Real>();
		const panel = lazyPanel('Test', () => d.promise);
		const view = (open: boolean) => <PanelLoader panel={panel} sheet open={open} shell={shell}>{(P) => <P label="sheet" />}</PanelLoader>;
		const { rerender } = render(view(true));
		await act(async () => vi.advanceTimersByTime(100));
		rerender(view(false));
		await act(async () => vi.advanceTimersByTime(600));
		rerender(view(true)); // reopened at 700 ms: this slide-in runs to 1200 ms
		await act(async () => vi.advanceTimersByTime(200));
		await act(async () => d.resolve(Real)); // loaded at 900 ms, mid-slide
		await act(async () => vi.advanceTimersByTime(299));
		expect(screen.getByTestId('shell')).toBeInTheDocument();
		await act(async () => vi.advanceTimersByTime(1));
		expect(screen.getByTestId('real')).toHaveAttribute('data-instant', 'true');
	});

	it('lets a shell closed mid-load finish its close before swapping', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
		const d = deferred<typeof Real>();
		const panel = lazyPanel('Test', () => d.promise);
		const view = (open: boolean) => <PanelLoader panel={panel} sheet open={open} shell={shell}>{(P) => <P label="sheet" />}</PanelLoader>;
		const { rerender } = render(view(true));
		await act(async () => vi.advanceTimersByTime(100));
		rerender(view(false)); // Escape at 100 ms: the close runs to 400 ms
		await act(async () => vi.advanceTimersByTime(100));
		await act(async () => d.resolve(Real)); // loaded at 200 ms, mid-close
		await act(async () => vi.advanceTimersByTime(SHEET_EXIT_MS - 101));
		expect(screen.getByTestId('shell')).toBeInTheDocument();
		await act(async () => vi.advanceTimersByTime(1));
		expect(screen.getByTestId('real')).toHaveAttribute('data-instant', 'false');
	});

	it('swaps a sheet at once, with no instant flag, when it loads while closed', async () => {
		const d = deferred<typeof Real>();
		const panel = lazyPanel('Test', () => d.promise);
		render(<PanelLoader panel={panel} sheet open={false} shell={shell}>{(P) => <P label="closed" />}</PanelLoader>);
		await act(async () => d.resolve(Real));
		expect(screen.getByTestId('real')).toHaveAttribute('data-instant', 'false');
	});

	it('shows the chunk-load card inside the shell when the load fails', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const d = deferred<typeof Real>();
		const panel = lazyPanel('Test', () => d.promise);
		render(<PanelLoader panel={panel} shell={shell}>{(P) => <P label="never" />}</PanelLoader>);
		await act(async () => d.reject(new TypeError('Failed to fetch dynamically imported module: /_astro/x.js')));
		const frame = screen.getByTestId('shell');
		expect(frame).toContainElement(screen.getByRole('alert'));
		expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
		spy.mockRestore();
	});

	it('loads each panel once, however many loaders ask', async () => {
		const loader = vi.fn(async () => Real);
		const panel = lazyPanel('Test', loader);
		await Promise.all([panel.load(), panel.load()]);
		render(<PanelLoader panel={panel} shell={shell}>{(P) => <P label="one" />}</PanelLoader>);
		expect(loader).toHaveBeenCalledTimes(1);
	});
});

describe('warmPanels', () => {
	it('loads the panels one after another when the browser is idle', async () => {
		vi.useFakeTimers();
		const order: string[] = [];
		const a = lazyPanel('A', async () => { order.push('a'); return Real; });
		const b = lazyPanel('B', async () => { order.push('b'); return Real; });
		warmPanels([a, b]);
		expect(order).toEqual([]);
		await act(async () => vi.runAllTimersAsync());
		expect(order).toEqual(['a', 'b']);
	});

	it('stops when cancelled', async () => {
		vi.useFakeTimers();
		const loader = vi.fn(async () => Real);
		const cancel = warmPanels([lazyPanel('A', loader)]);
		cancel();
		await act(async () => vi.runAllTimersAsync());
		expect(loader).not.toHaveBeenCalled();
	});

	it('fetches nothing under Save-Data', async () => {
		vi.useFakeTimers();
		const loader = vi.fn(async () => Real);
		Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
		warmPanels([lazyPanel('A', loader)]);
		await act(async () => vi.runAllTimersAsync());
		expect(loader).not.toHaveBeenCalled();
		Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });
	});
});

describe('useLatch', () => {
	function Probe({ on }: { on: boolean }) {
		return <span data-testid="latch">{String(useLatch(on))}</span>;
	}
	it('stays true once it has been true', () => {
		const { rerender } = render(<Probe on={false} />);
		expect(screen.getByTestId('latch')).toHaveTextContent('false');
		rerender(<Probe on />);
		rerender(<Probe on={false} />);
		expect(screen.getByTestId('latch')).toHaveTextContent('true');
	});
});
