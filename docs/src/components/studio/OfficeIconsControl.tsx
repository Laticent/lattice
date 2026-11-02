// The "Icons" choice in the editable PowerPoint / LibreOffice export: native shapes that every app draws, or our icon font
// that flows with the text but only desktop PowerPoint and LibreOffice load (lib/core/office-icons.js). Same words as the
// command line's --office-icons. Remembered per deck.
import * as React from 'react';
import { autoHeadLabel } from './auto-mark';
import { type Choice, ChoiceSelect } from './ChoiceSelect';
import { deckPolicyOf, setOfficeIconsOverride } from './export/images-override.js';

type Mode = '' | 'shapes' | 'font';
const MODES: Choice<Mode>[] = [
	{ value: '', title: 'Auto', blurb: 'Follow `office-icons:` in the deck’s front matter (shapes when it says nothing).' },
	{ value: 'shapes', title: 'Shapes', blurb: 'Right in every app: PowerPoint, Keynote, Google Slides, iPhone Preview. Recolor as a shape.' },
	{ value: 'font', title: 'Font', blurb: 'Icons flow with the text and edit like letters, in desktop PowerPoint and LibreOffice only. Other apps show boxes.' },
];

const KEY = (deckId?: string) => `lattice-studio-office-icons:${deckId ?? ''}`;

function load(deckId?: string): Mode {
	try {
		const v = localStorage.getItem(KEY(deckId));
		return v === 'shapes' || v === 'font' ? v : '';
	} catch {
		return '';
	}
}

export function OfficeIconsControl({ deckId, source, busy }: { deckId?: string; source?: string; busy?: boolean }) {
	const auto = React.useMemo(() => deckPolicyOf(source).officeIcons as Mode, [source]);
	const [mode, setMode] = React.useState<Mode>(() => load(deckId));
	React.useEffect(() => {
		setOfficeIconsOverride(mode);
		try {
			localStorage.setItem(KEY(deckId), mode);
		} catch {
			// blocked storage: the choice still applies to this session
		}
	}, [mode, deckId]);
	const choices = MODES.map((c) => (c.value === '' ? { ...c, title: autoHeadLabel(MODES.find((m) => m.value === auto)?.title ?? '') } : c));
	return <ChoiceSelect label="Icons" value={mode} choices={choices} disabled={busy} onChange={setMode} />;
}
