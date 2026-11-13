// The inline kinds an installed plugin declares, as Compose reads them. A module of its own with type-only imports, so the
// Studio shell can build the list without loading the editor (docs/route-budget.json holds its first load to its bytes).

import type { SlotSpec } from './inline-objects';

/**
 * An inline kind an installed plugin declares: its name and, when it declares them, its fields as a slot spec
 * (`contributes.inline.<kind>.slot`). A kind with no slot reads its own record, so Compose edits that record as one line
 * of text (2026-10-14-plugin-inline-door.md §4.5).
 */
export interface PluginKindEntry {
	readonly plugin: string;
	readonly name: string;
	readonly title?: string;
	readonly slot?: SlotSpec;
}

/** The entries a Studio plugin list holds: every inline kind, with its slot when it declares one. */
export function pluginKindEntries(plugins: readonly { name: string; kinds?: readonly { name: string; title?: string; slot?: unknown }[] }[]): PluginKindEntry[] {
	const out: PluginKindEntry[] = [];
	for (const p of plugins)
		for (const k of p.kinds ?? []) out.push({ plugin: p.name, name: k.name, ...(k.title ? { title: k.title } : {}), ...(k.slot && typeof k.slot === 'object' ? { slot: k.slot as SlotSpec } : {}) });
	return out;
}
