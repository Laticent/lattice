/**
 * Which page of a split run the Studio preview shows: the one the caret is on.
 *
 * At portrait/square a slide with several rows splits into a run — cover, one page per row,
 * closing (lib/core/structural-split.js). The Studio preview frame holds ONE page (#1551), so it
 * shows the page holding the line being edited (the owner's pick, "follow the caret").
 *
 * The rule reads TEXT, not structure, so it needs no per-component or per-editor knowledge:
 *   · a caret line whose text is on EVERY page is masthead material (the heading, the eyebrow),
 *     and that belongs to the COVER;
 *   · otherwise the body page that OWNS it: a page where a block starts with that text beats a
 *     page that only mentions it mid-sentence, so a card titled "Returns" goes to its own page
 *     and not to a later row that talks about returns. A tie at the top means the block is
 *     repeated on several pages (a claimed insight rides every page's markup and shows only on
 *     the last, #2321), so the LAST of them. Split chrome (the forward pill naming the next row,
 *     the rail, the footer) is removed first, or every title would also match the page before;
 *   · nothing matches (a blank line, a directive, a word too short to place) → keep the page
 *     already shown, so crossing an empty line between two bullets does not flash the cover.
 *
 * Markdown syntax is stripped from the caret line first, because the CodeMirror editor reports
 * `- **Returns.** Processing…` while the page's text is `Returns. Processing…`; the ProseMirror
 * editor already reports the plain text.
 */

const MIN_CHARS = 3;
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

// Split CHROME is not the page's content: the forward pill names the NEXT row, the rail and the
// footer repeat on every page. Left in, a row's title matched its own page AND the page before it.
// `\sclass=` with the leading space, so `data-class` is never read as the class list (#1358).
const CHROME = /<(div|span|nav)\b[^>]*\sclass="[^"]*\b(?:lat-split-rel|lat-split-rail|cell-footer|marker-rail|fixme-tab|overflow-tab|illegible-tab)\b[^"]*"[^>]*>[\s\S]*?<\/\1>/gi;
// Block boundaries become line breaks, so a row's text starts a line of its own.
const BLOCK = /<\/?(?:p|li|h[1-6]|blockquote|td|th|dt|dd|figcaption|div|section|ul|ol|tr)\b[^>]*>/gi;

/** A page's visible text, one line per block, lower-cased; split chrome removed. */
export function pageLines(html: string): string[] {
	return String(html || '')
		.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
		.replace(CHROME, ' ')
		.replace(BLOCK, '\n')
		.replace(/<[^>]*>/g, '')
		// Any `<` or `>` left is a fragment of a tag the strip above could not close. The result is
		// only ever COMPARED, never rendered, but it must not read as markup to anything downstream.
		.replace(/[<>]/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&rsquo;|&lsquo;/g, "'")
		.replace(/&(?!amp;)[a-z]+;|&#\d+;/g, ' ')
		// `&amp;` LAST, so `&amp;lt;` decodes once, to the text `&lt;`, and never on to `<`.
		.replace(/&amp;/g, '&')
		.split('\n')
		.map((l) => l.replace(/\s+/g, ' ').trim().toLowerCase())
		.filter(Boolean);
}

/** How well a page holds the probe: 2 = a line STARTS with it (it is that block's own text),
 *  1 = it appears mid-line (a word in someone else's sentence), 0 = absent. */
function score(lines: readonly string[], probe: string): number {
	let best = 0;
	for (const l of lines) {
		if (l.startsWith(probe)) return 2;
		if (best === 0 && l.includes(probe)) best = 1;
	}
	return best;
}

/**
 * @param pages   the run's pages as HTML strings, cover first
 * @param caret   the caret line's text, as the editor reports it
 * @param current the page shown now (kept when the caret line places nowhere)
 * @returns the 0-based page to show
 */
export function pickSplitPage(pages: readonly string[], caret: string | undefined, current = 0): number {
	const n = pages.length;
	const keep = Math.max(0, Math.min(current, n - 1));
	if (n <= 1) return 0;
	const probe = caretProbe(caret ?? '');
	if (probe.length < MIN_CHARS) return keep;
	const scores = pages.map((p) => score(pageLines(p), probe));
	if (scores.every((sc) => sc > 0)) return 0; // on every page: masthead material, the cover introduces the run
	const top = Math.max(...scores.slice(1));
	if (top === 0) return scores[0] > 0 ? 0 : keep;
	const best = scores.map((sc, k) => (k > 0 && sc === top ? k : -1)).filter((k) => k > 0);
	// One page owns the line → that page. A TIE at the top means the same block is repeated on
	// several pages (a claimed insight rides every page's markup and shows only on the last, #2321),
	// so the last of them.
	return best.length > 1 ? best[best.length - 1] : best[0];
}
