// The "how should these photos be stored?" step between picking files and saving them.
// Decision note: engineering/decisions/2026-10-12-library-media-assets.md §3.
//
// The choice trades file size against what a photo can do later (transparency, editing in PowerPoint,
// the size of a `.lattice`), and a person cannot weigh that without numbers. So each option shows what it
// would store for THESE files, measured by running the import's own encoder (media-import.ts
// `measureFormats`), and says in a line what the choice means. The sizes fill in as they are measured; the
// choice is open meanwhile.

import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { type FormatSizes, measureFormats, PHOTO_FORMATS, type PhotoFormat, webpSupported } from './media-import';

const PREF_KEY = 'lattice-photo-format';

/** The format the person chose last time, or JPEG: what the Library has always done with a phone photo. */
export function loadPhotoFormat(): PhotoFormat {
	try {
		const v = localStorage.getItem(PREF_KEY);
		if (v && (PHOTO_FORMATS as string[]).includes(v)) return v as PhotoFormat;
	} catch {
		// private window or blocked storage: the default is fine
	}
	return 'jpeg';
}
function savePhotoFormat(f: PhotoFormat) {
	try {
		localStorage.setItem(PREF_KEY, f);
	} catch {
		// remembered next time only where storage works
	}
}

const mb = (bytes: number) => (bytes < 100_000 ? '<0.1 MB' : `${(bytes / 1_048_576).toFixed(bytes < 10 * 1_048_576 ? 1 : 0)} MB`);

const OPTIONS: Record<PhotoFormat, { label: string; means: string }> = {
	original: {
		label: 'Keep original',
		means: 'The file as it came: full size and quality, nothing re-compressed. Location and camera details are removed. Largest files, so a Lattice project with many of them can pass its size limit.',
	},
	jpeg: {
		label: 'JPEG',
		means: 'Best for photographs, and opens everywhere. Shrunk to at most 2560 px wide, more than a slide can show. No transparency: a see-through background turns white.',
	},
	webp: {
		label: 'WebP',
		means: 'The smallest file for a photograph at the same look. Opens in every current browser; a few older apps cannot open it. See-through areas stay see-through.',
	},
	png: {
		label: 'PNG',
		means: 'Lossless, so screenshots, logos and anything see-through stay crisp. For photographs it is several times larger than JPEG.',
	},
};

export function PhotoFormatDialog({ files, onCancel, onConfirm }: { files: File[] | null; onCancel: () => void; onConfirm: (format: PhotoFormat) => void }) {
	const open = !!files?.length;
	const [format, setFormat] = React.useState<PhotoFormat>(loadPhotoFormat);
	const [sizes, setSizes] = React.useState<FormatSizes | null>(null);
	React.useEffect(() => {
		setSizes(null);
		if (!files?.length) return;
		setFormat(loadPhotoFormat());
		let stop = false;
		measureFormats(files, () => stop)
			.then((s) => !stop && setSizes(s))
			.catch(() => {});
		return () => {
			stop = true;
		};
	}, [files]);

	const webpOk = webpSupported();
	const n = files?.length ?? 0;
	const noun = `photo${n === 1 ? '' : 's'}`;
	const bytesOf = (f: PhotoFormat) => sizes?.bytes[f] ?? null;
	const smallest = sizes ? PHOTO_FORMATS.filter((f) => bytesOf(f) !== null).sort((a, b) => (bytesOf(a) as number) - (bytesOf(b) as number))[0] : undefined;
	// Every bar is drawn against the largest option, so the eye reads "how much bigger" without doing arithmetic.
	const widest = sizes ? Math.max(1, ...PHOTO_FORMATS.map((f) => bytesOf(f) ?? 0)) : 1;
	const chosen = bytesOf(format);

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
			<DialogContent className="max-h-[92dvh] gap-3 overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{`Add ${n} ${noun}`}</DialogTitle>
					<DialogDescription>
						Pick how {n === 1 ? 'it is' : 'they are'} stored. Smaller files load faster and fit more in a Lattice project; bigger ones keep more detail.
					</DialogDescription>
				</DialogHeader>
				<RadioGroup aria-label="Photo format" className="flex flex-col items-stretch gap-2" value={format} onValueChange={(v) => setFormat(v as PhotoFormat)}>
					{PHOTO_FORMATS.map((f) => {
						const unavailable = f === 'webp' && !webpOk;
						const b = bytesOf(f);
						const delta = b !== null && sizes && sizes.pickedBytes > 0 ? Math.round((b / sizes.pickedBytes - 1) * 100) : null;
						const picked = format === f;
						return (
							<RadioGroupItem
								key={f}
								value={f}
								disabled={unavailable}
								aria-label={OPTIONS[f].label}
								className={cn(
									'group flex-row items-start gap-3 rounded-xl border bg-card px-3 py-2.5 text-left font-normal transition-colors',
									picked ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm' : 'border-border hover:border-[var(--accent)]/50',
								)}
							>
								{/* The selected state is a drawn dot, not only a tint: a tint alone is invisible to some eyes and in print. */}
								<span aria-hidden className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border', picked ? 'border-[var(--accent)]' : 'border-muted-foreground/50')}>
									{picked ? <span className="size-2 rounded-full bg-[var(--accent)]" /> : null}
								</span>
								<span className="min-w-0 flex-1 space-y-1">
									<span className="flex items-baseline justify-between gap-3">
										<span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] font-semibold text-[var(--text-heading)]">
											{OPTIONS[f].label}
											{f === smallest && !unavailable ? <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--on-accent,#fff)]">Smallest</span> : null}
											{f === 'jpeg' ? <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Works everywhere</span> : null}
										</span>
										<span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-[var(--text-heading)]" data-format-size={f}>
											{unavailable ? <span className="font-normal text-muted-foreground">Not in this browser</span> : b === null ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="Measuring" /> : mb(b)}
											{delta !== null && !unavailable ? (
												<span className={cn('ml-1.5 text-[11px] font-medium', delta > 0 ? 'text-[var(--destructive,#b45309)]' : delta < 0 ? 'text-[var(--success,#15803d)]' : 'text-muted-foreground')}>
													{delta === 0 ? 'same' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)}%`}
												</span>
											) : null}
										</span>
									</span>
									{b !== null && !unavailable ? (
										<span aria-hidden className="block h-1 overflow-hidden rounded-full bg-border/60">
											<span className={cn('block h-full rounded-full transition-[width] duration-300', picked ? 'bg-[var(--accent)]' : 'bg-muted-foreground/40')} style={{ width: `${Math.max(3, Math.round((b / widest) * 100))}%` }} />
										</span>
									) : null}
									<span className="block text-[11.5px] leading-snug text-muted-foreground">{unavailable ? 'This browser cannot save WebP. Choose JPEG or PNG.' : OPTIONS[f].means}</span>
								</span>
							</RadioGroupItem>
						);
					})}
				</RadioGroup>
				<p className="min-h-4 text-[11px] leading-snug text-muted-foreground" aria-live="polite">
					{sizes
						? `You picked ${mb(sizes.pickedBytes)}. Sizes are measured on ${sizes.sampled < sizes.of ? `${sizes.sampled} of your ${sizes.of} photos and scaled to the rest` : n === 1 ? 'your photo' : 'your photos'}${sizes.skipped ? `; ${sizes.skipped} could not be measured` : ''}.`
						: 'Measuring your photos…'}
				</p>
				<DialogFooter className="sticky bottom-0 -mx-1 gap-2 bg-background px-1 pt-2 sm:gap-2">
					<Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
					<Button
						size="sm"
						onClick={() => {
							savePhotoFormat(format);
							onConfirm(format);
						}}
					>
						{`Add ${noun}`}
						{chosen !== null ? <span className="ml-2 font-normal opacity-80">{OPTIONS[format].label} · {mb(chosen)}</span> : null}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
