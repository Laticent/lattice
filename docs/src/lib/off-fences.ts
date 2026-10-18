// A DECK'S FENCES WHOSE PLUGIN IS OFF, for the Studio's export notice (#2758).
//
// The engine leaves a fence of a plugin the deck did not load as source (`data-lattice-off`, spec/LPM.md
// §3.2.1), so an export of such a deck ships that fence as highlighted code. This reads the same
// answer from the source: `deckPluginsOff` names the plugins left off, the registry names each one's
// fences, and the count is the fences of those names the deck holds. Generic on purpose: it names no plugin.

import { PLUGIN_GRAMMAR } from '../../../lib/plugins/grammar.generated.mjs';
import { deckPluginsOff } from './plugin-admission';

export type OffFences = { count: number; plugins: { name: string; title: string; fence: string; count: number }[] };

/** The fences in `source` whose plugin is off for this deck, or null when there are none. */
export function offFences(source: string): OffFences | null {
	const off = deckPluginsOff(source);
	if (!off.length) return null;
	const plugins: OffFences['plugins'] = [];
	for (const g of PLUGIN_GRAMMAR) {
		if (!off.includes(g.name)) continue;
		for (const fence of Object.keys(g.fences || {})) {
			// A fence opens a line (up to three spaces in, or any depth inside a quote or a list) with 3+ backticks or tildes.
			const re = new RegExp(`^[ \\t>]*(?:[-*+]\\s+)?(?:\`{3,}|~{3,})\\s*${fence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'gim');
			const count = (source.match(re) || []).length;
			if (count) plugins.push({ name: g.name, title: g.title, fence, count });
		}
	}
	const count = plugins.reduce((n, p) => n + p.count, 0);
	return count ? { count, plugins } : null;
}

/** One plain sentence: "4 mermaid fences will ship as source: the Mermaid diagrams plugin is off for this deck". */
export function offFencesSentence(o: OffFences, tense: 'will ship' | 'shipped' = 'will ship'): string {
	return o.plugins.map((p) => `${p.count} ${p.fence} ${p.count === 1 ? 'fence' : 'fences'} ${tense} as source: the ${p.title} plugin is off for this deck`).join('; ');
}
