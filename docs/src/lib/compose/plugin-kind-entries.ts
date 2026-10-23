// The inline kinds an installed plugin declares, as Compose reads them. A module of its own with type-only imports, so the
// Studio shell can build the list without loading the editor (docs/route-budget.json holds its first load to its bytes).

import type { SlotSpec } from './inline-objects';

/** An inline kind an installed plugin declares: its name and its fields as a slot spec (`contributes.inline.<kind>.slot`). */
export interface PluginKindEntry {
	readonly plugin: string;
	readonly name: string;
	readonly title?: string;
	readonly slot: SlotSpec;
}

/** The entries a Studio plugin list holds: each kind that declares its fields as a slot. A kind with no slot reads its own record, so the host has nothing to draw one from. */
export function pluginKindEntries(plugins: readonly { name: string; kinds?: readonly { name: string; title?: string; slot?: unknown }[] }[]): PluginKindEntry[] {
	const out: PluginKindEntry[] = [];
	for (const p of plugins)
		for (const k of p.kinds ?? []) if (k.slot && typeof k.slot === 'object') out.push({ plugin: p.name, name: k.name, ...(k.title ? { title: k.title } : {}), slot: k.slot as SlotSpec });
	return out;
}
