import { ArrowRight } from 'lucide-react';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

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
// A slim three-step band under the hero. The hero preview already shows the
// transform live; this strip's payload is the two facts missing from the
// fold — you name a layout, and one command emits every delivery format.
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

// ── "Speaks your field" cards ───────────────────────────────────────────────
// Each card carries a live-preview HOST (`data-live-card`) that the
// FieldCardsLive island fills with a real slide, plus a real "Edit this deck"
// link (its data-open-deck handoff seeds the playground via landing-handoff.ts).
// Order leads with the broadest personas; math anchors late so the page
// doesn't read "for academics" at first scroll.
type FieldCard = { live: string; title: string; body: React.ReactNode };

const FIELD_CARDS: FieldCard[] = [
	{
		live: 'gantt',
		title: 'Project leads',
		body: 'Gantt charts, kanban boards, roadmaps, journeys, and step ladders — native SVG rendered straight from a list, not pasted in from Visio.',
	},
	{
		live: 'radar',
		title: 'Analysts & consultants',
		body: 'Radar, quadrant, KPI, stats, pie, and verdict grids — the evidence layouts that turn numbers into an argument. They carry the quarterly review, the board pack, the client readout.',
	},
	{
		live: 'diagram',
		title: 'Engineers & architects',
		body: 'Every one of the 25 Mermaid diagram types renders auto-themed to the deck, state charts included — and two fenced blocks become a side-by-side, syntax-highlighted code diff.',
	},
	{
		live: 'obligation-matrix',
		title: 'Lawyers & compliance',
		body: 'An actual legal vocabulary: build a statute stack, an authority chain, an obligation matrix, a citation card, or a regulatory update from a plain list.',
	},
	{
		live: 'math',
		title: 'Mathematicians, quants & ML',
		body: 'Real KaTeX everywhere it matters: Definition / Theorem / Proof cards, derivation chains that justify every step, and an equation set beside its plot.',
	},
	{
		live: 'cards-grid',
		title: 'And the basics, for everyone',
		body: '', // filled below with the live layout count
	},
];

export function FieldCards({ playgroundHref, layoutCount }: { playgroundHref: string; layoutCount: number }) {
	const cards = FIELD_CARDS.map((c) =>
		c.live === 'cards-grid'
			? {
					...c,
					body: (
						<>
							A bullet list turns into a card grid. Tables become comparison matrices. {layoutCount} layouts, one
							Markdown syntax.
						</>
					),
				}
			: c,
	);
	return (
		<div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
			{cards.map((c) => (
				<Card key={c.live} className="gap-0 overflow-hidden py-6">
					<CardContent className="flex flex-col">
						{/* Live-preview host — filled by FieldCardsLive (data-live-card). */}
						<div
							className="live-host relative mb-[18px] aspect-video overflow-hidden rounded-md border border-border bg-muted"
							data-live-card={c.live}
						/>
						<h3 className="mb-2 font-[family-name:var(--font-body)] text-[18px] font-semibold leading-[1.3] tracking-[-0.01em] text-[var(--text-heading)]">
							{c.title}
						</h3>
						<p className="m-0 text-[15px] text-foreground">{c.body}</p>
						<a
							className="mt-3.5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-primary hover:underline focus-visible:underline"
							href={playgroundHref}
							data-open-deck={c.live}
						>
							{/* Names the Playground where it is genuinely the right tool: each
							    card holds ONE component's sample, and "paste a slide, watch it
							    render" is a slide verb, not a deck verb. This is the other half
							    of moving the Playground out of the hero — it doesn't lose a job,
							    it gets the right one. */}
							Edit this in the playground <ArrowRight aria-hidden="true" className="size-3.5" />
						</a>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

// ── "Why" cards (no live preview) ───────────────────────────────────────────
type WhyCard = { id: string; title: React.ReactNode; body: React.ReactNode };

const WHY_CARDS: WhyCard[] = [
	{
		id: 'one-file',
		title: 'Brand colors live in one file.',
		body: (
			<>
				Change a palette once; every deck picks it up on the next build. Layouts never name a color — they read{' '}
				<code className="font-mono text-[0.88em] text-primary">var(--token)</code>.
			</>
		),
	},
	{
		id: 'git-diff',
		title: (
			<>
				A <code className="font-mono text-[0.88em] text-primary">git diff</code> shows what changed.
			</>
		),
		body: 'A deck is text. Revisions read like code review — line by line — instead of hunting for the box that moved three pixels.',
	},
	{
		id: 'mermaid',
		title: 'Mermaid diagrams render in the palette.',
		body: 'Flowcharts and sequence diagrams pick up the deck’s tokens automatically, so a diagram never needs styling of its own.',
	},
	{
		id: 'contrast',
		title: 'Contrast is WCAG AA across every layout.',
		body: 'Accessibility is built into the token contract, not bolted on. Light and dark both clear the bar.',
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
		body: 'The engine is a build step. It runs where your code runs and sends nothing anywhere.',
	},
];

export function WhyCards() {
	return (
		<div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
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
// The attribution carries the caveat; the full sourced treatment (with its
// "read it as directional" footnote) lives one click away on /comparison.
export function ProofStrip({ comparisonHref }: { comparisonHref: string }) {
	return (
		<div className="mx-auto max-w-[62ch] text-center">
			<h2 className="mb-4 font-[family-name:var(--font-display)] text-[clamp(26px,3vw,38px)] leading-[1.12] tracking-[-0.02em] text-[var(--text-heading)]">
				The artsy deck wins the demo. The deterministic deck wins the boardroom.
			</h2>
			<p className="m-0 mb-5 text-[16.5px] leading-[1.6] text-foreground">
				When one team fact-checked six AI deck generators, the best got 20% of its claims right. Models predict
				plausible text instead of looking facts up. Lattice never invents a number or reshuffles a layout — it renders
				what you wrote, the same way every time.
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
	{ label: 'Edit', body: 'An editor with inline lint, beside a live preview of the real render.' },
	{
		label: 'Review',
		// The load-bearing row. It is what makes "web slide app" impossible to say
		// about the Studio: the review is the ENGINE's, it is deterministic, and it
		// is the same core the CLI runs (studio/coach/coach-core.ts runs the
		// generated `scorecard.scoreDeck` over `lintCore` + `reviewCore` findings —
		// the Studio's old 3-check heuristic was deleted when that landed).
		body: 'The same deterministic review the command line runs — a scorecard, and a named fix for each finding.',
	},
	{
		label: 'Present & ship',
		body: 'A dual-screen presenter window, a rehearsal plan, and export to PDF, PowerPoint, or a self-contained webpage.',
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
					<h2 className="mb-3.5 font-[family-name:var(--font-display)] text-[clamp(28px,3.4vw,42px)] leading-[1.08] tracking-[-0.02em] text-[var(--text-heading)]">
						The Studio puts the engine in a window.
					</h2>
					<p className="m-0 mb-6 max-w-[46ch] text-[17px] leading-[1.6] text-foreground">
						Same renderer, same layouts, same palettes as the command line — with an editor, a deck library, and
						Present mode wrapped around them. Your decks live in this browser: no account, nothing to install.
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
				Or start a blank deck <ArrowRight aria-hidden="true" className="inline size-3.5" />
			</a>
		</div>
	);
}

// The section's two honesty blocks, spanning the full panel under the columns.
// Block A converts the nav's `Preview` badge from a STABILITY doubt into a SCOPE
// statement, with the escape hatch in the same breath. Block B is the absorbed
// "Bring your own model" section, every string verbatim.
export function StudioHonesty({ featuresHref }: { featuresHref: string }) {
	return (
		<div className="lx-ui mt-8 grid grid-cols-1 gap-8 border-t border-border pt-8 md:grid-cols-2">
			<div>
					<div className="mb-2.5">
						<Eyebrow>Why the nav says Preview</Eyebrow>
					</div>
					<p className="m-0 text-[15px] leading-[1.55] text-foreground">
						The Studio is still growing, and the badge stays until it stops. What ships today runs the same engine
						that rendered every slide on this page — and everything you write exports, or backs up whole, in one
						click.
					</p>
				</div>
				<div>
					<div className="mb-2.5">
						{/* Verbatim from the absorbed section — this eyebrow is the page's
						    skim-altitude disclaimer that Lattice is not an AI deck generator. */}
						<Eyebrow>Bring your own model</Eyebrow>
					</div>
					<h3 className="mb-2 font-[family-name:var(--font-body)] text-[18px] font-semibold leading-[1.3] tracking-[-0.01em] text-[var(--text-heading)]">
						Point your copilot at Lattice.
					</h3>
					<p className="m-0 mb-3 text-[15px] leading-[1.55] text-foreground">
						Lattice ships a machine-readable layout catalog and a published authoring spec, so Claude, Cursor, or
						any agent can draft a valid deck. The engine renders that draft deterministically — the design was
						finished long before the model arrived.
					</p>
					<p className="m-0 mb-3 text-[15px] leading-[1.55] text-foreground">
						In the Studio the same rule holds: chat and fixes are optional, and they run on your own account —
						connect OpenRouter in one click, or download a model that runs on your device. Switch the AI off
						entirely and the Studio still edits, reviews, presents, and exports.
					</p>
					<a
						className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-primary hover:underline"
						href={featuresHref}
					>
						How AI authoring works <ArrowRight aria-hidden="true" className="size-3.5" />
					</a>
				</div>
		</div>
	);
}

// ── Waitlist form (SlideWright desktop app) ─────────────────────────────────
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
				Or get <span className="font-semibold text-[var(--text-heading)]">SlideWright</span>, the desktop app, when it lands.
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
 * of landing copy (HOW_STEPS, FIELD_CARDS, WHY_CARDS) is already in this file.
 * The base-aware `url` helper is passed in so the module stays free of
 * `import.meta.env`.
 */
export function nextStepsFor(url: (p: string) => string): NextStep[] {
	return [
		{
			href: url('getting-started/'),
			title: 'Get started',
			body: 'Install the toolchain and render your first deck in a few minutes.',
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
		{
			href: url('studio/'),
			// Keeps its P3-persona hook ("can't install anything?") and gains the
			// two-door split: the Studio for a whole deck, the playground for a quick
			// paste-and-render.
			title: "Can't install anything?",
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
