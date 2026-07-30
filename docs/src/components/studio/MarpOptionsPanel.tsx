// Export options — the pre-export step for the self-contained Marp bundle (.zip).
//
// The one choice that belongs here is the OVERFLOW MARKER. A slide with more
// content than fits is clipped — not scrollable, not printed — so an exported deck
// says so rather than losing it quietly. Who that message is addressed to is a
// per-export decision, and a wrong assumption either way is bad: the authoring
// signal (a red QA ring and per-cell "Fix Me" tags) in front of a board reads as a
// bug report, while no marker at all passes a broken slide off as finished.
//
// That is exactly the shape the PDF panel's comments toggle has — an app-level
// default the author overrides for THIS artifact — so it lives in the same place.
// The default comes from Workspace settings, so the standing answer is one click
// away and this panel is only for the deck that needs something different.
// See engineering/decisions/2026-07-30-overflow-marker-register.md.

import { ArrowLeft, Eye, EyeOff, Loader2, Package, Wrench } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import type { OverflowMarker } from './studio-store';

const CHOICES: { value: OverflowMarker; label: string; icon: React.ReactNode }[] = [
	{ value: 'reader', label: 'For the reader', icon: <Eye className="size-3.5" /> },
	{ value: 'author', label: 'For me', icon: <Wrench className="size-3.5" /> },
	{ value: 'off', label: 'No marker', icon: <EyeOff className="size-3.5" /> },
];

// What each level actually puts on a clipped slide, in the recipient's terms. Kept
// in the panel rather than the store so the copy can be about what you SEE.
const BLURB: Record<OverflowMarker, string> = {
	reader: 'A clipped slide carries a small “Content clipped” tag along its bottom edge — honest, and calm enough to hand to an audience.',
	author: 'A clipped slide gets the full editing signal: a red ring, an “Overflows” flag, and “Fix Me” tags on the boxes that overran. For a deck you are still working on, not one you are sending.',
	off: 'Nothing is shown. A clipped slide will look finished, so only choose this for a deck you have already checked fits.',
};

export function MarpOptionsPanel({
	busy,
	status,
	defaultMarker,
	onBack,
	onExport,
}: {
	busy?: boolean;
	status?: string | null;
	/** The Workspace-settings answer — the standing choice this export starts from.
	 *  The panel remounts each time the step is opened (ShareSheet renders it
	 *  conditionally), so this mount-time default re-syncs on its own and an explicit
	 *  pick is never silently clobbered — same reasoning as WebpageOptionsPanel. */
	defaultMarker: OverflowMarker;
	onBack: () => void;
	onExport: (overflowMarker: OverflowMarker) => void;
}) {
	const [marker, setMarker] = React.useState<OverflowMarker>(defaultMarker);

	return (
		<div className="space-y-5">
			<button type="button" onClick={onBack} disabled={busy} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-[var(--text-heading)] disabled:opacity-50">
				<ArrowLeft className="size-3.5" />All formats
			</button>

			<section className="space-y-3">
				<div>
					<h3 className="text-[15px] font-semibold text-[var(--text-heading)]">Export Marp bundle</h3>
					<p className="mt-0.5 text-[12px] text-muted-foreground">A self-contained <code>.zip</code> — the deck, its palette, fonts and runtime. Renders in any Marp tool.</p>
				</div>

				<div className="rounded-xl border border-border bg-background p-3.5">
					<span className="block text-[13px] font-semibold text-[var(--text-heading)]">If a slide overflows</span>
					<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{BLURB[marker]}</span>
					<div className="mt-2.5 grid grid-cols-3 gap-1.5 rounded-lg bg-[var(--accent-soft)] p-1">
						{CHOICES.map((c) => (
							<button
								key={c.value}
								type="button"
								aria-pressed={marker === c.value}
								disabled={busy}
								onClick={() => setMarker(c.value)}
								className={cn(
									'inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-40',
									marker === c.value ? 'bg-background text-[var(--text-heading)] shadow-sm' : 'text-muted-foreground hover:text-[var(--text-heading)]',
								)}
							>
								{c.icon}{c.label}
							</button>
						))}
					</div>
					{marker !== defaultMarker && (
						<span className="mt-2.5 block text-[11px] leading-snug text-muted-foreground">
							This export only — your Workspace default stays <strong>{CHOICES.find((c) => c.value === defaultMarker)?.label.toLowerCase()}</strong>.
						</span>
					)}
				</div>
			</section>

			<button
				type="button"
				disabled={busy}
				onClick={() => onExport(marker)}
				className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-[13.5px] font-semibold text-[var(--on-accent,#fff)] hover:opacity-90 disabled:opacity-60"
			>
				{busy ? <Loader2 className="size-4 animate-spin" /> : <Package className="size-4" />}
				{busy ? status || 'Exporting…' : 'Download bundle'}
			</button>
		</div>
	);
}
