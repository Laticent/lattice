// Export options — the pre-export step for the `.lattice` project file.
//
// The one choice is whether the photos the deck names travel inside it. They do by default: a
// `.lattice` is the file you hand to someone who will EDIT the deck, and a deck whose pictures are
// stand-ins is not that. The switch is for the author who wants a small file and knows the recipient
// already holds the pictures. Decision note: engineering/decisions/2026-10-12-library-media-assets.md §6.

import { ArrowLeft, FileArchive, Images, Loader2 } from 'lucide-react';
import * as React from 'react';
import { Switch } from '@/components/ui/switch';
import { latticePhotoSummary, type PhotoSummary } from './lattice-media';
import { assetNamesIn } from './media-urls';

const mb = (bytes: number) => (bytes < 100_000 ? '<0.1 MB' : `${(bytes / 1_048_576).toFixed(bytes < 10 * 1_048_576 ? 1 : 0)} MB`);

export function LatticeOptionsPanel({ busy, status, source, deckId, onBack, onExport }: { busy?: boolean; status?: string | null; source: string; deckId?: string; onBack: () => void; onExport: (includePhotos: boolean) => void }) {
	const named = React.useMemo(() => assetNamesIn(source), [source]);
	const [includePhotos, setIncludePhotos] = React.useState(true);
	// null until the shelf has been read; the toggle works meanwhile, only its size line waits.
	const [summary, setSummary] = React.useState<PhotoSummary | null>(null);
	React.useEffect(() => {
		let live = true;
		if (named.length) latticePhotoSummary(source, deckId).then((s) => live && setSummary(s)).catch(() => live && setSummary(null));
		return () => {
			live = false;
		};
	}, [source, deckId, named.length]);

	return (
		<div className="space-y-5">
			<button type="button" onClick={onBack} disabled={busy} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-[var(--text-heading)] disabled:opacity-50">
				<ArrowLeft className="size-3.5" />All formats
			</button>

			<section className="space-y-3">
				<div>
					<h3 className="text-[15px] font-semibold text-[var(--text-heading)]">Export Lattice project</h3>
					<p className="mt-0.5 text-[12px] text-muted-foreground">One <code>.lattice</code> file: the deck, its comments and its saved assets. It re-opens in Lattice on any device.</p>
				</div>

				{named.length ? (
					<div className="rounded-xl border border-border bg-background p-3.5" data-demo="lattice-photos">
						<div className="flex items-start justify-between gap-3">
							<span className="flex items-start gap-2">
								<Images className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
								<span>
									<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Include photos{summary ? ` (${summary.count}${summary.bytes ? ` · ${mb(summary.bytes)}` : ''})` : ''}</span>
									<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
										{includePhotos
											? 'The photos this deck uses go inside the file, so it looks the same wherever it is opened. They are added to the opener’s Library.'
											: 'The file keeps only the names of the photos. Anyone who opens it on a device without them sees stand-ins.'}
										{summary?.missing.length ? ` ${summary.missing.length === 1 ? 'One photo the deck names is' : `${summary.missing.length} photos the deck names are`} not in your Library, so ${summary.missing.length === 1 ? 'it stays' : 'they stay'} a stand-in.` : ''}
									</span>
								</span>
							</span>
							<Switch className="mt-0.5" aria-label="Include photos" checked={includePhotos} disabled={busy} onCheckedChange={setIncludePhotos} />
						</div>
					</div>
				) : null}
			</section>

			<button
				type="button"
				disabled={busy}
				onClick={() => onExport(includePhotos)}
				className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-[13.5px] font-semibold text-[var(--on-accent,#fff)] hover:opacity-90 disabled:opacity-60"
			>
				{busy ? <Loader2 className="size-4 animate-spin" /> : <FileArchive className="size-4" />}
				{busy ? status || 'Exporting…' : 'Download project'}
			</button>
		</div>
	);
}
