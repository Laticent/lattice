import { X } from 'lucide-react';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { cn } from '@/lib/utils';
import { SLIDE_SEP } from './deck-ops';
import { PooledThumbFace, PreviewPool } from './preview-pool';
import { hasMermaid } from './slide-thumb';

// Present → slide overview (the "slide sorter"). A grid of rendered slide
// thumbnails over the presented set, for jumping anywhere — especially in Q&A.
// REUSE: each thumbnail is the SAME engine render as the main stage (through the shared
// pooled face over DeckPreview), not a screenshot. PERF: a full deck could be dozens of
// slides, and each DeckPreview is an engine iframe, so the grid draws from a shared
// `PreviewPool` (#1538) — a small fixed set of frames that are re-pointed over the tiles on
// screen and NEVER torn down, because WebKit does not give a torn-down preview document
// back. That replaced the older two-way `useInView` window, which bounded how many frames
// were alive at once but paid for every recycle with a fresh document. Off-screen thumbs
// cost a ref and an empty box; one scrolling back into view is a patch into a frame that is
// already running. The SAME pool powers the add-slide gallery (SlidePicker) and Reshape.
//
// THESE ARE THE AUTHOR'S OWN SLIDES, so no tile passes `specimen` — the overflow and
// legibility alarms belong here, and the overview is exactly where an author scans for a
// clipped slide (see `isSpecimenDocument` in lib/runtime/index.js for the regression that
// makes this worth saying out loud).

function Thumb({ options, sample, slideIndex, slideCount, slideMarkdown, mermaid, paletteOverride, extraTheme, modeOverride, extraCss, current, onClick, label }: { options: SingleSlideOptions; sample: string; slideIndex: number; slideCount: number; slideMarkdown: string; mermaid: boolean; paletteOverride?: string; extraTheme?: { name: string; css: string }; modeOverride?: 'light' | 'dark'; extraCss?: string; current: boolean; onClick: () => void; label: string }) {
	return (
		<button type="button" onClick={onClick} aria-current={current ? 'true' : undefined} aria-label={label} className={cn('group relative text-left outline outline-2 outline-offset-[3px] transition-[outline-color]', current ? 'outline-[var(--accent)]' : 'outline-transparent hover:outline-[color-mix(in_srgb,var(--accent)_45%,var(--border))] focus-visible:outline-[var(--accent)]')}>
			{/* The tile IS the slide: no card, radius or border of its own, so a square deck shows
			    square tiles and a rounded deck rounded ones (the pool draws the slide frame —
			    docs/src/lib/slide-frame.ts). Current and hover are an offset outline around it.
			    An empty box; the pixels arrive from a pooled frame positioned over it. The frame is
			    pointer-events:none either way — it is a separate document that would otherwise
			    swallow this button's click. */}
			<PooledThumbFace options={options} sample={sample} slideIndex={slideIndex} slideCount={slideCount} slideMarkdown={slideMarkdown} mermaid={mermaid} paletteOverride={paletteOverride} extraTheme={extraTheme} modeOverride={modeOverride} extraCss={extraCss} className="pointer-events-none aspect-video w-full" />
			{/* The slide number. `z-10` because the pooled preview layer paints above the grid
			    (preview-pool.tsx) — without it the number is behind the frame. */}
			<span className="absolute bottom-1.5 left-1.5 z-10 rounded-md bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--text-heading)] backdrop-blur-sm">{label.replace('Slide ', '')}</span>
		</button>
	);
}

export function SlideOverview({ open, onClose, options, set, frontMatter = '', current, onJump, paletteOverride, extraTheme, modeOverride, extraCss }: { open: boolean; onClose: () => void; options: SingleSlideOptions; set: string[]; frontMatter?: string; current: number; onJump: (i: number) => void; paletteOverride?: string; extraTheme?: { name: string; css: string }; modeOverride?: 'light' | 'dark'; extraCss?: string }) {
	if (!open) return null;
	// DECK CONTEXT (see DeckPreview's `slideIndex`): every tile renders the SAME deck document and
	// displays its own slide, so each thumbnail shows its true page number. Handing each tile one
	// sliced-out slide printed "1" on every tile in the grid — the most visible face of the bug,
	// since the engine numbers a slide by its position among the sections it parses.
	//
	// Each visible tile therefore pays one whole-deck engine parse (~39ms for a 58-slide deck,
	// per 2026-07-11-preview-performance-diagnosis.md) instead of one slide's — but only the FIRST
	// tile does: the whole-deck memo in single-slide-render.ts is module-level precisely so the
	// grid's tiles share one parse. Bounded, not per-keystroke: the pool renders only the tiles on
	// screen. A re-pointed tile re-renders (the pool changes what a slot SHOWS, not whether it
	// exists), but `dispose()` no longer clears that shared memo unless it is the last renderer on
	// the page — without that refcount every eviction cost the next tile a cold whole-deck parse,
	// on this exact surface. The pool makes that rarer still: a slot is re-pointed rather than
	// disposed, so nothing on this grid reaches `dispose()` until the overview closes.
	// A shared render distributed across tiles would be cheaper still, but it means moving the
	// render out of the per-host renderer — deliberately left for a follow-up.
	const deck = frontMatter + set.join(SLIDE_SEP);
	return (
		<div role="dialog" aria-modal="true" aria-label="Slide overview" className="absolute inset-0 z-20 flex flex-col bg-[color-mix(in_srgb,var(--bg)_94%,transparent)] backdrop-blur-sm">
			<div className="flex items-center gap-2 px-4 py-3 sm:px-6">
				<span className="font-mono text-[11px] font-bold uppercase tracking-widest text-muted-foreground">All slides — {set.length}</span>
				<span className="flex-1" />
				<button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground" aria-label="Close slide overview"><X className="size-5" /></button>
			</div>
			{/* The scroller and the grid are two elements now, with the pool's frame layer between
			    them: the layer is `absolute inset-0` over the SCROLL CONTENT, so it scrolls with the
			    tiles natively and a slot's offset from its tile never has to be re-synced. */}
			{/* `pt-2`: the current tile's ring sits 3px OUTSIDE the slide (an offset outline, since
			    the tile has no card of its own), so the scroller needs room above the first row. */}
			<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-2 sm:px-6">
				<PreviewPool>
					<div className="grid auto-rows-min grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
						{set.map((s, i) => (
							<Thumb
								// biome-ignore lint/suspicious/noArrayIndexKey: slides are positional; index IS the stable identity here.
								key={i}
								options={options}
								sample={deck}
								slideIndex={i}
								slideCount={set.length}
								slideMarkdown={frontMatter ? frontMatter + s : s}
								mermaid={hasMermaid(s)}
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
				</PreviewPool>
			</div>
		</div>
	);
}
