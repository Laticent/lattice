// The Studio card-row catalog — DISPLAY metadata for the `cards:` register (where a row
// of cards puts the height it does not need). Sibling of corners-catalog.ts. The engine's
// single source of truth is CARDS_NAMES (lib/core/resolve-cards.js); THIS file adds only
// the human layer the picker needs. Rot-guard: card-row-catalog.test.ts.
//
// Named `card-row-*`, not `cards-*`, so it can't be mistaken for the engine's generated
// `lib/core/cards-catalog.generated.js` (each component's manifest default).
//
// There is deliberately NO default entry. Omitting `cards:` means "each component
// decides", which is not the same as any one value — so the picker's Auto row is added
// by the caller, not here, and every entry below writes the key.

export type CardRowEntry = {
	/** the `cards:` register value (and engine CARDS_NAMES member) */
	name: string;
	label: string;
	blurb: string;
	/** CSS for the preview chip — two cards placed in a tall frame */
	swatch: { background: string; backgroundSize?: string };
};

const INK = (pct: number) => `color-mix(in srgb, var(--text-heading) ${pct}%, transparent)`;
const card = (y: string, h: string) => `linear-gradient(${INK(26)}, ${INK(26)}) 50% ${y} / 70% ${h} no-repeat`;
const chip = (...cards: string[]) => `${cards.join(', ')}, var(--bg)`;

// Ordered as the picker shows them.
export const CARD_ROWS: CardRowEntry[] = [
	{
		name: 'center', label: 'Center',
		blurb: 'Cards keep their natural height and sit together in the middle of the frame.',
		swatch: { background: chip(card('38%', '16%'), card('62%', '16%')) },
	},
	{
		name: 'stretch', label: 'Stretch',
		blurb: 'Cards grow to share the whole frame height.',
		swatch: { background: chip(card('12%', '36%'), card('88%', '36%')) },
	},
	{
		name: 'top', label: 'Top',
		blurb: 'Cards keep their natural height and start at the top; spare space falls below.',
		swatch: { background: chip(card('14%', '16%'), card('38%', '16%')) },
	},
	{
		name: 'spread', label: 'Spread',
		blurb: 'Cards keep their natural height and the spare space is shared evenly between them.',
		swatch: { background: chip(card('24%', '16%'), card('76%', '16%')) },
	},
];

export const CARD_ROWS_BY_NAME: Record<string, CardRowEntry> = Object.fromEntries(
	CARD_ROWS.map((s) => [s.name, s]),
);

/** The active entry for a value, or null when the deck leaves it to each component. */
export function activeCardRow(value: string | undefined | null): CardRowEntry | null {
	const key = (value ?? '').trim().toLowerCase();
	return CARD_ROWS_BY_NAME[key] ?? null;
}
