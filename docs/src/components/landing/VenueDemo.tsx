import { CircleCheck, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import DeckPreview from '@/components/DeckPreview';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { VenueFinding } from './engine-facts';
import { VENUE_ONE, VENUE_SPLIT, VENUE_SPLIT_SLIDES, venueDeck } from './room-decks';

// The venue demo: ONE five-number slide in the four rooms a 16:9 deck is shown in
// (lib/core/resolve-venue.js). A bigger room sets bigger type, and the engine never
// shrinks it back to fit, so the slide that fits a laptop is too full for a conference
// screen. That is a FAILURE: whatever does not fit is cut off, and the linter says so
// before anyone sees it. Then the author's fix: the same five numbers as two slides.
//
// Nothing here is hand-written about the engine. Every slide is a live render through the
// shared <DeckPreview> bridge, and every warning is `lint:deck`'s own text, computed at
// build time (engine-facts.ts `venueFindings`) and pinned by engine-facts.test.ts.
//
// The venues are named as VIEWING CONDITIONS ("A conference screen"), never as audiences,
// so they never read as rivals to the six rooms above ("The lecture hall" is a room; the
// `hall` venue is an auditorium-sized screen).

/** One room's verdicts, computed at build time (engine-facts.ts). The decks themselves are
 *  composed here from room-decks.ts, the same builder engine-facts lints, so the props carry
 *  only the findings. */
export type VenueVerdictLite = { venue: string; label: string; who: string; one: VenueFinding[]; split: VenueFinding[] };

export type VenueDemoData = {
	venues: VenueVerdictLite[];
	themeBase: string;
	runtimeUrl: string;
	engineUrl: string;
	dagreUrl: string;
	katexUrl: string;
};

const LABEL = 'font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground';

export default function VenueDemo({ data }: { data: VenueDemoData }) {
	// Opens on the first room the slide FAILS in, so the failure and the fix are on screen
	// without a click; the laptop and the meeting-room TV are one tap away.
	const [venue, setVenue] = React.useState(data.venues.find((v) => v.one.length)?.venue ?? data.venues[0]?.venue ?? 'laptop');
	const options = React.useMemo(
		() => ({
			themeBase: data.themeBase,
			runtimeUrl: data.runtimeUrl,
			engineUrl: data.engineUrl,
			dagreUrl: data.dagreUrl,
			katexUrl: data.katexUrl,
		}),
		[data.themeBase, data.runtimeUrl, data.engineUrl, data.dagreUrl, data.katexUrl],
	);
	return (
		<div className="lx-ui min-w-0">
			<Tabs value={venue} onValueChange={setVenue}>
				<TabsList
					aria-label="Where the deck will be shown"
					className="grid w-full grid-cols-2 gap-1 group-data-[orientation=horizontal]/tabs:h-auto sm:grid-cols-4"
				>
					{data.venues.map((v) => (
						<TabsTrigger key={v.venue} value={v.venue} className="min-h-10 text-[14px]">
							{v.label}
						</TabsTrigger>
					))}
				</TabsList>
				{data.venues.map((v) => {
					const warned = v.one.length > 0;
					const active = venue === v.venue;
					const oneDeck = venueDeck(v.venue, VENUE_ONE);
					const splitSlides = VENUE_SPLIT_SLIDES.map((b) => venueDeck(v.venue, b));
					const splitDeck = venueDeck(v.venue, VENUE_SPLIT);
					return (
						<TabsContent key={v.venue} value={v.venue} className="mt-4">
							<div className="grid grid-cols-1 gap-x-[clamp(20px,3vw,36px)] gap-y-6 lg:grid-cols-2">
								<div className="min-w-0">
									<p className="m-0 mb-1 text-[15px] leading-[1.55] text-foreground">
										{/* Introduce, then look: what to look at, before the picture. */}
										{warned
											? `${v.label}, for ${v.who}: the type is larger, so the five tiles no longer fit side by side. Look at the edges: tiles are cut off, and Lattice marks the slide as too full.`
											: `${v.label}, for ${v.who}: all five numbers fit at this type size.`}
									</p>
									<p className={`m-0 mb-2 ${LABEL}`}>
										One slide · <code>venue: {v.venue}</code>
									</p>
									<DeckPreview
										options={options}
										sample={oneDeck}
										drawn={false}
										active={active}
										frame="stage"
										className="live-host relative m-0 aspect-video w-full overflow-hidden"
										aria-label={`The five-number slide as it renders on ${v.label.toLowerCase()}`}
									/>
									<LintVerdict findings={v.one} />
								</div>
								<div className="min-w-0">
									{warned ? (
										<>
											<p className="m-0 mb-1 text-[15px] leading-[1.55] text-foreground">
												Your fix: the same five numbers on two slides that fit at this size. On a 16:9 deck, Lattice
												never splits a slide for you.
											</p>
											<p className={`m-0 mb-2 ${LABEL}`}>The fix · two slides</p>
											<div className="grid grid-cols-2 gap-2.5">
												{splitSlides.map((s, i) => (
													<DeckPreview
														key={s}
														options={options}
														sample={splitDeck}
														slideIndex={i}
														slideCount={splitSlides.length}
														slideMarkdown={s}
														drawn={false}
														active={active}
														frame="tile"
														className="live-host relative m-0 aspect-video w-full overflow-hidden"
														aria-label={`The fix, slide ${i + 1} of ${splitSlides.length}, on ${v.label.toLowerCase()}`}
													/>
												))}
											</div>
											<LintVerdict findings={v.split} />
										</>
									) : (
										<p className="m-0 text-[15px] leading-[1.55] text-muted-foreground">
											Nothing to fix here. Pick a conference screen or an auditorium to see the same slide fail, and how to fix it.
										</p>
									)}
								</div>
							</div>
						</TabsContent>
					);
				})}
			</Tabs>
		</div>
	);
}

/** Lint's text marks code with backticks, as Markdown does; show those spans as code. */
function withCode(text: string): React.ReactNode[] {
	return text.split(/`([^`]+)`/).map((part, i) =>
		i % 2 ? (
			// biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed string never reorder.
			<code key={i} className="font-mono text-[0.9em]">
				{part}
			</code>
		) : (
			part
		),
	);
}

/** The linter's verdict on one deck, in its own words. */
function LintVerdict({ findings }: { findings: VenueFinding[] }) {
	if (!findings.length) {
		return (
			<p className="m-0 mt-2.5 flex items-center gap-2 text-[14px] text-foreground">
				<CircleCheck aria-hidden="true" className="size-4 flex-none text-primary" />
				<span>
					<code className="font-mono text-[0.9em]">lint:deck</code>: no warnings.
				</span>
			</p>
		);
	}
	return (
		<div className="mt-2.5 flex flex-col gap-2">
			{findings.map((f) => (
				<div
					key={f.message}
					role="note"
					className="flex gap-2.5 rounded-lg border border-[var(--warn)] bg-card px-3.5 py-2.5 text-card-foreground"
				>
					<TriangleAlert aria-hidden="true" className="mt-0.5 size-4 flex-none text-[var(--warn)]" />
					<div className="min-w-0 text-[14px] leading-[1.5]">
						<p className="m-0">
							<span className="font-semibold text-[var(--text-heading)]">Warning</span>{' '}
							<code className="font-mono text-[0.88em] text-muted-foreground">{f.rule}</code>
						</p>
						<p className="m-0">{withCode(f.message)}</p>
						{f.fix && <p className="m-0 text-muted-foreground">Fix: {withCode(f.fix)}</p>}
					</div>
				</div>
			))}
		</div>
	);
}
