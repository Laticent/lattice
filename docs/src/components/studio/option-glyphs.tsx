import {
	AArrowDown,
	AArrowUp,
	ALargeSmall,
	AlignVerticalJustifyCenter,
	AlignVerticalJustifyStart,
	AlignVerticalSpaceBetween,
	Flag,
	Heading2,
	Link2,
	type LucideIcon,
	PanelBottom,
	PanelLeft,
	PanelRight,
	PanelTop,
	Rows3,
	Rows4,
	Scissors,
	SeparatorHorizontal,
	Square,
	SquareArrowDown,
	SquareArrowDownLeft,
	SquareArrowDownRight,
	SquareArrowUp,
	SquareArrowUpLeft,
	SquareArrowUpRight,
	SquareDashed,
	SquareDot,
	SquareRoundCorner,
	StretchHorizontal,
	TextAlignCenter,
	TextAlignEnd,
	TextAlignStart,
	Wrench,
} from 'lucide-react';
import type * as React from 'react';
import { AutoIcon } from './auto-mark';
import { type CatalogSwatch, SwatchChip } from './CatalogSelect';

// The preview glyph for every Settings option whose meaning is GENERIC GEOMETRY: an edge, an
// alignment, a vertical distribution, a corner, a fit action. Those take an icon from the site's
// icon library (lucide, the set the rest of the chrome draws with), because a reader already
// knows what "panel top" or "align center" looks like and a hand-drawn chip only re-draws it
// less crisply at 16px.
//
// A Lattice-only LOOK keeps its own drawn chip in its catalog — the brand bar's gradients,
// the heading rule, the eyebrow mark, a finish, a theme's accent. No library draws those, and
// the chip shows the real color or texture the slide will get.
//
// One table for both Inspector scopes: the deck pickers and the per-slide override pickers
// both call `optionGlyph`, so the same value can never wear two icons (HARD RULE #15).

type Glyph = { icon: LucideIcon; muted?: boolean } | { swatch: CatalogSwatch };

const AUTO: Glyph = { icon: Link2, muted: true };
const EDGE: Record<string, Glyph> = {
	top: { icon: PanelTop },
	left: { icon: PanelLeft },
	right: { icon: PanelRight },
	bottom: { icon: PanelBottom },
	off: { icon: SquareDashed, muted: true },
};
const ALIGN: Record<string, Glyph> = {
	auto: AUTO,
	left: { icon: TextAlignStart },
	start: { icon: TextAlignStart },
	center: { icon: TextAlignCenter },
	right: { icon: TextAlignEnd },
	end: { icon: TextAlignEnd },
};

// The image card is a Lattice construct with no library icon for its ink, size or shape, so
// those three draw their own chip: the photo as a dark ground, the card as a block on it.
const PHOTO = 'color-mix(in srgb, var(--text-heading) 55%, transparent)';
const CARD = 'var(--bg)';
const block = (pos: string, size: string, fill = CARD) => `linear-gradient(${fill}, ${fill}) ${pos} / ${size} no-repeat`;
const onPhoto = (...layers: string[]) => ({ background: `${layers.join(', ')}, ${PHOTO}` });

// A level meter — three rising bars, the first `n` in the accent. Lucide's signal icons draw
// the SAME shape with fewer bars, which at 16px leaves "slow" as two specks; this keeps all
// three bars visible and says the level by how many are lit.
const meter = (n: number) => {
	const bar = (i: number, h: string) => {
		const ink = i < n ? 'var(--accent)' : 'color-mix(in srgb, var(--text-heading) 18%, transparent)';
		return `linear-gradient(${ink}, ${ink}) ${[18, 50, 82][i]}% 84% / 20% ${h} no-repeat`;
	};
	return { swatch: { background: `${bar(0, '34%')}, ${bar(1, '52%')}, ${bar(2, '70%')}, var(--bg)` } };
};

const GLYPHS = {
	/** `spectrum-edge:` (Bar placement) and `spectrum-card-edge:` (Card rail placement). */
	edge: EDGE,
	/** `headline:` and the card tag's text alignment. */
	align: ALIGN,
	/** `cards:` — where a row of cards puts spare height. */
	cardRows: {
		center: { icon: AlignVerticalJustifyCenter },
		stretch: { icon: StretchHorizontal },
		top: { icon: AlignVerticalJustifyStart },
		spread: { icon: AlignVerticalSpaceBetween },
	},
	corners: {
		square: { icon: Square },
		rounded: { icon: SquareRoundCorner },
	},
	/** `guards:` — what the engine may do to make a slide fit. */
	fit: {
		report: { icon: Flag },
		heal: { icon: Wrench },
		trim: { icon: Scissors },
	},
	/** Chart motion speed — a level, drawn as a meter. */
	speed: {
		auto: AUTO,
		slow: meter(1),
		normal: meter(2),
		fast: meter(3),
	},
	/** Narration pace — the same level scale as motion speed. */
	pace: {
		deliberate: meter(1),
		natural: meter(2),
		brisk: meter(3),
	},
	split: {
		headings: { icon: Heading2 },
		rule: { icon: SeparatorHorizontal },
	},
	tagSize: {
		small: { icon: AArrowDown },
		regular: { icon: ALargeSmall },
		large: { icon: AArrowUp },
	},
	imagePlacement: {
		'top-left': { icon: SquareArrowUpLeft },
		top: { icon: SquareArrowUp },
		'top-right': { icon: SquareArrowUpRight },
		center: { icon: SquareDot },
		'bottom-left': { icon: SquareArrowDownLeft },
		bottom: { icon: SquareArrowDown },
		'bottom-right': { icon: SquareArrowDownRight },
	},
	imageDensity: {
		regular: { icon: Rows3 },
		compact: { icon: Rows4 },
	},
	// Ink is ABSOLUTE — light words are light in either site mode — so these two chips use
	// fixed white and black rather than tokens that swap when the site goes dark.
	imageInk: {
		light: { swatch: { background: 'linear-gradient(white, white) 50% 50% / 60% 2.5px no-repeat, rgb(0 0 0 / 0.78)' } },
		dark: { swatch: { background: 'linear-gradient(black, black) 50% 50% / 60% 2.5px no-repeat, white' } },
	},
	imageSize: {
		sm: { swatch: onPhoto(block('22% 76%', '30% 22%')) },
		md: { swatch: onPhoto(block('20% 80%', '54% 38%')) },
		lg: { swatch: onPhoto(block('16% 84%', '76% 54%')) },
	},
	imageShape: {
		float: { swatch: onPhoto(block('20% 78%', '52% 34%')) },
		band: { swatch: onPhoto(block('0 100%', '100% 34%')) },
	},
} satisfies Record<string, Record<string, Glyph>>;

export type GlyphAxis = keyof typeof GLYPHS;

/** An icon sized and colored like the swatch chip it stands beside: 16px, the accent. */
export function OptionIcon({ icon: Icon, muted }: { icon: LucideIcon; muted?: boolean }) {
	return <Icon aria-hidden strokeWidth={1.75} className={muted ? 'size-4 shrink-0 text-muted-foreground' : 'size-4 shrink-0 text-[var(--accent)]'} />;
}

/** The preview for one option, or undefined when the axis draws none for that value. */
export function optionGlyph(axis: GlyphAxis, value: string): React.ReactNode {
	const g = (GLYPHS[axis] as Record<string, Glyph>)[value];
	if (!g) return undefined;
	// Auto keeps the one auto glyph every other Auto head wears (auto-mark.tsx), at its size.
	if (g === AUTO) return <AutoIcon />;
	return 'icon' in g ? <OptionIcon icon={g.icon} muted={g.muted} /> : <SwatchChip {...g.swatch} />;
}

/** `optionGlyph` bound to one axis — the shape `catalogOptions` and the slide pickers take. */
export const glyphs = (axis: GlyphAxis) => (value: string) => optionGlyph(axis, value);

/** The image card's six axes, by their `image-card:` axis name. Backing has its own control. */
const IMAGE_AXIS: Record<string, GlyphAxis> = { placement: 'imagePlacement', ink: 'imageInk', size: 'imageSize', density: 'imageDensity', shape: 'imageShape' };
export function imageGlyph(axis: string, value: string): React.ReactNode {
	return IMAGE_AXIS[axis] ? optionGlyph(IMAGE_AXIS[axis], value) : undefined;
}

/** The card tag's four axes. Color and placement are Lattice shapes with no drawn chip yet. */
const TAG_AXIS: Record<string, GlyphAxis> = { size: 'tagSize', align: 'align' };
export function tagGlyph(axis: string, value: string): React.ReactNode {
	return TAG_AXIS[axis] ? optionGlyph(TAG_AXIS[axis], value) : undefined;
}
