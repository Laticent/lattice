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
import bgImage from '../../../lib/core/bg-image.js';
import imageAspect from '../../../lib/core/image-aspect.js';

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
export function prefetch(fr: HTMLIFrameElement | null | undefined, markdown: string, allow: string[], webOrigin: (u: string) => string | null) {
	const W = fr?.contentWindow as (Window & typeof globalThis) | null | undefined;
	if (!W || typeof W.Image !== 'function') return;
	const allowed = new Set(allow);
	let started = 0;
	for (const m of String(markdown).matchAll(new RegExp(bgImage.BG_RE.source, 'gm'))) {
		const url = String(m[2] || '').trim().split(/\s+/)[0];
		if (!/^https?:\/\//i.test(url) || IMAGE_BUCKETS.has(url) || IMAGE_PENDING.has(url)) continue;
		const origin = webOrigin(url);
		if (!origin || !allowed.has(origin)) continue;
		if (++started > 24) break;
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
}
