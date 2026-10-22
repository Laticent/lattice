import MarkdownIt from 'markdown-it';
import type { NodeSpec, Node as PMNode } from 'prosemirror-model';
import { mathBlockRule, mathInlineRule } from '../../../../lib/plugins/math/math.syntax.mjs';
import { CLIP_ORIGIN } from './clip-origin';
import { commentBlockRule } from './comment-block';

// RAW BLOCKS and MATH — the three things a slide can hold that Compose draws as ONE unit and writes back byte for byte.
//
//   · `raw_block` kind `html`: a block of HTML the author wrote (`<div class="x">…</div>`). Compose does not render it and
//     does not edit it as prose. The node carries the source lines verbatim and the serializer writes them back unchanged.
//   · `raw_block` kind `math`: a `$$ … $$` display block, carried with its delimiters.
//   · `inline_math`: a `$x^2$` span inside a line of prose, carried as its TeX.
//
// Until now a slide holding any of the three LOCKED: read-only in Compose, "edit in Markdown". Measured on the 2,965
// shipped slides, 96 locked, and these were 30 (inline math) and 21 (block HTML) of them
// (engineering/decisions/2026-10-21-compose-point-and-click.md §7). A prose editor cannot round-trip them (it escapes `_`
// and `*` in `a_1`, and turns `<div>` into literal text), so the node is an atom: nothing inside it is prose.
//
// THE GRAMMAR IS THE ENGINE'S. The math rules are `lib/plugins/math/math.syntax.mjs`'s own, installed at the same places the
// math plugin installs them (inline after `escape`, block before `fence`), so Compose and the render draw the same boundary
// (HARD RULE #1). The HTML rule is markdown-it's own `html_block` rule, called with `html` on for that one call.
//
// TOP LEVEL ONLY for the two block rules (`blkIndent` 0), for the reason `comment-block.ts` gives: inside a list item, modeling a
// block changes the render (a tight list turns loose). That includes a quote's own top level, which is modeled; a block inside a list
// item stays prose and the slide stays locked.

/** The first non-space text of a line that opens an HTML tag the old lock caught: `<div`, `</span>`, `<br/>`, but not a comment. */
const OPEN_TAG = /^<(?!!--)\/?[a-zA-Z][\w-]*(?:\s|>|\/|$)/;

/** Longest a raw block may be. A pasted block is bounded; an authored one is as long as the author made it. */
export const RAW_BLOCK_MAX = 20_000;

// biome-ignore lint/suspicious/noExplicitAny: markdown-it's StateBlock and Ruler internals are loosely typed upstream.
type State = any;

/** markdown-it's own `html_block` rule. Its ruler entry is private API, so this reads it once and fails loudly if it is gone. */
const htmlBlockRule: (state: State, start: number, end: number, silent: boolean) => boolean = (() => {
	// biome-ignore lint/suspicious/noExplicitAny: `__rules__` is the ruler's documented-in-source internal list.
	const rules = (new MarkdownIt('commonmark', { html: true }).block.ruler as any).__rules__ as { name: string; fn: (s: State, a: number, b: number, c: boolean) => boolean }[];
	const rule = rules.find((r) => r.name === 'html_block');
	if (!rule) throw new Error('markdown-it has no html_block rule: raw-block.ts must be reworked');
	return rule.fn;
})();

/** Is this a top-level position a block may be modeled at (see the header)? */
function topLevel(state: State, startLine: number): boolean {
	return state.blkIndent === 0 && state.sCount[startLine] - state.blkIndent < 4;
}

/** The raw-block and math rules, for the Compose tokenizer. Install AFTER `commentBlockRule`. */
export function rawBlockRules(md: MarkdownIt): void {
	// HTML: ahead of `heading`, where markdown-it's own `html_block` sits, with its terminator list.
	md.block.ruler.before(
		'heading',
		'lattice_html',
		(state: State, startLine: number, endLine: number, silent: boolean) => {
			if (!topLevel(state, startLine)) return false;
			const begin = state.bMarks[startLine] + state.tShift[startLine];
			// Measured from the first non-space character (`tShift`), so a tab-indented line inside a quote reads like a spaced one.
			if (state.src.charCodeAt(begin) !== 0x3c || !OPEN_TAG.test(state.src.slice(begin, state.eMarks[startLine]))) return false;
			const was = state.md.options.html;
			state.md.options.html = true;
			let ok: boolean;
			try {
				ok = htmlBlockRule(state, startLine, endLine, silent);
			} finally {
				state.md.options.html = was;
			}
			if (!ok || silent) return ok;
			const token = state.tokens[state.tokens.length - 1];
			token.type = 'lattice_html';
			// getLines keeps the final line feed; the node holds the bytes without it, as the comment node does.
			token.content = String(token.content).replace(/\n$/, '');
			return true;
		},
		{ alt: ['paragraph', 'reference', 'blockquote'] },
	);

	// Display math: the engine's rule, with the SOURCE BYTES (delimiters and all) kept instead of the stripped TeX.
	md.block.ruler.before(
		'fence',
		'lattice_math_block',
		(state: State, startLine: number, endLine: number, silent: boolean) => {
			if (!topLevel(state, startLine)) return false;
			const ok = mathBlockRule(state, startLine, endLine, silent);
			if (!ok || silent) return ok;
			const token = state.tokens[state.tokens.length - 1];
			token.type = 'lattice_math_block';
			token.content = state.getLines(startLine, state.line, state.blkIndent, false);
			return true;
		},
		// No `alt`: the engine installs `math_block` without one (lib/plugins/host-grammar.mjs), so `$$` never interrupts a paragraph there.
	);

	// Inline math: the engine's rule at the engine's place. The token's `content` is the TeX between the dollars.
	md.inline.ruler.after('escape', 'lattice_math_inline', (state: State, silent: boolean) => {
		const ok = mathInlineRule(state, silent);
		if (ok && !silent) state.tokens[state.tokens.length - 1].type = 'lattice_math_inline';
		return ok;
	});
}

/** The one markdown-it Compose parses slide prose with: CommonMark + tables + comment, raw-block and math rules, HTML OFF. */
export function createTokenizer(): MarkdownIt {
	return new MarkdownIt('commonmark', { html: false }).enable('table').use(commentBlockRule).use(rawBlockRules);
}

/**
 * `prose` with the lines of every MODELED raw block (an HTML or `$$` block at the top level) blanked. What `hasLossyConstruct`
 * still sees afterwards is exactly what Compose cannot round-trip: an HTML tag or a `$$` block inside a list or a quote.
 */
let maskTokenizer: MarkdownIt | null = null;
export function withoutModeledBlocks(prose: string): string {
	if (!/[<$]/.test(prose)) return prose;
	const lines = prose.split('\n');
	let tokens: { type: string; map: [number, number] | null }[];
	try {
		maskTokenizer ??= createTokenizer();
		tokens = maskTokenizer.parse(prose, {}) as typeof tokens;
	} catch {
		return prose;
	}
	for (const t of tokens) {
		if ((t.type === 'lattice_html' || t.type === 'lattice_math_block') && t.map) {
			for (let i = t.map[0]; i < t.map[1]; i++) lines[i] = '';
		}
	}
	return lines.join('\n');
}

// ── The nodes ────────────────────────────────────────────────────────────────

export type RawKind = 'html' | 'math';

/** A line of three or more `-`, `*` or `_`: a slide boundary or a rule. No raw block may write one on a line of its own. */
const RULE_LINE = /^[ \t]*([-*_])[ \t]*(?:\1[ \t]*){2,}$/m;
/** A `_`-prefixed directive comment: attributes are not content, and a foreign page must not set them (comment-block.ts). */
const DIRECTIVE_COMMENT = /<!--\s*_[A-Za-z]/;

/** May `text` be a raw block of this kind? The SAFETY check for the one path where text arrives from outside: a paste. */
export function isRawBlockText(kind: unknown, text: unknown): text is string {
	if (kind !== 'html' && kind !== 'math') return false;
	if (typeof text !== 'string' || !text || text.length > RAW_BLOCK_MAX) return false;
	if (/\r/.test(text) || RULE_LINE.test(text) || DIRECTIVE_COMMENT.test(text)) return false;
	// A blank line ends an HTML block (types 6 and 7), so a pasted one that holds a blank line is two blocks.
	if (kind === 'html' && (/\n[ \t]*(?:\n|$)/.test(text) || !OPEN_TAG.test(text.trimStart()))) return false;
	// ONE math block: the TeX between the outer delimiters holds no `$$` of its own.
	if (kind === 'math' && !(text.startsWith('$$') && text.trimEnd().endsWith('$$') && text.trim().length > 4 && !text.trim().slice(2, -2).includes('$$'))) return false;
	return true;
}

/** Longest TeX an inline math node may carry: a line of notation, never a document. */
export const MATH_INLINE_MAX = 2_000;

/** May `tex` be an inline math node? One line (a break would end the paragraph on the way back), no `$`, no leading or trailing space. */
export function isInlineTex(tex: unknown): boolean {
	return typeof tex === 'string' && tex.length > 0 && tex.length <= MATH_INLINE_MAX && !/[\n\r$]/.test(tex) && !/^\s|\s$/.test(tex) && !tex.endsWith('\\');
}

function readRaw(el: HTMLElement): { kind: RawKind; text: string } | false {
	const kind = el.getAttribute('data-raw-kind');
	const text = el.getAttribute('data-raw');
	if (el.getAttribute('data-lattice-origin') !== CLIP_ORIGIN || !isRawBlockText(kind, text)) return false;
	return { kind: kind as RawKind, text };
}

export const rawBlockSpec: NodeSpec = {
	atom: true,
	group: 'block',
	attrs: { kind: { default: 'html' }, text: { default: '' } },
	selectable: true,
	defining: true,
	leafText: (node) => node.attrs.text as string,
	toDOM: (node) => ['div', { class: 'cs-raw', 'data-raw-kind': node.attrs.kind as string, 'data-raw': node.attrs.text as string, 'data-lattice-origin': CLIP_ORIGIN }],
	parseDOM: [{ tag: 'div.cs-raw', getAttrs: (dom) => readRaw(dom as HTMLElement) }],
};

export const mathInlineSpec: NodeSpec = {
	group: 'inline',
	inline: true,
	atom: true,
	selectable: true,
	draggable: false,
	attrs: { tex: {} },
	leafText: (node) => `$${node.attrs.tex as string}$`,
	toDOM: (node) => ['span', { class: 'cs-math', 'data-math': node.attrs.tex as string, 'data-lattice-origin': CLIP_ORIGIN }],
	parseDOM: [
		{
			tag: 'span.cs-math',
			getAttrs: (dom) => {
				const el = dom as HTMLElement;
				const tex = el.getAttribute('data-math');
				return el.getAttribute('data-lattice-origin') === CLIP_ORIGIN && isInlineTex(tex) ? { tex } : false;
			},
		},
	],
};

// ── The serializers ──────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: prosemirror-markdown's serializer state is loosely typed upstream.
export function serializeRawBlock(state: any, node: PMNode): void {
	// Each line goes through `text`, which prefixes the container's delimiter (a quote's `> `), and nothing is escaped.
	state.text(node.attrs.text as string, false);
	state.closeBlock(node);
}

// biome-ignore lint/suspicious/noExplicitAny: prosemirror-markdown's serializer state is loosely typed upstream.
export function serializeMathInline(state: any, node: PMNode): void {
	// `text` carries a container's delimiter onto a continuation line, for a TeX span that crossed a soft break.
	state.text(`$${node.attrs.tex as string}$`, false);
}
