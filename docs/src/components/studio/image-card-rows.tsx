import type * as React from 'react';
import type { ImageCardAxis } from './slide-provenance';

// The Image rows the deck settings and the slide drawer share — one row per axis of the
// `image-card:` register (lib/core/resolve-image-card.js, lib/base/base.registers.docs.md
// § image-card:). Both surfaces read the labels from here, so a word is named the same way in each.

export type ImageCardRow = {
	axis: ImageCardAxis;
	label: string;
	desc: string;
	find: string;
	help: React.ReactNode;
};

export const IMAGE_CARD_ROWS: readonly ImageCardRow[] = [
	{
		axis: 'placement',
		label: 'Card placement',
		desc: 'Where the text card sits on the photo.',
		find: 'image photo card placement position corner top bottom left right center',
		help: (
			<>
				Move the card to a quiet part of the photo so the subject keeps the frame. A portrait deck keeps the card full width, so only top, middle or bottom applies. Written as <code>image-card: top-right</code>.
			</>
		),
	},
	{
		axis: 'backing',
		label: 'Card backing',
		desc: 'How opaque the card is, 0–100%.',
		find: 'image photo card backing opacity transparent solid soft sheer clear scrim',
		help: (
			<>
				The card's panel on a spotlight slide, the scrim on a statement slide. Drag for any 5% step, or tap a name: <strong>Solid</strong> is 100%, <strong>Soft</strong> 80%, <strong>Sheer</strong> 55%, <strong>Clear</strong> none at all. Under 60% the photo shows through, so a spotlight card needs a matching ink: on this slide, dragging below 60% picks one from the photo for you. A deck can set one in the Card ink row. Written as <code>image-card: soft</code> or <code>image-card: 65%</code>.
			</>
		),
	},
	{
		axis: 'ink',
		label: 'Card ink',
		desc: 'Light or dark words on the card.',
		find: 'image photo card ink text color light dark white black',
		help: (
			<>
				<strong>Light</strong> sets white words on a dark card, <strong>Dark</strong> near-black words on a light one. Pick the one that reads against the photo. Written as <code>image-card: dark</code>.
			</>
		),
	},
	{
		axis: 'size',
		label: 'Card size',
		desc: 'The card and its type, together.',
		find: 'image photo card size small medium large font type discreet',
		help: (
			<>
				<strong>Small</strong> is the discreet one: a narrower card and smaller type, so the photo carries the slide. Written as <code>image-card: sm</code>.
			</>
		),
	},
	{
		axis: 'density',
		label: 'Card density',
		desc: 'How tight the card is.',
		find: 'image photo card density compact padding tight spacing regular',
		help: (
			<>
				<strong>Compact</strong> tightens the card's padding and pulls it closer to the slide edge. Written as <code>image-card: compact</code>.
			</>
		),
	},
	{
		axis: 'shape',
		label: 'Card shape',
		desc: 'A floating card or a full-width strip.',
		find: 'image photo card shape band strip full width stretch banner caption top bottom',
		help: (
			<>
				<strong>Band</strong> stretches the card across the slide, heading left and text right, so it sits flush along the top or bottom and leaves the middle of the photo clear. It needs a top or bottom placement. Written as <code>image-card: bottom band</code>.
			</>
		),
	},
];

const OPTION_LABEL: Record<string, string> = {
	'top-left': 'Top left',
	top: 'Top center',
	'top-right': 'Top right',
	center: 'Center',
	'bottom-left': 'Bottom left',
	bottom: 'Bottom center',
	'bottom-right': 'Bottom right',
	solid: 'Solid',
	soft: 'Soft — 80%',
	sheer: 'Sheer — 55%',
	clear: 'Clear — no backing',
	light: 'Light words',
	dark: 'Dark words',
	sm: 'Small',
	md: 'Medium',
	lg: 'Large',
	regular: 'Regular',
	compact: 'Compact',
	float: 'Floating card',
	band: 'Full-width band',
};

export function imageCardOptionLabel(word: string): string {
	return OPTION_LABEL[word] ?? word;
}

/** What an axis does when no word is set: the deck list's head option, and the slide's Auto. */
export const IMAGE_CARD_DEFAULT_LABEL: Record<ImageCardAxis, string> = {
	placement: 'Bottom left',
	backing: 'Solid',
	ink: "Layout's own",
	size: 'Medium',
	density: 'Regular',
	shape: 'Floating card',
};
