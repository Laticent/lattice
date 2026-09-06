// INSTANCING — a stored drawing is a template; every insertion is a copy that needs its own ids.
//
// This module is deliberately SEPARATE from `svg-intake.ts`, and the reason is bundle weight, not
// taste: `Library.tsx` imports `slideSkeleton` eagerly, so anything the skeleton reaches pulls into
// the Studio route's eager bundle. The intake kernel carries DOMPurify. This carries a DOMParser
// call and a string swap, and the Studio route has a measured byte budget it has already blown once.

import type { Scene } from '@/lib/anima';

/** Stamped on art the intake kernel has already processed. Without it, reopening a saved asset ran its own
 *  output back through `intake` and prefixed every id a SECOND time — so the saved spec's `pathRef`s
 *  matched nothing, every part reported "no longer in the drawing", and the Library's Edit button was
 *  a dead end that could not be saved out of. It lives here rather than beside `intake` so that
 *  `reinstance` — and therefore the eagerly-imported skeleton — can read it without the kernel. */
export const PROCESSED_ATTR = 'data-lattice-motion';

/** A namespace for one INSTANCE of a drawing — random, because the thing it must differ from is a
 *  byte-identical copy of itself, possibly inserted in an earlier session. 36^8 ≈ 2.8e12. */
export function mintNamespace(): string {
	let out = 'm';
	for (let i = 0; i < 8; i++) out += Math.floor(Math.random() * 36).toString(36);
	return out;
}

/**
 * Give one drawing a FRESH namespace, and remap the plan that addresses it — what Insert owes.
 *
 * A stored asset is a template; every insertion is a copy. Without this, the same drawing on two
 * slides carried the same ids into one rendered document — five duplicates in this repo's own worked
 * example — and `test/unit/core/render-ids.test.js` asserts across the engine that a document has
 * none, because a duplicate makes every `url(#…)` resolve to the first one. `artNamespace` could
 * never have caught it: the two copies are the same bytes.
 *
 * The swap is a PREFIX swap, which is exact because `namespaceIds` guarantees every id in processed
 * art begins `<ns>-`. Ids, every `url(#…)` and `href="#…"` reference, the `PROCESSED_ATTR` stamp and
 * the spec's `pathRef`s all move together, so the copy is internally consistent and addressable.
 *
 * Art that carries no stamp is returned untouched — there is no prefix to swap, and inventing one
 * here would desynchronize it from a spec this function is not allowed to reinterpret.
 */
export function reinstance(art: string, spec: Scene): { art: string; spec: Scene } {
	const doc = new DOMParser().parseFromString(art, 'image/svg+xml');
	const svg = doc.querySelector('svg');
	const from = svg?.getAttribute(PROCESSED_ATTR);
	if (!svg || !from) return { art, spec };
	const to = mintNamespace();

	for (const el of Array.from(svg.querySelectorAll('[id]'))) {
		const id = el.getAttribute('id') || '';
		if (id.startsWith(`${from}-`)) el.setAttribute('id', `${to}-${id.slice(from.length + 1)}`);
	}
	// References, by the same prefix rule. `escapeReg` is not needed — a namespace is `m` plus base36.
	for (const el of Array.from(svg.querySelectorAll('*'))) {
		for (const attr of Array.from(el.attributes)) {
			if (!attr.value.includes(`#${from}-`)) continue;
			el.setAttribute(attr.name, attr.value.split(`#${from}-`).join(`#${to}-`));
		}
	}
	svg.setAttribute(PROCESSED_ATTR, to);

	// An svg scene addresses its drawing through BOTH fields on each element: `pathRef` selects the
	// node and `id` is what the compiled timeline reports back. They move together or the copy is
	// half-remapped — which is worse than not remapping at all, because it still validates.
	const swap = (ref: string) => (ref.startsWith(`${from}-`) ? `${to}-${ref.slice(from.length + 1)}` : ref);
	const nextSpec = {
		...spec,
		elements: (spec.elements ?? []).map((el) => ({ ...el, id: swap(el.id), ...('pathRef' in el ? { pathRef: swap((el as { pathRef: string }).pathRef) } : {}) })),
	} as Scene;
	return { art: new XMLSerializer().serializeToString(svg), spec: nextSpec };
}
