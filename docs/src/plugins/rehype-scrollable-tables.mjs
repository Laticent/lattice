/**
 * Make every Markdown table keyboard-scrollable.
 *
 * WHY. Starlight lets a wide Markdown table scroll horizontally rather than
 * squeeze it, which is the right call for a spec page full of them. But a
 * scroll container that nothing can focus is reachable only by pointer: on a
 * phone the columns past the right edge are unreachable by keyboard at all,
 * which is WCAG 2.1.1 (Keyboard). It is invisible at desktop width — the table
 * fits, so it does not scroll, so nothing scores — which is exactly why the
 * site axe gate runs at 390px as well as 1440px. Found on `/guides/authoring/`,
 * `/model/concepts/` and `/spec/lfm/`, mobile only.
 *
 * WHAT IT DOES, AND WHAT IT DELIBERATELY DOES NOT. It adds `tabindex="0"` and
 * nothing else. It does NOT add `role="region"`: a landmark per table would put
 * three unnamed regions on a spec page (axe `landmark-unique`), and naming them
 * all the same is worse. It does NOT add `role="group"` either — a role on a
 * `<table>` REPLACES the table role, and trading real table semantics (row and
 * column announcement, header association) for a scroll affordance is a much
 * bigger loss than the one it fixes.
 *
 * No unist-util-visit dependency: the walk is four lines and the tree is small.
 */

function walk(node, fn) {
	fn(node);
	for (const child of node.children ?? []) walk(child, fn);
}

export default function rehypeScrollableTables() {
	return (tree) => {
		walk(tree, (node) => {
			if (node.type === 'element' && node.tagName === 'table') {
				node.properties = { ...(node.properties ?? {}), tabIndex: 0 };
			}
		});
	};
}
