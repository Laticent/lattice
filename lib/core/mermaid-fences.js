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
 * **A LINE WALKER, NOT A REGEX, AND THE REASON IS THE TILDES.** The obvious widening is
 * `/(```|~~~)mermaid\n([\s\S]*?)\1/`, and it was written that way first. It closes on a run
 * of EXACTLY three at column 0, and it knows nothing about what it is already inside — warts
 * that were invisible while only backticks were recognized and reachable the moment tildes
 * are. Every one below was DRIVEN on the real CLI, and two of them destroyed slides:
 *
 *   · a CommonMark-legal longer closer (`~~~mermaid` … `~~~~`) matched three of the four
 *     characters, so the export drew the diagram AND a leftover `~` beside it;
 *   · a teaching slide showing a `~~~mermaid` sample INSIDE a ```` ```markdown ```` block got
 *     its example substituted into a picture. `mermaid-check.ts` carries an outer-fence
 *     tracker for exactly this shape, added after a red-teamer hit it there;
 *   · an INDENTED CLOSER (two spaces) was not a closer, so the fence stayed open across two
 *     `---` separators and the substitution swallowed them: a three-slide deck exported as
 *     ONE page, both diagrams and a slide of prose gone;
 *   · an INDENTED OPENER — a diagram written under a bullet, which is how anyone writes one
 *     inside a list — was not a fence, so the PDF printed raw Mermaid source where the
 *     preview drew a diagram. That is this module's own bug, in the exact shape it exists to
 *     fix, and a green unit test asserted it was correct behavior.
 *
 * So this walks lines the way the parser does. The rules, and each is checked against what
 * `lib/engine` ACTUALLY emits rather than against a reading of the spec:
 *
 *   · up to three spaces of indent opens (four is an indented code block, and the engine
 *     agrees — it emits no `language-mermaid` there);
 *   · the content of an indented fence is de-indented by the opener's indent, so mmdc is
 *     handed the same definition however the author laid it out;
 *   · a run of the SAME character, at least as long, alone on its line and itself indented at
 *     most three, closes;
 *   · a ``` fence's info string may not contain a backtick, so one line of inline code cannot
 *     open a phantom fence;
 *   · a fence opened by any other info string swallows what is inside it;
 *   · and an HTML COMMENT is not markdown. A speaker note IS a comment, and a fence commented
 *     out inside one used to be substituted — putting 12KB of rendered SVG into the `.notes`
 *     sidecar where the author had a commented-out draft. Driven; the engine renders nothing
 *     there. Comment state is tracked only OUTSIDE a fence, because a `<!--` in a Mermaid
 *     definition is diagram source.
 *
 * **IT MOVES NO DECK, AND THAT IS MEASURED, NOT ARGUED.** Differential against the regex it
 * replaces over every tracked `.md` file: identical spans and bodies everywhere except three
 * DOCS — `engineering/mermaid.md`, `lib/components/diagram/diagram/diagram.docs.md` and
 * `changelog/pre-release-archive.md` — each of which documents a fence inside a
 * ```` ````markdown ```` example and should never have been substituted. None is a deck; none
 * reaches the CLI. Re-derive by running both over `git ls-files "*.md"`.
 *
 * That differential proves NO REGRESSION and nothing more, and it is worth being precise
 * about why: no deck in this repo indents a Mermaid fence or writes one with tildes, so
 * "nothing moved" was guaranteed before it ran. The hazard it cannot speak to arrives with the
 * decks written after this lands, which is what the arms in the unit test are for.
 *
 * NOR IS IT THE ONLY FENCE RECOGNIZER IN THE PRODUCT, and the differences are worth knowing
 * before quoting this module as the authority:
 *
 *   · `extractDiagrams` (`docs/src/components/studio/mermaid-check.ts`) matches this on
 *     indent and is more generous on the info string — it is a diagnostic, and a diagnostic
 *     that misses is worse than one that over-reports;
 *   · `hasMermaid` (`slide-thumb.tsx`) is a bare substring test and agrees with nothing: it is
 *     true for an unclosed fence, a ```` ```mermaidish ```` tag, and for PROSE that merely
 *     mentions a fence. That is deliberate and cheap — it decides whether to inject the
 *     3.16MB Mermaid bundle, where a false positive costs a download and a false negative
 *     costs a blank diagram — but do not read it as a second opinion about what a fence is;
 *   · `scanFences` (`lib/core/fence-languages.js`) allows arbitrary indent, because it reports
 *     LINES for grammar loading and a substitution needs character offsets.
 *
 * WHAT IT STILL IS NOT: a CommonMark parser. It does not measure indentation from a list
 * marker, so a fence nested deeper than three spaces inside a list is not seen — a MISS, so
 * the author sees their source rather than a wrong picture, which is the safe direction.
 * Reconciling the walkers is a real change to what the CLI renders and belongs in its own diff.
 */

/**
 * Is this info string ours? THE ENGINE'S RULE, not a guess at it: markdown-it takes the first
 * whitespace-delimited token and stops at the first character that cannot be in a language
 * name, so ```` ```mermaid js ````, ```` ```mermaid{.x} ```` and a trailing tab all render
 * `class="language-mermaid"` while ```` ```mermaidish ```` does not. Driven against
 * `lib/engine`'s own render — an earlier version of this module required the trimmed info to
 * EQUAL `mermaid`, and a conformance test caught the divergence within a minute of existing:
 * the preview drew a diagram for `mermaid js` and the PDF printed the source.
 */
function isMermaidInfo(info) {
	const first = String(info).trim().split(/\s/)[0] || '';
	return /^mermaid(?![\w-])/.test(first);
}

/** Drop up to `n` leading spaces/tabs — CommonMark's content-indent rule for a fence. */
function stripIndent(line, n) {
	let i = 0;
	while (i < n && (line[i] === ' ' || line[i] === '\t')) i++;
	return line.slice(i);
}

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
	let body = [];
	// HTML-COMMENT STATE. A fence inside `<!-- … -->` is not a fence — markdown never parses
	// it, the engine emits no `language-mermaid` for it, and a speaker NOTE is written as
	// exactly such a comment. Substituting there put 12KB of rendered SVG into the notes
	// sidecar where the author had commented a draft diagram out (driven on the real CLI).
	// Tracked only OUTSIDE a fence: a `<!--` in a Mermaid definition is diagram source.
	let inComment = false;
	for (const line of src.split('\n')) {
		const lineEnd = offset + line.length;
		if (!open) {
			// Does the line START inside a comment? A fence opener sits at the head of its line
			// (up to three spaces), so anything opening a comment later on the same line cannot
			// reach it — this one flag is the whole question.
			const startsInComment = inComment;
			for (let k = 0; k < line.length; ) {
				if (!inComment) {
					const o = line.indexOf('<!--', k);
					if (o === -1) break;
					inComment = true;
					k = o + 4;
				} else {
					const c = line.indexOf('-->', k);
					if (c === -1) break;
					inComment = false;
					k = c + 3;
				}
			}
			if (startsInComment) {
				offset = lineEnd + 1;
				continue;
			}
			const m = /^([ \t]{0,3})(`{3,}|~{3,})(.*)$/.exec(line);
			// A ``` fence's info string may not itself contain a backtick (CommonMark), so a
			// lone line of inline code cannot open a phantom fence. Same rule `scanFences` uses.
			if (m && !(m[2][0] === '`' && m[3].includes('`'))) {
				open = { char: m[2][0], len: m[2].length, marker: m[2], indent: m[1].length, info: m[3].trim(), start: offset - m[1].length };
				body = [];
			}
		} else {
			const c = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
			if (c && c[1][0] === open.char && c[1].length >= open.len) {
				if (isMermaidInfo(open.info)) {
					out.push({ start: open.start, end: lineEnd, body: body.length ? body.join('\n') + '\n' : '', marker: open.marker });
				}
				open = null;
			} else {
				// CommonMark strips up to the OPENER's indent from each content line, so an
				// indented fence hands mmdc the same definition a column-0 one would.
				body.push(stripIndent(line, open.indent));
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
