// CodeMirror autocomplete source for the `map` component's region grammar.
//
// The spelling-variance problem world maps live with (Côte d'Ivoire, Myanmar,
// Czechia) is a STATIC-VOCABULARY problem, not a generative one — so it's
// solved client-side from the baked basemaps, with ZERO model calls. As the
// author types a list item inside a `map` slide, this offers the country/state
// names and the group names (continents + dated blocs + Global South cuts) the
// basemap resolves, so the right spelling is one keypress away instead of a
// render-time miss (or an LLM round-trip to guess what they meant).
//
// Companion to the deterministic "did you mean" lint rule in
// lib/authoring/lint-core.js (findUnknownMapRegions): autocomplete prevents the
// typo at the keystroke, the lint catches one that slips through — both off the
// same baked vocabulary, neither costing a token.
//
// Slide detection + basemap selection are delegated to slide-context.js (the
// one shared context walker) so this can't drift from the component grammar the
// way the previous hand-rolled walker did — it defaulted to `us` and so hid
// every world country + group (Global South, blocs, continents) behind a
// redundant `world` token that map.docs.md tells authors to omit.

import usBasemap from '../../../lib/plugins/chart-family/kinds/map/map.basemap.json';
import worldBasemap from '../../../lib/plugins/chart-family/kinds/map/map.basemap.world.json';
import { mapBasemapFor } from './slide-context.js';

// Build the completion option list for one basemap: every region name + every
// group label, de-duplicated, with a `detail` chip naming what it is.
function optionsFor(basemap, kindLabel) {
	const seen = new Set();
	const options = [];
	for (const r of Object.values(basemap.regions || {})) {
		if (seen.has(r.name)) continue;
		seen.add(r.name);
		options.push({ label: r.name, type: 'constant', detail: kindLabel });
	}
	for (const g of Object.values(basemap.groups || {})) {
		if (seen.has(g.label)) continue;
		seen.add(g.label);
		options.push({ label: g.label, type: 'keyword', detail: g.kind });
	}
	return options;
}

const OPTIONS = {
	us: optionsFor(usBasemap, 'state'),
	world: optionsFor(worldBasemap, 'country'),
};

// Body-data completer for map slides — active only on a list-item NAME position
// (after `- `, before the trailing inline-code value). Registered in
// data-sources.js, which supplies the resolved slide `info` and `line` through
// the shared makeDataSource gate, so this no longer walks for the directive
// itself. The basemap is the world by default; `map us` / `map usa` switches to
// US states (mapBasemapFor).
export function mapBodyCompletion(context, info, line) {
	const which = mapBasemapFor(info);
	if (!which) return null;

	const beforeCursor = context.state.sliceDoc(line.from, context.pos);
	// `- ` / `* ` bullet, then the name being typed — no backtick yet (the value
	// pill ends the name). The capture group's start is where we replace from.
	const m = beforeCursor.match(/^(\s*[-*]\s+)([^`]*)$/);
	if (!m) return null;
	const from = line.from + m[1].length;
	const typed = m[2];
	// Don't pop the menu on a bare bullet until there's a keystroke, unless
	// explicitly invoked (Ctrl-Space), to stay out of the way.
	if (!typed.trim() && !context.explicit) return null;

	return {
		from,
		options: OPTIONS[which],
		validFor: /^[\p{L} .,'’()-]*$/u,
	};
}
