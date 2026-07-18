import * as React from 'react';
import DeckPreview from '@/components/DeckPreview';
import type { SingleSlideOptions } from '@/lib/single-slide-render';

// Shared windowing + preview face for slide-thumbnail grids — the Present-mode
// Slide Overview (the "slides in Present" sorter) AND the Studio add-slide gallery
// (SlidePicker) both render a grid of live engine thumbnails, so they share ONE
// IntersectionObserver windowing policy and ONE DeckPreview render (HARD RULE #15).
// The CALLER owns the wrapper element: both wrap the face in a single <button> that
// IS the click target — the picker's "+ Insert" affordance is a decorative,
// pointer-events-none overlay, not a nested focusable button, so one button per tile.

/**
 * Does this slide's markdown contain a Mermaid fence? A diagram-bucket component's
 * thumbnail must render as a DIAGRAM, not raw code — `DeckPreview`'s `mermaid` flag
 * gates the runtime injection per render, so a thumbnail grid can't hardcode it.
 */
export function hasMermaid(md: string): boolean {
	return /```mermaid|~~~mermaid|language-mermaid/.test(md);
}

/**
 * Render on scroll-in (default `rootMargin` 250px), then stay mounted — once a
 * thumbnail has painted it never recycles ("cheap to keep, jarring to recycle").
 * No `IntersectionObserver` (jsdom / very old browsers) → render eagerly rather
 * than never; the windowing is a perf optimization, not a correctness gate.
 */
export function useInView<T extends Element>(rootMargin = '250px'): [React.RefObject<T | null>, boolean] {
	const ref = React.useRef<T>(null);
	const [visible, setVisible] = React.useState(false);
	React.useEffect(() => {
		const el = ref.current;
		if (!el || visible) return;
		if (typeof IntersectionObserver === 'undefined') {
			setVisible(true);
			return;
		}
		const io = new IntersectionObserver(
			([e]) => {
				if (e.isIntersecting) {
					setVisible(true);
					io.disconnect();
				}
			},
			{ rootMargin },
		);
		io.observe(el);
		return () => io.disconnect();
	}, [visible, rootMargin]);
	return [ref, visible];
}

export type SlideThumbFaceProps = {
	options: SingleSlideOptions;
	/** Slide markdown (front-matter already prepended by the caller for theme/size parity). */
	sample: string;
	paletteOverride?: string;
	extraTheme?: { name: string; css: string };
	modeOverride?: 'light' | 'dark';
	/** A local component's own CSS — the engine theme doesn't know a `.name` rule, so
	 *  without this a local-component thumbnail paints unstyled. */
	extraCss?: string;
	/** Windowing gate — the caller pairs this with `useInView`. */
	active: boolean;
	className?: string;
};

/**
 * The preview face only — a windowed `<DeckPreview>` with Mermaid auto-detected
 * from the sample. The caller supplies the wrapping element, which owns the
 * accessible NAME; the face itself is `aria-hidden` (a decorative render), so a
 * screen reader hears the tile's button once, never a duplicate figure node.
 */
export function SlideThumbFace({ options, sample, paletteOverride, extraTheme, modeOverride, extraCss, active, className }: SlideThumbFaceProps) {
	return (
		<DeckPreview
			options={options}
			sample={sample}
			mermaid={hasMermaid(sample)}
			paletteOverride={paletteOverride}
			extraTheme={extraTheme}
			modeOverride={modeOverride}
			extraCss={extraCss}
			active={active}
			className={className}
			aria-hidden
		/>
	);
}
