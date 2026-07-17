import * as React from 'react';
import { nextIndex, type Palette } from '@/lib/restyle-carousel';
import { createSingleSlideRenderer } from '@/lib/single-slide-render';

// "One source, every palette": one slide re-rendered live through every palette,
// auto-advancing. The swatch rail + the active-name readout are React (shadcn-
// styled buttons in a tablist); the live render WRAPS the shared engine bridge.
// Behavior preserved from the old inline IIFE: 2.6s auto-cycle, pause on hover,
// stop on manual select / focus, respect prefers-reduced-motion, lazy start when
// scrolled into view, and re-render on the global mode (light/dark) change.

const CYCLE_MS = 2600;

export type RestyleData = {
	sample: string;
	mermaid: boolean;
	palettes: Palette[];
	themeBase: string;
	runtimeUrl: string;
	engineUrl: string;
};

export default function RestyleShowcase({ data }: { data: RestyleData }) {
	const { palettes } = data;
	const [idx, setIdx] = React.useState(0);
	const stageRef = React.useRef<HTMLDivElement>(null);
	const engineRef = React.useRef(
		createSingleSlideRenderer({ themeBase: data.themeBase, runtimeUrl: data.runtimeUrl, engineUrl: data.engineUrl }),
	);

	const idxRef = React.useRef(idx);
	idxRef.current = idx;
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
			if (host && pal) engineRef.current.renderInto(host, data.sample, data.mermaid, pal.name);
		},
		[palettes, data.sample, data.mermaid],
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
		let cancelled = false;
		const begin = () => {
			if (startedRef.current) return;
			startedRef.current = true;
			// Kick the theme CSS fetch off in PARALLEL with the engine-bundle load
			// (not behind it) — same fix as DeckPreview.tsx's paint().
			engineRef.current.prefetchTheme?.(palettes[idxRef.current]?.name);
			engineRef.current.whenReady().then(() => {
				if (cancelled) return;
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
			cancelled = true;
			io?.disconnect();
			stop();
		};
	}, [renderAt, start, stop, palettes]);

	// Re-render the current palette on a global mode (light/dark) flip.
	React.useEffect(() => {
		const root = document.documentElement;
		let t: ReturnType<typeof setTimeout>;
		const obs = new MutationObserver(() => {
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
			<figure
				ref={stageRef}
				role="img"
				onMouseEnter={pause}
				onMouseLeave={resume}
				className="live-host relative m-0 aspect-video w-full overflow-hidden rounded-[14px] border border-border bg-muted shadow-lg"
				aria-label="A slide re-rendered through the selected palette"
			/>
			<div className="mt-[18px] flex items-center justify-between gap-4">
				<div
					className="flex flex-wrap gap-[9px]"
					role="tablist"
					aria-label="Choose a palette"
					onFocusCapture={stop}
					onMouseEnter={pause}
					onMouseLeave={resume}
				>
					{palettes.map((p, i) => (
						<button
							key={p.name}
							type="button"
							role="tab"
							aria-label={p.label}
							aria-selected={i === idx}
							title={p.label}
							onClick={() => select(i)}
							style={{ background: p.accent }}
							className={`size-[22px] cursor-pointer rounded-full border-2 transition-transform hover:scale-110 ${
								i === idx ? 'scale-[1.2] border-[var(--text-heading)]' : 'border-border'
							}`}
						/>
					))}
				</div>
				<p className="m-0 min-w-[7ch] text-right text-[15px] font-semibold text-[var(--text-heading)]" aria-live="polite">
					{active?.label ?? ''}
				</p>
			</div>
		</div>
	);
}
