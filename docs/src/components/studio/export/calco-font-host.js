// Calco's FontHost in the browser: the engine faces the site bundles (playground/font-embed.js),
// each pinned to one weight with every character kept, by the HarfBuzz subsetter the
// composed PDF already loads (lib/core/pdf-compose/font-subset.mjs, `text` null = keep all).
// The CLI's twin is lib/export/office-export.js `createFontHost`. Shared by the Studio's
// office export (deck-export.js) and the /calco page, which is why it is its own small module:
// the page must not pull the Studio's exporter in to embed a font.
// engineering/decisions/2026-10-06-calco-office-export-library.md.

export async function calcoFontHost(textTier) {
	const [{ FACES }, { createFontSubsetter }, { default: hbUrl }, { nearestFace, pinFeatures }, { default: officePolicy }] = await Promise.all([
		import('../../../playground/font-embed.js'),
		import('../../../../../lib/core/pdf-compose/font-subset.mjs'),
		import('harfbuzzjs/hb-subset.wasm?url'),
		import('@/lib/calco'),
		import('../../../../../lib/core/office-export-policy.js'),
	]);
	let subset = null;
	return {
		// Calco lists the faces the deck draws with; this decides what goes in the file for each (lib/core/office-export-policy.js `faceCut`).
		async font(face) {
			const cut = officePolicy.faceCut(textTier, face.chars);
			if (cut === undefined) return 'system';
			const hit = nearestFace(FACES, face);
			const res = hit ? await fetch(hit.url) : null;
			if (!res?.ok) return null;
			if (!subset) subset = await createFontSubsetter(await (await fetch(hbUrl)).arrayBuffer());
			// A variable web font is pinned to this weight; `exact` keeps just the characters the deck draws in the face, every other tier every character.
			return subset(new Uint8Array(await res.arrayBuffer()), cut, { wght: face.weight }, pinFeatures(face.ligatures));
		},
	};
}
