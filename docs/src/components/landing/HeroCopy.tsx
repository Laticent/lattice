import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Eyebrow } from './sections';

// The hero's left panel — static marketing copy + CTAs, rendered server-side
// (NO client: directive → zero JS). CTAs are shadcn Buttons via `asChild` so
// they're real <a> links (cmd/middle-click works) styled as buttons, themed
// through the bridge (bg-primary / border).
//
// Copy contract: the H1 positions AGAINST auto-generation language ("builds
// itself" is the AI-generator promise) — deterministic design is the claim.
// See engineering/decisions/2026-07-02-website-copy-positioning.md §3, §5.1.
// The lead names the ROOMS a deck is for and the reader's outcome (understood
// at a glance). It keeps the WRITER as the one who writes each slide and names
// its layout: "write what you mean and Lattice turns it into slides" was the
// auto-generation echo §7.1 bans, caught by the red-team round on this change.
// See engineering/decisions/2026-10-28-home-positioning-audit.md §8 (option B).
//
// The fold offers exactly TWO doors — browser and machine — and names the job
// of each. Three doors in the fold is the failure this router line exists to
// prevent: a visitor who can't tell which of engine/Playground/Studio is theirs
// reads the page as three products. The Playground keeps its own entrances
// where it is genuinely the right tool (the single-slide field cards, next
// steps) and stays a top-level nav item on every page.
// See engineering/decisions/2026-07-30-landing-studio-promotion.md §0 F1, §3.1.

export function HeroCopy() {
	return (
		<div className="lx-ui min-w-0">
			<div className="mb-[18px]">
				<Eyebrow>A text file in, a polished PDF out</Eyebrow>
			</div>
			<h1 className="mb-[22px] font-[family-name:var(--font-display)] text-[clamp(38px,5.4vw,68px)] leading-[1.08] tracking-[-0.02em] text-[var(--text-heading)]">
				Write the <span className="italic text-primary">words</span>. The deck is already designed.
			</h1>
			{/* "Markdown" stays (the developer visitor asked for it back) but is glossed
			    in the same breath for everyone else: both scoring reviews on 2026-10-28
			    split on it, and the gloss serves both. */}
			<p className="m-0 max-w-[46ch] text-[clamp(17px,1.5vw,20px)] text-foreground">
				For the boardroom, the pitch, the briefing, and the lecture hall. Write each slide as a few lines of plain
				text (Markdown, as simple as a bulleted email) and name the layout that fits it. Lattice sets every page so
				your audience gets the point at a glance.
			</p>
			{/* The contrast with AI deck generators, at the fold. Both scoring reviews
			    found it only mid-page; the July note's §7.1 still holds — the page
			    never lets the product write the deck. */}
			<p className="m-0 mt-4 max-w-[46ch] text-[15px] font-semibold text-[var(--text-heading)]">
				Not an AI that guesses your slides: Lattice renders what you wrote, the same way every time.
			</p>
		</div>
	);
}

// The hero's actions, a SEPARATE grid child from the copy so that below `lg` the
// order reads copy → live slide → buttons (the Studio section's three-child
// shape). On a phone the slide used to fall below the first screen, under the
// buttons and three paragraphs of small print; both scoring reviews flagged it.
//
// The fold offers exactly TWO doors — browser and machine — and names the job
// of each. See engineering/decisions/2026-07-30-landing-studio-promotion.md §0 F1.
// "Same slides", NOT "same output": the command line emits a vector PDF with
// selectable text and note annotations, while the Studio's one-click PDF is a
// 2x raster, and our own getting-started page says so.
export function HeroActions({
	studioHref,
	getStartedHref,
	galleryHref,
}: { studioHref: string; getStartedHref: string; galleryHref: string }) {
	return (
		<div className="lx-ui min-w-0">
			<div className="flex flex-wrap items-center gap-3">
				<Button asChild size="lg">
					<a href={studioHref}>
						Open the Studio <ArrowRight aria-hidden="true" />
					</a>
				</Button>
				<Button asChild variant="outline" size="lg">
					<a href={getStartedHref}>Use the command line</a>
				</Button>
			</div>
			<p className="m-0 mt-4 max-w-[46ch] text-[13px] text-muted-foreground">
				The Studio runs in a browser tab; one command renders the same deck on your laptop or in CI.{' '}
				<span className="font-semibold text-foreground">Same engine, same slides.</span> Free and open source, no
				sign-up. Or skim{' '}
				<a className="font-semibold text-primary hover:underline" href={galleryHref} target="_blank" rel="noopener">
					a finished deck, as a PDF
				</a>
				.
			</p>
		</div>
	);
}
