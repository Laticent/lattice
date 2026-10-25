// The "Pictures" choice in an export panel: what the export does to the deck's photos and screenshots.
// Same plan as the command line's --images (lib/core/image-policy.js). Remembered per deck.
import { Image as ImageIcon } from 'lucide-react';
import * as React from 'react';
import { loadImagesChoice, saveImagesChoice, setImagesOverride } from './export/images-override.js';

type Mode = 'deck' | 'optimized' | 'original';
const CHOICES: { value: Mode; title: string; blurb: string }[] = [
	{ value: 'deck', title: 'Deck setting', blurb: 'Follow `images:` in the deck’s front matter (optimized when it says nothing).' },
	{ value: 'optimized', title: 'Smaller file', blurb: 'Large photos shrink to 2560 px and re-encode as JPEG, only when that saves space. Differences are not visible at slide size.' },
	{ value: 'original', title: 'Original quality', blurb: 'Every picture is embedded exactly as added. PowerPoint and LibreOffice slides stay lossless PNG. Larger file.' },
];

export function PicturesControl({ deckId, busy, applies }: { deckId?: string; busy?: boolean; applies: string }) {
	const [choice, setChoice] = React.useState(() => loadImagesChoice(deckId ?? ''));
	// Every change reaches the exporter at once, so the Download button needs no extra wiring.
	React.useEffect(() => {
		setImagesOverride(choice);
		saveImagesChoice(deckId ?? '', choice);
	}, [choice, deckId]);
	return (
		<div className="rounded-xl border border-border bg-background p-3.5">
			<span className="flex items-start gap-2">
				<ImageIcon className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
				<span className="min-w-0 flex-1">
					<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Pictures</span>
					<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">How {applies} treat your photos and screenshots.</span>
					<span role="radiogroup" aria-label="Pictures" className="mt-2 grid gap-1.5">
						{CHOICES.map((c) => (
							<label key={c.value} className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-2.5 py-2 has-[:checked]:border-[var(--accent)]">
								<input type="radio" name="export-pictures" value={c.value} checked={choice.mode === c.value} disabled={busy} onChange={() => setChoice({ ...choice, mode: c.value })} className="mt-1" />
								<span>
									<span className="block text-[12.5px] font-semibold text-[var(--text-heading)]">{c.title}</span>
									<span className="block text-[11px] leading-snug text-muted-foreground">{c.blurb}</span>
								</span>
							</label>
						))}
					</span>
					{choice.mode === 'optimized' && (
						<label className="mt-2 flex items-center gap-2 text-[11.5px] text-muted-foreground">
							JPEG quality
							<input type="number" min={1} max={100} placeholder="88" value={choice.quality} disabled={busy} onChange={(e) => setChoice({ ...choice, quality: e.target.value })} className="w-16 rounded-md border border-border bg-background px-2 py-1 text-[12px]" aria-label="JPEG quality, 1 to 100" />
						</label>
					)}
				</span>
			</span>
		</div>
	);
}
