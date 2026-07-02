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

export function HeroCopy({
	playgroundHref,
	getStartedHref,
	galleryHref,
}: { playgroundHref: string; getStartedHref: string; galleryHref: string }) {
	return (
		<div className="lx-ui min-w-0">
			<div className="mb-[18px]">
				<Eyebrow>A text file in, a polished PDF out</Eyebrow>
			</div>
			<h1 className="mb-[22px] font-[var(--font-display)] text-[clamp(38px,5.4vw,68px)] leading-[1.08] tracking-[-0.02em] text-[var(--text-heading)]">
				Write the <span className="italic text-primary">words</span>. The deck is already designed.
			</h1>
			<p className="m-0 mb-[30px] max-w-[46ch] text-[clamp(17px,1.5vw,20px)] text-foreground">
				Your deck is one plain text file — a few lines of Markdown for each slide, plus that slide's layout name.
				Lattice sets every page in the same palette and type scale: no dragging, no nudging, no drift.
			</p>
			<div className="flex flex-wrap items-center gap-3">
				<Button asChild size="lg">
					<a href={playgroundHref}>
						Try it in your browser <ArrowRight aria-hidden="true" />
					</a>
				</Button>
				<Button asChild variant="outline" size="lg">
					<a href={getStartedHref}>Get started</a>
				</Button>
			</div>
			<p className="m-0 mt-4 text-[13px] text-muted-foreground">
				No install to try it. Runs on your laptop or in CI. Fully offline. Open source{' '}
				<span className="whitespace-nowrap">(AGPL-3.0)</span>.
			</p>
			<p className="m-0 mt-2 text-[13px] text-muted-foreground">
				Or skim a finished deck first —{' '}
				<a className="font-semibold text-primary hover:underline" href={galleryHref} target="_blank" rel="noopener">
					the full gallery, as a PDF
				</a>
				.
			</p>
		</div>
	);
}
