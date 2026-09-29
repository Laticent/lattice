// WHAT A PREVIEW'S STYLESHEET DEPENDS ON, IN A PANE.
//
// The engine composes a pane twin of each rule that reaches a pane into the sheet it returns
// (lib/core/pane-css.js), and only for the classes actually on a pane (lib/engine/index.js
// `paneCss.paneClasses`), so two renders with different panes have different sheets. Both live
// previews patch a slide in place under a signature and keep the resident sheet while it holds:
// the Playground's filmstrip (deck-render.js) and the Studio's single-slide frame
// (lib/single-slide-render.ts). Each puts this in its signature, so a deck that gains a pane,
// or changes what a pane holds or how, gets the new sheet — a list typed into a pane rendered as
// bare lines, and a chart at the wrong scale, until a reload.

/** Every class on every `<lat-pane>` in `sections` — the same set the engine builds its pane
 *  rules from (lib/engine/index.js `paneCss.paneClasses`: a component AND its modifiers, since
 *  `section.list.takeaway …` reaches a pane only when `takeaway` is on one) — sorted, as one
 *  string, or ''. */
export function paneComponentsSig(sections) {
	const names = new Set();
	for (const sec of sections) {
		if (sec.indexOf('<lat-pane') === -1) continue;
		for (const m of sec.matchAll(/<lat-pane\b[^>]*\sclass="([^"]*)"/g)) {
			for (const c of m[1].trim().split(/\s+/)) if (c) names.add(c);
		}
	}
	return [...names].sort().join(',');
}
