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
	const bytesOf = (f: PhotoFormat) => sizes?.bytes[f] ?? null;
	const smallest = sizes ? PHOTO_FORMATS.filter((f) => bytesOf(f) !== null).sort((a, b) => (bytesOf(a) as number) - (bytesOf(b) as number))[0] : undefined;

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{`Add ${n} photo${n === 1 ? '' : 's'}`}</DialogTitle>
					<DialogDescription>
						Choose how they are stored. This sets their size now and what you can do with them later.
						{sizes ? ` Sizes are measured on ${sizes.sampled < sizes.of ? `${sizes.sampled} of your ${sizes.of} photos and scaled up` : n === 1 ? 'your photo' : 'your photos'}; you picked ${mb(sizes.pickedBytes)}.` : ''}
					</DialogDescription>
				</DialogHeader>
				<RadioGroup aria-label="Photo format" className="flex flex-col items-stretch gap-2" value={format} onValueChange={(v) => setFormat(v as PhotoFormat)}>
					{PHOTO_FORMATS.map((f) => {
						const unavailable = f === 'webp' && !webpOk;
						const b = bytesOf(f);
						const delta = b !== null && sizes && sizes.pickedBytes > 0 ? Math.round((b / sizes.pickedBytes - 1) * 100) : null;
						return (
							<RadioGroupItem
								key={f}
								value={f}
								disabled={unavailable}
								aria-label={OPTIONS[f].label}
								className={cn('flex-col items-stretch gap-1 rounded-lg border border-border bg-card px-3 py-2.5 text-left font-normal data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent-soft)]')}
							>
								<span className="flex items-baseline justify-between gap-3">
									<span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-heading)]">
										{OPTIONS[f].label}
										{f === smallest && !unavailable ? <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--accent)]">Smallest</span> : null}
									</span>
									<span className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground" data-format-size={f}>
										{unavailable ? 'Not in this browser' : b === null ? <Loader2 className="size-3.5 animate-spin" aria-label="Measuring" /> : `${mb(b)}${delta !== null ? ` (${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta)}%)` : ''}`}
									</span>
								</span>
								<span className="text-[11.5px] leading-snug text-muted-foreground">{unavailable ? 'This browser cannot save WebP. Choose JPEG or PNG.' : OPTIONS[f].means}</span>
							</RadioGroupItem>
						);
					})}
				</RadioGroup>
				<DialogFooter>
					<Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
					<Button
						size="sm"
						onClick={() => {
							savePhotoFormat(format);
							onConfirm(format);
						}}
					>
						Add photos
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
