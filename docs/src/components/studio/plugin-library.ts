// The Studio's shelf of zip PLUGINS (plugin-system §9 decision 13): a thin wrapper over the shared
// Workbench asset store (library/asset-store.js, kind 'plugin'), beside the themes, components and
// finishes, and unlike them NEVER in a deck, a `.lattice` project or a workspace backup. A plugin's
// code is the user's to approve in THIS browser, so the code stays in this browser's storage and
// nothing that leaves it carries the code (workspace-backup.ts lists the kinds it exports, and this
// is not one; package-zip.ts refuses a plugin that arrives inside a project). Degrades like its
// siblings: with no IndexedDB a read returns an empty shelf and never throws.

import { deleteAsset, listAssets, putAsset } from '@/components/studio/library/asset-store.js';
import type { StudioPluginKind } from '@/lib/code-packages/door';

/** A saved zip plugin as the Studio uses it. */
export type StudioPluginRecord = {
	id: string;
	name: string; // lowercase slug: the name a deck writes in `plugins:`
	fence: string; // the one fence it owns (```fence), or '' for a plugin of inline kinds only
	code: string; // its `render.js`, as text
	/** The plugin's `styles.css`. The door rebuilds it behind the plugin's root (`scopePluginCss`) and adds it to every preview and export. */
	css: string;
	title: string;
	description: string;
	/** The manifest's `placeholder` hint, already reduced by `placeholderHint`. */
	placeholder?: { placement?: string; aspect?: string; size?: string };
	/** Its inline kinds (`@kind{…}`, 2026-10-14-plugin-inline-door.md): name, slot spec, placeholder size, title. */
	kinds?: StudioPluginKind[];
	/** Its declared return fields (`contributes.returns`), as the manifest held them. */
	returns?: unknown;
};

type PluginAssetRecord = { id: string; kind: 'plugin'; name: string; fence?: string; text?: string; css?: string; title?: string; description?: string; placeholder?: { placement?: string; aspect?: string; size?: string }; kinds?: StudioPluginKind[]; returns?: unknown; addedAt?: number };

const toRecord = (a: PluginAssetRecord): StudioPluginRecord => ({ id: a.id, name: a.name, fence: a.fence ?? '', code: a.text ?? '', css: a.css ?? '', title: a.title ?? a.name, description: a.description ?? '', ...(a.placeholder ? { placeholder: a.placeholder } : {}), ...(Array.isArray(a.kinds) && a.kinds.length ? { kinds: a.kinds } : {}), ...(a.returns !== undefined ? { returns: a.returns } : {}) });

/** Save a plugin; re-saving the same name replaces it in place (the store keys on kind + name, with a history snapshot). */
export async function saveStudioPlugin(input: { name: string; fence: string; code: string; css?: string; title?: string; description?: string; placeholder?: { placement?: string; aspect?: string; size?: string }; kinds?: StudioPluginKind[]; returns?: unknown }, opts?: { historyLabel?: string }): Promise<StudioPluginRecord> {
	const stored = (await putAsset({ kind: 'plugin', name: input.name, fence: input.fence, text: input.code, css: input.css ?? '', title: input.title ?? input.name, description: input.description ?? '', ...(input.placeholder ? { placeholder: input.placeholder } : {}), ...(input.kinds?.length ? { kinds: input.kinds } : {}), ...(input.returns !== undefined ? { returns: input.returns } : {}), addedAt: Date.now() }, opts)) as PluginAssetRecord;
	return toRecord(stored);
}

/** Every saved plugin, newest first. Returns [] when the store is unavailable. */
export async function listStudioPlugins(): Promise<StudioPluginRecord[]> {
	try {
		return ((await listAssets('plugin')) as PluginAssetRecord[]).map(toRecord);
	} catch {
		return [];
	}
}

/** Remove a saved plugin by id (no-op if the store is unavailable). Its approval stays in this browser, pinned to code that is gone. */
export async function deleteStudioPlugin(id: string): Promise<void> {
	try {
		await deleteAsset(id);
	} catch {
		/* unavailable: non-fatal */
	}
}
