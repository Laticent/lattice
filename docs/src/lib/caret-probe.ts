/**
 * The caret line, normalized to text a rendered page can be searched for — its own module so a
 * caller in the Studio's EAGER chunk (studio/pane-pages.ts, the split-panes page pick) can use it
 * without pulling split-page-pick.ts in with it: that module is loaded on the first split slide,
 * not with the route, because the Studio's eager bundle is budgeted (docs/route-budget.json).
 */

const PROBE_CHARS = 48;

/** Normalize to comparable text: lower-case, collapsed whitespace, no markdown syntax. */
export function caretProbe(line: string): string {
	return String(line || '')
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX-]\]\s+)?/, '') // list marker (+ task box)
		.replace(/^\s*>+\s?/, '') // blockquote
		.replace(/^\s*#{1,6}\s+/, '') // heading
		.replace(/\*\*|__|`|~~/g, '') // emphasis / code / strike
		.replace(/(^|\s)[*_](?=\S)|(?<=\S)[*_](?=\s|$)/g, '$1') // single-char emphasis
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links and images → their text
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase()
		.slice(0, PROBE_CHARS);
}

