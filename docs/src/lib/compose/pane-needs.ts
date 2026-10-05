// What each component needs to find in a pane's body to render it: its REQUIRED grammar slots, less
// the heading (a pane's title is its `###`, never the slide's `##`), plus, for a chart, a number.
// Built in the browser from the Studio's component catalog (`studio/component-catalog.json`, the
// rows `lib/studio-catalog.mjs` builds from `dist/docs/components.json`), which carries each slot's
// selector and each skeleton: the same generated grammar every other Compose map reads (HARD RULE
// #1), fetched after the page rather than inlined into it, since only the pane gallery reads it.
// Compose uses it to tell the author, before they choose, whether a component KEEPS a pane's text or starts it with an example
// (pane-model.ts `paneFit`; engineering/decisions/2026-09-28-generic-pane-layouts-authoring.md §7.2).
//
// Shape alone over-promises. `contact` and `actors` require only `ul > li`, so a plain "- A point"
// matched them and "kept" as a contact card. So a need also carries the MARKS the component's own
// example puts on every item (`marks`): a trailing label (`- Ann `name``), a leading figure
// (big-number's `- 92%`), a picture, an arrow. A
// pane keeps its text only when it uses at least one of them, which is what says the list was
// written for that component rather than merely shaped like its input. A chart's need for a
// number is the same idea, older and stricter (`numbers`). Ruling: the 2026-09-28 note §7.2.

/** A mark an item can carry that tells a component what the item MEANS, beyond being an item. */
export type PaneMark = 'label' | 'figure' | 'picture' | 'arrow';
export type PaneNeed = { slots: string[]; numbers: boolean; marks: PaneMark[] };
export type PaneNeeds = Record<string, PaneNeed>;

type GrammarSlot = { selector?: string; required?: boolean };
/** A grammar.json component, or a Studio catalog row: slots keyed by name, or listed. */
type GrammarComponent = { name?: string; slots?: Record<string, GrammarSlot> | GrammarSlot[]; skeleton?: string; substance?: string };
export type PaneCatalogRow = GrammarComponent;

/** A selector that names only the slide's heading (`h2`, `h1, h2`), or something read off it
 *  (`h2 + p`): a pane has none of these, so they are not the body's to satisfy. */
const HEADING_ONLY = /^h[1-6](?:\s*,\s*h[1-6])*$/;
const OFF_HEADING = /\bh[1-6]\s*[+~]/;

export function paneNeedsFrom(components: GrammarComponent[], substanceOf: Record<string, string> = {}): PaneNeeds {
	const out: PaneNeeds = {};
	for (const c of components) {
		if (!c.name) continue;
		const slots = Object.values(c.slots || {})
			.filter((s) => s?.required && s.selector)
			.map((s) => String(s.selector).trim())
			.filter((sel) => !HEADING_ONLY.test(sel) && !OFF_HEADING.test(sel));
		out[c.name] = { slots, numbers: (substanceOf[c.name] ?? c.substance) === 'series', marks: marksOf(c.skeleton || '') };
	}
	return out;
}

// Each mark, as Markdown on a skeleton's item (its first line, or anywhere under it).
const LABEL = /`[^`\n]+`/; // on the item's own line: a trailing pill names or values it
const FIGURE = /^[^\p{L}\p{N}\n]{0,3}\p{N}/u; // the item's own line opens on a number: `92%`, `$4.2M`
const PICTURE = /!\[[^\]\n]*\]\(/;
const ARROW = /->|=>/;

/** The marks that EVERY top-level item of a component's first list carries, in its skeleton. A mark
 *  only some items show (team-profile's portrait, logo-wall's stage pill) is optional, so it is not
 *  asked for. */
export function marksOf(skeleton: string): PaneMark[] {
	const items: { head: string; all: string }[] = [];
	let fenced = false;
	for (const line of skeleton.split('\n')) {
		if (/^\s*(`{3,}|~{3,})/.test(line)) fenced = !fenced;
		if (fenced) continue;
		const item = /^(?:[-*+]|\d+[.)]) (.*)$/.exec(line); // a bullet or a numbered item
		if (item) items.push({ head: item[1], all: line });
		else if (items.length && /^\s+\S/.test(line)) items[items.length - 1].all += `\n${line}`;
		else if (items.length && line.trim()) break; // the first list has ended
	}
	if (!items.length) return [];
	const out: PaneMark[] = [];
	if (items.every((i) => LABEL.test(i.head))) out.push('label');
	if (items.every((i) => FIGURE.test(i.head))) out.push('figure');
	if (items.every((i) => PICTURE.test(i.all))) out.push('picture');
	if (items.every((i) => ARROW.test(i.all))) out.push('arrow');
	return out;
}
