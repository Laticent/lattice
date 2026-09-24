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
 *   · otherwise the page after the cover whose text contains it (a row). When SEVERAL body
 *     pages carry it, it is repeated trailing material (a claimed insight is repeated in each
 *     page's markup and shown only on the last, #2321), so the LAST of them;
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

/** A page's visible text, normalized the same way (tags dropped, entities for the common few). */
export function pageText(html: string): string {
	return String(html || '')
		.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&rsquo;|&lsquo;/g, "'")
		.replace(/&[a-z]+;|&#\d+;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
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
	const texts = pages.map(pageText);
	const hits = texts.map((t) => t.includes(probe));
	if (hits.every(Boolean)) return 0; // masthead material: the cover introduces the run
	const body = hits.map((h, k) => (k > 0 && h ? k : -1)).filter((k) => k > 0);
	if (body.length) return body.length > 1 ? body[body.length - 1] : body[0];
	return hits[0] ? 0 : keep;
}
