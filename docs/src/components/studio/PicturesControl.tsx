// The "Pictures" choice in an export panel: what the export does to the deck's photos and screenshots.
// Same plan as the command line's --images (lib/core/image-policy.js). Remembered per deck.
import { Image as ImageIcon } from 'lucide-react';
import * as React from 'react';
import exportCanvasCore from '../../../../lib/core/export-canvas.js';
import { autoHeadLabel } from './auto-mark';
import { type Choice, ChoiceSelect } from './ChoiceSelect';
import { deckPolicyOf, deckSizeOf, loadImagesChoice, saveImagesChoice, setCanvasChoice, setImagesOverride } from './export/images-override.js';

type Mode = 'deck' | 'optimized' | 'original';
const CHOICES: Choice<Mode>[] = [
	{ value: 'deck', title: 'Auto', blurb: 'Follow `images:` in the deck’s front matter (optimized when it says nothing).' },
	{ value: 'optimized', title: 'Smaller file', blurb: 'Large photos shrink to 2560 px and re-encode as JPEG, only when that saves space. Differences are not visible at slide size.' },
	{ value: 'original', title: 'Original quality', blurb: 'Every picture is embedded exactly as added. PowerPoint and LibreOffice slides stay lossless PNG. Larger file.' },
];

export function PicturesControl({ deckId, source, busy, applies }: { deckId?: string; source?: string; busy?: boolean; applies: string }) {
	// "Auto" reads as what it lands on: the deck's own `images:` line, else the built-in default.
	const autoMode = React.useMemo(() => deckPolicyOf(source).images as Mode, [source]);
	const choices = CHOICES.map((c) => (c.value === 'deck' ? { ...c, title: autoHeadLabel(CHOICES.find((x) => x.value === autoMode)?.title) } : c));
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
					<ChoiceSelect label="Pictures" value={choice.mode} choices={choices} disabled={busy} onChange={(mode) => setChoice({ ...choice, mode })} />
					{choice.mode === 'optimized' && (
						<label className="mt-2 flex items-center gap-2 text-[11.5px] text-muted-foreground">
							JPEG quality
							<input type="number" min={1} max={100} placeholder="90" value={choice.quality} disabled={busy} onChange={(e) => setChoice({ ...choice, quality: e.target.value })} className="w-16 rounded-md border border-border bg-background px-2 py-1 text-[12px]" aria-label="JPEG quality, 1 to 100" />
						</label>
					)}
				</span>
			</span>
		</div>
	);
}

/** Is this deck's own canvas 4K? Only then is there a resolution to choose. */
export function deckIs4k(source?: string): boolean {
	return exportCanvasCore.is4k(deckSizeOf(source));
}

const KEY = (deckId?: string) => `lattice-studio-canvas:${deckId ?? ''}`;

/** The Resolution choice for a 4K deck's PDF, PowerPoint or LibreOffice export. HD is the default; 4K shows what it costs. */
export function ResolutionControl({ deckId, source, busy, format }: { deckId?: string; source?: string; busy?: boolean; format: 'pdf' | 'pptx' | 'odp' }) {
	const [is4k, setIs4k] = React.useState(() => {
		try {
			return localStorage.getItem(KEY(deckId)) === '4k';
		} catch {
			return false;
		}
	});
	React.useEffect(() => {
		setCanvasChoice(is4k ? '4k' : '');
		try {
			if (is4k) localStorage.setItem(KEY(deckId), '4k');
			else localStorage.removeItem(KEY(deckId));
		} catch {
			// blocked storage: the choice still applies to this session
		}
	}, [is4k, deckId]);
	if (!deckIs4k(source)) return null;
	const factor = exportCanvasCore.FOUR_K_FACTOR[format];
	return (
		<div className="rounded-xl border border-border bg-background p-3.5">
			<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Resolution</span>
			<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">This deck is set to 4K. The design is the same at either size; the pixels are what make the file big.</span>
			<ChoiceSelect
				label="Resolution"
				value={is4k ? '4k' : 'hd'}
				disabled={busy}
				onChange={(v) => setIs4k(v === '4k')}
				choices={[
					{ value: 'hd', title: 'HD, 1280 × 720 (default)', blurb: 'Smaller; easy to email and store. Sharp on any screen and in print.' },
					{ value: '4k', title: '4K, 3840 × 2160', blurb: `Typically about ${factor}× larger than HD (measured on a 52-slide photo deck). The finished file’s size is shown when the export is ready.` },
				]}
			/>
		</div>
	);
}
