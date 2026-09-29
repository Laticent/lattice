import type * as React from 'react';
import type { CardTagAxis } from './slide-provenance';

// The Tag rows the deck settings and the slide drawer share — one row per axis of the `tag:`
// register (lib/core/resolve-card-tag.js, lib/base/base.registers.docs.md § tag:). Both surfaces
// read the labels from here, so a word is named the same way in each.

export type CardTagRow = {
	axis: CardTagAxis;
	label: string;
	desc: string;
	find: string;
	help: React.ReactNode;
	/** The component's own word on this axis. The deck list leaves it out (it is what Auto means);
	 *  the slide list keeps it, so a slide can return to it inside a deck that set another. */
	native: string;
};

export const CARD_TAG_ROWS: readonly CardTagRow[] = [
	{
		axis: 'color',
		label: 'Tag color',
		desc: 'How card tags are filled.',
		find: 'card tag label badge color plain none neutral',
		native: 'color',
		help: (
			<>
				The label that names a card. <strong>Plain</strong> is a neutral pill; <strong>None</strong> is bare text. Written as <code>tag: plain</code>.
			</>
		),
	},
	{
		axis: 'size',
		label: 'Tag size',
		desc: 'How large card tags are.',
		find: 'card tag label size small large',
		native: 'regular',
		help: (
			<>
				0.85×, 1× or 1.2×. Written as <code>tag: large</code>.
			</>
		),
	},
	{
		axis: 'placement',
		label: 'Tag placement',
		desc: 'Where each tag sits on its card.',
		find: 'card tag placement corner foot bottom notch band banner inline position',
		native: 'corner',
		help: (
			<>
				A <strong>Notch</strong> straddles the card's top edge; a <strong>Band</strong> spans the card top; <strong>Inline</strong> sits above the text, as steps do. Written as <code>tag: band</code>.
			</>
		),
	},
	{
		axis: 'align',
		label: 'Tag text',
		desc: 'Where the text sits in a wide tag.',
		find: 'card tag alignment align center end start text',
		native: 'start',
		help: (
			<>
				Shows in a band or a widened tag. Written as <code>tag: center</code>.
			</>
		),
	},
];

const OPTION_LABEL: Record<string, string> = {
	color: "Component's color",
	plain: 'Plain',
	none: 'None — bare text',
	small: 'Small',
	regular: 'Regular',
	large: 'Large',
	corner: 'Top corner',
	foot: 'Bottom corner',
	notch: 'Notch',
	band: 'Band',
	inline: 'Inline',
	start: 'Start',
	center: 'Center',
	end: 'End',
};

export function cardTagOptionLabel(word: string): string {
	return OPTION_LABEL[word] ?? word;
}
