// The Studio component library — a thin wrapper over the SHARED Workbench asset
// store (asset-store.js, IndexedDB `lattice-workbench`) and the canonical
// `componentAsset` record shape (layout-core). REUSE, DON'T REINVENT (HARD RULE
// #15): a local component authored + saved in the Studio's Fabricate Layout tab
// lands in the SAME library the Workbench's Layout Studio saves into. The
// persistence + record shapes are the trusted cores; this module only maps to
// the Studio's view model and degrades gracefully when IndexedDB is unavailable.

import { deleteAsset, listAssets, putAsset } from '@/components/studio/library/asset-store.js';
import { componentAsset } from '@/playground/layout-core.generated.js';

/** A saved local component as the Studio uses it. */
export type StudioComponent = {
	id: string;
	name: string; // lowercase slug — the `<!-- _class: name -->` invoked
	bucket: string | null;
	css: string;
	skeleton: string;
};

type ComponentAssetRecord = { id: string; name: string; bucket?: string | null; text?: string; skeleton?: string };

function toStudioComponent(a: ComponentAssetRecord): StudioComponent {
	return { id: a.id, name: a.name, bucket: a.bucket ?? null, css: a.text || '', skeleton: a.skeleton || '' };
}

/** The full component contract the Studio captures (manifest minus name/skeleton). */
export type ComponentMeta = {
	function?: string;
	form?: string;
	substance?: string;
	bucket?: string;
	tags?: string[];
	description?: string;
	adapt?: { mode: string };
	capacity?: { sweet?: number; soft?: number; hard?: number };
	density?: { axis: string; soft?: number; hard?: number };
};

/**
 * Save a local component to the shared library. Re-saving the same name UPDATES
 * in place (asset-store keys on kind+name). The FULL manifest is persisted (not
 * just name/bucket) so a saved component stays classifiable — it dedups against
 * future requests, graduates into the gallery, and reloads with its axes intact.
 * Throws if the name isn't a valid slug (componentAsset enforces it) or the store
 * is unavailable.
 */
export async function saveStudioComponent(input: { name: string; css: string; skeleton: string; meta?: ComponentMeta }): Promise<StudioComponent> {
	const meta = input.meta || {};
	const manifest: Record<string, unknown> = { name: input.name };
	for (const k of ['function', 'form', 'substance', 'bucket', 'adapt', 'capacity', 'density'] as const) {
		if (meta[k] != null) manifest[k] = meta[k];
	}
	if (Array.isArray(meta.tags) && meta.tags.length) manifest.tags = meta.tags;
	if (meta.description?.trim()) manifest.description = meta.description.trim();
	const asset = componentAsset({ name: input.name, css: input.css, skeleton: input.skeleton, manifest });
	const stored = (await putAsset(asset)) as ComponentAssetRecord;
	return toStudioComponent(stored);
}

/** Every saved local component, newest first. Returns [] when the store is unavailable. */
export async function listStudioComponents(): Promise<StudioComponent[]> {
	try {
		const rows = (await listAssets('component')) as ComponentAssetRecord[];
		return rows.map(toStudioComponent);
	} catch {
		return [];
	}
}

/** Remove a saved component by id (no-op if the store is unavailable). */
export async function deleteStudioComponent(id: string): Promise<void> {
	try {
		await deleteAsset(id);
	} catch {
		/* unavailable — non-fatal */
	}
}
