import { ArrowRight } from 'lucide-react';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { librariesNav } from '@/lib/nav.mjs';
import { slideFrameStyle } from '@/lib/slide-frame';

// Static marketing sections — rendered to HTML server-side (NO client:
// directive → zero JS). They use the bridged shadcn token utilities (bg-card,
// text-foreground, text-muted-foreground, border, text-primary…), so a palette
// or light/dark switch on <html> re-themes them for free. The interactive bits
// (hero Preview/Source tabs, the restyle carousel, the live card previews) are
// separate React islands that DO hydrate.
//
// Copy contract: marketing surfaces say "layout"; reference docs say
// "component". Code-styled names (`big-number`) appear only where the copy
// shows what you TYPE; plain English ("a verdict grid") where prose names the
// idea. See engineering/decisions/2026-07-02-website-copy-positioning.md §7.2.

/** Mono eyebrow line above each section heading. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
	return (
		<p className="m-0 font-mono text-[12px] font-medium uppercase tracking-[0.16em] text-primary">{children}</p>
	);
}

/** Section header block (eyebrow + h2 + optional lead). */
export function SectionHead({
	eyebrow,
	title,
	children,
}: {
	eyebrow: string;
	title: React.ReactNode;
	children?: React.ReactNode;
}) {
	return (
		<div className="mb-10 max-w-[62ch]">
			<div className="mb-3">
				<Eyebrow>{eyebrow}</Eyebrow>
			</div>
			<h2 className="mb-3.5 font-[family-name:var(--font-display)] text-[clamp(28px,3.4vw,42px)] leading-[1.08] tracking-[-0.02em] text-[var(--text-heading)]">
				{title}
			</h2>
			{children && <p className="m-0 text-[17px] text-foreground">{children}</p>}
		</div>
	);
}

// ── "How it works" strip ────────────────────────────────────────────────────
// A slim three-step band under the audience rooms. It sits AFTER the "why" (the
// say-more section and the rooms), so the visitor meets the mechanism once they
// know what it is for; its payload is the two facts the fold no longer carries —
// you name a layout, and one command emits every delivery format.
const HOW_STEPS: { verb: string; body: React.ReactNode }[] = [
	{ verb: 'Write', body: 'a slide is a few lines of Markdown.' },
	{
		verb: 'Name a layout',
		body: (
			<>
				call it <code className="font-mono text-[0.9em] text-primary">big-number</code>,{' '}
				<code className="font-mono text-[0.9em] text-primary">gantt</code>, or{' '}
				<code className="font-mono text-[0.9em] text-primary">verdict-grid</code>.
			</>
		),
	},
	{ verb: 'Build', body: 'one command renders the PDF, PPTX, PNG, or HTML.' },
];

export function HowItWorks() {
	return (
		// biome-ignore lint/a11y/noRedundantRoles: list-style:none makes WebKit drop the implicit list role — the explicit role restores "list, 3 items" for VoiceOver.
		<ol role="list" className="m-0 grid list-none grid-cols-1 gap-[18px] p-0 sm:grid-cols-3">
			{HOW_STEPS.map((s, i) => (
				<li key={s.verb} className="flex items-start gap-3.5">
					<span
						aria-hidden="true"
						className="mt-0.5 inline-flex size-7 flex-none items-center justify-center rounded-full bg-primary font-mono text-[13px] font-bold"
						style={{ color: 'var(--on-accent)' }}
					>
						{i + 1}
					</span>
					<p className="m-0 text-[15px] leading-[1.55] text-foreground">
						<strong className="font-semibold text-[var(--text-heading)]">{s.verb}</strong> — {s.body}
					</p>
				</li>
			))}
		</ol>
	);
}

// ── "Say more with less" ────────────────────────────────────────────────────
// The communication thesis, in words, directly under the hero that SHOWS it: the
// memo-to-waterfall before/after moved up into the hero in the third scoring
// round, so this band states the idea and its three beats and does not repeat the
// demonstration. See engineering/decisions/2026-10-28-home-positioning-audit.md §5, §15.
const SAY_MORE_BEATS: { lead: string; body: string }[] = [
	{
		lead: 'One idea per slide.',
		body: 'Each idea gets a layout built for it, and Lattice warns you when a slide runs long.',
	},
	{
		lead: 'Show it instead of saying it.',
		body: 'A plain list becomes a funnel, a Gantt chart, a map, or a verdict grid. No drawing tool.',
	},
	{
		lead: 'Spend the hour on the argument.',
		body: 'The design is finished before you start, so the time goes into what you are saying.',
	},
];

export function SayMoreSection() {
	return (
		<div className="lx-ui grid grid-cols-1 items-start gap-x-[clamp(24px,3vw,44px)] gap-y-8 lg:grid-cols-[1fr_1.05fr]">
			<div className="min-w-0">
				<div className="mb-3">
					<Eyebrow>Say more with less</Eyebrow>
				</div>
				<h2 className="mb-3.5 font-[family-name:var(--font-display)] text-[clamp(28px,3.4vw,42px)] leading-[1.08] tracking-[-0.02em] text-[var(--text-heading)]">
					People decide in seconds. Give them a slide, not a paragraph.
				</h2>
				<p className="m-0 text-[17px] leading-[1.6] text-foreground">
					A deck has one job: to move what you know into the heads of the people who decide. A paragraph makes them hunt
					for the point; a slide built for one idea puts it in front of them.
				</p>
			</div>
			<dl className="m-0 flex min-w-0 flex-col gap-4 lg:pt-10">
				{SAY_MORE_BEATS.map((b) => (
					<div key={b.lead}>
						<dt className="text-[17px] font-semibold text-[var(--text-heading)]">{b.lead}</dt>
						<dd className="m-0 text-[15.5px] leading-[1.55] text-foreground">{b.body}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}

// ── "Every room" cards ──────────────────────────────────────────────────────
// The audience, organized by the ROOM a deck is for rather than the author's job
// title: a sales lead and a CFO make different decks for different rooms, and
// both should find theirs. Each card names who presents there, real layouts that
// exist today, and one fact the site already proves (offline, WCAG AA, one brand
// file, free) — no new claims. The former "speaks your field" professions live on
// as "The review" and as examples inside the other rooms.
// Each card carries a live-preview HOST (`data-live-card`) that the LiveCards
// island fills with a real slide, plus an "Edit this" link (its data-open-deck
// handoff seeds the playground via landing-handoff.ts). The slide sources live in
// room-decks.ts. See engineering/decisions/2026-10-28-home-positioning-audit.md §6.
// `deck` is a full worked deck from exemplars/ for that room: a whole deck, not one
// slide, committed with its PDF (the nightly bless renders it). The site does not
// serve those PDFs, so the link opens GitHub's PDF preview of `main`.
// `outcome` is what the room's audience gets, in their words, before any layout is
// named: the third scoring round found the cards described layouts, not results.
type RoomCard = {
	live: string;
	room: string;
	who: string;
	outcome: string;
	body: React.ReactNode;
	deck: { label: string; path: string };
};

const EXEMPLAR_PDF = (path: string) => `https://github.com/Laticent/lattice/blob/main/exemplars/${path}.pdf`;

const ROOM_CARDS: RoomCard[] = [
	{
		live: 'boardroom',
		room: 'The boardroom',
		who: 'Executives, finance, founders',
		outcome: 'The board reads the decision, not the decoration.',
		body: 'A verdict grid that scores the options, like this one; a decision slide that names the call; a waterfall that explains the change. Every page of the board pack matches.',
		deck: { label: 'a full board update', path: 'corporate/board-update' },
	},
	{
		live: 'pitch',
		room: 'The pitch',
		who: 'Sales and marketing teams',
		outcome: 'Every rep sends a deck that looks like the brand.',
		body: 'A funnel that shows where the pipeline leaks, like this one, plus layouts for pricing tiers, customer logos, and quotes. The brand lives in one file, so every rep’s deck matches, and any deck exports to PowerPoint with text you can edit.',
		deck: { label: 'a full sales deck', path: 'corporate/sales-deck' },
	},
	{
		live: 'briefing',
		room: 'The briefing',
		who: 'Government and the public sector',
		outcome: 'Members see the recommendation and its evidence in one view.',
		body: 'A policy recommendation with its evidence cited, a regulatory update, a risk matrix. It runs offline on your own machine, and every layout meets WCAG AA contrast.',
		deck: { label: 'a full policy briefing', path: 'government-public/policy-briefing' },
	},
	{
		live: 'lecture',
		room: 'The lecture hall',
		who: 'Faculty, researchers, students',
		outcome: 'Students follow the argument one step at a time.',
		body: 'Real math notation, plots, diagrams, and a glossary. Free and open source. Each lecture is a text file you can keep, share, and reuse next term.',
		deck: { label: 'a full lecture', path: 'academic/lecture' },
	},
	{
		live: 'mission',
		room: 'The mission',
		who: 'Nonprofits and foundations',
		outcome: 'Donors see what their gift did.',
		body: 'Impact numbers like these, plus layouts for a map of the countries or states you serve and the people who do the work. It’s free, so the donor report looks professional without a design budget.',
		deck: { label: 'a full annual impact report', path: 'nonprofit/impact-annual-report' },
	},
	{
		live: 'review',
		room: 'The review',
		who: 'Engineers, lawyers, analysts, project leads',
		outcome: 'The team sees the plan, the risk, and the code on one page.',
		body: '', // filled below with the live layout count
		deck: { label: 'a full project status review', path: 'general-team/project-status' },
	},
];

export function RoomCards({ playgroundHref, layoutCount }: { playgroundHref: string; layoutCount: number }) {
	const cards = ROOM_CARDS.map((c) =>
		c.live === 'review'
			? {
					...c,
					body: (
						<>
							Gantt charts, every Mermaid diagram type, code diffs, statute stacks, and radar charts, in the notation
							each field expects. {layoutCount} layouts in all, one Markdown syntax.
						</>
					),
				}
			: c,
	);
	return (
		// Below `sm` the six cards are a horizontal swipe row (scroll-snap), each 84%
		// wide so the next one peeks in. Stacked, they were about six phone screens of
		// scroll before the next section; both scoring reviews flagged the length. The
		// row bleeds to the screen edge by cancelling `.wrap`'s 24px gutter, and its own
		// overflow keeps the page itself from ever scrolling sideways.
		// No tabIndex on the row: every card holds a focusable "Edit" link, and tabbing
		// to it scrolls that card into view, so the keyboard reaches all six.
		<div className="grid grid-cols-1 gap-[18px] max-sm:-mx-[24px] max-sm:flex max-sm:snap-x max-sm:snap-mandatory max-sm:overflow-x-auto max-sm:scroll-px-[24px] max-sm:px-[24px] max-sm:pb-3 sm:grid-cols-2 lg:grid-cols-3">
			{cards.map((c) => (
				<Card key={c.live} className="gap-0 overflow-hidden py-6 max-sm:w-[84%] max-sm:flex-none max-sm:snap-start">
					<CardContent className="flex flex-col">
						{/* Live-preview host — filled by FieldCardsLive (data-live-card). A slide
						    frame (docs/src/lib/slide-frame.ts): it never shapes the slide. */}
						<div
							className="live-host relative mb-[18px] aspect-video overflow-hidden"
							data-slide-frame
							style={slideFrameStyle('tile')}
							data-live-card={c.live}
						/>
						<h3 className="room-title">{c.room}</h3>
						<p className="room-who">{c.who}</p>
						<p className="room-outcome">{c.outcome}</p>
						<p className="m-0 text-[15px] text-foreground">{c.body}</p>
						<div className="room-links">
							{/* Names the Playground where it is genuinely the right tool: each card
							    holds ONE slide, and "paste a slide, watch it render" is a slide verb. */}
							<a className="room-link" href={playgroundHref} data-open-deck={c.live}>
								Edit this in the playground <ArrowRight aria-hidden="true" className="ico-arrow" />
							</a>
							<a className="room-link" href={EXEMPLAR_PDF(c.deck.path)} target="_blank" rel="noopener">
								See {c.deck.label} (PDF) <ArrowRight aria-hidden="true" className="ico-arrow" />
							</a>
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

// ── Drift picture ───────────────────────────────────────────────────────────
// The blank-canvas problem SHOWN, not described: four slides four people made on
// blank canvases (each picks its own font, size, alignment and shade of the brand
// color), beside the same four slides from one Lattice palette. Both scoring
// reviewers in the third round found the contrast with blank-canvas tools told in
// prose only. An illustration, drawn in CSS from the page's own tokens so it
// follows the palette and light/dark like everything else; no hex (HARD RULE #3's
// spirit on a docs surface), no typed glyphs (#29).
type MiniSlide = { title: string; font: string; size: string; align: string; bar: string; weight: string };

const DRIFTED: MiniSlide[] = [
	{ title: 'Q3 revenue', font: 'var(--font-display)', size: '15px', align: 'left', bar: 'var(--accent)', weight: '700' },
	{
		title: 'PIPELINE UPDATE',
		font: 'var(--font-body)',
		size: '11px',
		align: 'center',
		bar: 'color-mix(in srgb, var(--accent) 55%, var(--text-heading))',
		weight: '600',
	},
	{
		title: 'Hiring Plan',
		font: 'ui-serif, Georgia, serif',
		size: '17px',
		align: 'left',
		bar: 'color-mix(in srgb, var(--accent) 45%, var(--bg-alt))',
		weight: '400',
	},
	{
		title: 'risks & next steps',
		font: 'ui-monospace, monospace',
		size: '12px',
		align: 'right',
		bar: 'color-mix(in srgb, var(--accent) 70%, var(--bg))',
		weight: '500',
	},
];
const ALIGNED: MiniSlide[] = ['Q3 revenue', 'Pipeline update', 'Hiring plan', 'Risks and next steps'].map((title) => ({
	title,
	font: 'var(--font-display)',
	size: '14px',
	align: 'left',
	bar: 'var(--accent)',
	weight: '700',
}));

function MiniSlideRow({ slides, label }: { slides: MiniSlide[]; label: string }) {
	return (
		<div className="min-w-0">
			<p className="m-0 mb-2.5 font-mono text-[11.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
				{label}
			</p>
			<ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-4">
				{slides.map((m) => (
					<li key={m.title} className="drift-mini">
						<span aria-hidden="true" className="drift-bar" style={{ background: m.bar }} />
						<span
							className="drift-title"
							style={{ fontFamily: m.font, fontSize: m.size, fontWeight: m.weight, textAlign: m.align as 'left' }}
						>
							{m.title}
						</span>
						<span aria-hidden="true" className="drift-line" />
						<span aria-hidden="true" className="drift-line" />
					</li>
				))}
			</ul>
		</div>
	);
}

export function DriftDemo() {
	return (
		<figure className="lx-ui m-0 flex flex-col gap-6 rounded-xl border border-border bg-muted p-[clamp(16px,2.5vw,28px)]">
			<MiniSlideRow slides={DRIFTED} label="Four people, four blank canvases" />
			<MiniSlideRow slides={ALIGNED} label="The same four slides, one Lattice palette" />
			<figcaption className="m-0 text-[13px] text-muted-foreground">
				An illustration: the same deck, made twice.
			</figcaption>
		</figure>
	);
}

// ── "Why" cards (no live preview) ───────────────────────────────────────────
type WhyCard = { id: string; title: React.ReactNode; body: React.ReactNode };

const WHY_CARDS: WhyCard[] = [
	{
		id: 'git-diff',
		title: 'Every change is visible.',
		body: 'A deck is a text file, so a revision shows exactly which words changed, line by line, instead of leaving you to hunt for the box that moved three pixels.',
	},
	{
		id: 'mermaid',
		title: 'Diagrams match the deck.',
		body: 'Flowcharts and sequence diagrams take the deck’s colors and type automatically, so a diagram never needs styling of its own.',
	},
	{
		id: 'vocabulary',
		title: 'Layouts you ask for by name.',
		body: (
			<>
				You ask for a verdict grid, a derivation, a statute stack — the name says what the slide does. &ldquo;Which
				layout do I want?&rdquo; has an answer that isn&rsquo;t <em>scroll the gallery</em>.
			</>
		),
	},
	{
		id: 'no-service',
		title: 'No service, no account, no telemetry.',
		body: 'The engine runs on your own machine, or in your own build, and sends nothing anywhere.',
	},
];

export function WhyCards() {
	return (
		// Four cards, two by two, closing the "Your brand, on every deck" section. The
		// brand-colors card became that section's carousel and the contrast card lives
		// in the briefing room card: the scoring reviews counted the repeats (audit §14).
		<div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2">
			{WHY_CARDS.map((c) => (
				<Card
					key={c.id}
					className="gap-0 py-0"
				>
					<CardContent className="px-6 py-[26px]">
						<h3 className="mb-2 font-[family-name:var(--font-body)] text-[18px] font-semibold leading-[1.3] tracking-[-0.01em] text-[var(--text-heading)]">
							{c.title}
						</h3>
						<p className="m-0 text-[15px] text-foreground">{c.body}</p>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

// ── Proof strip ─────────────────────────────────────────────────────────────
// One receipt from /comparison, promoted to the landing. The headline is a
// protected line (copy-positioning doc §10) — promote verbatim, never rewrite.
// The study is linked INLINE (the same source and date comparison.astro cites):
// a page that attacks AI tools for unsourced numbers cannot print one bare, and
// both scoring reviews on 2026-10-28 read it as uncited from here.
// The attribution carries the caveat; the full sourced treatment (with its
// "read it as directional" footnote) lives one click away on /comparison.
export function ProofStrip({ comparisonHref }: { comparisonHref: string }) {
	return (
		<div className="mx-auto max-w-[62ch] text-center">
			<h2 className="mb-4 font-[family-name:var(--font-display)] text-[clamp(26px,3vw,38px)] leading-[1.12] tracking-[-0.02em] text-[var(--text-heading)]">
				The artsy deck wins the demo. The deterministic deck wins the boardroom.
			</h2>
			<p className="m-0 mb-5 text-[16.5px] leading-[1.6] text-foreground">
				When{' '}
				<a
					className="font-semibold text-primary hover:underline"
					href="https://medium.com/@neel2108/we-fact-checked-6-ai-presentation-makers-heres-how-often-they-hallucinate-90e6093e42fc"
					rel="noopener"
				>
					one team fact-checked six AI deck generators
				</a>{' '}
				in February 2026, the best got 20% of its claims right. Models predict plausible text instead of looking facts
				up. Lattice never invents a number or reshuffles a layout.
			</p>
			<a
				className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-primary hover:underline"
				href={comparisonHref}
			>
				Read the comparison — including where Lattice loses <ArrowRight aria-hidden="true" className="size-4" />
			</a>
		</div>
	);
}

// ── The Studio section ──────────────────────────────────────────────────────
// The page's "what is behind the browser door" answer, at position 3 — AFTER
// "How it works", so the visitor reads the text-file → named-layout → one-command
// model BEFORE they learn there is an app. That order is deliberate: at position
// 2 the page would read "web app that also has a CLI"; at 3 it reads "engine,
// and here is the room it lives in."
//
// It ABSORBS the former ByomSection. Every asset of that section survives
// verbatim — the `Bring your own model` eyebrow (red-teamed in the copy doc
// §5.5 precisely to disclaim at skim altitude), the `Point your copilot at
// Lattice.` heading words, the whole body paragraph, and the `How AI authoring
// works →` link and its #ai-authoring target. It loses only its h2 altitude and
// its own band. The page therefore carries ONE AI conversation instead of two in
// two registers, and it is the one wearing the disclaiming eyebrow.
//
// These three exports are ALL server-rendered, zero JS. They do not compose the
// section: `index.astro` owns the panel and the grid, and places `StudioCopy`,
// the `StudioPreview` island, and `StudioActions` into it as siblings. That
// split is forced — a `client:` island passed as `children` to a server-rendered
// React component throws an invalid-hook-call during SSR — and it is the same
// shape the hero already uses (HeroCopy beside HeroPreview). It also means the
// live preview can be deferred or dropped without touching this module.
// See engineering/decisions/2026-07-30-landing-studio-promotion.md §3.2, §6.1
// and its "Deviations" section.
const STUDIO_ROWS: { label: string; body: React.ReactNode }[] = [
	// Written as what the reader DOES and GETS, not as a parts list. An earlier
	// draft named five engine-internal nouns here ("inline lint", "scorecard",
	// "renderer", "the real render", "self-contained webpage") — two of which the
	// Studio's own UI never shows a user, which made the rows both jargon-heavy
	// and off-label.
	// Compose and live editing ride in this row rather than a fourth one (owner pick,
	// PR 2964 D2): both are proven on the real Studio (compose-panes, live-session-check),
	// and a fourth row costs phones a screen.
	{
		label: 'Edit',
		body: 'Write in Markdown, or in Compose, a plain writing page with no Markdown at all, beside a live preview of the finished slide. Share a link and up to four people edit with you live, on a voice call.',
	},
	{
		label: 'Review',
		// The load-bearing row — what makes "web slide app" impossible to say about
		// the Studio. Its claim is now scoped to what is actually true, because the
		// first draft overclaimed in two places:
		//   • the CHECKS are genuinely shared — coach-core.ts runs lintCore +
		//     reviewCore out of authoring-core.generated.js, the same files
		//     tools/lint-deck.js requires;
		//   • the SCORE is not. `scoreDeck` has no CLI caller at all, so "the same
		//     review the command line runs — a scorecard" was false. The score is
		//     the Studio's own, and its panel is titled "Deck read".
		//   • the deterministic per-finding fix surfaces in the EDITOR's inline
		//     diagnostics (editor-diagnostics.js appends "Fix: …"), not in the
		//     review list — whose fix affordance is AI-gated, i.e. the opposite of
		//     deterministic. So the fix is credited to the editor, where it is.
		body: 'The same deterministic checks the command line runs, plus craft and style scores. Every issue is named, and the editor underlines where to fix it.',
	},
	{
		label: 'Present & ship',
		// Split from one 21-word sentence carrying six list items. Formats stay in
		// the plain register the "How it works" band already uses two sections up.
		body: 'The deck on your second screen, your notes and the next slide on yours, and a rehearsal plan. Export a PDF, a PowerPoint, or a single web page that works offline.',
	},
];

// The section's prose: eyebrow, headline, lead, and the three capability rows.
//
// Astro owns the panel and the grid around it (so the live preview can sit
// beside this as a SIBLING island — a `client:` island nested inside a
// server-rendered React component's children is not a shape Astro supports),
// exactly as the hero already splits HeroCopy / HeroPreview.
//
// The CTAs are deliberately NOT here — they are their own grid child
// (`StudioActions`) so that when the grid stacks below `lg`, the button lands
// directly under the preview rather than above it. The impulse to open the
// Studio peaks the moment the visitor has seen the slide; a scroll between the
// proof and the button spends that impulse.
export function StudioCopy() {
	return (
		<div className="lx-ui min-w-0">
			<div className="mb-3">
						{/* The same six words as nav.mjs's Studio `desc`, so a visitor who
						    opened the mobile menu and a visitor who scrolled learn one phrase. */}
						<Eyebrow>Write, review, present — in the browser</Eyebrow>
					</div>
					{/* Reader-facing, like every other H2 on this page ("Your field already
					    has a notation", "Change one line. Restyle the whole deck."). An
					    earlier draft read "The Studio puts the engine in a window." — the
					    only H2 whose subject AND object were both Lattice internals, and
					    "puts X in a window" is developer idiom for wrapping a library in a
					    GUI. The engine-subordination that answers "yet another web slide
					    app" is carried by the lead below, where it belongs. */}
					<h2 className="mb-3.5 font-[family-name:var(--font-display)] text-[clamp(28px,3.4vw,42px)] leading-[1.08] tracking-[-0.02em] text-[var(--text-heading)]">
						The same deck, without installing anything.
					</h2>
					{/* No "renderer" — the page already owns one word for this and it is
					    "engine"; a second name one line under the H2 reads as a second
					    thing. No second "command line" either (the Review row carries it).
					    And not "a deck library": the Studio's Library holds themes,
					    components and finishes — decks live in the workspace, so the old
					    wording named a real surface that holds something else. */}
					<p className="m-0 mb-6 max-w-[46ch] text-[17px] leading-[1.6] text-foreground">
						The same engine that renders your PDFs, running in a browser tab — with an editor, your saved decks, and
						Present mode around it. Your decks live in this browser: no account, nothing to install.
					</p>

					{/* Three beats, echoing the "How it works" band two sections up so the
					    page reads as one voice. Three rather than four: mobile pays for
					    every row, and this section already costs it the most. */}
					<dl className="m-0 flex flex-col gap-3">
						{STUDIO_ROWS.map((r) => (
							<div key={r.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2.5">
								<dt className="flex-none text-[15px] font-semibold text-[var(--text-heading)] sm:w-[8.5rem]">
									{r.label}
								</dt>
								<dd className="m-0 text-[15px] leading-[1.5] text-foreground">{r.body}</dd>
							</div>
						))}
					</dl>

		</div>
	);
}

// The section's CTAs — its own grid child so the stacked (< lg) order puts the
// button immediately under the live preview. See StudioCopy's note.
export function StudioActions({ studioHref, newDeckHref }: { studioHref: string; newDeckHref: string }) {
	return (
		<div className="lx-ui flex flex-wrap items-center gap-x-5 gap-y-3">
			<Button asChild size="lg" className="max-sm:w-full">
				<a href={studioHref}>
					Open the Studio <ArrowRight aria-hidden="true" />
				</a>
			</Button>
			{/* py-2 inline-block keeps this tap target ≥44px on a phone. */}
			<a
				className="inline-block py-2 text-[14px] font-semibold text-primary hover:underline focus-visible:underline"
				href={newDeckHref}
			>
				{/* "a new deck", not "a blank deck": `?new=1` seeds a title slide
				    (studio-store `newDeckSource`), so "blank" promised something the
				    click does not deliver. */}
				Or start a new deck <ArrowRight aria-hidden="true" className="inline size-3.5" />
			</a>
		</div>
	);
}

// The section's trust footer, spanning the full panel under the columns.
//
// It deliberately carries NO eyebrow and does not name the nav's `Preview`
// badge. An earlier draft opened with "Why the nav says Preview" and "The Studio
// is still growing" — which is the move the 2026-07-02 review already killed for
// the Marp disclaimer on getting-started: it answers a question no newcomer
// asked and plants a doubt they did not have, at headline weight. It also had no
// gate tying it to `nav.mjs`'s badge, so the day the badge is dropped the
// homepage would have quietly started lying. The payload below does all of the
// trust work with none of the doubt, and stays true whatever the nav says.
export function StudioTrust() {
	return (
		<div className="lx-ui mt-8 max-w-[62ch] border-t border-border pt-8">
			{/* "One click saves a copy" — the whole-workspace backup genuinely is one
			    click; an export is two (open Share, pick a format), so the earlier
			    "everything you write exports … in one click" overstated it. */}
			<p className="m-0 text-[15px] leading-[1.55] text-foreground">
				Every slide on this page was rendered by what ships today. Your work is yours: export any deck, or save a
				copy of everything you have written, in one click.
			</p>
		</div>
	);
}

// ── "Bring your own model" — its own band again ─────────────────────────────
// This was briefly absorbed into the Studio section as an h3 in a two-column
// footer, which held the page's section count. That trade was wrong: the eyebrow
// exists to disclaim AT SKIM ALTITUDE (copy doc §5.5, red-teamed into being
// precisely so an AI-burned skeptic does not file Lattice with the deck
// generators), and a skimmer scanning h2s never sees an h3 in someone else's
// panel. Worse, sat beside a screenshot of an editor it stopped reading as "the
// engine is agent-addressable" and started reading as "our web app has AI chat"
// — the exact adjacency §3 exists to prevent.
//
// Every string is the original, verbatim, at its original altitude. It sits
// immediately AFTER the Studio section so the page still holds one AI
// conversation rather than two in two registers.
export function ByomSection({
	featuresHref,
	url,
	layoutCount,
}: { featuresHref: string; url: (p: string) => string; layoutCount: number }) {
	return (
		<div className="grid grid-cols-1 items-start gap-x-[clamp(24px,3vw,44px)] gap-y-10 lg:grid-cols-[1.15fr_1fr]">
			<div className="min-w-0 max-w-[62ch]">
				<div className="mb-3">
					<Eyebrow>Bring your own model</Eyebrow>
				</div>
				<h2 className="mb-3.5 font-[family-name:var(--font-display)] text-[clamp(28px,3.4vw,42px)] leading-[1.08] tracking-[-0.02em] text-[var(--text-heading)]">
					Point your copilot at Lattice.
				</h2>
				<p className="m-0 mb-5 text-[17px] leading-[1.6] text-foreground">
					Lattice itself never guesses, but a model can still draft the words. Lattice ships a machine-readable layout
					catalog and a published authoring spec, so Claude, Cursor, or any agent can draft a valid deck, and the
					engine renders only what is in the file — the design was finished long before the model arrived.
				</p>
				{/* The one new sentence. "The split holds", not "the same rule holds" —
				    the paragraph above describes a split (the model drafts, the engine
				    renders), it never states a rule. */}
				<p className="m-0 mb-5 text-[17px] leading-[1.6] text-foreground">
					The split holds in the Studio too: chat and fixes are optional, and they run on your own account. Connect
					OpenRouter in one click, or download a model that runs on your device. Switch the AI off entirely and
					nothing else changes.
				</p>
				<a
					className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-primary hover:underline"
					href={featuresHref}
				>
					How AI authoring works <ArrowRight aria-hidden="true" className="size-4" />
				</a>
			</div>
			<BuildersPanel url={url} layoutCount={layoutCount} />
		</div>
	);
}

// ── For builders ────────────────────────────────────────────────────────────
// The technical visitor's band, beside "Point your copilot at Lattice" — the other
// half of the same audience. When the Libraries and Specs sections left the home
// scroll, a single sentence under Next steps replaced them, and both scoring
// reviews (2026-10-28) marked the developer visitor down for it: a technical
// buyer, often the gatekeeper for government and corporate adoption, lost the
// reasons to trust the engine. Three proof points, each with its link, and the
// AGPL line in plain words, because a procurement reader stops at the license
// name. The library count comes from nav.mjs, so it updates itself.
function BuildersPanel({ url, layoutCount }: { url: (p: string) => string; layoutCount: number }) {
	const points: { lead: string; body: React.ReactNode }[] = [
		{
			lead: 'Open formats.',
			body: (
				<>
					The deck format, the linter's findings, and narration timing are{' '}
					<a className="font-semibold text-primary hover:underline" href={url('spec/lfm/')}>
						published specs
					</a>{' '}
					(CC-BY-4.0) that another tool can implement.
				</>
			),
		},
		{
			lead: 'Parts you can reuse.',
			body: (
				<>
					The engine is{' '}
					<a className="font-semibold text-primary hover:underline" href={url('libraries/')}>
						{librariesNav(url).length} framework-free libraries
					</a>
					, each usable without Lattice.
				</>
			),
		},
		{
			lead: 'Coming from Marp or Slidev?',
			body: (
				<>
					You keep writing Markdown, and gain {layoutCount} named layouts, a linter that knows them, and an engine that
					renders the same way on every machine.{' '}
					<a className="font-semibold text-primary hover:underline" href={url('comparison/#vs-marp')}>
						The honest comparison
					</a>
					.
				</>
			),
		},
		{
			lead: 'Runs in your build.',
			body: (
				<>
					One command renders the PDF, PowerPoint, PNG, or HTML on your laptop or in CI.{' '}
					<a className="font-semibold text-primary hover:underline" href={url('getting-started/')}>
						Get started
					</a>
					.
				</>
			),
		},
	];
	return (
		<div className="min-w-0 rounded-xl border border-border bg-card p-[clamp(20px,2.5vw,32px)] text-card-foreground shadow-sm">
			<div className="mb-3">
				<Eyebrow>For builders</Eyebrow>
			</div>
			<dl className="m-0 flex flex-col gap-3.5">
				{points.map((p) => (
					<div key={p.lead}>
						<dt className="inline text-[15px] font-semibold text-[var(--text-heading)]">{p.lead}</dt>{' '}
						<dd className="m-0 inline text-[15px] leading-[1.55] text-foreground">{p.body}</dd>
					</div>
				))}
			</dl>
			<p className="m-0 mt-5 border-t border-border pt-4 text-[13.5px] leading-[1.55] text-muted-foreground">
				Open source under AGPL-3.0, with an exception that leaves every deck you make free of any license.
			</p>
		</div>
	);
}

// ── Waitlist form (Laticent desktop app) ─────────────────────────────────
// A plain HTML form that POSTs to Buttondown — no client JS. `target="_blank"`
// opens Buttondown's confirmation page in a new tab, so the landing page stays
// put. The hidden `embed=1` field is Buttondown's embeddable-form marker. The
// list lives at buttondown.com/latticestyle; endpoint per docs.buttondown.com.
export function WaitlistForm() {
	return (
		<form
			action="https://buttondown.com/api/emails/embed-subscribe/latticestyle"
			method="post"
			target="_blank"
			rel="noopener"
			className="mt-4 border-t border-border pt-4"
		>
			<p className="m-0 mb-2 text-[13.5px] text-foreground">
				Or get <span className="font-semibold text-[var(--text-heading)]">Laticent</span>, the desktop app, when it lands.
			</p>
			<div className="flex gap-2">
				<label htmlFor="bd-email" className="sr-only">
					Email address
				</label>
				<input
					id="bd-email"
					type="email"
					name="email"
					required
					autoComplete="email"
					placeholder="you@example.com"
					className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-[14px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
				/>
				<input type="hidden" name="embed" value="1" />
				<button
					type="submit"
					className="flex-none rounded-md bg-primary px-3.5 py-2 text-[13.5px] font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
					style={{ color: 'var(--on-accent)' }}
				>
					Notify me
				</button>
			</div>
		</form>
	);
}

// ── Next-step cards ─────────────────────────────────────────────────────────
// Most cards are a single whole-card link. A card flagged `form` instead holds
// an inline CTA link plus the waitlist form — a form can't nest inside the
// card's <a>, so that card renders as a <div>.
// `body` is a ReactNode, not a string, so a card can carry an inline link — the
// Studio card needs to name the playground mid-sentence without spending its
// own CTA on it.
type NextStep = { href: string; title: string; body: React.ReactNode; cta: string; form?: boolean };

/**
 * The four next-step cards. This lives here rather than in `index.astro`
 * because card 4's body carries an inline link, and JSX cannot appear in Astro
 * frontmatter — which is also the more consistent home, since every other block
 * of landing copy (HOW_STEPS, ROOM_CARDS, WHY_CARDS) is already in this file.
 *
 * Card 1 is the developer door. The libraries and specs used to hold two full
 * sections of the home scroll; they are real assets for developers and they
 * spent a general visitor's attention, so they live in the "For builders" panel
 * beside the AI section, the header's Libraries menu, and the footer
 * (2026-10-28-home-positioning-audit.md §7, §13).
 * The base-aware `url` helper is passed in so the module stays free of
 * `import.meta.env`.
 */
export function nextStepsFor(url: (p: string) => string): NextStep[] {
	return [
		{
			href: url('studio/'),
			// First: the business visitor's door, titled for what they get, not for a
			// constraint (the second scoring round asked to lead with it). It keeps the
			// two-door split: the Studio for a whole deck, the playground for a quick
			// paste-and-render.
			title: 'Make your first deck in your browser',
			body: (
				<>
					The Studio runs the whole deck in your browser — nothing to install. For a quick paste-and-render there's{' '}
					<a className="font-semibold text-primary hover:underline" href={url('playground/')}>
						the playground
					</a>
					.
				</>
			),
			cta: 'Open the Studio',
			form: true,
		},
		{
			href: url('getting-started/'),
			title: 'For developers',
			body: 'Install the command line, render your first deck in a few minutes, and build decks in CI.',
			cta: 'Getting started',
		},
		{
			href: url('guides/authoring/'),
			title: 'Author decks',
			body: "See every layout, what it's for, and the Markdown that feeds it.",
			cta: 'Authoring guide',
		},
		{
			href: url('components/'),
			title: 'Browse the layouts',
			body: 'Every layout (the reference calls them components) with a live preview and an in-browser editor — themable in all palettes.',
			cta: 'Layout reference',
		},
	];
}

export function NextSteps({ links }: { links: NextStep[] }) {
	return (
		<div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
			{links.map((l) =>
				l.form ? (
					<div
						key={l.href + l.title}
						className="flex flex-col rounded-xl border border-border bg-card p-[26px] text-card-foreground shadow-sm"
					>
						<h3 className="mb-2 font-[family-name:var(--font-body)] text-[19px] font-semibold tracking-[-0.01em] text-[var(--text-heading)]">
							{l.title}
						</h3>
						<p className="m-0 mb-3.5 text-[15px] text-foreground">{l.body}</p>
						<a
							href={l.href}
							className="group inline-flex items-center gap-1.5 text-[14px] font-semibold text-primary hover:underline"
						>
							{l.cta} <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-0.5" />
						</a>
						<WaitlistForm />
					</div>
				) : (
					<a
						key={l.href + l.title}
						href={l.href}
						className="group block rounded-xl border border-border bg-card p-[26px] text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-lg"
					>
						<h3 className="mb-2 font-[family-name:var(--font-body)] text-[19px] font-semibold tracking-[-0.01em] text-[var(--text-heading)]">
							{l.title}
						</h3>
						<p className="m-0 mb-3.5 text-[15px] text-foreground">{l.body}</p>
						<span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-primary">
							{l.cta} <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-0.5" />
						</span>
					</a>
				),
			)}
		</div>
	);
}
