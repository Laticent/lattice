import * as React from 'react';
import { nextIndex, type Palette } from '@/lib/restyle-carousel';
import { slideFrameStyle } from '@/lib/slide-frame';
import { createSingleSlideRenderer } from '@/playground/single-slide-render';

// "Your brand, one line": one slide re-rendered live through every palette,
// auto-advancing. The swatch rail + the active-name readout are React (shadcn-
// styled buttons in a tablist); the live render WRAPS the shared engine bridge.
// Behavior preserved from the old inline IIFE: 2.6s auto-cycle, pause on hover,
// stop on manual select / focus, respect prefers-reduced-motion, lazy start when
// scrolled into view, and re-render on the global mode (light/dark) change.
// The 2026-11 polish pass added what the heading promises but the demo never showed:
// the LINE. A front-matter strip above the slide names the `theme:` value as it
// changes, and a Light/Dark switch sets `color-mode:` for this slide alone, so "change
// one line, restyle the whole deck, in light or dark" is visible rather than claimed.

const CYCLE_MS = 2600;

/** A swatch shows the accent over half the dot and the palette's first two chart hues
 *  over the rest; a palette with no chart hues (a test fixture) shows its accent alone. */
export function swatchFill(p: Palette): string {
	if (!p.cat1 || !p.cat2) return p.accent;
	return `conic-gradient(${p.accent} 0 50%, ${p.cat1} 50% 75%, ${p.cat2} 75% 100%)`;
}

export type RestyleData = {
	sample: string;
	drawn: boolean;
	palettes: Palette[];
	themeBase: string;
	runtimeUrl: string;
	engineUrl: string;
	dagreUrl: string;
	katexUrl: string;
};

export default function RestyleShowcase({ data }: { data: RestyleData }) {
	const { palettes } = data;
	const [idx, setIdx] = React.useState(0);
	const stageRef = React.useRef<HTMLDivElement>(null);
	const engineRef = React.useRef(
		createSingleSlideRenderer({
			themeBase: data.themeBase,
			runtimeUrl: data.runtimeUrl,
			engineUrl: data.engineUrl,
			dagreUrl: data.dagreUrl,
			katexUrl: data.katexUrl,
		}),
	);

	const idxRef = React.useRef(idx);
	idxRef.current = idx;
	// null = follow the page's own light/dark; set = this demo's `color-mode:` override.
	const [modeOverride, setModeOverride] = React.useState<'light' | 'dark' | null>(null);
	const modeRef = React.useRef(modeOverride);
	modeRef.current = modeOverride;
	// The page's resolved mode, read after mount (the server render has no document).
	const [pageMode, setPageMode] = React.useState<'light' | 'dark'>('light');
	const startedRef = React.useRef(false); // lazy: don't render/cycle until in view
	const pausedRef = React.useRef(false); // hover-pause (keeps the timer, skips ticks)
	const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
	const reduceMotion = React.useRef(
		typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
	);

	const renderAt = React.useCallback(
		(i: number) => {
			const host = stageRef.current;
			const pal = palettes[i];
			if (!host || !pal) return;
			// RENDERS IN FLIGHT, on the stage: two clicks can overlap, and the older render may finish late and stand
			// down (single-slide-render.ts `newerOwns`), which changes nothing on screen. This count is how a reader of
			// the page, e2e/restyle-overlap.spec.ts included, knows every render has finished rather than guessing.
			host.dataset.rendersPending = String(Number(host.dataset.rendersPending ?? 0) + 1);
			// The mode argument only when this demo overrides it, so the default call stays the
			// four-argument one the page has always made.
			const mode = modeRef.current;
			const run = mode
				? engineRef.current.renderInto(host, data.sample, data.drawn, pal.name, undefined, mode)
				: engineRef.current.renderInto(host, data.sample, data.drawn, pal.name);
			void run.finally(() => {
				host.dataset.rendersPending = String(Math.max(0, Number(host.dataset.rendersPending ?? 1) - 1));
			});
		},
		[palettes, data.sample, data.drawn],
	);

	const stop = React.useCallback(() => {
		if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	const start = React.useCallback(() => {
		if (reduceMotion.current || timerRef.current || palettes.length <= 1) return;
		timerRef.current = setInterval(() => {
			if (pausedRef.current) return;
			const next = nextIndex(idxRef.current, palettes.length);
			setIdx(next);
			renderAt(next);
		}, CYCLE_MS);
	}, [palettes.length, renderAt]);

	// Manual select: stop auto-cycling, jump + render.
	const select = (i: number) => {
		stop();
		setIdx(i);
		renderAt(i);
	};

	// Lazy start: render slide 0 + begin cycling when the stage scrolls into view.
	React.useEffect(() => {
		const host = stageRef.current;
		if (!host) return;
		let canceled = false;
		const begin = () => {
			if (startedRef.current) return;
			startedRef.current = true;
			// Kick the theme CSS fetch off in PARALLEL with the engine-bundle load
			// (not behind it) — same fix as DeckPreview.tsx's paint().
			engineRef.current.prefetchTheme?.(palettes[idxRef.current]?.name);
			engineRef.current.whenReady().then(() => {
				if (canceled) return;
				renderAt(idxRef.current);
				start();
			});
		};
		let io: IntersectionObserver | null = null;
		if ('IntersectionObserver' in window) {
			io = new IntersectionObserver(
				(entries) => {
					if (entries.some((e) => e.isIntersecting)) {
						io?.disconnect();
						begin();
					}
				},
				{ rootMargin: '200px' },
			);
			io.observe(host);
		} else {
			begin();
		}
		return () => {
			canceled = true;
			io?.disconnect();
			stop();
		};
	}, [renderAt, start, stop, palettes]);

	// Re-render the current palette on a global mode (light/dark) flip.
	React.useEffect(() => {
		const root = document.documentElement;
		const readMode = () => setPageMode(root.dataset.mode === 'dark' ? 'dark' : 'light');
		readMode();
		let t: ReturnType<typeof setTimeout>;
		const obs = new MutationObserver(() => {
			readMode();
			if (!startedRef.current) return;
			clearTimeout(t);
			t = setTimeout(() => renderAt(idxRef.current), 80);
		});
		obs.observe(root, { attributes: true, attributeFilter: ['data-palette', 'data-mode'] });
		return () => {
			clearTimeout(t);
			obs.disconnect();
		};
	}, [renderAt]);

	// Release the renderer's per-host ResizeObserver + scaleTargets entry on unmount
	// (mount-once). Page-lifetime like FieldCardsLive — doesn't churn — but disposing
	// keeps the renderer from rooting its iframe past unmount. Matches DeckPreview.
	React.useEffect(() => () => engineRef.current.dispose(), []);

	const active = palettes[idx];
	const effectiveMode = modeOverride ?? pageMode;
	const setMode = (m: 'light' | 'dark') => {
		// Choosing the page's own mode clears the override, so a later flip of the site
		// toggle carries the demo with it again.
		const next = m === pageMode ? null : m;
		setModeOverride(next);
		modeRef.current = next;
		if (startedRef.current) renderAt(idxRef.current);
	};

	// Pause the auto-cycle while the pointer is over the live stage; resume on
	// leave. Bound to the figure (which carries a role), so no static element
	// gains interactivity. Keyboard users stop the cycle by focusing a swatch.
	const pause = () => {
		pausedRef.current = true;
	};
	const resume = () => {
		pausedRef.current = false;
	};

	return (
		<div className="lx-ui mx-auto max-w-[860px]">
			{/* The front-matter strip. Its theme chip reserves the width of the longest name
			    ("a11y-achromatopsia"), so the switch beside it never moves as the cycle
			    advances, and on a phone the row never re-wraps. */}
			<div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
				<span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
					Front matter
				</span>
				<code
					className="min-w-[25ch] rounded-md border border-border bg-card px-2 py-1 font-mono text-[13px] text-foreground"
				>
					theme: <span className="font-semibold text-primary">{active?.name ?? ''}</span>
				</code>
				<code className="rounded-md border border-border bg-card px-2 py-1 font-mono text-[13px] text-foreground">
					color-mode: <span className="font-semibold text-primary">{effectiveMode}</span>
				</code>
				<fieldset className="m-0 ml-auto inline-flex min-w-0 rounded-md border border-border bg-card p-0.5">
					<legend className="sr-only">Color mode for this slide</legend>
					{(['light', 'dark'] as const).map((m) => (
						<button
							key={m}
							type="button"
							aria-pressed={effectiveMode === m}
							onClick={() => setMode(m)}
							className={`cursor-pointer rounded-[5px] px-3 py-1 text-[13px] font-semibold capitalize transition-colors ${
								effectiveMode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
							}`}
						>
							{m}
						</button>
					))}
				</fieldset>
			</div>
			<figure
				ref={stageRef}
				role="img"
				onMouseEnter={pause}
				onMouseLeave={resume}
				// The shared SLIDE FRAME (docs/src/lib/slide-frame.ts): no radius, border or
				// background of its own, so the slide shows the deck's own corner. The edge is
				// what separates it from the `bg-muted` band this section sits on.
				data-slide-frame
				style={slideFrameStyle('stage')}
				className="live-host relative m-0 aspect-video w-full overflow-hidden"
				aria-label="A slide re-rendered through the selected palette"
			/>
			{/* The palette name sits on its OWN line under the swatches, never beside
			    them. Beside them, a long name ("A11y Achromatopsia") took width from
			    the swatch row, so the swatches re-wrapped as the cycle advanced and the
			    name ran off a phone's edge (seen on iPhone, 2026-10-28). On its own line
			    with its height reserved, nothing moves whatever the name's length. */}
			<div className="mt-[18px] flex flex-col items-start gap-3">
				<div
					className="flex flex-wrap items-center gap-x-5 gap-y-3"
					role="tablist"
					aria-label="Choose a palette"
					onFocusCapture={stop}
					onMouseEnter={pause}
					onMouseLeave={resume}
				>
					{[false, true].map((a11y) => (
						<div key={String(a11y)} role="presentation" className="flex flex-wrap items-center gap-[9px]">
							{a11y && (
								<span aria-hidden="true" className="mr-1 text-[12.5px] font-medium text-muted-foreground">
									Color-blind safe
								</span>
							)}
							{palettes.map((p, i) =>
								Boolean(p.a11y) === a11y ? (
									<button
										key={p.name}
										type="button"
										role="tab"
										aria-label={p.label}
										aria-selected={i === idx}
										title={p.label}
										onClick={() => select(i)}
										// Three of the palette's own colors, not the accent alone: ten palettes
										// share a near-black accent, and their chart hues are what set them apart.
										style={{ background: swatchFill(p) }}
										className={`size-[22px] cursor-pointer rounded-full border-2 transition-transform hover:scale-110 ${
											i === idx ? 'scale-[1.2] border-[var(--text-heading)]' : 'border-border'
										}`}
									/>
								) : null,
							)}
						</div>
					))}
				</div>
				<p
					className="m-0 min-h-[1.5em] max-w-full truncate text-[15px] leading-[1.5] font-semibold text-[var(--text-heading)]"
					aria-live="polite"
				>
					{active?.label ?? ''}
				</p>
			</div>
		</div>
	);
}
