/**
 * mermaid-fences — the ONE pattern that says "this is a Mermaid fence".
 *
 * Pure and fs-free, so both paths can require it (HARD RULE #1). Two callers, and they
 * have to agree or the deck renders one thing and says another:
 *
 *   · `preprocessMermaid` (lattice-emulator.js) — substitutes each fence with the SVG
 *     mmdc rendered for it, at build time, before slide splitting.
 *   · `narrateDiagram` (lib/core/chart-narration.js) — reads the SAME fence to speak the
 *     diagram. Its docblock states the invariant outright: "the same match
 *     `preprocessMermaid` renders, so narrator ⇔ render".
 *
 * Both used to carry their own copy of ```` /```mermaid\n([\s\S]*?)```/ ````, which is why
 * this module exists rather than a third copy.
 *
 * **BOTH FENCE CHARACTERS.** CommonMark fences with backticks OR tildes, markdown-it emits
 * `class="language-mermaid"` for either, and the live-preview path has always rendered both
 * (the runtime keys on the emitted class; `hasMermaid` and the Studio's `mermaid-check`
 * accept both). Only these two regexes did not — so a `~~~mermaid` fence rendered in the
 * preview the author was looking at and reached the exported PDF as raw source. Found while
 * fixing something else and logged as §7 of
 * `engineering/decisions/2026-09-05-diagram-fence-flash.md`; this closes it.
 *
 * THE PATTERN IS DELIBERATELY NO LOOSER THAN THE ONE IT REPLACES. Exactly three markers,
 * the info string immediately followed by a newline, and a close on a run of the SAME
 * character — which for a backtick fence is byte-for-byte the old behavior, so widening to
 * tildes is the only change in what gets substituted. It is not a CommonMark parser and does
 * not try to be: `scanFences` (lib/core/fence-languages.js) is that, and it reports lines
 * rather than the character offsets a substitution needs. Reconciling the two is a real
 * change to what the CLI renders (indented fences, longer runs, unclosed fences) and belongs
 * in its own diff, not smuggled into this one.
 */

/**
 * A fresh global matcher for Mermaid fences. Returns a NEW RegExp each call because a `/g`
 * regex carries `lastIndex`, and a module-level constant shared between two callers that
 * both `matchAll` it is a bug waiting for the first interleaved use.
 *
 * Capture groups: `1` the fence marker (` ``` ` or `~~~`), `2` the fence body.
 *
 * @returns {RegExp}
 */
function mermaidFenceRe() {
	return /(```|~~~)mermaid\n([\s\S]*?)\1/g;
}

/**
 * Every Mermaid fence in `source`, in document order.
 *
 * @param {string} source markdown
 * @returns {Array<{ start: number, end: number, body: string, marker: string }>}
 */
function matchMermaidFences(source) {
	const out = [];
	for (const m of String(source || '').matchAll(mermaidFenceRe())) {
		out.push({ start: m.index, end: m.index + m[0].length, body: m[2], marker: m[1] });
	}
	return out;
}

/**
 * The FIRST Mermaid fence's body, or null. What the narrator wants: one slide, one diagram.
 *
 * @param {string} source markdown
 * @returns {string|null}
 */
function firstMermaidFenceBody(source) {
	const m = mermaidFenceRe().exec(String(source || ''));
	return m ? m[2] : null;
}

module.exports = { mermaidFenceRe, matchMermaidFences, firstMermaidFenceBody };
