// Calco's FontHost in the browser: the engine faces the site bundles (playground/font-embed.js),
// each pinned to one weight with every character kept, by the HarfBuzz subsetter the
// composed PDF already loads (lib/core/pdf-compose/font-subset.mjs, `text` null = keep all).
// The CLI's twin is lib/export/office-export.js `createFontHost`. Shared by the Studio's
// office export (deck-export.js) and the /calco page, which is why it is its own small module:
// the page must not pull the Studio's exporter in to embed a font.
// engineering/decisions/2026-10-06-calco-office-export-library.md.

export async function calcoFontHost() {
	const [{ FACES }, { createFontSubsetter }, { default: hbUrl }, { nearestFace, pinFeatures }] = await Promise.all([
		import('../../../playground/font-embed.js'),
		import('../../../../../lib/core/pdf-compose/font-subset.mjs'),
		import('harfbuzzjs/hb-subset.wasm?url'),
		import('@/lib/calco'),
	]);
	let subset = null;
	return {
		async load(face) {
			const hit = nearestFace(FACES, face);
			if (!hit) return null;
			const res = await fetch(hit.url);
			return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
		},
		async pin(bytes, { weight, ligatures }) {
			if (!subset) subset = await createFontSubsetter(await (await fetch(hbUrl)).arrayBuffer());
			return subset(bytes, null, { wght: weight }, pinFeatures(ligatures));
		},
	};
}
