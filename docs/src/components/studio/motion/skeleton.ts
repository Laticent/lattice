// THE SLIDE A MOTION ASSET LANDS ON.
//
// Read off the shipped worked deck (`examples/anima-scene.md`, the `source: "svg"` slide) rather
// than invented, because Insert has to produce this byte shape and nothing else. From here the
// existing chain runs untouched: `animaSceneFences` base64s the fence into a `.anima-spec` div,
// `scene.transform.js` lifts it onto the `<section>` and wraps the poster in `.scene-figure`, and
// `anima-scenes.ts` selects `section.scene[data-scene-spec]` and mounts it live. No new render path.
//
// TWO SHAPES ARE NOT COSMETIC:
//
//  • THE POSTER GOES ON ONE LINE, with no blank line inside it. Markdown block-HTML ends at a blank
//    line, so a prettified multi-line `<svg>` would split the drawing and leave half of it as prose.
//    `examples/anima-scene.md` is single-line for exactly this reason.
//  • THE POSTER CARRIES ITS OWN ACCESSIBLE NAME. A bare `<svg>` ships an unlabeled graphic into
//    every deck that uses a crafted asset. The record already holds `label` and `description`, the
//    sanitizer keeps `<title>` and `<desc>`, and the naming cascade already reads `<title>` — so
//    `role="img"` plus the two elements costs nothing and is the difference between a screen reader
//    saying "Value chain, five stages" and saying nothing at all.

import type { Scene } from '@/lib/anima';
import { ART_MAX_BYTES } from './svg-intake';

/** Strip newlines out of serialized markup so it can sit on one markdown line. Attribute values are
 *  left alone — a newline inside one would be unusual and collapsing it is still safe here, because
 *  the only thing this markup does is paint. */
function oneLine(markup: string): string {
	return markup.replace(/\s*\n\s*/g, ' ').trim();
}

/**
 * Flatten a label to something that can sit on ONE markdown line.
 *
 * `label` reaches here from a record, and a record can come from an imported bundle whose manifest a
 * stranger hand-edited — where a label carrying newlines wrote `---` and a second `<!-- _class -->`
 * straight into the heading, injecting arbitrary slides into the author's deck under their own name.
 * The `<title>` half was already safe (escaped, then newline-collapsed by `oneLine`); the heading was
 * not, because it is markdown rather than markup.
 */
function oneLineText(text: string): string {
	return String(text ?? '')
		.replace(/[\r\n]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Escape the two characters that would end an attribute or open a tag inside `<title>`/`<desc>`. */
function escapeText(text: string): string {
	return String(text ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/**
 * Give the drawing an accessible name, in place, without disturbing anything that paints.
 *
 * `<title>` and `<desc>` must be the FIRST children to be picked up as the accessible name, and any
 * existing pair is replaced rather than appended to — two `<title>` elements make the name
 * ambiguous, and the second is ignored by every engine that has an opinion.
 */
export function labelArt(art: string, label: string, description?: string): string {
	const doc = new DOMParser().parseFromString(art, 'text/html');
	const svg = doc.querySelector('svg');
	if (!svg) return art;

	for (const el of Array.from(svg.children)) {
		const t = el.tagName.toLowerCase();
		if (t === 'title' || t === 'desc') el.remove();
	}
	svg.setAttribute('role', 'img');

	const head: string[] = [];
	if (label) head.push(`<title>${escapeText(label)}</title>`);
	if (description) head.push(`<desc>${escapeText(description)}</desc>`);
	if (head.length) svg.insertAdjacentHTML('afterbegin', head.join(''));
	return svg.outerHTML;
}

/**
 * How big the poster this slide will carry actually is.
 *
 * The design record keeps the winning track's better half: the ceiling binds the POSTER, not just
 * the art, because the poster is the artifact that inlines into the deck — art plus the accessible
 * name, plus whatever the drawing library stamped on the nodes. Refusing on art alone left the thing
 * that lands on the slide unmeasured.
 */
export function posterBytes({ label, description, art }: { label: string; description?: string; art: string }): number {
	return new TextEncoder().encode(oneLine(labelArt(art, oneLineText(label) || 'Untitled drawing', description))).length;
}

/** Whether that poster is small enough to travel inside a deck. */
export function posterFits(input: { label: string; description?: string; art: string }): boolean {
	return posterBytes(input) <= ART_MAX_BYTES;
}

export interface SkeletonInput {
	label: string;
	description?: string;
	/** The sanitized drawing — one string, the same one the poster and the stored `art` derive from. */
	art: string;
	spec: Scene;
	/** Optional prose under the heading. */
	caption?: string;
}

/**
 * The markdown Insert writes: a `scene` slide carrying the drawing inline and its plan in a fence.
 *
 * The drawing rides INLINE, which is what makes a deck carrying a crafted asset self-contained with
 * no further work — portability is a property of the target, not something Insert has to add.
 */
export function slideSkeleton({ label, description, art, spec, caption }: SkeletonInput): string {
	const heading = oneLineText(label) || 'Untitled drawing';
	const poster = oneLine(labelArt(art, heading, description));
	const fence = JSON.stringify(spec, null, 2);
	const lines = ['<!-- _class: scene -->', '', `## ${heading}`, ''];
	if (caption) lines.push(oneLineText(caption), '');
	lines.push(poster, '', '```anima', fence, '```', '');
	return lines.join('\n');
}
