// A DECK'S FENCES WHOSE PLUGIN IS OFF, for the Studio's export notice (#2758).
//
// The engine leaves a fence of a plugin the deck did not load as source (`data-lattice-off`, spec/LPM.md
// §3.2.1), so an export of such a deck ships that fence as highlighted code. This reads the same
// answer from the source: `deckPluginsOff` names the plugins left off, the registry names each one's
// fences, and the count is the fences of those names the deck holds. Generic on purpose: it names no plugin.

import fenceLanguagesCore from '../../../lib/core/fence-languages.js';
import { PLUGIN_GRAMMAR } from '../../../lib/plugins/grammar.generated.mjs';
import { deckPluginsOff } from './plugin-admission';

export type OffFences = { count: number; plugins: { name: string; title: string; fence: string; count: number }[] };

/** The fences in `source` whose plugin is off for this deck, or null when there are none. */
export function offFences(source: string): OffFences | null {
	const off = deckPluginsOff(source);
	if (!off.length) return null;
	// The fence walker the Studio already shares (`lib/core/fence-languages.js`): it tracks a fence opened inside another,
	// so a sample in a code block is not counted. Quote and list prefixes are removed first so a fence under `>` or `1.` is seen.
	const flat = String(source)
		.split('\n')
		.map((l) => l.replace(/^(?:[ \t]*>)+[ \t]?/, '').replace(/^([ \t]*)(?:[-*+]|\d{1,9}[.)])[ \t]+(?=`{3,}|~{3,})/, '$1'))
		.join('\n');
	const fences = fenceLanguagesCore.scanFences(flat) as { lang: string }[];
	const plugins: OffFences['plugins'] = [];
	for (const g of PLUGIN_GRAMMAR) {
		if (!off.includes(g.name)) continue;
		for (const fence of Object.keys(g.fences || {})) {
			const count = fences.filter((f) => f.lang === fence.toLowerCase()).length;
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
