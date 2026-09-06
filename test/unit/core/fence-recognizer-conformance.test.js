/**
 * Conformance: what the CLI SUBSTITUTES vs what the ENGINE RENDERS.
 *
 * This repo has several things that decide "is this a Mermaid fence", and they do not agree:
 *
 *   · `matchMermaidFences` (lib/core/mermaid-fences.js) — the CLI's substitution and the
 *     narrator. Caps indent at three, because it REPLACES source with a picture.
 *   · `createFenceReader` (lib/core/slide-speech.js) — narration's fence state. Trims, so any
 *     indent. Over-blanking under-narrates, which is the safe direction there.
 *   · `scanFences` (lib/core/fence-languages.js) — which highlight.js grammars to fetch.
 *     Deliberately generous: a false positive costs one unused 2KB file.
 *   · `extractDiagrams` (docs/src/components/studio/mermaid-check.ts) and `hasMermaid`
 *     (slide-thumb.tsx) — Studio diagnostics, generous for the same reason.
 *
 * Five answers to one question is not a design, it is an accident — and the accident has been
 * expensive. Twice now a fence rendered in the preview an author was working in and printed as
 * something else in the PDF they sent. Each recognizer's docblock claims a relationship to the
 * others, and those claims were prose until this file: one of them ("the same three rules")
 * was simply false, and nothing caught it.
 *
 * SO THE GROUND TRUTH HERE IS THE ENGINE, not a reading of CommonMark. Every row runs through
 * `lib/engine`'s real render and asks whether it emitted `language-mermaid`. Two properties
 * are asserted against that:
 *
 *   1. **The engine's own behavior is pinned.** If a markdown-it upgrade changes what counts
 *      as a fence, this file fails and names the row — rather than the CLI silently drifting
 *      away from the preview for a year.
 *   2. **THE WALKER NEVER OVER-MATCHES.** Every disagreement must be a MISS: the engine draws
 *      a diagram and the CLI prints the source. That direction is a visible, recoverable
 *      annoyance. The other direction replaces something the author wrote as literal text with
 *      a picture, and there is no budget for it — the assertion is zero, not "few".
 *
 * A new recognizer, or a change to an old one, adds its column here. That is the point: this
 * is the file that stops a sixth answer being invented in silence.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { render } = require('../../../lib/engine/index.js');
const { matchMermaidFences } = require('../../../lib/core/mermaid-fences');
const { createFenceReader } = require('../../../lib/core/slide-speech');
const { scanFences } = require('../../../lib/core/fence-languages');

const FRONT = '---\nmarp: true\ntheme: lattice\n---\n\n<!-- _class: diagram -->\n\n## A heading.\n\n';
const DEF = 'flowchart LR\n  A[Input] --> B[Process]\n';

/**
 * Would the PREVIEW draw this? The engine emits `language-<first info token>`, and the runtime
 * picks fences up with `code[class*="language-mermaid"]` — a SUBSTRING match, so
 * `language-mermaidish` matches it too. That looseness is the runtime's, it is pre-existing,
 * and it is the reason this helper mirrors the real selector rather than testing for the exact
 * class: the question a reviewer needs answered is "does the author see a diagram in the
 * preview", not "what class did markdown-it write".
 */
function previewDraws(body) {
	return /<code[^>]*class="[^"]*language-mermaid/.test(render(FRONT + body).html);
}
/** Does narration's reader consider the fence's first body line to be inside a fence? */
function readerFences(body) {
	const fence = createFenceReader();
	const kinds = body.split('\n').map((l) => fence.read(l));
	return kinds.includes('inside');
}
/** Does the grammar scanner see a `mermaid` fence? */
function scannerSees(body) {
	return scanFences(body).some((f) => f.lang === 'mermaid');
}

const indent = (text, pad) => text.replace(/^(?=.)/gm, pad);

// `walker` is what `matchMermaidFences` MUST report. Where it differs from `engine`, `why`
// says which way the disagreement runs and states that the direction is safe.
const CORPUS = [
	{ name: 'column 0, backticks', body: `\`\`\`mermaid\n${DEF}\`\`\`\n`, engine: true, walker: true },
	{ name: 'column 0, tildes', body: `~~~mermaid\n${DEF}~~~\n`, engine: true, walker: true },
	{ name: 'one space of indent', body: ` \`\`\`mermaid\n${indent(DEF, ' ')} \`\`\`\n`, engine: true, walker: true },
	{ name: 'three spaces of indent', body: `   \`\`\`mermaid\n${indent(DEF, '   ')}   \`\`\`\n`, engine: true, walker: true },
	{ name: 'four spaces — an indented code block, not a fence', body: `    \`\`\`mermaid\n${indent(DEF, '    ')}    \`\`\`\n`, engine: false, walker: false },
	{ name: 'inside a list item', body: `- item\n\n  \`\`\`mermaid\n${indent(DEF, '  ')}  \`\`\`\n`, engine: true, walker: true },
	{ name: 'closer indented, opener not', body: `\`\`\`mermaid\n${DEF}  \`\`\`\n`, engine: true, walker: true },
	{ name: 'opener indented, closer not', body: `  \`\`\`mermaid\n${indent(DEF, '  ')}\`\`\`\n`, engine: true, walker: true },
	{ name: 'closing run longer than the opener', body: `~~~mermaid\n${DEF}~~~~\n`, engine: true, walker: true },
	{ name: 'closing run shorter than the opener', body: `~~~~mermaid\n${DEF}~~~\n`, engine: true, walker: false, why: 'MISS — the engine runs the fence to end-of-document and still tags it; the walker declines to substitute an unclosed fence rather than swallow the rest of the deck. The author sees their source.' },
	{ name: 'trailing space on the info string', body: `\`\`\`mermaid  \n${DEF}\`\`\`\n`, engine: true, walker: true },
	{ name: 'a second word in the info string', body: `\`\`\`mermaid js\n${DEF}\`\`\`\n`, engine: true, walker: true },
	{ name: 'an attribute suffix on the info string', body: `\`\`\`mermaid{.x}\n${DEF}\`\`\`\n`, engine: true, walker: true },
	{ name: 'a hyphenated tag that is not ours', body: `\`\`\`mermaid-x\n${DEF}\`\`\`\n`, engine: true, walker: false, why: "MISS — the class is `language-mermaid-x`, which the runtime's substring selector picks up but which is plainly a DIFFERENT language. The CLI declines rather than substitute a picture over a block the author tagged as something else. The runtime's looseness here is pre-existing and not ours to widen into an export." },
	{ name: 'a tag that merely starts with mermaid', body: `\`\`\`mermaidish\n${DEF}\`\`\`\n`, engine: true, walker: false, why: 'MISS — same shape: `language-mermaidish` contains `language-mermaid`, so the runtime draws it. Substituting would be an over-match on a tag that is not ours.' },
	{ name: 'untagged fence', body: `\`\`\`\n${DEF}\`\`\`\n`, engine: false, walker: false },
	{ name: 'a sample shown inside a ````markdown block', body: `\`\`\`\`markdown\n~~~mermaid\n${DEF}~~~\n\`\`\`\`\n`, engine: false, walker: false },
	{ name: 'commented out in an HTML comment', body: `<!--\ndraft:\n~~~mermaid\n${DEF}~~~\n-->\n`, engine: false, walker: false },
	{ name: 'a directive comment above a real fence', body: `<!-- _footer: "x" -->\n\n\`\`\`mermaid\n${DEF}\`\`\`\n`, engine: true, walker: true },
	{ name: 'unclosed at end of document', body: `\`\`\`mermaid\n${DEF}`, engine: true, walker: false, why: 'MISS — markdown-it runs an unclosed fence to the end of the document. Substituting there would swallow every slide after it, which is a worse failure than showing the source.' },
	{ name: 'blockquoted', body: `> \`\`\`mermaid\n> ${DEF.replace(/\n(?=.)/g, '\n> ')}> \`\`\`\n`, engine: true, walker: false, why: 'MISS — the walker does not strip block-quote markers, so it does not see the fence. The author sees their source; substituting a `>`-prefixed definition would hand mmdc a broken one.' },
	{ name: 'a fence character inside the definition', body: `\`\`\`mermaid\nflowchart LR\n  A["~~~"] --> B\n\`\`\`\n`, engine: true, walker: true },
];

describe('fence recognizers — conformance against the engine', () => {
	test('the ENGINE behaves as this corpus records', () => {
		for (const row of CORPUS) {
			assert.equal(
				previewDraws(row.body),
				row.engine,
				`"${row.name}": the engine no longer does what this corpus says. Either markdown-it ` +
					'changed, or this row was always wrong — do not "fix" the row without re-deriving it.',
			);
		}
	});

	test('the WALKER matches the corpus, and every disagreement carries its reason', () => {
		for (const row of CORPUS) {
			assert.equal(matchMermaidFences(row.body).length > 0, row.walker, `"${row.name}": walker`);
			if (row.engine !== row.walker) {
				assert.ok(row.why, `"${row.name}" disagrees with the engine and says nothing about why`);
			}
		}
	});

	// THE INVARIANT. Everything else here is bookkeeping; this is the property.
	test('the walker NEVER substitutes where the engine does not render a diagram', () => {
		const overMatches = CORPUS.filter((r) => r.walker && !r.engine).map((r) => r.name);
		assert.deepEqual(
			overMatches,
			[],
			'the walker would replace, in an exported PDF, something the author wrote as literal ' +
				'text with a picture. There is no budget for this direction — a MISS shows the source ' +
				'and is recoverable; an over-match is not.',
		);
	});

	// The two other `lib/` recognizers, and the ways they deliberately differ. Prose said this
	// and prose was wrong: `slide-speech.js` claimed "the same three rules" as the walker.
	test('the generous recognizers are generous in the direction they claim', () => {
		const indented = `  \`\`\`mermaid\n${indent(DEF, '  ')}  \`\`\`\n`;
		// Narration's reader trims, so it fences an indented block the walker will not substitute.
		// Safe there: over-blanking under-narrates, it never speaks source it should not.
		assert.equal(readerFences(indented), true);
		assert.equal(matchMermaidFences(indented).length, 1); // …and at 2 spaces the walker agrees
		const deep = `- a\n\n      \`\`\`mermaid\n${indent(DEF, '      ')}      \`\`\`\n`;
		assert.equal(readerFences(deep), true, 'the reader should still fence a deeply indented block');
		assert.equal(matchMermaidFences(deep).length, 0, 'the walker caps indent at three — a MISS, by design');
		// The grammar scanner allows arbitrary indent too: a false positive costs one 2KB fetch.
		assert.equal(scannerSees(deep), true);
	});
});
