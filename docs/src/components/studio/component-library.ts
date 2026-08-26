// The Studio component library — a thin wrapper over the SHARED Workbench asset
// store (asset-store.js, IndexedDB `lattice-workbench`) and the canonical
// `componentAsset` record shape (layout-core). REUSE, DON'T REINVENT (HARD RULE
// #15): a local component authored + saved in the Studio's Fabricate Layout tab
// lands in the SAME library the Workbench's Layout Studio saves into. The
// persistence + record shapes are the trusted cores; this module only maps to
// the Studio's view model and degrades gracefully when IndexedDB is unavailable.

import { deleteAsset, listAssets, putAsset } from '@/components/studio/library/asset-store.js';

// Loaded ON DEMAND (2026-08-17 loading audit §9.2). This module is reached eagerly
// from StudioShell, so a static import pulled layout-core's 126.7KB of source onto
// the cold path — past the React.lazy boundary Fabricate already has. `componentAsset`
// is only ever called while SAVING a component, which is a user action.
type LayoutCore = typeof import('@/playground/layout-core.generated.js');
let layoutCoreLoad: Promise<LayoutCore> | null = null;
function loadLayoutCore(): Promise<LayoutCore> {
	if (!layoutCoreLoad) layoutCoreLoad = import('@/playground/layout-core.generated.js');
	return layoutCoreLoad;
}

/** A saved local component as the Studio uses it. */
export type StudioComponent = {
	id: string;
	name: string; // lowercase slug — the `<!-- _class: name -->` invoked
	bucket: string | null;
	css: string;
	skeleton: string;
	/** The persisted manifest, minus the fields already hoisted above.
	 *
	 *  CARRIED, NOT DROPPED. `saveStudioComponent` has always persisted the FULL
	 *  manifest — function, form, substance, tags, adapt, capacity, density — and this
	 *  mapper used to discard every one of them on the way back out. Nothing noticed
	 *  while the only reader was a card that shows a name and a bucket; it breaks the
	 *  moment a component can be REOPENED for editing, because the faculty would seed
	 *  from its own saved record and silently lose the author's whole contract. */
	meta: ComponentMeta;
};

type ComponentAssetRecord = { id: string; name: string; bucket?: string | null; text?: string; skeleton?: string; manifest?: Record<string, unknown> };

/** The manifest fields worth carrying back, in the shape `saveStudioComponent` takes. */
function toMeta(manifest: Record<string, unknown> | undefined): ComponentMeta {
	const m = manifest || {};
	const out: ComponentMeta = {};
	for (const k of ['function', 'form', 'substance', 'bucket', 'description'] as const) {
		if (typeof m[k] === 'string') out[k] = m[k] as string;
	}
	if (Array.isArray(m.tags)) out.tags = m.tags.filter((t): t is string => typeof t === 'string');
	if (m.adapt && typeof m.adapt === 'object') out.adapt = m.adapt as ComponentMeta['adapt'];
	if (m.capacity && typeof m.capacity === 'object') out.capacity = m.capacity as ComponentMeta['capacity'];
	if (m.density && typeof m.density === 'object') out.density = m.density as ComponentMeta['density'];
	return out;
}

function toStudioComponent(a: ComponentAssetRecord): StudioComponent {
	return { id: a.id, name: a.name, bucket: a.bucket ?? null, css: a.text || '', skeleton: a.skeleton || '', meta: toMeta(a.manifest) };
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
 *
 * `id` PINS THE RECORD, and is what makes editing a saved asset safe: without it
 * the store finds the record to update by NAME, so renaming while editing lands the
 * edit as a SECOND record and leaves every deck pointing at the untouched first one.
 * Pass the id you loaded and the same record is rewritten whatever the name becomes.
 * Omit it and the name-keyed behavior above is unchanged.
 */
export async function saveStudioComponent(input: { id?: string; name: string; css: string; skeleton: string; meta?: ComponentMeta }, opts?: { historyLabel?: string }): Promise<StudioComponent> {
	const meta = input.meta || {};
	const manifest: Record<string, unknown> = { name: input.name };
	for (const k of ['function', 'form', 'substance', 'bucket', 'adapt', 'capacity', 'density'] as const) {
		if (meta[k] != null) manifest[k] = meta[k];
	}
	if (Array.isArray(meta.tags) && meta.tags.length) manifest.tags = meta.tags;
	if (meta.description?.trim()) manifest.description = meta.description.trim();
	const asset = (await loadLayoutCore()).componentAsset({ name: input.name, css: input.css, skeleton: input.skeleton, manifest });
	const stored = (await putAsset(input.id ? { ...asset, id: input.id } : asset, opts)) as ComponentAssetRecord;
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
