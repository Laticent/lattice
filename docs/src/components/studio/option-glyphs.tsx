import {
	AArrowDown,
	AArrowUp,
	ALargeSmall,
	AlignVerticalJustifyCenter,
	AlignVerticalJustifyStart,
	AlignVerticalSpaceBetween,
	Briefcase,
	File,
	Files,
	Flag,
	Frame,
	GraduationCap,
	Heading2,
	Laptop,
	Link2,
	type LucideIcon,
	MousePointer2,
	PanelBottom,
	PanelLeft,
	PanelRight,
	PanelTop,
	Presentation,
	Rows3,
	Rows4,
	ScanText,
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
	SquareMousePointer,
	SquareRoundCorner,
	StretchHorizontal,
	Target,
	TextAlignCenter,
	TextAlignEnd,
	TextAlignStart,
	Theater,
	Tv,
	Wrench,
} from 'lucide-react';
import type * as React from 'react';
import { AutoIcon } from './auto-mark';
import { type CatalogSwatch, SwatchChip } from './CatalogSelect';
import { sizeRatio } from './slide-size';

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

// The badge family — stamp shape, tone shape, card tag — is drawn as a miniature slide or
// card, with the mark where the engine puts it (lib/base/base.variants.css,
// lib/base/base.card-tag.css). The mark takes the accent, as the rest of the panel does;
// on a slide it takes the state's own color.
const AC = 'var(--accent)';
const SOFT = 'color-mix(in srgb, var(--accent) 22%, var(--bg))';
const MUTED = 'var(--text-muted)';
const fill = (ink: string, pos: string, size: string) => `linear-gradient(${ink}, ${ink}) ${pos} / ${size} no-repeat`;
const chipOf = (...layers: string[]): Glyph => ({ swatch: { background: [...layers, 'var(--bg)'].join(', ') } });
// A ring around (x, y): the seal.
// Every full-chip layer is `no-repeat`: a repeating layer tiles into the chip's border and
// leaves a sliver of its shape on the opposite edge.
const ring = (x: string, y: string) => `radial-gradient(circle at ${x} ${y}, transparent 0 2.4px, ${AC} 2.6px 3.6px, transparent 3.8px) no-repeat`;
// A dot at (x, y): the stamp dot.
const dot = (x: string, y: string) => `radial-gradient(circle at ${x} ${y}, ${AC} 0 1.6px, transparent 2px) no-repeat`;
// A rounded pill outline with a soft fill, centered on (x, y).
const pill = (x: string, y: string) =>
	`radial-gradient(ellipse 4.6px 2.6px at ${x} ${y}, ${SOFT} 0 62%, ${AC} 66% 96%, transparent 100%) no-repeat`;
// A thin diagonal band: the ribbon (across the corner) and the mark (across the middle).
const band = (deg: number, from: string, to: string, ink: string) =>
	`linear-gradient(${deg}deg, transparent ${from}, ${ink} ${from} ${to}, transparent ${to}) no-repeat`;
// Four bars rising from the baseline: how much the narrated guide gestures.
const gesture = (hs: number[], ink: string): Glyph =>
	chipOf(...hs.map((h, i) => fill(ink, `${[16, 38, 62, 84][i]}% 84%`, `14% ${h}%`)));

/** The engine's default stamp and tone shapes (`default:` in lib/core/deck-settings.js), the
 *  value each picker's Auto head names. Mirrored, not imported: that table and its prose would
 *  ride into the Studio's startup bundle for two words. option-glyphs.test.tsx pins them. */
export const DEFAULT_STAMP = 'tab';
export const DEFAULT_TONE = 'rail';

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
	venue: {
		laptop: { icon: Laptop },
		huddle: { icon: Tv },
		conference: { icon: Presentation },
		hall: { icon: Theater },
	},
	delivery: {
		restrained: gesture([34, 46, 34, 46], AC),
		expressive: gesture([40, 86, 56, 96], AC),
		somber: gesture([26, 30, 26, 30], MUTED),
	},
	/** `stamp:` — the shape a state badge renders in, on a miniature slide. */
	stamp: {
		tab: chipOf(fill(AC, 'right top', '50% 28%')),
		notch: chipOf(fill(AC, '2px 1.5px', '3px 3px'), fill(SOFT, 'top', '100% 30%')),
		pill: chipOf(pill('64%', '32%')),
		// [ ]: each bracket is a stroke with a tick at either end, turned in. No label stroke
		// between them: at 16px it closed the gap and the pair read as an H.
		bracket: chipOf(
			fill(AC, '2.5px 2.5px', '1.5px 7px'), fill(AC, '2.5px 2.5px', '2.5px 1.5px'), fill(AC, '2.5px 8px', '2.5px 1.5px'),
			fill(AC, 'right 2.5px top 2.5px', '1.5px 7px'), fill(AC, 'right 2.5px top 2.5px', '2.5px 1.5px'), fill(AC, 'right 2.5px top 8px', '2.5px 1.5px'),
		),
		seal: chipOf(ring('68%', '36%')),
		ribbon: chipOf(band(225, '24%', '40%', AC)),
		flag: chipOf(fill(AC, '74% top', '3px 64%')),
		underline: chipOf(fill(MUTED, 'right 2px top 3px', '50% 2px'), fill(AC, 'right 2px top 6px', '50% 2px')),
		dot: chipOf(dot('42%', '30%'), fill(MUTED, 'right 2px top 4px', '36% 2px')),
		mark: chipOf(band(162, '42%', '58%', 'color-mix(in srgb, var(--accent) 40%, transparent)')),
		veil: { swatch: { background: `${fill(AC, 'right 2px top 2px', '5px 2.5px')}, ${SOFT}` } },
		bar: chipOf(fill('color-mix(in srgb, var(--accent) 82%, var(--text-heading))', 'right 2px top 3px', '60% 28%')),
		pin: chipOf(fill(AC, '70% top', '3.5px 40%')),
	},
	/** `tone:` — how a review tone shows: a left rail, the top edge, or a ring. */
	tone: {
		rail: chipOf(fill(AC, 'left', '3px 100%')),
		edge: chipOf(fill(AC, 'top', '100% 3px')),
		glow: { swatch: { background: `${fill('var(--bg)', 'center', 'calc(100% - 5px) calc(100% - 5px)')}, ${AC}` } },
	},
	/** Card tag color: the component's own fill, a neutral pill, or bare text. */
	tagColor: {
		color: chipOf(fill(AC, '2px 3px', '60% 32%')),
		plain: chipOf(fill('color-mix(in srgb, var(--text-heading) 40%, var(--bg))', '2px 3px', '60% 32%')),
		none: chipOf(fill(MUTED, '2px 5px', '60% 2px')),
	},
	/** Card tag placement: where the tag sits on its card (the chip is the card). */
	tagPlacement: {
		corner: chipOf(fill(AC, 'left top', '50% 28%')),
		foot: chipOf(fill(AC, 'left bottom', '50% 28%')),
		notch: chipOf(fill(AC, '3px top', '44% 18%')),
		band: chipOf(fill(AC, 'top', '100% 28%')),
		inline: chipOf(fill(AC, '2px 50%', '28% 26%'), fill(MUTED, 'right 2px top 50%', '48% 2px')),
	},
	logoPlacement: {
		'top-left': { icon: SquareArrowUpLeft },
		'top-center': { icon: SquareArrowUp },
		'top-right': { icon: SquareArrowUpRight },
		'bottom-left': { icon: SquareArrowDownLeft },
		'bottom-center': { icon: SquareArrowDown },
		'bottom-right': { icon: SquareArrowDownRight },
	},
	/** The logo recolored from a palette role: the chip is the mark, in that role's ink.
	 *  The blends split the chip between their two roles. */
	logoColor: {
		accent: chipOf(fill(AC, 'center', '62% 62%')),
		ink: chipOf(fill('var(--text-heading)', 'center', '62% 62%')),
		muted: chipOf(fill(MUTED, 'center', '62% 62%')),
		canvas: { swatch: { background: `${fill('var(--bg)', 'center', '62% 62%')}, var(--text-heading)` } },
		inverse: { swatch: { background: `${fill('var(--text-heading)', 'center', '62% 62%')}, ${SOFT}` } },
		brand: chipOf(`conic-gradient(from 45deg at 50% 50%, ${AC} 0 25%, var(--text-heading) 0 50%, ${MUTED} 0 75%, ${SOFT} 0) center / 62% 62% no-repeat`),
		'accent-ink': chipOf(`linear-gradient(90deg, ${AC} 50%, var(--text-heading) 50%) center / 62% 62% no-repeat`),
		'accent-canvas': chipOf(`linear-gradient(90deg, ${AC} 50%, ${SOFT} 50%) center / 62% 62% no-repeat`),
		'ink-canvas': chipOf(`linear-gradient(90deg, var(--text-heading) 50%, ${SOFT} 50%) center / 62% 62% no-repeat`),
	},
	/** The logo's size: the same mark, smaller or larger, in the top-right berth. */
	logoSize: {
		sm: chipOf(fill(AC, 'right 2px top 2px', '28% 28%')),
		md: chipOf(fill(AC, 'right 2px top 2px', '44% 44%')),
		lg: chipOf(fill(AC, 'right 2px top 2px', '62% 62%')),
	},
	/** The debug overlay: shown on hover or always, with the verbose labels or without. */
	debug: {
		'on-hover': { icon: MousePointer2 },
		'on-hover verbose': { icon: SquareMousePointer },
		'on-always': { icon: Frame },
		'on-always verbose': { icon: ScanText },
	},
	/** The genre the Audit's Style score is measured against. */
	profile: {
		general: { icon: Briefcase },
		teaching: { icon: GraduationCap },
		mission: { icon: Target },
	},
	logoScope: {
		all: { icon: Files },
		title: { icon: File },
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

/** The card tag's four axes. Size and alignment take library icons; color and placement
 *  are Lattice shapes, so they draw their own chip. */
const TAG_AXIS: Record<string, GlyphAxis> = { color: 'tagColor', size: 'tagSize', placement: 'tagPlacement', align: 'align' };
export function tagGlyph(axis: string, value: string): React.ReactNode {
	return TAG_AXIS[axis] ? optionGlyph(TAG_AXIS[axis], value) : undefined;
}

/** A slide size, drawn as its own aspect ratio inside the chip: an accent outline of the
 *  shape, so 16:9, 4:3, square, 4:5 and 9:16 are told apart at a glance. */
export function SizeChip({ size }: { size: string }) {
	const [w, h] = sizeRatio(size);
	const k = 82 / Math.max(w, h);
	const box = `${(w * k).toFixed(1)}% ${(h * k).toFixed(1)}%`;
	const inner = `calc(${(w * k).toFixed(1)}% - 3px) calc(${(h * k).toFixed(1)}% - 3px)`;
	return <SwatchChip background={`${fill('var(--bg)', 'center', inner)}, ${fill(AC, 'center', box)}, var(--bg)`} />;
}

/** The logo's four Inspector axes (`logo-finish:`). The plate has no picker of its own. */
const LOGO_AXIS: Record<string, GlyphAxis> = { placement: 'logoPlacement', color: 'logoColor', size: 'logoSize', scope: 'logoScope' };
export function logoGlyph(axis: string, value: string): React.ReactNode {
	return LOGO_AXIS[axis] ? optionGlyph(LOGO_AXIS[axis], value) : undefined;
}
