// The "Fonts" choice in the web-page export panel: how much of each typeface the player carries.
// Same plan as the command line's --fonts (lib/core/font-policy.js). Remembered per deck.
import { Type } from 'lucide-react';
import * as React from 'react';
import { setFontsOverride } from './export/images-override.js';

type Tier = '' | 'exact' | 'used' | 'full' | 'system';
const TEXT: { value: Tier; title: string }[] = [
	{ value: '', title: 'Deck setting (used when it says nothing): the whole face for each script the deck uses, so edited text keeps every glyph' },
	{ value: 'exact', title: 'Exact: only the characters the deck shows, the smallest file' },
	{ value: 'used', title: 'Used: whole face for the scripts the deck uses' },
	{ value: 'full', title: 'Full: the whole face' },
	{ value: 'system', title: 'System: embed nothing, the viewer’s fonts draw the text' },
];
const EMOJI: { value: Tier; title: string }[] = [
	{ value: '', title: 'Deck setting (exact when it says nothing)' },
	{ value: 'exact', title: 'Exact: only the emoji the deck shows' },
	{ value: 'used', title: 'Used: whole slices holding the deck’s emoji' },
	{ value: 'full', title: 'Full: the whole emoji font (about 2 MB)' },
	{ value: 'system', title: 'System: the viewer’s own emoji' },
];

const KEY = (deckId?: string) => `lattice-studio-fonts:${deckId ?? ''}`;

function load(deckId?: string): { text: Tier; emoji: Tier } {
	try {
		const v = JSON.parse(localStorage.getItem(KEY(deckId)) || '{}');
		return { text: v.text || '', emoji: v.emoji || '' };
	} catch {
		return { text: '', emoji: '' };
	}
}

export function FontsControl({ deckId, busy }: { deckId?: string; busy?: boolean }) {
	const [choice, setChoice] = React.useState(() => load(deckId));
	React.useEffect(() => {
		setFontsOverride([choice.text, choice.emoji && `${choice.emoji}-emoji`].filter(Boolean).join(' '));
		try {
			localStorage.setItem(KEY(deckId), JSON.stringify(choice));
		} catch {
			// blocked storage: the choice still applies to this session
		}
	}, [choice, deckId]);
	const select = (label: string, value: Tier, options: typeof TEXT, set: (v: Tier) => void) => (
		<label className="mt-2 flex flex-col gap-1 text-[11.5px] text-muted-foreground">
			{label}
			<select value={value} disabled={busy} onChange={(e) => set(e.target.value as Tier)} className="rounded-md border border-border bg-background px-2 py-1.5 text-[12px] text-[var(--text-heading)]" aria-label={label}>
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.title}
					</option>
				))}
			</select>
		</label>
	);
	return (
		<div className="rounded-xl border border-border bg-background p-3.5">
			<span className="flex items-start gap-2">
				<Type className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
				<span className="min-w-0 flex-1">
					<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Fonts</span>
					<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">How much of each typeface the web page carries. Same words as the deck’s `fonts:` line.</span>
					{select('Text fonts', choice.text, TEXT, (text) => setChoice({ ...choice, text }))}
					{select('Emoji font', choice.emoji, EMOJI, (emoji) => setChoice({ ...choice, emoji }))}
				</span>
			</span>
		</div>
	);
}
