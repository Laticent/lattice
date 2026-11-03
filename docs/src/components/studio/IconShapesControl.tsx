// The "Icons for every app" switch in the editable PowerPoint / LibreOffice export (lib/core/office-icons.js). On (the
// default): each icon is a native shape, which every app draws. Off: icons travel as our icon font, flowing with the text
// and editing like letters, but only desktop PowerPoint (and LibreOffice from an .odp) draws them. The same choice as the
// command line's --no-icon-shapes. An export choice, not a front-matter key; remembered per deck.
import * as React from 'react';
import { Switch } from '@/components/ui/switch';
import { setIconShapes } from './export/images-override.js';

const KEY = (deckId?: string) => `lattice-studio-icon-shapes:${deckId ?? ''}`;

function load(deckId?: string): boolean {
	try {
		return localStorage.getItem(KEY(deckId)) !== 'off';
	} catch {
		return true;
	}
}

export function IconShapesControl({ deckId, busy, format }: { deckId?: string; busy?: boolean; format: 'pptx' | 'odp' }) {
	const [on, setOn] = React.useState<boolean>(() => load(deckId));
	// Who draws the font: desktop PowerPoint loads the fonts a .pptx carries; LibreOffice loads them from an .odp only.
	const reader = format === 'odp' ? 'LibreOffice' : 'desktop PowerPoint';
	React.useEffect(() => {
		setIconShapes(on);
		try {
			localStorage.setItem(KEY(deckId), on ? 'on' : 'off');
		} catch {
			// blocked storage: the choice still applies to this session
		}
	}, [on, deckId]);
	return (
		<div className="mt-3 flex items-start justify-between gap-3 border-t border-border pt-3">
			{/* The text column of the card's title above it: its icon (size-4) plus the gap (gap-2). */}
			<span className="pl-6">
				<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Icons for every app</span>
				<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
					{on
						? `Each icon is a shape, so apps that ignore the file’s fonts, like Google Slides, still draw it. Turn off to send icons as our font: they flow with the text, but only ${reader} draws them.`
						: `Icons travel as our font: they flow with the text and edit like letters, but only ${reader} draws them. Apps that ignore the file’s fonts, like Google Slides and iPhone Preview, show other symbols or empty boxes.`}
				</span>
			</span>
			<Switch className="mt-0.5" aria-label="Icons for every app" checked={on} disabled={busy} onCheckedChange={setOn} />
		</div>
	);
}
