// THE EMPTY DECK'S START GRID: what Compose shows under its one empty line while the deck has no slide.
//
// Design: engineering/decisions/2026-11-17-compose-empty-deck.md (the owner picked design C, after an independent
// UI/UX review scored it 8.0 to the centered button's 7.0). Choosing the first slide is the whole job on an empty
// deck, so the choices are on the page, not behind a button: four starting slides drawn with the add-slide picker's
// own `Tile` and live previews (HARD RULE #15: no second picker), and a link to the whole picker. Typing is the other
// way in, and Compose's empty line takes it. Nothing here opens by itself.

import type * as React from 'react';
import type { SingleSlideOptions } from '@/playground/single-slide-render';
import { PreviewPool } from './preview-pool';
import { type PickerItem, Tile } from './SlidePicker';

/** The starting slides, in this order: a deck opens on its title slide, so `title` leads. No Blank tile: typing makes
 *  that slide. */
export const START_SLIDES = ['title', 'content', 'cards-grid', 'big-number'] as const;

const noDetail = () => {};

export function EmptyDeckStart({ items, options, frontMatter, paletteOverride, extraTheme, modeOverride, onInsert, onBrowse }: { items: readonly PickerItem[]; options: SingleSlideOptions; frontMatter?: string; paletteOverride?: string; extraTheme?: { name: string; css: string }; modeOverride?: 'light' | 'dark'; onInsert: (item: PickerItem) => void; onBrowse: () => void }): React.ReactElement {
	const picks = START_SLIDES.map((n) => items.find((i) => i.name === n)).filter((i): i is PickerItem => !!i);
	return (
		<section aria-labelledby="cs-empty-title" aria-describedby="cs-empty-hint" data-empty-start="" className="flex w-full max-w-[560px] cursor-auto flex-col items-center gap-3 text-center">
			<h2 id="cs-empty-title" className="m-0 font-serif text-[22px] font-semibold text-[var(--text-heading)]">
				Start your deck
			</h2>
			{/* The hint is body size, not a caption: it names the other way in. A phone has no keyboard until a tap, and
			    the whole canvas is that tap (ComposeView `.cs-empty-start`). */}
			<p id="cs-empty-hint" className="m-0 text-[15px] text-[var(--text-body)]">
				Pick a first slide, or <span className="[@media(pointer:coarse)]:hidden">just start typing</span>
				<span className="hidden [@media(pointer:coarse)]:inline">tap here to start writing</span>
			</p>
			{/* One frame per tile, and no more: the pool is this grid's own. */}
			<PreviewPool baseSlots={START_SLIDES.length} maxSlots={START_SLIDES.length} className="w-full">
				<ul aria-label="Starting slides" className="m-0 grid w-full list-none grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2.5 p-0 text-left">
					{picks.map((item) => (
						<li key={item.name} className="min-w-0">
							<Tile item={item} options={options} frontMatter={frontMatter} paletteOverride={paletteOverride} extraTheme={extraTheme} modeOverride={modeOverride} onInsert={onInsert} onDetail={noDetail} />
						</li>
					))}
				</ul>
			</PreviewPool>
			<button type="button" onClick={onBrowse} className="min-h-11 rounded-md px-2 text-[14px] font-semibold text-[var(--accent)] underline underline-offset-4 hover:text-[var(--text-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
				Browse all {items.length} layouts
			</button>
		</section>
	);
}
