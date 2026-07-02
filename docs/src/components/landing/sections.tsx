import { ArrowRight } from 'lucide-react';
import type * as React from 'react';
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
			<h2 className="mb-3.5 font-[var(--font-display)] text-[clamp(28px,3.4vw,42px)] leading-[1.08] tracking-[-0.02em] text-[var(--text-heading)]">
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
						<h3 className="mb-2 font-[var(--font-body)] text-[18px] font-semibold leading-[1.3] tracking-[-0.01em] text-[var(--text-heading)]">
							{c.title}
						</h3>
						<p className="m-0 text-[15px] text-foreground">{c.body}</p>
						<a
							className="mt-3.5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-primary hover:underline focus-visible:underline"
							href={playgroundHref}
							data-open-deck={c.live}
						>
							Edit this deck <ArrowRight aria-hidden="true" className="size-3.5" />
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
						<h3 className="mb-2 font-[var(--font-body)] text-[18px] font-semibold leading-[1.3] tracking-[-0.01em] text-[var(--text-heading)]">
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
			<h2 className="mb-4 font-[var(--font-display)] text-[clamp(26px,3vw,38px)] leading-[1.12] tracking-[-0.02em] text-[var(--text-heading)]">
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

// ── "Bring your own model" section ──────────────────────────────────────────
// The agent-workflow wedge: the split-layers argument from /comparison,
// surfaced on the landing. The eyebrow does the disclaiming at skim altitude —
// this is NOT an AI deck generator, the model never renders anything.
export function ByomSection({ featuresHref }: { featuresHref: string }) {
	return (
		<div className="max-w-[62ch]">
			<div className="mb-3">
				<Eyebrow>Bring your own model</Eyebrow>
			</div>
			<h2 className="mb-3.5 font-[var(--font-display)] text-[clamp(28px,3.4vw,42px)] leading-[1.08] tracking-[-0.02em] text-[var(--text-heading)]">
				Point your copilot at Lattice.
			</h2>
			<p className="m-0 mb-5 text-[17px] leading-[1.6] text-foreground">
				Lattice ships a machine-readable layout catalog and a published authoring spec, so Claude, Cursor, or any
				agent can draft a valid deck. The engine renders that draft deterministically — the design was finished long
				before the model arrived.
			</p>
			<a
				className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-primary hover:underline"
				href={featuresHref}
			>
				How AI authoring works <ArrowRight aria-hidden="true" className="size-4" />
			</a>
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
type NextStep = { href: string; title: string; body: string; cta: string; form?: boolean };

export function NextSteps({ links }: { links: NextStep[] }) {
	return (
		<div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
			{links.map((l) =>
				l.form ? (
					<div
						key={l.href + l.title}
						className="flex flex-col rounded-xl border border-border bg-card p-[26px] text-card-foreground shadow-sm"
					>
						<h3 className="mb-2 font-[var(--font-body)] text-[19px] font-semibold tracking-[-0.01em] text-[var(--text-heading)]">
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
						<h3 className="mb-2 font-[var(--font-body)] text-[19px] font-semibold tracking-[-0.01em] text-[var(--text-heading)]">
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
