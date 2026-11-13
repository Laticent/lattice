// Adaptive image sizes, known BEFORE a slide paints — loaded lazily by single-slide-render, so none
// of this rides the Studio's eager bundle (docs/route-budget.json).
//
// The `image` layout takes the photo's shape, and the frame measures it only once the section is in
// the DOM. On a slide SWAP (single-slide-render's patch path) the section painted composition-less
// for a few frames — the panel filled the whole slide — then as the Clean floor, then in its final
// layout: two jumps per navigation, reported from an iPhone on #2412. So this module remembers every
// size a frame measured (`__latticeImageBuckets`, lib/transformers/image-adaptive.js), measures the
// deck's other photos ahead of time THROUGH THE FRAME (its `Image`, so the frame's content policy
// decides what may load — a redirect it refuses is refused here too), and stamps each section before
// it is written (lib/core/image-aspect.js `stampImageSections`).

import families from '../../../lib/adaptive/families.js';
import { boundaryParser } from '../../../lib/core/boundary-parser.mjs';
import imageAspect from '../../../lib/core/image-aspect.js';
import { placedPictureInSlide } from '../../../lib/core/placed-picture.mjs';
import { slideRanges } from './deck-lint';
import { stripFrontMatter } from './front-matter';
import { slidePlacingAt } from './slide-carried';

type Geom = { width: number; height: number };

/** url -> bucket (`null`: the frame could not load it). Sizes are a property of the photo, so the
 *  map is shared by every preview on the page; bounded, oldest first out. */
const IMAGE_BUCKETS = new Map<string, string | null>();
const IMAGE_PENDING = new Set<string>();
const IMAGE_BUCKETS_MAX = 400;

function remember(url: string, bucket: string | null) {
	IMAGE_BUCKETS.delete(url);
	IMAGE_BUCKETS.set(url, bucket);
	if (IMAGE_BUCKETS.size > IMAGE_BUCKETS_MAX) IMAGE_BUCKETS.delete(IMAGE_BUCKETS.keys().next().value as string);
}

/** Remember a photo's size from outside a frame: a preview-sized copy knows its own
 *  (./preview-image-scale.ts), so the section that shows it stamps final on its first paint. */
export function rememberSize(url: string, width: number, height: number) {
	remember(url, imageAspect.bucketForAspect(width, height));
}

/** Fold in every size the frame's own pass measured. */
function learn(fr: HTMLIFrameElement | null | undefined) {
	try {
		const seen = (fr?.contentWindow as (Window & { __latticeImageBuckets?: Record<string, string | null> }) | null)?.__latticeImageBuckets;
		if (seen) for (const [url, bucket] of Object.entries(seen)) if (IMAGE_BUCKETS.get(url) !== bucket) remember(url, bucket);
	} catch {
		/* a torn-down frame has nothing to teach */
	}
}

/**
 * The slide HTML with each image section stamped from what is known of its photo (learning first
 * from the live frame, if any). An unknown photo gets the Clean floor, marked provisional.
 */
export async function stampKnownSizes(html: string, geom: Geom, live: HTMLIFrameElement | null | undefined): Promise<string> {
	learn(live);
	const orientation = families.orientationFor(geom.width / geom.height);
	return imageAspect.stampImageSections(html, (url: string) => (IMAGE_BUCKETS.has(url) ? IMAGE_BUCKETS.get(url) : undefined), orientation);
}

/**
 * Measure the deck's other panel photos NOW, through the frame, so the slide the reader turns to
 * next stamps final. Only an address the frame could load at all is tried: an http(s) one whose
 * origin the reader allowed (`allow`); the frame's own policy then rules on it and on every
 * redirect, exactly as it would when the slide is shown. At most 24 per call.
 */
export function prefetch(fr: HTMLIFrameElement | null | undefined, markdown: string, allow: string[], webOrigin: (u: string) => string | null, warm?: (url: string, prose?: boolean) => boolean) {
	const W = fr?.contentWindow as (Window & typeof globalThis) | null | undefined;
	if (!W || typeof W.Image !== 'function') return;
	const allowed = new Set(allow);
	let started = 0;
	const panels = panelPhotos(markdown);
	// A panel photo is the picture a slide places (Markdown's picture on an `image` or `bleed` slide), asked of the kernel every
	// reader asks, with what the slide inherits from the deck. Never Marp's `![bg]`, which the engine draws in the text since
	// 2026-11-13: matching `![bg]` here is how a swept deck's photos stopped being measured ahead.
	for (const url of panels) {
		if (!/^https?:\/\//i.test(url) || IMAGE_BUCKETS.has(url) || IMAGE_PENDING.has(url)) continue;
		const origin = webOrigin(url);
		if (!origin || !allowed.has(origin)) continue;
		if (++started > 24) break;
		// A preview-sized copy is being made instead (./preview-image-scale.ts): it measures the
		// photo too, and the frame never holds the original.
		if (warm?.(url)) continue;
		IMAGE_PENDING.add(url);
		// A frame torn down mid-load never fires either handler; let the address be tried again.
		setTimeout(() => IMAGE_PENDING.delete(url), 15_000);
		const img = new W.Image();
		img.onload = () => {
			IMAGE_PENDING.delete(url);
			remember(url, imageAspect.bucketForAspect(img.naturalWidth, img.naturalHeight));
		};
		img.onerror = () => {
			IMAGE_PENDING.delete(url);
			remember(url, null);
		};
		img.src = url;
	}
	// A prose photo (`![alt](url)`, what the Compose picker and the chat agent write) has no size to
	// measure for, but its preview-sized copy is made ahead the same way, so the slide the reader turns
	// to next shows the copy and never decodes the original.
	if (!warm) return;
	for (const m of String(markdown).matchAll(/!\[[^\]]*\]\(\s*<?(https?:\/\/[^\s)>]+)/gm)) {
		if (panels.has(m[1])) continue;
		const origin = webOrigin(m[1]);
		if (!origin || !allowed.has(origin)) continue;
		if (++started > 24) break;
		warm(m[1], true);
	}
}

/** The address of every picture a slide of `markdown` places as its photo, as written. */
function panelPhotos(markdown: string): Set<string> {
	const source = String(markdown);
	const body = stripFrontMatter(source);
	const head = source.length - body.length;
	const out = new Set<string>();
	for (const r of slideRanges(body)) {
		// Only a web address is prefetched, so a slide with no lone `http(s)` picture is never parsed: a pasted phone photo is a
		// multi-megabyte `data:` address, which the parse would read in full on every navigation.
		const text = body.slice(r.from, r.to);
		if (!/^[ \t]{0,3}!\[[^\]\n]*\]\(\s*<?https?:/im.test(text)) continue;
		const placing = slidePlacingAt(source, head + r.from);
		if (!placing) continue;
		const pic = placedPictureInSlide(text, placing.classes, { md: boundaryParser, backgroundImage: placing.backgroundImage });
		if (pic?.src) out.add(String(pic.src).trim());
	}
	return out;
}
