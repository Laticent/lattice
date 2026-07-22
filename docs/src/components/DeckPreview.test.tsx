import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeckPreview from './DeckPreview';

// A shared renderInto spy so we can assert what the component asked the renderer
// to draw across re-renders. The engine itself is never involved.
const { renderInto, dispose } = vi.hoisted(() => ({
	renderInto: vi.fn(
		(
			_host: HTMLElement,
			_markdown: string,
			_mermaid: boolean,
			_paletteOverride?: string,
			_extra?: { name: string; css: string },
			_modeOverride?: 'light' | 'dark',
			_extraCss?: string,
		) => Promise.resolve({ ok: true, slides: 1, error: null as string | null }),
	),
	dispose: vi.fn(),
}));
vi.mock('@/lib/single-slide-render', () => ({
	createSingleSlideRenderer: () => ({
		renderInto,
		whenReady: () => Promise.resolve(),
		onThemeChange: () => () => {},
		scaleFrame() {},
		ready: () => true,
		prefetchTheme() {},
		dispose,
	}),
}));

const opts = { themeBase: '', runtimeUrl: '', engineUrl: '' };

// Reset call history AND the implementation each test — the adaptive-backoff test
// swaps in a 'write'-regime return value, so a plain mockClear would leak it forward.
beforeEach(() => {
	renderInto.mockReset();
	renderInto.mockImplementation(() => Promise.resolve({ ok: true, slides: 1, error: null }));
	dispose.mockClear();
});

describe('DeckPreview — theme threading', () => {
	it('re-renders when the extra-theme CSS changes under a STABLE name (re-saved edit)', async () => {
		const { rerender } = render(<DeckPreview options={opts} sample="# A" mermaid={false} paletteOverride="ocean" extraTheme={{ name: 'ocean', css: '/* @theme ocean */ v1' }} aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		const before = renderInto.mock.calls.length;

		// Same NAME, NEW css — a saved theme edited then re-saved. Keying re-renders
		// on the name alone (a stable slug) would silently keep the old css; we key on
		// the css too, so this must trigger a fresh render carrying v2.
		rerender(<DeckPreview options={opts} sample="# A" mermaid={false} paletteOverride="ocean" extraTheme={{ name: 'ocean', css: '/* @theme ocean */ v2' }} aria-label="p" />);
		await waitFor(() => expect(renderInto.mock.calls.length).toBeGreaterThan(before));
		expect(renderInto.mock.calls.at(-1)?.[4]).toEqual({ name: 'ocean', css: '/* @theme ocean */ v2' });
	});

	it('does NOT re-render when identical props recur (no thrash)', async () => {
		const theme = { name: 'ocean', css: '/* @theme ocean */ v1' };
		const { rerender } = render(<DeckPreview options={opts} sample="# A" mermaid={false} paletteOverride="ocean" extraTheme={theme} aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		const before = renderInto.mock.calls.length;
		// A fresh wrapper object with the SAME name + css content must not re-render.
		rerender(<DeckPreview options={opts} sample="# A" mermaid={false} paletteOverride="ocean" extraTheme={{ name: 'ocean', css: '/* @theme ocean */ v1' }} aria-label="p" />);
		await new Promise((r) => setTimeout(r, 50));
		expect(renderInto.mock.calls.length).toBe(before);
	});

	it('forwards the modeOverride to the renderer', async () => {
		render(<DeckPreview options={opts} sample="# A" mermaid={false} modeOverride="dark" aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		expect(renderInto.mock.calls.at(-1)?.[5]).toBe('dark');
	});
});

describe('DeckPreview — frame-aligned render (per-keystroke coalescing)', () => {
	it('paints the first sample immediately, then COALESCES a rapid burst into one frame-aligned render of the LATEST state', async () => {
		const { rerender } = render(<DeckPreview options={opts} sample="# A" mermaid={false} coalesce aria-label="p" />);
		// First paint is always immediate — a fresh host must show something at once.
		await waitFor(() => expect(renderInto).toHaveBeenCalledTimes(1));
		expect(renderInto.mock.calls.at(-1)?.[1]).toBe('# A');

		// A burst of edits in one frame — a fast typist. They share a SINGLE scheduled
		// animation frame instead of one engine render each.
		rerender(<DeckPreview options={opts} sample="# AB" mermaid={false} coalesce aria-label="p" />);
		rerender(<DeckPreview options={opts} sample="# ABC" mermaid={false} coalesce aria-label="p" />);
		rerender(<DeckPreview options={opts} sample="# ABCD" mermaid={false} coalesce aria-label="p" />);
		// Synchronously after the burst, before the frame fires: no per-keystroke render.
		expect(renderInto).toHaveBeenCalledTimes(1);

		// Next frame: exactly ONE more render fires, carrying only the latest text —
		// the intermediate keystrokes never reach the engine.
		await waitFor(() => expect(renderInto).toHaveBeenCalledTimes(2));
		expect(renderInto.mock.calls.at(-1)?.[1]).toBe('# ABCD');
	});

	it('applies backpressure — a change mid-render never overlaps; it paints once the in-flight render settles', async () => {
		// Hang the first render until we release it, so a second edit lands mid-flight.
		let release: () => void = () => {};
		renderInto.mockImplementationOnce(
			() =>
				new Promise((res) => {
					release = () => res({ ok: true, slides: 1, error: null });
				}),
		);
		const { rerender } = render(<DeckPreview options={opts} sample="# A" mermaid={false} coalesce aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalledTimes(1));

		// Edit while the first render is still resolving → must NOT start a 2nd render.
		rerender(<DeckPreview options={opts} sample="# AB" mermaid={false} coalesce aria-label="p" />);
		await new Promise((r) => setTimeout(r, 40)); // give a frame a chance to fire
		expect(renderInto).toHaveBeenCalledTimes(1);

		// Release the in-flight render → the pending change now paints the latest text.
		release();
		await waitFor(() => expect(renderInto).toHaveBeenCalledTimes(2));
		expect(renderInto.mock.calls.at(-1)?.[1]).toBe('# AB');
	});

	it('a HEAVY (full-write) host coalesces on a trailing timer, not every frame — no drag strobe', async () => {
		// A full-write host (FinishStudio slider / Fabricate theme / LayoutStudio CSS)
		// changes the render sig every edit → renderInto reports writePath 'write'.
		renderInto.mockImplementation(() => Promise.resolve({ ok: true, slides: 1, error: null, writePath: 'write' }));
		const { rerender } = render(<DeckPreview options={opts} sample="# A" mermaid={false} coalesce aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalledTimes(1)); // first paint (a write)

		// A drag-like burst of writes. After the first write the loop knows the host is
		// heavy, so it coalesces on the ~120ms timer instead of firing next frame.
		rerender(<DeckPreview options={opts} sample="# AB" mermaid={false} coalesce aria-label="p" />);
		rerender(<DeckPreview options={opts} sample="# ABC" mermaid={false} coalesce aria-label="p" />);
		// A frame has passed (~40ms) — a PATCH host would have rendered by now; the heavy
		// host is still coalescing, so no second iframe rewrite yet (no strobe).
		await new Promise((r) => setTimeout(r, 40));
		expect(renderInto).toHaveBeenCalledTimes(1);
		// After the coalesce window: exactly one more render, carrying the latest text.
		await waitFor(() => expect(renderInto).toHaveBeenCalledTimes(2));
		expect(renderInto.mock.calls.at(-1)?.[1]).toBe('# ABC');
	});

	it('without `coalesce` (default) every change renders eagerly — static hosts keep their behavior', async () => {
		const { rerender } = render(<DeckPreview options={opts} sample="# A" mermaid={false} aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalledTimes(1));
		rerender(<DeckPreview options={opts} sample="# B" mermaid={false} aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalledTimes(2));
		expect(renderInto.mock.calls.at(-1)?.[1]).toBe('# B');
	});
});

describe('DeckPreview — teardown (leak fix)', () => {
	it('disposes the renderer on unmount so its observers + scaleTargets entry are released', async () => {
		const { unmount } = render(<DeckPreview options={opts} sample="# A" mermaid={false} aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		expect(dispose).not.toHaveBeenCalled();
		// A remounting host (HeroPreview tab flip, Slide Overview, Studio overlays)
		// unmounts DeckPreview; without this the host's ResizeObserver + its
		// module-level scaleTargets entry would leak the parsed ~560KB theme iframe.
		unmount();
		expect(dispose).toHaveBeenCalledTimes(1);
	});
});

describe('DeckPreview — first-render handoff (opacity reveal)', () => {
	it('fires onFirstRender exactly once and fades the loader when iframe.live opacity flips 0→1', async () => {
		const onFirstRender = vi.fn();
		const { container } = render(
			<DeckPreview options={opts} sample="# A" mermaid={false} loader onFirstRender={onFirstRender} aria-label="Live deck preview" />,
		);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		const figure = container.querySelector('figure') as HTMLElement;
		expect(container.querySelector('.nacre-loader')).toBeTruthy();
		expect(container.querySelector('.nacre-loader.is-done')).toBeNull();

		// The real renderer appends `iframe.live` (opacity:0) and reveals it (opacity 0→1) ONLY once
		// the slide has painted + scaled; the mocked renderer doesn't, so drive the handoff by hand.
		// The reveal-watcher keys on the frame's inline opacity via a MutationObserver (the srcdoc
		// `load` event is unreliable on iOS), so a hidden frame must NOT hand off and the reveal MUST.
		const fr = document.createElement('iframe');
		fr.className = 'live';
		fr.style.opacity = '0';
		figure.appendChild(fr);
		await new Promise((r) => setTimeout(r, 20));
		expect(onFirstRender).not.toHaveBeenCalled();
		expect(container.querySelector('.nacre-loader.is-done')).toBeNull();

		// Reveal → handoff: onFirstRender fires once AND the loader gets `is-done` (fade + freeze).
		fr.style.opacity = '1';
		await waitFor(() => expect(onFirstRender).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(container.querySelector('.nacre-loader.is-done')).toBeTruthy());

		// A later opacity churn must NOT re-fire onFirstRender (once-guarded).
		fr.style.opacity = '0';
		fr.style.opacity = '1';
		await new Promise((r) => setTimeout(r, 20));
		expect(onFirstRender).toHaveBeenCalledTimes(1);
	});

	it('fires onFirstRender even without a loader (a non-loader host still gets the first-paint signal)', async () => {
		const onFirstRender = vi.fn();
		const { container } = render(
			<DeckPreview options={opts} sample="# A" mermaid={false} onFirstRender={onFirstRender} aria-label="Live deck preview" />,
		);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		// No loader → no skeleton rendered, but the reveal-watcher still runs for onFirstRender.
		expect(container.querySelector('.nacre-loader')).toBeNull();
		const figure = container.querySelector('figure') as HTMLElement;
		const fr = document.createElement('iframe');
		fr.className = 'live';
		fr.style.opacity = '0';
		figure.appendChild(fr);
		fr.style.opacity = '1';
		await waitFor(() => expect(onFirstRender).toHaveBeenCalledTimes(1));
	});
});

describe('DeckPreview — render failure affordance (#1164)', () => {
	it('a NON-loader host whose render resolves ok:false shows a Retry affordance; a later success clears it', async () => {
		renderInto.mockImplementation(() => Promise.resolve({ ok: false, slides: 0, error: 'boom' }));
		const { container, getByText } = render(<DeckPreview options={opts} sample="# A" mermaid={false} aria-label="p" />);
		// The deterministic ok:false signal surfaces the failure card + a Retry — not a blank box.
		await waitFor(() => expect(container.querySelector('.nacre-failed')).toBeTruthy());
		expect(getByText('Retry')).toBeTruthy();

		// Retry re-renders (still backpressured); make the next render succeed → the card clears.
		renderInto.mockImplementation(() => Promise.resolve({ ok: true, slides: 1, error: null }));
		fireEvent.click(getByText('Retry'));
		await waitFor(() => expect(container.querySelector('.nacre-failed')).toBeNull());
	});

	it('a LOADER host does NOT show the failure affordance — it keeps its skeleton (unchanged contract)', async () => {
		renderInto.mockImplementation(() => Promise.resolve({ ok: false, slides: 0, error: 'boom' }));
		const { container } = render(<DeckPreview options={opts} sample="# A" mermaid={false} loader aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		await new Promise((r) => setTimeout(r, 30));
		expect(container.querySelector('.nacre-failed')).toBeNull();
		expect(container.querySelector('.nacre-loader')).toBeTruthy();
	});

	it('a transient "renderer disposed" (host detached mid-render) does NOT trip the failure affordance', async () => {
		// A mobile pane swap / unmount returns this sentinel — the reconnected host re-renders, so
		// it must NOT read as a failure (which would flash a spurious Retry during a normal swap).
		renderInto.mockImplementation(() => Promise.resolve({ ok: false, slides: 0, error: 'renderer disposed' }));
		const { container } = render(<DeckPreview options={opts} sample="# A" mermaid={false} aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		await new Promise((r) => setTimeout(r, 30));
		expect(container.querySelector('.nacre-failed')).toBeNull();
	});
});
