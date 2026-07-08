import { X } from 'lucide-react';
import * as React from 'react';
import DeckPreview from '@/components/DeckPreview';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { cn } from '@/lib/utils';

// Present → slide overview (the "slide sorter"). A grid of rendered slide
// thumbnails over the presented set, for jumping anywhere — especially in Q&A.
// REUSE: each thumbnail is the SAME engine render as the main stage (DeckPreview),
// not a screenshot. PERF: a full deck could be dozens of slides, and each
// DeckPreview is an engine iframe, so thumbnails are WINDOWED — a thumb defers its
// render (`active={false}`) until it scrolls into view (IntersectionObserver),
// then renders once and stays. Off-screen thumbs cost only a lightweight renderer
// ref, never an iframe.

function Thumb({ options, sample, paletteOverride, extraTheme, modeOverride, extraCss, current, onClick, label }: { options: SingleSlideOptions; sample: string; paletteOverride?: string; extraTheme?: { name: string; css: string }; modeOverride?: 'light' | 'dark'; extraCss?: string; current: boolean; onClick: () => void; label: string }) {
	const ref = React.useRef<HTMLButtonElement>(null);
	const [visible, setVisible] = React.useState(false);
	React.useEffect(() => {
		const el = ref.current;
		if (!el || visible) return;
		// No IntersectionObserver (jsdom / very old browsers) → render eagerly rather
		// than never. The windowing is a perf optimization, not a correctness gate.
		if (typeof IntersectionObserver === 'undefined') {
			setVisible(true);
			return;
		}
		// Render a little before it enters the viewport so scrolling reveals a painted
		// thumb, not a blank that pops in. Disconnect after the first hit — once a
		// thumbnail has rendered it stays mounted (cheap to keep, jarring to recycle).
		const io = new IntersectionObserver(
			([e]) => {
				if (e.isIntersecting) {
					setVisible(true);
					io.disconnect();
				}
			},
			{ rootMargin: '250px' },
		);
		io.observe(el);
		return () => io.disconnect();
	}, [visible]);
	return (
		<button type="button" ref={ref} onClick={onClick} aria-current={current ? 'true' : undefined} aria-label={label} className={cn('group relative overflow-hidden rounded-xl border-2 bg-card text-left transition-colors', current ? 'border-[var(--accent)]' : 'border-border hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border))]')}>
			{/* The render is an engine IFRAME — without pointer-events:none it would swallow
			    the click (a separate document) and the button's onClick would never fire. */}
			<DeckPreview options={options} sample={sample} mermaid={false} paletteOverride={paletteOverride} extraTheme={extraTheme} modeOverride={modeOverride} extraCss={extraCss} active={visible} className="pointer-events-none aspect-video w-full" aria-label={label} />
			<span className="absolute bottom-1.5 left-1.5 rounded-md bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--text-heading)] backdrop-blur-sm">{label.replace('Slide ', '')}</span>
		</button>
	);
}

export function SlideOverview({ open, onClose, options, set, frontMatter = '', current, onJump, paletteOverride, extraTheme, modeOverride, extraCss }: { open: boolean; onClose: () => void; options: SingleSlideOptions; set: string[]; frontMatter?: string; current: number; onJump: (i: number) => void; paletteOverride?: string; extraTheme?: { name: string; css: string }; modeOverride?: 'light' | 'dark'; extraCss?: string }) {
	if (!open) return null;
	return (
		<div role="dialog" aria-modal="true" aria-label="Slide overview" className="absolute inset-0 z-20 flex flex-col bg-[color-mix(in_srgb,var(--bg)_94%,transparent)] backdrop-blur-sm">
			<div className="flex items-center gap-2 px-4 py-3 sm:px-6">
				<span className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">All slides — {set.length}</span>
				<span className="flex-1" />
				<button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" aria-label="Close slide overview"><X className="size-5" /></button>
			</div>
			<div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto px-4 pb-8 sm:grid-cols-3 sm:gap-4 sm:px-6 lg:grid-cols-4">
				{set.map((s, i) => (
					<Thumb
						// biome-ignore lint/suspicious/noArrayIndexKey: slides are positional; index IS the stable identity here.
						key={i}
						options={options}
						sample={frontMatter ? frontMatter + s : s}
						paletteOverride={paletteOverride}
						extraTheme={extraTheme}
						modeOverride={modeOverride}
						extraCss={extraCss}
						current={i === current}
						onClick={() => {
							onJump(i);
							onClose();
						}}
						label={`Slide ${i + 1}`}
					/>
				))}
			</div>
		</div>
	);
}
