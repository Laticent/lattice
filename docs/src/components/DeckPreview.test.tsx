import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeckPreview from './DeckPreview';

// A shared renderInto spy so we can assert what the component asked the renderer
// to draw across re-renders. The engine itself is never involved.
const { renderInto, dispose, whenReady } = vi.hoisted(() => ({
	whenReady: vi.fn(() => Promise.resolve()),
	renderInto: vi.fn(
		(
			_host: HTMLElement,
			_markdown: string,
			_drawn: boolean,
			_paletteOverride?: string,
			_extra?: { name: string; css: string },
			_modeOverride?: 'light' | 'dark',
			_extraCss?: string,
			// The slide-context bag — `slideIndex`/`slideCount`/`slideMarkdown`/`deckId`/`focused`.
			// Declared here because the arms below assert what the component puts in it; without
			// it the tuple has no index 7 and the assertions do not typecheck.
			_slide?: { slideIndex?: number; slideCount?: number; slideMarkdown?: string; deckId?: string; focused?: boolean },
		) => Promise.resolve({ ok: true, slides: 1, error: null as string | null }),
	),
	dispose: vi.fn(),
}));
const created = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('@/playground/single-slide-render', () => ({
	createSingleSlideRenderer: (o: Record<string, unknown>) => (created.push(o), {
		renderInto,
		whenReady,
		onThemeChange: () => () => {},
		scaleFrame() {},
		ready: () => true,
		prefetchTheme() {},
		dispose,
	}),
}));

const opts = { themeBase: '', runtimeUrl: '', engineUrl: '' };

// Run every timer, animation frame and microtask the next `ms` of FAKE time would fire. The
// absence checks below ("no second render yet") use it instead of a real sleep: under fake
// timers the window is exact, so the check passes or fails on the scheduler's code alone
// (HARD RULE #32). Call `vi.useFakeTimers()` BEFORE the change that would schedule work.
const advance = (ms: number) =>
	act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});

// Reset call history AND the implementation each test — the adaptive-backoff test
// swaps in a 'write'-regime return value, so a plain mockClear would leak it forward.
beforeEach(() => {
	renderInto.mockReset();
	renderInto.mockImplementation(() => Promise.resolve({ ok: true, slides: 1, error: null }));
	dispose.mockClear();
	whenReady.mockReset();
	whenReady.mockImplementation(() => Promise.resolve());
});

describe('DeckPreview — theme threading', () => {
	it('re-renders when the extra-theme CSS changes under a STABLE name (re-saved edit)', async () => {
		const { rerender } = render(<DeckPreview options={opts} sample="# A" drawn={false} paletteOverride="ocean" extraTheme={{ name: 'ocean', css: '/* @theme ocean */ v1' }} aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		const before = renderInto.mock.calls.length;

		// Same NAME, NEW css — a saved theme edited then re-saved. Keying re-renders
		// on the name alone (a stable slug) would silently keep the old css; we key on
		// the css too, so this must trigger a fresh render carrying v2.
		rerender(<DeckPreview options={opts} sample="# A" drawn={false} paletteOverride="ocean" extraTheme={{ name: 'ocean', css: '/* @theme ocean */ v2' }} aria-label="p" />);
		await waitFor(() => expect(renderInto.mock.calls.length).toBeGreaterThan(before));
		expect(renderInto.mock.calls.at(-1)?.[4]).toEqual({ name: 'ocean', css: '/* @theme ocean */ v2' });
	});

	it('does NOT re-render when identical props recur (no thrash)', async () => {
		const theme = { name: 'ocean', css: '/* @theme ocean */ v1' };
		const { rerender } = render(<DeckPreview options={opts} sample="# A" drawn={false} paletteOverride="ocean" extraTheme={theme} aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		const before = renderInto.mock.calls.length;
		vi.useFakeTimers();
		try {
			// A fresh wrapper object with the SAME name + css content must not re-render. Past every
			// path a render could take: the eager flush, a frame, the 120 ms heavy-coalesce timer.
			rerender(<DeckPreview options={opts} sample="# A" drawn={false} paletteOverride="ocean" extraTheme={{ name: 'ocean', css: '/* @theme ocean */ v1' }} aria-label="p" />);
			await advance(500);
			expect(renderInto.mock.calls.length).toBe(before);
		} finally {
			vi.useRealTimers();
		}
	});

	it('forwards deckId to the renderer, inside the slide-context opts', async () => {
		// The host thread the preview's diagram-hold decides on: without this the id never
		// reaches `deckContextKey`, and two different one-slide decks compare equal — one
		// deck's diagram painted over the other's. Nothing asserted this until the sixth
		// review pass showed the whole thread was deletable with every suite green.
		render(<DeckPreview options={opts} sample="# A" drawn={false} slideIndex={0} slideCount={1} slideMarkdown="# A" deckId="deck-7:full:3" aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		expect(renderInto.mock.calls.at(-1)?.[7]).toMatchObject({ slideIndex: 0, deckId: 'deck-7:full:3' });
	});

	it('re-renders when only the deckId changes — identical text, different document', async () => {
		// A checkpoint restore on a one-slide deck changes nothing else, so if `deckId` is
		// missing from the effect's dependency list the renderer is never re-invoked and the
		// stale identity decides the swap.
		const { rerender } = render(<DeckPreview options={opts} sample="# A" drawn={false} slideIndex={0} slideCount={1} slideMarkdown="# A" deckId="deck-7:full:3" aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		const before = renderInto.mock.calls.length;
		rerender(<DeckPreview options={opts} sample="# A" drawn={false} slideIndex={0} slideCount={1} slideMarkdown="# A" deckId="deck-7:full:4" aria-label="p" />);
		await waitFor(() => expect(renderInto.mock.calls.length).toBeGreaterThan(before));
		expect(renderInto.mock.calls.at(-1)?.[7]).toMatchObject({ deckId: 'deck-7:full:4' });
	});

	it('forwards the modeOverride to the renderer', async () => {
		render(<DeckPreview options={opts} sample="# A" drawn={false} modeOverride="dark" aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		expect(renderInto.mock.calls.at(-1)?.[5]).toBe('dark');
	});
});

describe('DeckPreview — frame-aligned render (per-keystroke coalescing)', () => {
	it('paints the first sample immediately, then COALESCES a rapid burst into one frame-aligned render of the LATEST state', async () => {
		const { rerender } = render(<DeckPreview options={opts} sample="# A" drawn={false} coalesce aria-label="p" />);
		// First paint is always immediate — a fresh host must show something at once.
		await waitFor(() => expect(renderInto).toHaveBeenCalledTimes(1));
		expect(renderInto.mock.calls.at(-1)?.[1]).toBe('# A');

		// A burst of edits in one frame — a fast typist. They share a SINGLE scheduled
		// animation frame instead of one engine render each.
		rerender(<DeckPreview options={opts} sample="# AB" drawn={false} coalesce aria-label="p" />);
		rerender(<DeckPreview options={opts} sample="# ABC" drawn={false} coalesce aria-label="p" />);
		rerender(<DeckPreview options={opts} sample="# ABCD" drawn={false} coalesce aria-label="p" />);
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
		vi.useFakeTimers();
		try {
			const { rerender } = render(<DeckPreview options={opts} sample="# A" drawn={false} coalesce aria-label="p" />);
			await advance(0);
			expect(renderInto).toHaveBeenCalledTimes(1);

			// Edit while the first render is still resolving → must NOT start a 2nd render, however
			// many frames pass (the 4000 ms watchdog that unwedges a hung render is out of range).
			rerender(<DeckPreview options={opts} sample="# AB" drawn={false} coalesce aria-label="p" />);
			await advance(500);
			expect(renderInto).toHaveBeenCalledTimes(1);

			// Release the in-flight render → the pending change now paints the latest text. The 500 ms
			// hang is past the 50 ms wall-clock backstop, so the scheduler treats it as heavy and
			// paints on its 120 ms coalesce timer rather than the next frame.
			release();
			await advance(200);
			expect(renderInto).toHaveBeenCalledTimes(2);
			expect(renderInto.mock.calls.at(-1)?.[1]).toBe('# AB');
		} finally {
			vi.useRealTimers();
		}
	});

	it('a HEAVY (full-write) host coalesces on a trailing timer, not every frame — no drag strobe', async () => {
		// A full-write host (FinishStudio slider / Fabricate theme / LayoutStudio CSS)
		// changes the render sig every edit → renderInto reports writePath 'write'.
		renderInto.mockImplementation(() => Promise.resolve({ ok: true, slides: 1, error: null, writePath: 'write' }));
		vi.useFakeTimers();
		try {
			const { rerender } = render(<DeckPreview options={opts} sample="# A" drawn={false} coalesce aria-label="p" />);
			await advance(0);
			expect(renderInto).toHaveBeenCalledTimes(1); // first paint (a write)

			// A drag-like burst of writes. After the first write the loop knows the host is
			// heavy, so it coalesces on the 120 ms timer instead of firing next frame.
			rerender(<DeckPreview options={opts} sample="# AB" drawn={false} coalesce aria-label="p" />);
			rerender(<DeckPreview options={opts} sample="# ABC" drawn={false} coalesce aria-label="p" />);
			// Several frames have passed — a PATCH host would have rendered by now; the heavy
			// host is still coalescing, so no second iframe rewrite yet (no strobe).
			await advance(100);
			expect(renderInto).toHaveBeenCalledTimes(1);
			// After the coalesce window: exactly one more render, carrying the latest text.
			await advance(40);
			expect(renderInto).toHaveBeenCalledTimes(2);
			expect(renderInto.mock.calls.at(-1)?.[1]).toBe('# ABC');
		} finally {
			vi.useRealTimers();
		}
	});

	it('without `coalesce` (default) every change renders eagerly — static hosts keep their behavior', async () => {
		const { rerender } = render(<DeckPreview options={opts} sample="# A" drawn={false} aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalledTimes(1));
		rerender(<DeckPreview options={opts} sample="# B" drawn={false} aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalledTimes(2));
		expect(renderInto.mock.calls.at(-1)?.[1]).toBe('# B');
	});
});

describe('DeckPreview — teardown (leak fix)', () => {
	it('disposes the renderer on unmount so its observers + scaleTargets entry are released', async () => {
		const { unmount } = render(<DeckPreview options={opts} sample="# A" drawn={false} aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		expect(dispose).not.toHaveBeenCalled();
		// A remounting host (HeroPreview tab flip, Slide Overview, Studio overlays)
		// unmounts DeckPreview; without this the host's ResizeObserver + its
		// module-level scaleTargets entry would leak the parsed ~560KB theme iframe.
		unmount();
		expect(dispose).toHaveBeenCalledTimes(1);
	});

	it('still paints after a StrictMode remount whose props never change', async () => {
		// StrictMode (the dev server) disposes and nulls the renderer, then re-runs the effects —
		// the first-paint effect before the render body can rebuild it. A host whose props never
		// change afterwards (a pooled preview tile) then painted nothing on `astro dev`
		// (followups.d/2391-p2). The render must reach a live renderer with no second React render.
		const { unmount } = render(
			<StrictMode>
				<DeckPreview options={opts} sample="# A" drawn={false} aria-label="p" />
			</StrictMode>,
		);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		expect(dispose, 'StrictMode disposed the first renderer').toHaveBeenCalledTimes(1);
		unmount();
		expect(dispose, 'the rebuilt renderer is disposed on a real unmount').toHaveBeenCalledTimes(2);
	});
});

describe('DeckPreview — first-render handoff (opacity reveal)', () => {
	it('fires onFirstRender exactly once and fades the loader when iframe.live opacity flips 0→1', async () => {
		const onFirstRender = vi.fn();
		const { container } = render(
			<DeckPreview options={opts} sample="# A" drawn={false} loader onFirstRender={onFirstRender} aria-label="Live deck preview" />,
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
		// The watcher is a MutationObserver, whose callback is a microtask queued by the append
		// above: any later await runs it first, so one act() turn is the whole window.
		await act(async () => {});
		expect(onFirstRender).not.toHaveBeenCalled();
		expect(container.querySelector('.nacre-loader.is-done')).toBeNull();

		// Reveal → handoff: onFirstRender fires once AND the loader gets `is-done` (fade + freeze).
		fr.style.opacity = '1';
		await waitFor(() => expect(onFirstRender).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(container.querySelector('.nacre-loader.is-done')).toBeTruthy());

		// A later opacity churn must NOT re-fire onFirstRender (once-guarded).
		fr.style.opacity = '0';
		fr.style.opacity = '1';
		await act(async () => {}); // the observer's microtask, as above
		expect(onFirstRender).toHaveBeenCalledTimes(1);
	});

	it('fires onFirstRender even without a loader (a non-loader host still gets the first-paint signal)', async () => {
		const onFirstRender = vi.fn();
		const { container } = render(
			<DeckPreview options={opts} sample="# A" drawn={false} onFirstRender={onFirstRender} aria-label="Live deck preview" />,
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
	it('a NON-loader host whose render resolves ok:false shows a Retry affordance; the card tracks the retry OUTCOME', async () => {
		renderInto.mockImplementation(() => Promise.resolve({ ok: false, slides: 0, error: 'boom' }));
		const { container, getByText } = render(<DeckPreview options={opts} sample="# A" drawn={false} aria-label="p" />);
		// The deterministic ok:false signal surfaces the failure card + a Retry — not a blank box.
		await waitFor(() => expect(container.querySelector('.nacre-failed')).toBeTruthy());
		expect(getByText('Retry')).toBeTruthy();

		// Retry OPTIMISTICALLY clears the card then re-renders. If that render STILL fails, the card
		// must come BACK — proving the card reflects the render outcome, not just the optimistic clear.
		const callsBeforeRetry = renderInto.mock.calls.length;
		fireEvent.click(getByText('Retry'));
		await waitFor(() => expect(renderInto.mock.calls.length).toBeGreaterThan(callsBeforeRetry)); // the retry actually re-rendered
		await waitFor(() => expect(container.querySelector('.nacre-failed')).toBeTruthy()); // still failing → card returns

		// Now the render succeeds → the card clears for real (and stays cleared after it settles).
		renderInto.mockImplementation(() => Promise.resolve({ ok: true, slides: 1, error: null }));
		const callsBeforeSuccess = renderInto.mock.calls.length;
		fireEvent.click(getByText('Retry'));
		await waitFor(() => expect(renderInto.mock.calls.length).toBeGreaterThan(callsBeforeSuccess));
		await waitFor(() => expect(container.querySelector('.nacre-failed')).toBeNull());
	});

	it('a LOADER host DOES show the failure affordance on a deterministic ok:false, and drops its skeleton (#1551)', async () => {
		// REVISED from #1164's "a loader host keeps its skeleton" — that contract was
		// right about the never-paint CEILING (below, still loader-exempt: there the
		// render may yet land, so a skeleton is honest) and wrong about a DETERMINISTIC
		// failure. `ok:false` means the render resolved and cannot produce a slide, so a
		// skeleton that spins forever tells the author nothing — which is precisely the
		// silence #1551 was filed about. Present is a loader host, so leaving this as it
		// was would have traded a silently missing slide for a permanently spinning one.
		renderInto.mockImplementation(() => Promise.resolve({ ok: false, slides: 2, error: 'renders as 2 slides' }));
		const { container } = render(<DeckPreview options={opts} sample="# A" drawn={false} loader aria-label="p" />);
		await waitFor(() => expect(container.querySelector('.nacre-failed')).toBeTruthy());
		// The skeleton stands down — two competing affordances at once reads as "loading
		// AND broken".
		expect(container.querySelector('.nacre-loader')).toBeNull();
		// …and the card carries the renderer's REASON, not a bare "couldn't render". The
		// reason is the actionable half; without it the author cannot tell what to change.
		expect(container.querySelector('.nacre-failed__text')?.textContent).toContain('renders as 2 slides');
	});

	it('an engine that did not load shows the failure card with its reason on a LOADER host, and Retry imports again', async () => {
		// The Studio's preview is a loader host. whenReady() rejecting used to throw into the frame scheduler's
		// `.catch`, which swallowed it: no card, and the skeleton spun for good (PR #3368's first-render notes).
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		whenReady.mockImplementation(() => Promise.reject(new Error('Importing a module script failed.')));
		const { container, getByText } = render(<DeckPreview options={opts} sample="# A" drawn={false} loader aria-label="p" />);
		await waitFor(() => expect(container.querySelector('.nacre-failed')).toBeTruthy());
		expect(container.querySelector('.nacre-failed__text')?.textContent).toContain('the slide engine did not load; check the connection, then Retry');
		// The browser's message (a module URL, wider than a phone) is the console's, not the card's.
		expect(container.querySelector('.nacre-failed__text')?.textContent).not.toContain('Importing a module script failed');
		expect(warn).toHaveBeenCalledWith('[preview] the slide engine did not load:', expect.any(Error));
		warn.mockRestore();
		expect(container.querySelector('.nacre-loader')).toBeNull();
		expect(renderInto).not.toHaveBeenCalled();
		// The engine loads on Retry (load-engine drops a rejected import, so it really imports again): the slide renders.
		whenReady.mockImplementation(() => Promise.resolve());
		fireEvent.click(getByText('Retry'));
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		await waitFor(() => expect(container.querySelector('.nacre-failed')).toBeNull());
	});

	// D4 (owner, 2026-11-28): a render on a LOADER host that has not settled after 30 s shows the failure card with Retry,
	// and the card clears itself if that render settles later. Fake time drives the 30 s (HARD RULE #32).
	describe('a render that hangs on a LOADER host', () => {
		const hang = () => {
			let settle: (v: { ok: boolean; slides: number; error: string | null }) => void = () => {};
			renderInto.mockImplementationOnce(() => new Promise((res) => (settle = res)));
			return (v = { ok: true, slides: 1, error: null as string | null }) => act(async () => settle(v));
		};
		const text = (c: HTMLElement) => c.querySelector('.nacre-failed__text')?.textContent;

		it('shows nothing before 30 s, then the card with Retry; the card goes when the render settles', async () => {
			vi.useFakeTimers();
			const release = hang();
			const { container } = render(<DeckPreview options={opts} sample="# A" drawn={false} loader aria-label="p" />);
			await advance(29999);
			expect(renderInto).toHaveBeenCalledTimes(1);
			expect(container.querySelector('.nacre-failed')).toBeNull();
			await advance(1);
			expect(text(container)).toBe('This preview couldn’t render — the slide did not finish loading; check the connection, then Retry.');
			expect(container.querySelector('.nacre-failed__retry')?.textContent).toBe('Retry');
			await release();
			await advance(0);
			expect(container.querySelector('.nacre-failed')).toBeNull();
			vi.useRealTimers();
		});

		it('over a slide already showing (the bake) it is the bar, and stays until a render settles', async () => {
			vi.useFakeTimers();
			const release = hang();
			const { container } = render(<DeckPreview options={opts} sample="# A" drawn={false} loader aria-label="p" />);
			const fr = document.createElement('iframe');
			fr.className = 'live';
			fr.style.opacity = '1';
			container.querySelector('figure')?.appendChild(fr);
			await advance(30000);
			expect(container.querySelector('.nacre-failed')?.classList.contains('nacre-failed--bar')).toBe(true);
			expect(text(container)).toBe('The preview stopped loading, so edits will not show here.');
			expect(fr.hasAttribute('aria-hidden')).toBe(false);
			await release();
			await advance(0);
			expect(container.querySelector('.nacre-failed')).toBeNull();
			vi.useRealTimers();
		});

		it('Retry starts a fresh render: if that one hangs too the card comes back at 30 s, and it goes when one settles', async () => {
			vi.useFakeTimers();
			hang();
			const { container, getByText } = render(<DeckPreview options={opts} sample="# A" drawn={false} loader aria-label="p" />);
			await advance(30000);
			expect(container.querySelector('.nacre-failed')).toBeTruthy();
			const releaseRetry = hang();
			fireEvent.click(getByText('Retry'));
			await advance(16);
			expect(renderInto).toHaveBeenCalledTimes(2);
			expect(container.querySelector('.nacre-failed')).toBeNull();
			await advance(30000);
			expect(text(container)).toContain('did not finish loading');
			await releaseRetry();
			await advance(0);
			expect(container.querySelector('.nacre-failed')).toBeNull();
			vi.useRealTimers();
		});

		it('edits that keep starting renders while each hangs still show the card 30 s after the first', async () => {
			// The checker on #3617: a clock re-armed by every new render never fired for a person typing into a stalled preview.
			vi.useFakeTimers();
			renderInto.mockImplementation(() => new Promise(() => {}));
			const { container, rerender } = render(<DeckPreview options={opts} sample="# A0" drawn={false} loader aria-label="p" />);
			for (let i = 1; i <= 5; i++) {
				await advance(5000);
				rerender(<DeckPreview options={opts} sample={`# A${i}`} drawn={false} loader aria-label="p" />);
			}
			await advance(16);
			expect(renderInto.mock.calls.length).toBeGreaterThan(2);
			await advance(30000 - 5 * 5000 - 16);
			expect(text(container)).toContain('did not finish loading');
			vi.useRealTimers();
		});

		it('an older render that settles does not clear the card a newer, still hung render raised', async () => {
			vi.useFakeTimers();
			const releaseFirst = hang();
			const { container, rerender } = render(<DeckPreview options={opts} sample="# A" drawn={false} loader aria-label="p" />);
			await advance(5000);
			hang();
			rerender(<DeckPreview options={opts} sample="# B" drawn={false} loader aria-label="p" />);
			await advance(25000);
			expect(text(container)).toContain('did not finish loading');
			await releaseFirst();
			await advance(0);
			expect(text(container)).toContain('did not finish loading');
			vi.useRealTimers();
		});

		it('a hung render whose clock is overtaken by a newer render that settled raises no card', async () => {
			vi.useFakeTimers();
			hang();
			const { container, rerender } = render(<DeckPreview options={opts} sample="# A" drawn={false} loader aria-label="p" />);
			// Past the frame scheduler's 4 s watchdog, so an edit starts a NEW render while the first still hangs.
			await advance(5000);
			rerender(<DeckPreview options={opts} sample="# B" drawn={false} loader aria-label="p" />);
			await advance(16);
			expect(renderInto).toHaveBeenCalledTimes(2);
			// 30 s after the FIRST render began: its clock is stale, and the newer render settled fine.
			await advance(25000);
			expect(container.querySelector('.nacre-failed')).toBeNull();
			vi.useRealTimers();
		});

		it('a NON-loader host keeps its own never-paint ceiling: no hung-render card at 30 s', async () => {
			vi.useFakeTimers();
			hang();
			const { container } = render(<DeckPreview options={opts} sample="# A" drawn={false} aria-label="p" />);
			await advance(30000);
			expect(text(container) ?? '').not.toContain('did not finish loading');
			vi.useRealTimers();
		});
	});

	it('an engine that fails while a slide is ALREADY SHOWING (the newcomer bake) leaves the slide visible: a bar, not a cover', async () => {
		// Measured on Chromium and WebKit: the head seed's bake had painted a correct slide when the engine import failed,
		// and the full card hid it. Now the card is a bar along the slide's foot and the slide stays in the a11y tree.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		let fail: (e: Error) => void = () => {};
		whenReady.mockImplementation(() => new Promise<void>((_, reject) => (fail = reject)));
		const { container } = render(<DeckPreview options={opts} sample="# A" drawn={false} loader aria-label="p" />);
		const fr = document.createElement('iframe');
		fr.className = 'live';
		fr.style.opacity = '1';
		container.querySelector('figure')?.appendChild(fr);
		await waitFor(() => expect(whenReady).toHaveBeenCalled());
		fail(new Error('Importing a module script failed.'));
		await waitFor(() => expect(container.querySelector('.nacre-failed')).toBeTruthy());
		expect(container.querySelector('.nacre-failed')?.classList.contains('nacre-failed--bar')).toBe(true);
		// The slide shown IS right, so the bar does not say it couldn't render: it says edits will not show.
		expect(container.querySelector('.nacre-failed__text')?.textContent).toBe('The slide engine did not load, so edits will not show here.');
		expect(fr.hasAttribute('aria-hidden')).toBe(false);
		warn.mockRestore();
	});

	it('an engine that fails with NO slide on screen covers the box, and hides the parked frame from the a11y tree', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		let fail: (e: Error) => void = () => {};
		whenReady.mockImplementation(() => new Promise<void>((_, reject) => (fail = reject)));
		const { container } = render(<DeckPreview options={opts} sample="# A" drawn={false} loader aria-label="p" />);
		const fr = document.createElement('iframe');
		fr.className = 'live';
		fr.style.opacity = '0';
		container.querySelector('figure')?.appendChild(fr);
		await waitFor(() => expect(whenReady).toHaveBeenCalled());
		fail(new Error('Importing a module script failed.'));
		await waitFor(() => expect(container.querySelector('.nacre-failed')).toBeTruthy());
		expect(container.querySelector('.nacre-failed')?.classList.contains('nacre-failed--bar')).toBe(false);
		await waitFor(() => expect(fr.getAttribute('aria-hidden')).toBe('true'));
		// The newcomer bake can land AFTER the failure: that slide is correct, so the cover becomes the bar over it and the
		// frame leaves aria-hidden (the checker on PR #3385 saw the full card over a revealed slide in 3 of 4 desktop runs).
		fr.style.opacity = '1';
		await waitFor(() => expect(container.querySelector('.nacre-failed')?.classList.contains('nacre-failed--bar')).toBe(true));
		expect(container.querySelector('.nacre-failed__text')?.textContent).toBe('The slide engine did not load, so edits will not show here.');
		await waitFor(() => expect(fr.hasAttribute('aria-hidden')).toBe(false));
		warn.mockRestore();
	});

	it('an engine that fails AGAIN after Retry offers Reload: an in-page retry cannot fetch a sub-file the browser cached as failed', async () => {
		// A browser build that keeps a failed engine SUB-FILE's error in the page replays it on a second in-page retry, since
		// `?retry=N` renames only the entry (measured, PR #3385). A reload, or a new tab, is what recovers it there.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const reload = vi.fn();
		const realLocation = window.location;
		Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, reload } });
		try {
			whenReady.mockImplementation(() => Promise.reject(new Error('Importing a module script failed.')));
			const { container, getByText, rerender } = render(<DeckPreview options={opts} sample="# A" drawn={false} loader reloadSafe aria-label="p" />);
			await waitFor(() => expect(getByText('Retry')).toBeTruthy());
			fireEvent.click(getByText('Retry'));
			await waitFor(() => expect(getByText('Reload')).toBeTruthy());
			expect(container.querySelector('.nacre-failed__text')?.textContent).toContain('the slide engine still did not load; reload, or open the page in a new tab');
			// An edit schedules another render, which fails too: the card stays Reload (it is sticky until the engine loads).
			const calls = whenReady.mock.calls.length;
			rerender(<DeckPreview options={opts} sample="# B" drawn={false} loader reloadSafe aria-label="p" />);
			await waitFor(() => expect(whenReady.mock.calls.length).toBeGreaterThan(calls));
			await waitFor(() => expect(getByText('Reload')).toBeTruthy());
			fireEvent.click(getByText('Reload'));
			expect(reload).toHaveBeenCalledTimes(1);
			// The engine arriving (an edit's render succeeding) clears it all.
			whenReady.mockImplementation(() => Promise.resolve());
			rerender(<DeckPreview options={opts} sample="# C" drawn={false} loader reloadSafe aria-label="p" />);
			await waitFor(() => expect(renderInto).toHaveBeenCalled());
			await waitFor(() => expect(container.querySelector('.nacre-failed')).toBeNull());
		} finally {
			Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
			warn.mockRestore();
		}
	});

	it('a page the Reload button reloaded, where the engine fails again, says to close the tab and open the page again: no button', async () => {
		// The iOS Simulator probe (engine-retry.mjs, PR #3385): in Mobile Safari a reload, and a tab the page opens, both failed
		// on a cut engine sub-file without one request; a tab the person opened loaded it. So the card offers no button there.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);
		sessionStorage.setItem('lattice-preview-engine-reloaded', '1');
		try {
			whenReady.mockImplementation(() => Promise.reject(new Error('Importing a module script failed.')));
			const { container, rerender } = render(<DeckPreview options={opts} sample="# A" drawn={false} loader reloadSafe aria-label="p" />);
			await waitFor(() => expect(container.querySelector('.nacre-failed__text')?.textContent).toContain('still did not load after a reload; close this tab and open the page again'));
			expect(container.querySelector('.nacre-failed__retry')).toBeNull();
			expect(open).not.toHaveBeenCalled();
			// The engine arriving clears the state, and the mark.
			whenReady.mockImplementation(() => Promise.resolve());
			rerender(<DeckPreview options={opts} sample="# B" drawn={false} loader reloadSafe aria-label="p" />);
			await waitFor(() => expect(container.querySelector('.nacre-failed')).toBeNull());
			expect(sessionStorage.getItem('lattice-preview-engine-reloaded')).toBeNull();
		} finally {
			sessionStorage.removeItem('lattice-preview-engine-reloaded');
			open.mockRestore();
			warn.mockRestore();
		}
	});

	it('the Reload button marks the tab before it reloads, so the reloaded page knows', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const reload = vi.fn();
		const realLocation = window.location;
		Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, reload } });
		try {
			whenReady.mockImplementation(() => Promise.reject(new Error('Importing a module script failed.')));
			const { getByText } = render(<DeckPreview options={opts} sample="# A" drawn={false} loader reloadSafe aria-label="p" />);
			await waitFor(() => expect(getByText('Retry')).toBeTruthy());
			fireEvent.click(getByText('Retry'));
			await waitFor(() => expect(getByText('Reload')).toBeTruthy());
			fireEvent.click(getByText('Reload'));
			expect(sessionStorage.getItem('lattice-preview-engine-reloaded')).toBe('1');
			expect(reload).toHaveBeenCalledTimes(1);
		} finally {
			sessionStorage.removeItem('lattice-preview-engine-reloaded');
			Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
			warn.mockRestore();
		}
	});

	it('a host that is NOT reload-safe ignores a reloaded mark: it keeps Retry', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		sessionStorage.setItem('lattice-preview-engine-reloaded', '1');
		try {
			whenReady.mockImplementation(() => Promise.reject(new Error('Importing a module script failed.')));
			const { container, getByText, queryByText } = render(<DeckPreview options={opts} sample="# A" drawn={false} aria-label="p" />);
			await waitFor(() => expect(getByText('Retry')).toBeTruthy());
			expect(queryByText('Reload')).toBeNull();
			// Its first failure reads as a first failure: the mark is the Studio deck's, not this host's.
			expect(container.querySelector('.nacre-failed__text')?.textContent).toContain('check the connection, then Retry');
		} finally {
			sessionStorage.removeItem('lattice-preview-engine-reloaded');
			warn.mockRestore();
		}
	});

	it('a host that is NOT reload-safe never offers Reload: it keeps Retry and says to save first', async () => {
		// The theme editor and the component lab hold unsaved work in React state alone, so a reload there would lose it
		// (the checker on PR #3385). Only the Studio's deck preview, saved on pagehide, sets `reloadSafe`.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const reload = vi.fn();
		const realLocation = window.location;
		Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, reload } });
		try {
			whenReady.mockImplementation(() => Promise.reject(new Error('Importing a module script failed.')));
			const { container, getByText, queryByText } = render(<DeckPreview options={opts} sample="# A" drawn={false} aria-label="p" />);
			await waitFor(() => expect(getByText('Retry')).toBeTruthy());
			fireEvent.click(getByText('Retry'));
			await waitFor(() => expect(container.querySelector('.nacre-failed__text')?.textContent).toContain('save your work, then reload the page or open it in a new tab'));
			expect(queryByText('Reload')).toBeNull();
			const calls = whenReady.mock.calls.length;
			fireEvent.click(getByText('Retry'));
			await waitFor(() => expect(whenReady.mock.calls.length).toBeGreaterThan(calls));
			expect(reload).not.toHaveBeenCalled();
		} finally {
			Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
			warn.mockRestore();
		}
	});

	it('a transient "renderer disposed" (host detached mid-render) does NOT trip the failure affordance', async () => {
		// A mobile pane swap / unmount returns this sentinel — the reconnected host re-renders, so
		// it must NOT read as a failure (which would flash a spurious Retry during a normal swap).
		renderInto.mockImplementation(() => Promise.resolve({ ok: false, slides: 0, error: 'renderer disposed' }));
		// `onRender` fires after the component has read the status and set (or not set) the failure
		// flag, so waiting on it is waiting on the decision itself.
		const onRender = vi.fn();
		const { container } = render(<DeckPreview options={opts} sample="# A" drawn={false} onRender={onRender} aria-label="p" />);
		await waitFor(() => expect(onRender).toHaveBeenCalled());
		expect(container.querySelector('.nacre-failed')).toBeNull();
	});

	it('the never-paint CEILING trips when iframe.live stays unrevealed, but NOT once it reveals in time', async () => {
		// The ceiling is the safeguard for "render resolved OK but `.lattice` never painted" — the
		// deterministic ok:false path can't see that (the render succeeded). It's armed on mount and
		// reads the frame's opacity at the deadline (~32s, past the kernel poll's ~30s give-up point).
		// The mock renderer never appends/reveals a frame, so it's driven by hand. Fake timers so the
		// budget doesn't slow the suite.
		vi.useFakeTimers();
		try {
			// (a) TRIPS — no frame ever reveals (opacity stays effectively 0 / no frame at all).
			const trip = render(<DeckPreview options={opts} sample="# A" drawn={false} aria-label="p" />);
			expect(trip.container.querySelector('.nacre-failed')).toBeNull();
			await act(async () => {
				await vi.advanceTimersByTimeAsync(32000); // the timer's setFailed(true) needs act() to flush
			});
			expect(trip.container.querySelector('.nacre-failed')).toBeTruthy();
			trip.unmount();

			// (b) does NOT trip — a frame reveals (opacity flips to non-'0') before the deadline.
			const ok = render(<DeckPreview options={opts} sample="# B" drawn={false} aria-label="p" />);
			const figure = ok.container.querySelector('figure') as HTMLElement;
			const fr = document.createElement('iframe');
			fr.className = 'live';
			fr.style.opacity = '1'; // revealed
			figure.appendChild(fr);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(32000);
			});
			expect(ok.container.querySelector('.nacre-failed')).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('hides the parked opacity:0 iframe from the a11y tree while the failure card owns the surface', async () => {
		renderInto.mockImplementation(() => Promise.resolve({ ok: false, slides: 0, error: 'boom' }));
		const { container } = render(<DeckPreview options={opts} sample="# A" drawn={false} aria-label="p" />);
		// A parked (opacity:0) iframe.live exists during the failure — it must be aria-hidden so the
		// message + Retry are the only accessible surface (opacity alone keeps it in the a11y tree).
		const figure = container.querySelector('figure') as HTMLElement;
		const fr = document.createElement('iframe');
		fr.className = 'live';
		fr.style.opacity = '0';
		figure.appendChild(fr);
		await waitFor(() => expect(container.querySelector('.nacre-failed')).toBeTruthy());
		await waitFor(() => expect(fr.getAttribute('aria-hidden')).toBe('true'));
	});

	it('RECOVERS — the failure card clears when the frame reveals LATE (never occludes a good slide)', async () => {
		// The confirmed trio regression: `failed` was a one-way latch. The kernel reveals the frame
		// imperatively (opacity 0→1, no React state), so a reveal AFTER the ceiling/ok:false fired left
		// the opaque card masking a correct slide. The recovery effect must drop `failed` on reveal.
		renderInto.mockImplementation(() => Promise.resolve({ ok: false, slides: 0, error: 'boom' }));
		const { container } = render(<DeckPreview options={opts} sample="# A" drawn={false} aria-label="p" />);
		await waitFor(() => expect(container.querySelector('.nacre-failed')).toBeTruthy());

		// A late reveal (the poll / ResizeObserver flips opacity 0→1) — the card must YIELD.
		const figure = container.querySelector('figure') as HTMLElement;
		const fr = document.createElement('iframe');
		fr.className = 'live';
		fr.style.opacity = '1';
		figure.appendChild(fr);
		await waitFor(() => expect(container.querySelector('.nacre-failed')).toBeNull());
	});
});

describe('DeckPreview — followWhenParked', () => {
	const deck = (n: number, text = '# A') => (
		<DeckPreview options={opts} sample={`${text}\n\n---\n\n# B\n\n---\n\n# C`} slideIndex={n} slideCount={3} slideMarkdown={text} deckId="d" drawn={false} active={false} followWhenParked aria-label="p" />
	);
	it('a parked host that follows draws once when the slide changes, and not for an edit', async () => {
		const { rerender } = render(deck(0));
		// Parked on mount: nothing is drawn.
		await act(async () => {});
		expect(renderInto).not.toHaveBeenCalled();

		rerender(deck(1));
		await waitFor(() => expect(renderInto).toHaveBeenCalledTimes(1));
		expect(renderInto.mock.calls[0]?.[7]?.slideIndex).toBe(1);

		// An edit on the same slide stays deferred: the parked host is not redrawn per keystroke.
		vi.useFakeTimers();
		try {
			rerender(deck(1, '# A edited'));
			await advance(500);
			expect(renderInto).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});
	it('a parked host that does not follow never draws on a slide change', async () => {
		const plain = (n: number) => <DeckPreview options={opts} sample="# A" slideIndex={n} slideCount={3} slideMarkdown="# A" deckId="d" drawn={false} active={false} aria-label="p" />;
		vi.useFakeTimers();
		try {
			const { rerender } = render(plain(0));
			rerender(plain(1));
			await advance(500);
			expect(renderInto).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});

// Preview-sized photo copies (lib/preview-image-scale.ts) are opt-in per renderer, and a host may opt in
// only if it re-renders when a copy lands: the rewrite writes a photo with no url() until then.
describe('DeckPreview — preview-sized photo copies', () => {
	it('opts its renderer in to photo copies', async () => {
		created.length = 0;
		render(<DeckPreview options={opts} sample="# A" drawn={false} aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		expect(created.at(-1)?.scaleImages).toBe(true);
	});

	it('re-renders when a copy it waited for lands', async () => {
		render(<DeckPreview options={opts} sample="# A" drawn={false} aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		const host = renderInto.mock.calls[0][0];
		const before = renderInto.mock.calls.length;
		act(() => {
			host.dispatchEvent(new CustomEvent('lattice:preview-images-ready'));
		});
		await waitFor(() => expect(renderInto.mock.calls.length).toBeGreaterThan(before));
	});
});

// `onPaint` says the frame SHOWS the render; `onRender` fires at commit. A full write commits before the frame has
// navigated to the new document, so a reader of the frame's DOM on `onRender` could still see the old slide (the photo
// verdict, coach/photo-contrast-watch.ts). The frame's document is driven by hand here: the mocked renderer appends
// `iframe.live` with a document the test swaps, the way a srcdoc navigation would.
describe('DeckPreview — onPaint waits for the frame to show the render', () => {
	function frameWithDocs() {
		let doc = document.implementation.createHTMLDocument('a');
		let frame: HTMLIFrameElement | null = null;
		const mount = (host: HTMLElement) => {
			if (frame) return;
			frame = document.createElement('iframe');
			frame.className = 'live';
			Object.defineProperty(frame, 'contentDocument', { get: () => doc });
			host.appendChild(frame);
		};
		const navigate = () => {
			doc = document.implementation.createHTMLDocument('b');
			frame?.dispatchEvent(new Event('load'));
		};
		return { mount, navigate };
	}

	it('fires at commit when the render patched the document already in the frame', async () => {
		const f = frameWithDocs();
		renderInto.mockImplementation((host: HTMLElement) => {
			f.mount(host);
			return Promise.resolve({ ok: true, slides: 1, error: null, writePath: 'patch' });
		});
		const onPaint = vi.fn();
		const onRender = vi.fn();
		render(<DeckPreview options={opts} sample="# A" drawn={false} onRender={onRender} onPaint={onPaint} aria-label="p" />);
		await waitFor(() => expect(onRender).toHaveBeenCalled());
		expect(onPaint).toHaveBeenCalledTimes(onRender.mock.calls.length);
	});

	it('waits for the load when a full write still holds the old document at commit', async () => {
		const f = frameWithDocs();
		// The first render mounts the frame; the second is a full write that has not navigated when it resolves.
		renderInto.mockImplementationOnce((host: HTMLElement) => {
			f.mount(host);
			return Promise.resolve({ ok: true, slides: 1, error: null, writePath: 'patch' });
		});
		const onPaint = vi.fn();
		const onRender = vi.fn();
		const { rerender } = render(<DeckPreview options={opts} sample="# A" drawn={false} onRender={onRender} onPaint={onPaint} aria-label="p" />);
		await waitFor(() => expect(onRender).toHaveBeenCalledTimes(1));
		expect(onPaint).toHaveBeenCalledTimes(1);
		renderInto.mockImplementation(() => Promise.resolve({ ok: true, slides: 1, error: null, writePath: 'write' }));
		rerender(<DeckPreview options={opts} sample="# B" drawn={false} onRender={onRender} onPaint={onPaint} aria-label="p" />);
		await waitFor(() => expect(onRender).toHaveBeenCalledTimes(2));
		expect(onPaint).toHaveBeenCalledTimes(1);
		act(() => f.navigate());
		expect(onPaint).toHaveBeenCalledTimes(2);
	});
});
