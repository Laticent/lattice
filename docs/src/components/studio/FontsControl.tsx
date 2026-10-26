// The "Fonts" choice in the web-page export panel: how much of each typeface the player carries.
// Same plan as the command line's --fonts (lib/core/font-policy.js). Remembered per deck.
import { Type } from 'lucide-react';
import * as React from 'react';
import { autoHeadLabel } from './auto-mark';
import { type Choice, ChoiceSelect } from './ChoiceSelect';
import { deckPolicyOf, setFontsOverride } from './export/images-override.js';

type Tier = '' | 'exact' | 'used' | 'full' | 'system';
const TEXT: Choice<Tier>[] = [
	{ value: '', title: 'Auto', blurb: 'Follow `fonts:` in the deck’s front matter (the whole face when it says nothing).' },
	{ value: 'exact', title: 'Exact', blurb: 'Only the characters the deck shows. The smallest file.' },
	{ value: 'used', title: 'Used', blurb: 'The whole face, so edited text keeps every glyph.' },
	{ value: 'full', title: 'Full', blurb: 'The whole face, every script.' },
	{ value: 'system', title: 'System', blurb: 'Embed nothing; the viewer’s fonts draw the text.' },
];
// In a PDF the engine's own faces stay in the page picture under System; no viewer font draws them.
const PDF_SYSTEM: Choice<Tier> = { value: 'system', title: 'System', blurb: 'Embed none of the engine’s fonts; those words stay in the page picture.' };
const EMOJI: Choice<Tier>[] = [
	{ value: '', title: 'Auto', blurb: 'Follow `fonts:` in the deck’s front matter (exact when it says nothing).' },
	{ value: 'exact', title: 'Exact', blurb: 'Only the emoji the deck shows.' },
	{ value: 'used', title: 'Used', blurb: 'Whole slices holding the deck’s emoji.' },
	{ value: 'full', title: 'Full', blurb: 'The whole emoji font, about 2 MB.' },
	{ value: 'system', title: 'System', blurb: 'The viewer’s own emoji.' },
];

const BLURB = {
	webpage: 'How much of each typeface the web page carries.',
	pdf: 'The PDF writer embeds the glyphs it draws. System embeds none of the engine’s fonts: those words stay in the page picture, so they are not selectable or searchable.',
	office: 'Editable PowerPoint and LibreOffice files embed the whole face for every choice but System, so edited text keeps the deck’s type.',
};

const titleOf = (list: Choice<Tier>[], tier: Tier) => list.find((c) => c.value === tier)?.title ?? '';

const KEY = (deckId?: string) => `lattice-studio-fonts:${deckId ?? ''}`;

function load(deckId?: string): { text: Tier; emoji: Tier } {
	try {
		const v = JSON.parse(localStorage.getItem(KEY(deckId)) || '{}');
		return { text: v.text || '', emoji: v.emoji || '' };
	} catch {
		return { text: '', emoji: '' };
	}
}

export function FontsControl({ deckId, source, busy, format = 'webpage' }: { deckId?: string; source?: string; busy?: boolean; format?: 'webpage' | 'pdf' | 'office' }) {
	// "Auto" reads as what it lands on: the deck's own `fonts:` line, else the built-in default.
	const auto = React.useMemo(() => deckPolicyOf(source).fonts, [source]);
	const named = (list: Choice<Tier>[], tier: Tier) => list.map((c) => (c.value === '' ? { ...c, title: autoHeadLabel(titleOf(list, tier)) } : c));
	const [choice, setChoice] = React.useState(() => load(deckId));
	React.useEffect(() => {
		setFontsOverride([choice.text, choice.emoji && `${choice.emoji}-emoji`].filter(Boolean).join(' '));
		try {
			localStorage.setItem(KEY(deckId), JSON.stringify(choice));
		} catch {
			// blocked storage: the choice still applies to this session
		}
	}, [choice, deckId]);
	return (
		<div className="rounded-xl border border-border bg-background p-3.5">
			<span className="flex items-start gap-2">
				<Type className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
				<span className="min-w-0 flex-1">
					<span className="block text-[13px] font-semibold text-[var(--text-heading)]">Fonts</span>
					<span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{BLURB[format]} Same words as the deck’s `fonts:` line.</span>
					<ChoiceSelect label="Text fonts" value={choice.text} choices={named(format === 'pdf' ? TEXT.map((c) => (c.value === 'system' ? PDF_SYSTEM : c)) : TEXT, auto.text as Tier)} disabled={busy} onChange={(text) => setChoice({ ...choice, text })} />
					<ChoiceSelect label="Emoji font" value={choice.emoji} choices={named(EMOJI, auto.emoji as Tier)} disabled={busy} onChange={(emoji) => setChoice({ ...choice, emoji })} />
					{format !== 'webpage' && <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">In a {format === 'pdf' ? 'PDF' : 'PowerPoint or LibreOffice file'} the emoji are part of the slide picture, so this choice does not change the file. It applies to web pages and the player.</span>}
				</span>
			</span>
		</div>
	);
}
