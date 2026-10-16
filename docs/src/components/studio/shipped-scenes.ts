// The SHIPPED motion library — the scenes Lattice ships as packages in lib/motion/<name>/
// (engineering/decisions/2026-09-23-portable-packages.md §5, phase 5). The Library's Motion tab
// lists them under "Shipped with Lattice", and Insert copies one into the deck exactly as it
// copies a saved scene: a deck never names a motion package, so nothing else reads them.
//
// LOADED ON DEMAND. tools/build-packages-index.js writes lib/motion/scenes.generated.js, and the
// module loads when the Library first asks for it, so a session that never opens the Library never
// downloads the scenes (the build splits it into its own chunk). A DEFAULT import: it
// is a CommonJS leaf (docs/src/plugins/vite-cjs-lib-dev.mjs).
//
// The same gates as a saved scene, on the way out: `parseScene` must accept the spec, and the
// drawing and the still pass `sanitizeSceneAssets` before the Library draws them (HARD RULE #22).
// The repo's own files are reviewed, but the Library has one drawing path, and it is the guarded one.

import { parseScene, type Scene } from '@/lib/anima';
import { sanitizeSceneAssets } from './scene-library';

/** A shipped scene, as the Library's card and Insert use it. */
export type ShippedScene = {
	name: string;
	label: string;
	description: string;
	spec: Scene;
	/** The still. Every shipped package carries one (test/unit/core/packages-spine.test.js). */
	poster?: string;
	/** The drawing an `svg` scene animates; a `built` scene has none. */
	art?: string;
};

type GeneratedRow = { name: string; label: string; description: string; spec: unknown; poster?: string; art?: string };
type GeneratedModule = { MOTION_SCENES: readonly GeneratedRow[] };

let load: Promise<ShippedScene[]> | null = null;

/** Every shipped scene that parses, in the packages' `order`. Never rejects: a failed load lists none. */
export function listShippedScenes(): Promise<ShippedScene[]> {
	if (!load) {
		load = import('../../../../lib/motion/scenes.generated.js')
			.then((m) => ((m as unknown as { default?: GeneratedModule }).default ?? (m as unknown as GeneratedModule)).MOTION_SCENES)
			.then((rows) => Promise.all(rows.map(toShipped)))
			.then((rows) => rows.filter((r): r is ShippedScene => r !== null))
			.catch((e) => {
				// The section then shows nothing, so say why where a developer will look.
				console.warn('[shipped-scenes] could not load the shipped motion library:', e);
				load = null;
				return [];
			});
	}
	return load;
}

async function toShipped(row: GeneratedRow): Promise<ShippedScene | null> {
	const r = parseScene(row.spec);
	if (!r.ok) {
		console.warn(`[shipped-scenes] lib/motion/${row.name} does not parse, so the Library leaves it out:`, r.errors.join('; '));
		return null;
	}
	const { poster, art } = await sanitizeSceneAssets({ poster: row.poster, art: row.art });
	return { name: row.name, label: row.label, description: row.description, spec: r.scene, ...(poster ? { poster } : {}), ...(art ? { art } : {}) };
}

/** The drawing Insert places: the art an `svg` scene animates, or a `built` scene's still. */
export function shippedDrawing(s: ShippedScene): string | undefined {
	return s.art ?? s.poster;
}
