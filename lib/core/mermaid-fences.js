/**
 * mermaid-fences — the one thing in the engine that says "this is a Mermaid fence".
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
 * preview the author was looking at and reached the exported PDF as raw source.
 *
 * **A LINE SCANNER, NOT A REGEX, AND THE REASON IS THE TILDES.** The obvious widening is
 * `/(```|~~~)mermaid\n([\s\S]*?)\1/`, and it was written that way first. It closes on a run
 * of EXACTLY three, and it has no idea whether it is already inside a fence — two warts that
 * were invisible while only backticks were recognized and become reachable the moment tildes
 * are. Both were driven, on the real CLI:
 *
 *   · a CommonMark-legal longer closer (`~~~mermaid` … `~~~~`) matched three of the four
 *     characters, so the export drew the diagram AND a leftover `~` beside it;
 *   · a teaching slide that shows a `~~~mermaid` sample INSIDE a ```` ```markdown ```` block
 *     got its example substituted into a picture — the preview showed the sample, the export
 *     showed a diagram. `mermaid-check.ts` already carries an outer-fence tracker for exactly
 *     this shape, added after a red-teamer hit it.
 *
 * So this walks lines, the way a Markdown parser does: a run of three or more of one
 * character opens, a run of the SAME character AT LEAST AS LONG and alone on its line closes,
 * and a fence opened by any other info string swallows what is inside it.
 *
 * **IT MOVES NO DECK, AND THAT IS MEASURED, NOT ARGUED.** Differential against the regex it
 * replaces over all 1387 tracked `.md` files (48 carry a Mermaid fence): identical spans and
 * bodies everywhere except three DOCS — `engineering/mermaid.md`,
 * `lib/components/diagram/diagram/diagram.docs.md` and `changelog/pre-release-archive.md` —
 * each of which documents a fence inside a ```` ````markdown ```` example and should never
 * have been substituted. None is a deck; none reaches the CLI. Re-derive with a script that
 * runs both over `git ls-files "*.md"`.
 *
 * NOR IS IT THE ONLY FENCE RECOGNIZER IN THE PRODUCT, and the difference is worth knowing
 * before quoting this module as the authority. `hasMermaid` (`slide-thumb.tsx`) agrees with
 * it. `extractDiagrams` (`docs/src/components/studio/mermaid-check.ts`) is DELIBERATELY more
 * generous — it allows up to three spaces of indent and a trailing-whitespace info string,
 * because it is a diagnostic telling an author what they appear to have written, and a
 * diagnostic that misses is worse than one that over-reports. So a fence indented inside a
 * list item is flagged by the Studio and not substituted by the CLI. That gap is real,
 * pre-existing, and named here rather than papered over.
 *
 * WHAT IT STILL IS NOT: a CommonMark parser. It does not track list indentation, so a fence
 * indented inside a list item is not seen (the same blind spot the regex had, and the reason
 * `scanFences` in `lib/core/fence-languages.js` is deliberately generous where it can afford
 * to be — that one reports LINES, and a substitution needs character offsets). Reconciling
 * the two walkers is a real change to what the CLI renders and belongs in its own diff.
 */

/** An info string is ours when, trimmed, it is exactly `mermaid`. */
const MERMAID_INFO = 'mermaid';

/**
 * Every Mermaid fence in `source`, in document order.
 *
 * `start`/`end` bound the WHOLE fence, opener and closer included, so a caller can splice a
 * rendered SVG over `source.slice(start, end)`. `body` is the fence's content with its
 * trailing newline, exactly as the regex it replaces reported it.
 *
 * An unclosed fence yields nothing — markdown-it would render it to the end of the document,
 * but a substitution that swallowed the rest of the deck is the worse failure, and that is
 * also what the regex did.
 *
 * @param {string} source markdown
 * @returns {Array<{ start: number, end: number, body: string, marker: string }>}
 */
function matchMermaidFences(source) {
	const src = String(source || '');
	const out = [];
	let open = null;
	let offset = 0;
	for (const line of src.split('\n')) {
		const lineEnd = offset + line.length;
		if (!open) {
			const m = /^(`{3,}|~{3,})(.*)$/.exec(line);
			// A ``` fence's info string may not itself contain a backtick (CommonMark), so a
			// lone line of inline code cannot open a phantom fence. Same rule `scanFences` uses.
			if (m && !(m[1][0] === '`' && m[2].includes('`'))) {
				open = { char: m[1][0], len: m[1].length, marker: m[1], info: m[2].trim(), start: offset, bodyStart: lineEnd + 1 };
			}
		} else {
			const c = /^(`{3,}|~{3,})\s*$/.exec(line);
			if (c && c[1][0] === open.char && c[1].length >= open.len) {
				if (open.info === MERMAID_INFO) {
					out.push({ start: open.start, end: lineEnd, body: src.slice(open.bodyStart, offset), marker: open.marker });
				}
				open = null;
			}
		}
		offset = lineEnd + 1;
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
	const [first] = matchMermaidFences(source);
	return first ? first.body : null;
}

module.exports = { matchMermaidFences, firstMermaidFenceBody };
