import DeckPreview from '@/components/DeckPreview';

// The Studio section's proof: a caption bar over a LIVE engine render of the
// literal first slide of the literal deck the Studio boots into. It is the
// "there is a real deck already open in there" evidence that a prose section
// cannot supply.
//
// Everything it displays is DERIVED from the Studio's own module at build time
// (`DECKS[0]` — title, slides.length, slides[0]), threaded in as props by the
// Astro page. Nothing here is hand-written, so the landing cannot drift from
// the app the way a transcribed slide count would. The count comes from
// `slides.length`, deliberately NOT from the deck's hand-written `meta:
// '7 slides'` string, which can rot independently of the deck.
//
// Wraps the shared <DeckPreview> bridge (→ src/lib/single-slide-render.ts) and
// adds no frame builder of its own — so HARD RULE #22 is satisfied by the
// already-sanctioned sink, with no SANCTIONED_PREVIEW_BUILDERS entry to add.
//
// It renders slide 0 on purpose rather than the most impressive slide: at 390px
// this figure is ~302px wide and ~170px tall, where the `title` component's big
// display type and five words stay legible. A `kpi` or `stats` slide would turn
// to mush at that size.

export type StudioPreviewData = {
	sample: string;
	mermaid: boolean;
	deckTitle: string;
	slideCount: number;
	themeBase: string;
	runtimeUrl: string;
	engineUrl: string;
};

export default function StudioPreview({ data }: { data: StudioPreviewData }) {
	const options = { themeBase: data.themeBase, runtimeUrl: data.runtimeUrl, engineUrl: data.engineUrl };

	return (
		<div className="lx-ui min-w-0">
			<figure className="m-0 overflow-hidden rounded-[14px] border border-border bg-card shadow-lg">
				{/* Caption bar — the cue that this is a DECK in a workspace, not a
				    decorative specimen. The title truncates and the count is
				    flex-none, so a longer deck name can never push the count off. */}
				<div className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-2.5">
					<span className="truncate text-[13px] font-semibold text-[var(--text-heading)]">{data.deckTitle}</span>
					<span className="flex-none font-mono text-[11.5px] text-muted-foreground">{data.slideCount} slides</span>
				</div>
				<DeckPreview
					options={options}
					sample={data.sample}
					mermaid={data.mermaid}
					className="live-host relative m-0 aspect-video w-full overflow-hidden bg-muted"
					aria-label={`The first slide of the ${data.deckTitle} deck, rendered by Lattice`}
				/>
			</figure>
			<p className="m-0 mt-3 text-[13px] text-muted-foreground">
				This is the deck the Studio opens on. Edit any slide, or start your own.
			</p>
		</div>
	);
}
