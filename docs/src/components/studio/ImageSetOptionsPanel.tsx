// Export options — the pre-export step for the image set (a .zip of one image per
// slide). The defaults are perfect-fidelity: lossless PNG at the largest sensible
// resolution, thumbnails on, and the deck's chart/diagram SVGs extracted as
// standalone vectors. The tuning here trades size for fidelity — a smaller format
// (JPEG/WebP), a smaller resolution, or dropping the extras shrinks the zip. The zip
// layout, naming, size presets, and manifest are single-sourced with the CLI `.zip`
// output via the shared kernel (lib/export/image-set.js). See share-export.ts ›
// shareImageSet.

import { ArrowLeft, FileImage, ImageDown, Layers, Loader2 } from 'lucide-react';
import * as React from 'react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { ImageSetOptions } from './share-export';

type Format = 'png' | 'jpeg' | 'webp';
type Size = 'max' | '2x' | '1x' | 'half';

const FORMATS: { value: Format; label: string; hint: string }[] = [
	{ value: 'png', label: 'PNG', hint: 'Lossless — perfect fidelity, largest files.' },
	{ value: 'jpeg', label: 'JPEG', hint: 'Lossy — smaller, opens everywhere.' },
	{ value: 'webp', label: 'WebP', hint: 'Lossy — smallest at equal quality.' },
];

const SIZES: { value: Size; label: string; hint: string }[] = [
	{ value: 'max', label: 'Full', hint: 'Highest resolution (2× HD).' },
	{ value: '2x', label: 'Large', hint: 'Fixed 2×.' },
	{ value: '1x', label: 'Medium', hint: 'Fixed 1× — the slide’s own size.' },
	{ value: 'half', label: 'Small', hint: 'Half size — the lightest set.' },
];

function Segmented<T extends string>({ options, value, onChange, busy, cols }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; busy?: boolean; cols: string }) {
	return (
		<div className={cn('mt-2.5 grid gap-1.5 rounded-lg bg-[var(--accent-soft)] p-1', cols)}>
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					aria-pressed={value === o.value}
					disabled={busy}
					onClick={() => onChange(o.value)}
					className={cn(
						'inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-40',
						value === o.value ? 'bg-background text-[var(--text-heading)] shadow-sm' : 'text-muted-foreground hover:text-[var(--text-heading)]',
					)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

export function ImageSetOptionsPanel({
	busy,
	status,
	onBack,
	onExport,
}: {
	busy?: boolean;
	status?: string | null;
	onBack: () => void;
	onExport: (opts: ImageSetOptions) => void;
}) {
	const [format, setFormat] = React.useState<Format>('png');
	const [size, setSize] = React.useState<Size>('max');
	const [quality, setQuality] = React.useState(92);
	const [thumbnails, setThumbnails] = React.useState(true);
	const [extractSvg, setExtractSvg] = React.useState(true);

	const lossy = format !== 'png';
	const fmtHint = FORMATS.find((f) => f.value === format)?.hint;
	const sizeHint = SIZES.find((s) => s.value === size)?.hint;

	return (
		<div className="space-y-5">
			<button type="button" onClick={onBack} disabled={busy} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-[var(--text-heading)] disabled:opacity-50">
				<ArrowLeft className="size-3.5" />All formats
			</button>

			<section className="space-y-3">
				<div>
					<h3 className="text-[15px] font-semibold text-[var(--text-heading)]">Export images</h3>
					<p className="mt-0.5 text-[12px] text-muted-foreground">A <code>.zip</code> with one image per slide, plus optional thumbnails and the deck’s charts &amp; diagrams as standalone SVGs.</p>
				</div>

				{/* Format — lossless PNG by default; JPEG/WebP trade fidelity for size. */}
				<div className="rounded-xl border border-border bg-background p-3.5">
					<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Format</span>
					<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{fmtHint}</span>
					<Segmented options={FORMATS} value={format} onChange={setFormat} busy={busy} cols="grid-cols-3" />
					{lossy && (
						<div className="mt-3">
							<div className="flex items-center justify-between text-[11.5px] font-semibold text-muted-foreground">
								<span>Quality</span><span className="tabular-nums text-[var(--text-heading)]">{quality}</span>
							</div>
							<Slider className="mt-1.5" value={quality} min={40} max={100} step={1} disabled={busy} onValueChange={setQuality} aria-label="Image quality" />
						</div>
					)}
				</div>

				{/* Size — the resolution / set-size lever. */}
				<div className="rounded-xl border border-border bg-background p-3.5">
					<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Resolution</span>
					<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{sizeHint} Lower shrinks each image and the overall zip.</span>
					<Segmented options={SIZES} value={size} onChange={setSize} busy={busy} cols="grid-cols-4" />
				</div>

				{/* Thumbnails — a small companion image per slide. */}
				<div className="rounded-xl border border-border bg-background p-3.5">
					<div className="flex items-start justify-between gap-3">
						<span className="flex items-start gap-2">
							<ImageDown className="mt-0.5 size-4 text-[var(--accent)]" />
							<span>
								<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Thumbnails</span>
								<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">A small 480px-wide image per slide, under <code>thumbnails/</code> — handy for contact sheets and previews.</span>
							</span>
						</span>
						<Switch className="mt-0.5" aria-label="Include thumbnails" checked={thumbnails} disabled={busy} onCheckedChange={setThumbnails} />
					</div>
				</div>

				{/* SVG extraction — the deck's vector charts & diagrams as standalone files. */}
				<div className="rounded-xl border border-border bg-background p-3.5">
					<div className="flex items-start justify-between gap-3">
						<span className="flex items-start gap-2">
							<Layers className="mt-0.5 size-4 text-[var(--accent)]" />
							<span>
								<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Chart &amp; diagram SVGs</span>
								<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">Lift each chart and Mermaid diagram out as a standalone <code>.svg</code> under <code>assets/</code> — theme-free, fonts embedded, opens anywhere.</span>
							</span>
						</span>
						<Switch className="mt-0.5" aria-label="Extract chart and diagram SVGs" checked={extractSvg} disabled={busy} onCheckedChange={setExtractSvg} />
					</div>
				</div>
			</section>

			<button
				type="button"
				disabled={busy}
				onClick={() => onExport({ format, size, quality, thumbnails, extractSvg })}
				className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-[13.5px] font-semibold text-[var(--on-accent,#fff)] hover:opacity-90 disabled:opacity-60"
			>
				{busy ? <Loader2 className="size-4 animate-spin" /> : <FileImage className="size-4" />}
				{busy ? status || 'Exporting…' : 'Download images'}
			</button>
		</div>
	);
}
