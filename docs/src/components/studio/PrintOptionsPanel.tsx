// Print options — the pre-print step for "Print deck". It builds a real PDF (one
// slide per page, the chosen paper baked into the page geometry) and opens it in a
// NEW TAB to print or save. A real PDF is the only thing that prints one-slide-per-
// page at the right size on iOS, where CSS @page is ignored (an HTML print tab there
// clips + flows continuously). This panel picks the paper, orientation, color, and
// fit; share-export.ts sharePrintDeck bakes them into the PDF's MediaBox (B&W renders
// through the section.print band). See
// engineering/decisions/2026-06-14-deck-print-styling.md.

import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export type PrintOptions = {
	paper: 'auto' | 'letter' | 'legal' | 'a4';
	orientation: 'auto' | 'landscape' | 'portrait';
	color: 'color' | 'bw';
	fit: 'page' | 'actual';
};

export const DEFAULT_PRINT_OPTIONS: PrintOptions = { paper: 'auto', orientation: 'auto', color: 'color', fit: 'page' };

// A labelled segmented control (buttons in a radiogroup).
function Segmented<T extends string>({ label, hint, value, onChange, options }: {
	label: string;
	hint?: string;
	value: T;
	onChange: (v: T) => void;
	options: readonly { label: string; value: T }[];
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-baseline justify-between gap-2">
				<span className="text-[13px] font-semibold text-[var(--text-heading)]">{label}</span>
				{hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
			</div>
			<div role="radiogroup" aria-label={label} className="inline-flex w-full overflow-hidden rounded-md border border-border">
				{options.map((o, i) => (
					// biome-ignore lint/a11y/useSemanticElements: segmented control — buttons in a radiogroup.
					<button
						key={o.value}
						type="button"
						role="radio"
						aria-checked={value === o.value}
						onClick={() => onChange(o.value)}
						className={cn(
							'flex-1 px-2.5 py-1.5 text-[12px] font-semibold transition-colors',
							i > 0 && 'border-l border-border',
							value === o.value ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-[var(--accent-soft)]',
						)}
					>
						{o.label}
					</button>
				))}
			</div>
		</div>
	);
}

export function PrintOptionsPanel({ busy, status, onBack, onPrint }: {
	busy?: boolean;
	status?: string | null;
	onBack: () => void;
	onPrint: (opts: PrintOptions) => void;
}) {
	const [opts, setOpts] = React.useState<PrintOptions>(DEFAULT_PRINT_OPTIONS);
	const set = <K extends keyof PrintOptions>(k: K) => (v: PrintOptions[K]) => setOpts((o) => ({ ...o, [k]: v }));

	return (
		<div className="space-y-5">
			<button type="button" onClick={onBack} disabled={busy} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-[var(--text-heading)] disabled:opacity-50">
				<ArrowLeft className="size-3.5" />All formats
			</button>

			<section className="space-y-4">
				<div>
					<h3 className="text-[15px] font-semibold text-[var(--text-heading)]">Print deck</h3>
					<p className="mt-0.5 text-[12px] text-muted-foreground">Builds a print-ready PDF — one slide per page — and opens it in a new tab to print or Save as PDF. Works on phones too.</p>
				</div>

				<Segmented label="Paper size" hint="Auto = least-wasteful fit" value={opts.paper} onChange={set('paper')}
					options={[{ label: 'Auto', value: 'auto' }, { label: 'Letter', value: 'letter' }, { label: 'Legal', value: 'legal' }, { label: 'A4', value: 'a4' }]} />

				<Segmented label="Orientation" hint="Auto follows the deck" value={opts.orientation} onChange={set('orientation')}
					options={[{ label: 'Auto', value: 'auto' }, { label: 'Landscape', value: 'landscape' }, { label: 'Portrait', value: 'portrait' }]} />

				<Segmented label="Color" hint="B&W is toner-safe + grayscale-legible" value={opts.color} onChange={set('color')}
					options={[{ label: 'Color', value: 'color' }, { label: 'Black & white', value: 'bw' }]} />

				<Segmented label="Fit" value={opts.fit} onChange={set('fit')}
					options={[{ label: 'Fit to page', value: 'page' }, { label: 'Actual size', value: 'actual' }]} />
			</section>

			<button
				type="button"
				disabled={busy}
				onClick={() => onPrint(opts)}
				className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-[13.5px] font-semibold text-[var(--on-accent,#fff)] hover:opacity-90 disabled:opacity-60"
			>
				{busy ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
				{busy ? status || 'Building print PDF…' : 'Open print PDF'}
			</button>
		</div>
	);
}
