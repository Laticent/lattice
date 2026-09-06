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
 * **IT MOVES NO SHIPPED DECK, AND THAT IS MEASURED, NOT ARGUED.** Differential against the
 * regex it replaces over every tracked `.md` file: identical spans and bodies everywhere
 * except FOUR files. Three are DOCS — `engineering/mermaid.md`,
 * `lib/components/diagram/diagram/diagram.docs.md` and `changelog/pre-release-archive.md` —
 * each documenting a fence inside a ```` ````markdown ```` example that should never have been
 * substituted, and none of which reaches the CLI. The fourth is `examples/mermaid-tilde-fences.md`,
 * the demo deck THIS change adds, whose tilde and indented fences are the whole point.
 * Re-derive by running both over `git ls-files "*.md"`.
 *
 * That differential proves NO REGRESSION and nothing more, and it is worth being precise about
 * why: apart from that demo deck, nothing in this repo indents a Mermaid fence or writes one
 * with tildes, so "nothing moved" was guaranteed before it ran. The hazard it cannot speak to
 * arrives with the decks written after this lands, which is what the unit arms are for.
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

/**
 * Drop up to `n` leading SPACES — CommonMark's content-indent rule for a fence.
 *
 * Spaces only, and a tab is deliberately not one: CommonMark counts a tab as four columns, so
 * a tab-indented line is an indented code block rather than a fence, and treating it as one
 * unit of indent both over-matched the opener and CORRUPTED the body. Measured: a definition
 * whose Mermaid front matter is tab-indented had that indentation deleted, so mmdc was handed
 * a different definition than the preview parsed.
 */
function stripIndent(line, n) {
	let i = 0;
	while (i < n && line[i] === ' ') i++;
	return line.slice(i);
}

/**
 * Would substituting this fence destroy a slide boundary?
 *
 * `preprocessMermaid` splices over character ranges BEFORE slides are split, so a span that
 * reaches across a slide break deletes it. Measured on the real CLI more than once: a
 * three-slide deck exported as ONE page with a slide of prose gone, and a substituted block
 * torn in half across a boundary. Both came from a fence the walker thought was still open —
 * an indented closer it did not recognize, or a fence left open inside a list item, which is a
 * block context this walker deliberately does not model.
 *
 * Rather than try to be right about those, refuse: a body containing a slide break is not
 * substituted at all. The author sees their source, which is recoverable; a destroyed slide is
 * not.
 *
 * **EVERY THEMATIC BREAK, not just `---`.** The engine splits on markdown-it's `hr` TOKEN
 * (`splitOnHr`, lib/engine/slides.js), and CommonMark makes `***`, `___`, `- - -`, `* * *` and
 * an indented `---` all thematic breaks — driven through the real render, every one of them
 * produces two sections. A first version of this guard tested `/^---\s*$/` and closed one
 * spelling out of five, so the deck in this module's own unit test still lost a slide with the
 * separator changed by one character. Nothing tracked in this repo writes `***`; the exposure
 * is the decks authors write, which is exactly the population this module exists for.
 *
 * THE ONE EXCEPTION IS MERMAID'S OWN FRONT MATTER — a `---` block at the very start of the
 * definition (`---\nconfig:\n  theme: base\n---`). Legitimate, common, and inside a fence the
 * engine never splits on. Allowed there and only there; `***` is never front matter.
 *
 * @param {string[]} lines the fence's body lines, already de-indented
 * @returns {boolean}
 */
function bodyCrossesSeparator(lines) {
	// CommonMark thematic break: three or more of `-`, `_` or `*`, spaces allowed between,
	// up to three columns of leading indent. The de-indent above can leave a deeper-indented
	// break with spaces in front, so the indent tolerance is not optional here.
	const isBreak = (l) => /^ {0,3}(?:(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})$/.test(l);
	const isFrontMatter = (l) => /^ {0,3}-{3,}[ \t]*$/.test(l);
	let from = 0;
	if (lines.length && isFrontMatter(lines[0])) {
		const close = lines.findIndex((l, i) => i > 0 && isFrontMatter(l));
		if (close !== -1) from = close + 1;
	}
	return lines.slice(from).some(isBreak);
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
			// Does the line START inside a comment? A fence opener sits at the head of its line,
			// so this one flag is the whole question.
			const startsInComment = inComment;
			if (!inComment) {
				// A comment OPENS only at the head of a line (up to three spaces) — CommonMark's
				// HTML block type 2, and what the engine actually does. An earlier version scanned
				// anywhere on the line with inline-code runs stripped, on the stated reasoning that
				// "a bare `<!--` in prose really does open a comment". Driven through the real
				// render, it does not: a mid-line `<!--` is ordinary text, and treating it as an
				// opener silently switched off every diagram in the rest of the deck.
				if (/^ {0,3}<!--/.test(line) && !line.includes('-->')) inComment = true;
			} else if (line.includes('-->')) {
				// …and it closes on the line carrying `-->`, wherever on that line it sits.
				inComment = false;
			}
			if (!startsInComment) {
				const m = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
				// A ``` fence's info string may not itself contain a backtick (CommonMark), so a
				// lone line of inline code cannot open a phantom fence. Same rule `scanFences` uses.
				if (m && !(m[2][0] === '`' && m[3].includes('`'))) {
					// `offset` is ALREADY the first character of the line, indent included.
					// Subtracting the indent again started the span N characters EARLY, and the
					// splice then ate that much of the author's prose — "42 million." exported
					// as "42 millio". Driven on the real CLI, and at the head of a file it went
					// negative and duplicated the whole document.
					open = { char: m[2][0], len: m[2].length, marker: m[2], indent: m[1].length, info: m[3].trim(), start: offset };
					body = [];
				}
			}
		} else {
			const c = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
			if (c && c[1][0] === open.char && c[1].length >= open.len) {
				// NEVER ACROSS A SLIDE BOUNDARY — see `bodyCrossesSeparator`.
				if (!bodyCrossesSeparator(body) && isMermaidInfo(open.info)) {
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
