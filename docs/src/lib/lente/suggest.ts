// The SUGGEST PATH — a separate module from the read path (./project never imports this). Pure, NO
// AI, NO model call: a transparent rule table over each slide's class (read by the host's `classOf`) that PROPOSES
// membership. It writes nothing; the author reviews and approves. Suggestions are DIFFS from each
// lens's base (an include token for a base:none lens, a `-` exclude for a base:all lens), so the
// review UI writes only the shortest correct tag. Determinism is scoped to the injected catalog: the
// SAME catalog in gives the SAME proposals out.

import { findDirectiveComment } from './tags.js';
import type { ComponentCatalog, ComponentInfo, LensRegistry, Suggestion } from './types.js';
import { FULL_LENS_ID } from './types.js';

const NAME_RE = /^[A-Za-z0-9-]+$/; // validates a single already-split token; not run on raw input

/** Reads a slide's class words (space-separated; '' for none). A host that has the engine passes its own reader, so
 *  every way an author can name a layout (a `_class` comment, a `@meta{layout=…}` record, …) counts exactly as the
 *  engine counts it. This package is zero-dependency and does not carry that grammar itself. */
export type SlideClassReader = (slideSrc: string) => string;

/** The default reader, for a host without the engine: the first non-fenced `_class` comment (a `_class` shown inside
 *  a code fence is ignored, mirroring the read-path's fence handling). It does not read `@meta` records. */
export const commentClassReader: SlideClassReader = (src) => findDirectiveComment(src, 'class')?.body.trim() ?? '';

/** The component name of a slide: the first class word, or `text` for bare markdown or a word that is not a name. */
function nameOf(src: string, read: SlideClassReader): string {
	const first = String(read(src) ?? '').trim().split(/\s+/)[0] ?? '';
	return NAME_RE.test(first) ? first : 'text';
}

/** The heuristics, keyed by lens id. Only the built-in default lenses have a rule; a custom lens with
 *  no rule gets no suggestions (the author tags it by hand). Each returns a diff-from-base proposal. */
// Each rule reads the slides' component NAMES, one per slide, worked out once by `suggestMembership`.
const SUGGESTERS: Record<string, (slides: string[], catalog: ComponentCatalog) => Suggestion[]> = {
	// brief (base:none) — the bottom line. Bookend frame + assertions + headline metrics; NO detail.
	brief(slides, catalog) {
		const out: Suggestion[] = [];
		slides.forEach((slide, index) => {
			const name = slide;
			const info = catalog.get(name);
			if (!info) return;
			let reason = '';
			if (info.function === 'anchor' && info.form === 'bookend') reason = `${name} → title/closing frame → Brief`;
			else if (info.function === 'statement' && info.bucket !== 'connect') reason = `${name} → key assertion → Brief`;
			else if (name === 'kpi' || name === 'stats') reason = `${name} → headline metric → Brief`;
			if (reason) out.push({ index, lensId: 'brief', member: true, reason });
		});
		return out;
	},
	// ask (base:none, single) — exactly ONE slide, or NONE (never a low-confidence guess).
	ask(slides) {
		let pick = -1;
		let reason = '';
		slides.forEach((slide, index) => {
			if (slide === 'closing') { pick = index; reason = 'last closing slide → the CTA → Ask'; } // last wins
		});
		if (pick < 0) {
			const decision = slides.findIndex((s) => s === 'decision');
			if (decision >= 0) { pick = decision; reason = 'decision component → Ask'; }
		}
		if (pick < 0) {
			for (const metric of ['big-number', 'kpi', 'stats']) {
				const i = slides.findIndex((s) => s === metric);
				if (i >= 0) { pick = i; reason = `${metric} → headline metric → Ask`; break; }
			}
		}
		return pick >= 0 ? [{ index: pick, lensId: 'ask', member: true, reason }] : [];
	},
	// story (base:none) — the throughline: anchors (incl. dividers), the journey, and the problem setup.
	story(slides, catalog) {
		const firstNonAnchor = slides.findIndex((s) => (catalog.get(s)?.function ?? 'anchor') !== 'anchor');
		const out: Suggestion[] = [];
		slides.forEach((slide, index) => {
			const name = slide;
			const fn = catalog.get(name)?.function;
			let reason = '';
			if (fn === 'anchor') reason = `${name} → chapter frame → Story`;
			else if (fn === 'progression') reason = `${name} → the journey → Story`;
			else if (index === firstNonAnchor) reason = 'first non-anchor slide → the problem setup → Story';
			if (reason) out.push({ index, lensId: 'story', member: true, reason });
		});
		return out;
	},
	// evidence (base:all) — keep everything substantive; EXCLUDE decoration, logistics, and dividers.
	evidence(slides, catalog) {
		const out: Suggestion[] = [];
		slides.forEach((slide, index) => {
			const name = slide;
			const info = catalog.get(name);
			if (!info) return;
			const drop =
				info.function === 'imagery' ||
				(info.function === 'statement' && info.bucket === 'connect') ||
				(info.function === 'anchor' && info.form === 'divider');
			if (drop) out.push({ index, lensId: 'evidence', member: false, reason: `${name} → not substantive → dropped from Evidence` });
		});
		return out;
	},
};

/** Propose membership for every registered lens that has a built-in heuristic. Returns the tag WRITES
 *  (diffs from each lens's base) for the review grid — pure, no AI, no persistence. */
export function suggestMembership(slides: string[], reg: LensRegistry, catalog: ComponentCatalog, classOf: SlideClassReader = commentClassReader): Suggestion[] {
	const src = (Array.isArray(slides) ? slides : []).map((slide) => nameOf(slide, classOf));
	const out: Suggestion[] = [];
	for (const lens of reg.lenses) {
		if (lens.id === FULL_LENS_ID) continue;
		const rule = SUGGESTERS[lens.id];
		if (rule) out.push(...rule(src, catalog));
	}
	return out;
}

/** Build a ComponentCatalog from the shape of `dist/docs/components.json` (an array of entries with
 *  `name`/`bucket`/`function`/`form`) — a host-side convenience; the core stays catalog-injection-only. */
export function catalogFromComponents(components: Array<{ name: string } & ComponentInfo>): ComponentCatalog {
	return new Map(components.map((c) => [c.name, { bucket: c.bucket, function: c.function, form: c.form }]));
}
