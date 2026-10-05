// What each component needs to find in a pane's body to render it: its REQUIRED grammar slots, less
// the heading (a pane's title is its `###`, never the slide's `##`), plus, for a chart, a number.
// Built once at site build from `dist/docs/grammar.json` and `components.json` (studio.astro), the
// same generated grammar every other Compose map reads (HARD RULE #1). Compose uses it to tell the
// author, before they choose, whether a component KEEPS a pane's text or starts it with an example
// (pane-model.ts `paneFit`; engineering/decisions/2026-09-28-generic-pane-layouts-authoring.md §7.2).
//
// It is a structural test, and says so: a slot selector matched means the component can read the
// pane's blocks. The one thing a selector cannot say is that a chart needs values, which is why a
// `series` component also needs a number in its items or cells.

export type PaneNeed = { slots: string[]; numbers: boolean };
export type PaneNeeds = Record<string, PaneNeed>;

type GrammarSlot = { selector?: string; required?: boolean };
type GrammarComponent = { name?: string; slots?: Record<string, GrammarSlot> };

/** A selector that names only the slide's heading (`h2`, `h1, h2`), or something read off it
 *  (`h2 + p`): a pane has none of these, so they are not the body's to satisfy. */
const HEADING_ONLY = /^h[1-6](?:\s*,\s*h[1-6])*$/;
const OFF_HEADING = /\bh[1-6]\s*[+~]/;

export function paneNeedsFrom(components: GrammarComponent[], substanceOf: Record<string, string>): PaneNeeds {
	const out: PaneNeeds = {};
	for (const c of components) {
		if (!c.name) continue;
		const slots = Object.values(c.slots || {})
			.filter((s) => s?.required && s.selector)
			.map((s) => String(s.selector).trim())
			.filter((sel) => !HEADING_ONLY.test(sel) && !OFF_HEADING.test(sel));
		out[c.name] = { slots, numbers: substanceOf[c.name] === 'series' };
	}
	return out;
}
