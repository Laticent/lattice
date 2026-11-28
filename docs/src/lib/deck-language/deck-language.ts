// THE SOURCE EDITOR READS THE DECK THE WAY THE ENGINE DOES (Segno deck pipeline P4b,
// engineering/decisions/2026-10-22-segno-deck-pipeline.md §P4b landed).
//
// CodeMirror's syntax tree, built from the deck model (`@laticent/segno-languages/markdown`, configured as the engine
// parses by lib/core/deck-model.mjs) instead of from `@lezer/markdown`'s own grammar. Before this, the deck editor read
// Lattice-flavored Markdown with a third parser: `$x_1$` was emphasis, `~~a~~` and tables were plain text, and a front
// matter the engine reads was whatever lang-yaml's frontmatter grammar decided. Now every node is a range the model
// recorded, so the editor, the preview and Compose agree on what each character is.
//
// THE NODE NAMES ARE LEZER MARKDOWN'S. The tree uses the node set of `markdown({ base: markdownLanguage })`, so
// everything that reads the tree by name keeps working unchanged: the highlight style tags, the fold props, the
// `Enter` / `Backspace` list keymap, heading folds and the HTML completion. A block the model has and Lezer Markdown has
// no name for gets one of three names added here: `Frontmatter` (its `---` lines as `FrontmatterMark`, the YAML inside
// parsed by lang-yaml, as `yamlFrontmatter` did), `LatticeBlock` (a plugin block: math's `$$`, the code record) and
// `LatticeInline` (a plugin inline token: math's `$`).
//
// SLIDE BY SLIDE. Each slide's subtree is built from its segment of the model's tape and kept with that segment, which
// an update reuses when the edit is elsewhere. A slide subtree is an anonymous node, so a reader sees Lezer Markdown's
// flat shape (the blocks as the document's children). A keystroke re-reads one slide in the model (`updateDeckModel`)
// and rebuilds one slide's subtree here; `deckTreeStats` counts both, so the cost per keystroke is a count a test
// holds, not a time (HARD RULE #32).
//
// The model rides on the tree it built (`MODEL`, a per-node prop), so the next parse finds it in CodeMirror's
// fragments and updates it instead of parsing from nothing. Two editors never share one: each tree carries its own.

import { html } from '@codemirror/lang-html';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { yamlLanguage } from '@codemirror/lang-yaml';
import { Language, LanguageSupport } from '@codemirror/language';
import { COL_SHIFT, F_CLOSED, KIND, STRIDE, T_AUX, T_FLAGS, T_KIND, T_L0, T_L1, T_NEST } from '@laticent/segno-languages/markdown';
import { type Input, NodeProp, NodeSet, NodeType, Parser, type PartialParse, parseMixed, Tree, type TreeFragment } from '@lezer/common';
import { styleTags, tags as t } from '@lezer/highlight';
import { deckInlineOptions as deckInlineOptionsJs } from '../../../../lib/core/deck-inline.mjs';
import { deckModel as deckModelJs, updateDeckModel as updateDeckModelJs } from '../../../../lib/core/deck-model.mjs';
// THE INLINE PASS COMES FROM ITS SOURCE MODULES, not from the package entry the block pass is read through. The entry is
// one module (`dist/index.mjs`) and a bundler keeps a module in one chunk, the eager one the outline needs, so an inline
// import from it put the whole inline pass on the Studio's and the home page's eager path (+10,189 B gzipped, #3599).
// From here it rides only in this module's own chunk. The model's block pass is the entry's; these modules read a model
// by its fields, so they read the entry's models as they read their own.
import type { DeckModel } from '../segno-markdown/deck';
import type { Detail, RefRecord } from '../segno-markdown/detail';
import {
	F_EMPTY,
	I_AUX,
	I_FLAGS,
	I_FROM,
	I_KIND,
	I_NEST,
	I_TO,
	IKIND,
	InlineParser,
	type InlineParserOptions,
	type InlineTape,
	ISTRIDE,
	L_CHILD,
	L_DEST0,
	L_DEST1,
	L_TITLE0,
	L_TITLE1,
	L_TYPE,
	LINK_AUTO,
	LINK_EMAIL,
	LINK_INLINE,
	LINK_REF,
	LSTRIDE,
	SPECIAL_ENTITY,
} from '../segno-markdown/inline';
import { type InlineLeaf, inlineSlide, leafToBody, referencesOf, slideDetail } from '../segno-markdown/model-inline';

const buildModel = deckModelJs as (source: string) => DeckModel;
const updateModel = updateDeckModelJs as (prev: DeckModel, next: string) => DeckModel;
const inlineOptions = deckInlineOptionsJs as () => InlineParserOptions;
let parser: InlineParser | null = null;
let parserFor: InlineParserOptions | null = null;
/** The editors' inline parser, rebuilt when the admitted plugins change (`deckInlineOptions` returns new options then). */
function inlineParser(): InlineParser {
	const o = inlineOptions();
	if (!parser || parserFor !== o) {
		parser = new InlineParser(o);
		parserFor = o;
	}
	return parser;
}

/** What building trees has cost, for the tests and the editor census: counted, never timed. */
export const deckTreeStats = { models: 0, updates: 0, slidesBuilt: 0, slidesReused: 0, nodes: 0 };

// The support `markdown()` gives (keymap, heading folds, HTML tag completion, URL paste), with GFM's node set so
// tables and strikethrough have names. Its grammar is never run: `deckLanguage` below replaces it.
const htmlNoMatch = /* @__PURE__ */ html({ matchClosingTags: false });
const base = /* @__PURE__ */ markdown({ base: markdownLanguage, htmlTagLanguage: htmlNoMatch });
const baseSet: NodeSet = (base.language.parser as unknown as { nodeSet: NodeSet }).nodeSet;

const EXTRA = ['Frontmatter', 'FrontmatterMark', 'FrontmatterContent', 'LatticeBlock', 'LatticeInline'] as const;
/** The node set: Lezer Markdown's types, then the five the model adds, styled as lang-yaml styles a front matter's dashes. */
export const deckNodeSet: NodeSet = /* @__PURE__ */ (() => {
	const n = baseSet.types.length;
	const extra = EXTRA.map((name, i) => NodeType.define({ id: n + i, name, props: name === 'Frontmatter' || name === 'LatticeBlock' ? [[NodeProp.group, ['Block']]] : [] }));
	return new NodeSet([...baseSet.types, ...extra]).extend(styleTags({ FrontmatterMark: t.meta }));
})();

const ID: Record<string, number> = /* @__PURE__ */ (() => {
	const out: Record<string, number> = {};
	for (const type of deckNodeSet.types) if (type.name) out[type.name] = type.id;
	return out;
})();

/** The model a tree was built from, on its top node. */
const MODEL = /* @__PURE__ */ new NodeProp<DeckModel>({ perNode: true });

/** The model a tree built by this language carries, or undefined. */
export function modelOf(tree: Tree): DeckModel | undefined {
	return tree.prop(MODEL);
}

// ── One slide's nodes ────────────────────────────────────────────────────────────────────────────────────────────

/** A slide's subtree, kept with its segment and the reference labels its inline parse read. */
const kept = /* @__PURE__ */ new WeakMap<object, { keys: string; tree: Tree; nodes: number }>();

/**
 * Lezer's postfix buffer for one slide: `(type, from, to, size)` per node, children before their parent, offsets from
 * the slide's first character. Container marks a line prefix carries (`>` on a continuation line, a table row's pipes)
 * wait in `pending`, sorted, and land in the innermost node open when the writer reaches them, as Lezer Markdown places
 * them.
 */
class Writer {
	buf: number[] = [];
	private stack: number[] = []; // per open node: type, from, buffer index, last child end
	private pending: number[] = []; // (type, from, to) triples, sorted by from
	private p = 0;

	mark(type: number, from: number, to: number): void {
		// Sorted insert: marks arrive mostly in order (an inner quote's lines come after its outer quote's first line).
		let i = this.pending.length;
		while (i > this.p && this.pending[i - 2] > from) i -= 3;
		this.pending.splice(i, 0, type, from, to);
	}

	private flush(before: number): void {
		const q = this.pending;
		while (this.p < q.length && q[this.p + 1] < before) {
			this.put(q[this.p], q[this.p + 1], q[this.p + 2]);
			this.p += 3;
		}
	}

	private put(type: number, from: number, to: number): void {
		this.buf.push(type, from, to, 4);
		const s = this.stack;
		if (s.length && to > s[s.length - 1]) s[s.length - 1] = to;
	}

	leaf(type: number, from: number, to: number): void {
		if (to <= from) return;
		this.flush(from + 1);
		this.put(type, from, to);
	}

	open(type: number, from: number): void {
		this.flush(from + 1);
		this.stack.push(type, from, this.buf.length, from);
	}

	/** Close the innermost node at `to`, or at its last child's end when that is later. */
	close(to: number): number {
		this.flush(to);
		const s = this.stack;
		const last = s.pop() as number;
		const at = s.pop() as number;
		const from = s.pop() as number;
		const type = s.pop() as number;
		const end = Math.max(to, last, from);
		this.buf.push(type, from, end, this.buf.length - at + 4);
		if (s.length && end > s[s.length - 1]) s[s.length - 1] = end;
		return end;
	}

	/** Push the innermost open node's end out to `to`, without a node (a leaf's last character). */
	extend(to: number): void {
		const s = this.stack;
		if (s.length && to > s[s.length - 1]) s[s.length - 1] = to;
	}

	/** The end of the innermost open node's last child. */
	get lastEnd(): number {
		return this.stack[this.stack.length - 1];
	}

	done(): void {
		this.flush(Number.MAX_SAFE_INTEGER);
	}
}

const isSpace = (c: number) => c === 0x20 || c === 0x09;

/**
 * One slide's subtree: its blocks from the slide's DETAIL parse (the same tokens the model holds, with the columns a
 * marker sits at), its inline nodes from the leaves the model keeps with the segment.
 */
function slideTree(m: DeckModel, seg: number, leaves: InlineLeaf[]): { tree: Tree; nodes: number } {
	const sd = slideDetail(m, seg);
	const d = sd.parse;
	const src = d.src;
	const g = m.segs[seg];
	const L0 = sd.line0;
	const origin = d.bMarks[L0];
	// Offsets from the slide's first character, read off the detail parse (the slide's text has not changed since it).
	const ls = (line: number) => d.bMarks[line + L0] - origin;
	const le = (line: number) => d.eMarks[line + L0] - origin;
	const ch = (rel: number) => src.charCodeAt(rel + origin);
	const length = seg + 1 < m.segs.length ? m.segOff[seg + 1] - m.segOff[seg] : m.body.length - m.segOff[seg];
	const slideOff = m.segOff[seg];
	const leafAt = (leaf: InlineLeaf, off: number) => leafToBody(leaf.leaf, off) - slideOff;

	const w = new Writer();
	// The furthest a container mark reaches on each line, so a block opening there starts after it.
	const floor = new Map<number, number>();
	const floorOf = (line: number) => Math.max(ls(line), floor.get(line) ?? 0);
	const setFloor = (line: number, to: number) => {
		if ((floor.get(line) ?? -1) < to) floor.set(line, to);
	};
	const skipSpace = (rel: number, end: number) => {
		while (rel < end && isSpace(ch(rel))) rel++;
		return rel;
	};
	/** End of a line with trailing spaces taken off. */
	const trimEnd = (from: number, to: number) => {
		while (to > from && isSpace(ch(to - 1))) to--;
		return to;
	};
	let quoteDepth = 0;
	let nextLeaf = 0;
	let inHead = false;
	const opens: number[] = []; // kind of each open block token, by depth
	let headingAux = 0;
	let headingLine = 0;
	let headingEnd = 0; // the open token's map end: a close token carries no map
	let tableLine = 0;
	let rowEnd = 0;
	let leafEnd = 0;

	// The slide's link reference definitions, which produce no token: each is written before the first token on a line
	// after it, so it lands in the container that holds it.
	const refs = ((d.detail as Detail | undefined)?.refs ?? []).filter((r) => r.line >= L0 && r.line < L0 + g.lines);
	let nextRef = 0;
	const containerEnds: number[] = []; // a quote's or list item's map end, for the definitions inside it
	const refsBefore = (line: number) => {
		for (; nextRef < refs.length && refs[nextRef].line - L0 < line; nextRef++) reference(refs[nextRef]);
	};

	for (let j = 0; j < g.length; j++) {
		const at = (sd.t0 + j) * STRIDE;
		const tape = d.tape;
		if (tape[at + T_L0] >= 0) refsBefore(tape[at + T_L0] - L0);
		const kind = tape[at + T_KIND];
		const nest = tape[at + T_NEST];
		const l0 = tape[at + T_L0] - L0;
		const l1 = tape[at + T_L1] - L0;
		const flags = tape[at + T_FLAGS];
		const aux = tape[at + T_AUX];
		const col = (line: number) => ls(line) + (flags >> COL_SHIFT);
		if (nest > 0) opens.push(kind);
		else if (nest < 0) opens.pop();
		switch (kind) {
			case KIND.paragraph_open:
				w.open(ID.Paragraph, leafStart(leaves[nextLeaf]));
				break;
			case KIND.paragraph_close:
				w.close(w.lastEnd);
				break;
			case KIND.heading_open: {
				headingAux = aux;
				headingLine = l0;
				headingEnd = l1;
				if (aux >= 8) w.open(ID[`SetextHeading${aux - 8}`], leafStart(leaves[nextLeaf]));
				else {
					const from = col(l0);
					w.open(ID[`ATXHeading${aux}`], from);
					w.leaf(ID.HeaderMark, from, from + aux);
				}
				break;
			}
			case KIND.heading_close: {
				if (headingAux >= 8) {
					// The underline: the last line of the heading's map, its run of `=` or `-` after any container prefix.
					const line = headingEnd - 1;
					let p = floorOf(line);
					const end = le(line);
					while (p < end && (isSpace(ch(p)) || ch(p) === 0x3e)) p++;
					let q = p;
					while (q < end && ch(q) === ch(p)) q++;
					w.leaf(ID.HeaderMark, p, q);
				} else {
					// A closing sequence of `#`s, which markdown-it keeps out of the heading's text: whatever follows the text.
					const after = Math.max(leafEnd, w.lastEnd);
					const end = trimEnd(after, le(headingLine));
					let p = end;
					while (p > after && ch(p - 1) === 0x23) p--;
					if (p < end) w.leaf(ID.HeaderMark, p, end);
				}
				w.close(w.lastEnd);
				break;
			}
			case KIND.bullet_list_open:
			case KIND.ordered_list_open: {
				const item = at + STRIDE;
				w.open(kind === KIND.bullet_list_open ? ID.BulletList : ID.OrderedList, ls(tape[item + T_L0] - L0) + (tape[item + T_FLAGS] >> COL_SHIFT));
				break;
			}
			case KIND.bullet_list_close:
			case KIND.ordered_list_close:
				w.close(w.lastEnd);
				break;
			case KIND.list_item_close:
				refsBefore(containerEnds.pop() as number);
				w.close(w.lastEnd);
				break;
			case KIND.list_item_open: {
				const from = col(l0);
				let to = from;
				if (opens[opens.length - 2] === KIND.ordered_list_open) while (ch(to) >= 0x30 && ch(to) <= 0x39) to++;
				to++;
				containerEnds.push(l1);
				w.open(ID.ListItem, from);
				w.leaf(ID.ListMark, from, to);
				setFloor(l0, to);
				break;
			}
			case KIND.blockquote_open: {
				quoteDepth++;
				containerEnds.push(l1);
				let p = skipSpace(floorOf(l0), le(l0));
				w.open(ID.Blockquote, p);
				if (ch(p) === 0x3e) {
					w.leaf(ID.QuoteMark, p, p + 1);
					setFloor(l0, p + 1);
				}
				// Each later line's own `>` for this quote: the `quoteDepth`-th one in the line's prefix (a lazy line has none).
				for (let line = l0 + 1; line < l1; line++) {
					const end = le(line);
					let n = 0;
					for (p = ls(line); p < end && (isSpace(ch(p)) || ch(p) === 0x3e); p++) {
						if (ch(p) === 0x3e && ++n === quoteDepth) {
							w.mark(ID.QuoteMark, p, p + 1);
							setFloor(line, p + 1);
							break;
						}
					}
				}
				break;
			}
			case KIND.blockquote_close:
				quoteDepth--;
				refsBefore(containerEnds.pop() as number);
				w.close(w.lastEnd);
				break;
			case KIND.fence: {
				const from = col(l0);
				w.open(ID.FencedCode, from);
				w.leaf(ID.CodeMark, from, from + aux);
				const infoFrom = skipSpace(from + aux, le(l0));
				w.leaf(ID.CodeInfo, infoFrom, trimEnd(infoFrom, le(l0)));
				const last = flags & F_CLOSED ? l1 - 1 : l1;
				if (last > l0 + 1) {
					// Open and closed, not a leaf: a quote's `>` on a later line of the code lands inside it.
					// After the line's container prefix, and the one space a quote's `>` takes with it.
					let at = floorOf(l0 + 1);
					if (at > ls(l0 + 1) && isSpace(ch(at))) at++;
					w.open(ID.CodeText, at);
					w.close(le(last - 1));
				}
				let end = le(l0);
				if (flags & F_CLOSED) {
					const line = l1 - 1;
					let p = floorOf(line);
					const e = le(line);
					while (p < e && ch(p) !== ch(from)) p++;
					let q = p;
					while (q < e && ch(q) === ch(from)) q++;
					w.leaf(ID.CodeMark, p, q);
					end = q;
				} else if (last > l0 + 1) end = le(last - 1);
				w.close(end);
				break;
			}
			case KIND.code_block: {
				const from = skipSpace(floorOf(l0), le(l0));
				w.open(ID.CodeBlock, from);
				w.open(ID.CodeText, from);
				w.close(le(l1 - 1));
				w.close(le(l1 - 1));
				break;
			}
			case KIND.html_block: {
				const from = skipSpace(floorOf(l0), le(l0));
				const type = src.startsWith('<!--', from + origin) ? ID.CommentBlock : src.startsWith('<?', from + origin) ? ID.ProcessingInstructionBlock : ID.HTMLBlock;
				w.open(type, from);
				w.close(trimEnd(from, le(l1 - 1)));
				break;
			}
			case KIND.hr: {
				const from = col(l0);
				w.open(ID.HorizontalRule, from);
				w.close(trimEnd(from, le(l0)));
				break;
			}
			case KIND.table_open: {
				tableLine = l0;
				w.open(ID.Table, skipSpace(floorOf(l0), le(l0)));
				break;
			}
			case KIND.table_close:
				w.close(w.lastEnd);
				break;
			case KIND.thead_open:
				inHead = true;
				break;
			case KIND.thead_close: {
				inHead = false;
				// The delimiter row, the line after the header.
				const line = tableLine + 1;
				const from = skipSpace(floorOf(line), le(line));
				w.leaf(ID.TableDelimiter, from, trimEnd(from, le(line)));
				break;
			}
			case KIND.tr_open: {
				const from = col(l0);
				rowEnd = trimEnd(from, le(l0));
				w.open(inHead ? ID.TableHeader : ID.TableRow, from);
				// The row's pipes: every `|` no backslash escapes. A cell's text never holds one (markdown-it splits there).
				for (let p = from; p < rowEnd; p++) if (ch(p) === 0x7c && ch(p - 1) !== 0x5c) w.mark(ID.TableDelimiter, p, p + 1);
				break;
			}
			case KIND.tr_close:
				w.close(rowEnd);
				break;
			case KIND.inline: {
				const leaf = leaves[nextLeaf++];
				const cell = opens[opens.length - 1] === KIND.th_open || opens[opens.length - 1] === KIND.td_open;
				const from = leafStart(leaf);
				const to = leafAt(leaf, leaf.leaf.text.length);
				if (cell) {
					if (to <= from) break;
					w.open(ID.TableCell, from);
					inlineNodes(leaf.tape, leaf, 0);
					w.close(to);
				} else {
					inlineNodes(leaf.tape, leaf, 0);
					// The leaf's end, so its block closes after its last character even when no inline node ends there.
					w.extend(to);
				}
				leafEnd = to;
				break;
			}
			default:
				if (nest === 0 && l0 >= 0 && kind >= KIND.td_close + 1) {
					// A plugin block (math's `$$`, the code record): its lines, as one node.
					const from = skipSpace(floorOf(l0), le(l0));
					w.open(ID.LatticeBlock, from);
					w.close(trimEnd(from, le(l1 - 1)));
				}
		}
	}
	refsBefore(Number.MAX_SAFE_INTEGER);
	w.done();
	const buf = w.buf;
	const tree = Tree.build({ buffer: buf, nodeSet: deckNodeSet, topID: 0, length, maxBufferLength: 1024 });
	return { tree, nodes: buf.length / 4 };

	/** A piece's first and last offsets: `(line, from, to)` triples, columns from each line's own start. */
	function pieceSpan(p: Int32Array): [number, number] {
		return [ls(p[0] - L0) + p[1], ls(p[p.length - 3] - L0) + p[p.length - 1]];
	}

	/** `[label]: destination "title"`, as Lezer Markdown names its parts. */
	function reference(r: RefRecord): void {
		const [l0, l1] = pieceSpan(r.label);
		const [d0, d1] = pieceSpan(r.dest);
		// A bracketed destination's `<>` are outside its recorded text.
		const bracketed = ch(d0 - 1) === 0x3c;
		let end = bracketed ? d1 + 1 : d1;
		w.open(ID.LinkReference, l0 - 1);
		w.leaf(ID.LinkLabel, l0 - 1, l1 + 1);
		w.leaf(ID.LinkMark, l1 + 1, l1 + 2);
		w.leaf(ID.URL, bracketed ? d0 - 1 : d0, end);
		if (r.title.length) {
			const [t0, t1] = pieceSpan(r.title);
			w.leaf(ID.LinkTitle, t0 - 1, t1 + 1);
			end = t1 + 1;
		}
		w.close(end);
	}

	function leafStart(leaf: InlineLeaf | undefined): number {
		return leaf ? leafAt(leaf, 0) : 0;
	}

	/** The inline nodes of one tape, in order; `shift` is where its text starts in the leaf's (an image's alt text). */
	function inlineNodes(tp: InlineTape, leaf: InlineLeaf, shift: number): void {
		const tape = tp.tape;
		const at = (off: number) => leafAt(leaf, shift + off);
		const opened: number[] = []; // per open link: its record
		for (let i = 0; i < tp.length; i++) {
			const k = i * ISTRIDE;
			const kind = tape[k + I_KIND];
			const from = tape[k + I_FROM];
			const to = tape[k + I_TO];
			const aux = tape[k + I_AUX];
			switch (kind) {
				case IKIND.text:
				case IKIND.softbreak:
					break;
				case IKIND.text_special:
					w.leaf(aux === SPECIAL_ENTITY ? ID.Entity : ID.Escape, at(from), at(to));
					break;
				case IKIND.hardbreak:
					w.leaf(ID.HardBreak, at(from), at(to));
					break;
				case IKIND.code_inline:
					w.open(ID.InlineCode, at(from));
					w.leaf(ID.CodeMark, at(from), at(from + aux));
					w.leaf(ID.CodeMark, at(to - aux), at(to));
					w.close(at(to));
					break;
				case IKIND.html_inline: {
					const s = tp.src.slice(from, from + 4);
					w.leaf(s.startsWith('<!--') ? ID.Comment : s.startsWith('<?') ? ID.ProcessingInstruction : ID.HTMLTag, at(from), at(to));
					break;
				}
				case IKIND.em_open:
				case IKIND.strong_open:
				case IKIND.s_open:
					if (tape[k + I_FLAGS] & F_EMPTY) break;
					w.open(kind === IKIND.em_open ? ID.Emphasis : kind === IKIND.strong_open ? ID.StrongEmphasis : ID.Strikethrough, at(from));
					w.leaf(kind === IKIND.s_open ? ID.StrikethroughMark : ID.EmphasisMark, at(from), at(to));
					break;
				case IKIND.em_close:
				case IKIND.strong_close:
				case IKIND.s_close:
					if (tape[k + I_FLAGS] & F_EMPTY) break;
					w.leaf(kind === IKIND.s_close ? ID.StrikethroughMark : ID.EmphasisMark, at(from), at(to));
					w.close(at(to));
					break;
				case IKIND.link_open: {
					const r = aux * LSTRIDE;
					opened.push(r);
					const type = tp.links[r + L_TYPE];
					w.open(type === LINK_AUTO || type === LINK_EMAIL ? ID.Autolink : ID.Link, at(from));
					w.leaf(ID.LinkMark, at(from), at(from + 1));
					break;
				}
				case IKIND.link_close: {
					const r = opened.pop() as number;
					tail(tp, r, from, to, at);
					w.close(at(to));
					break;
				}
				case IKIND.image: {
					const r = aux * LSTRIDE;
					w.open(ID.Image, at(from));
					w.leaf(ID.LinkMark, at(from), at(from + 2));
					const child = tp.links[r + L_CHILD];
					let close = from + 2;
					if (child >= 0) {
						const alt = tp.children[child];
						inlineNodes(alt, leaf, shift + alt.base);
						close = alt.base + alt.src.length;
					}
					tail(tp, r, close, to, at);
					w.close(at(to));
					break;
				}
				default:
					if (kind >= IKIND.image + 1 && tape[k + I_NEST] === 0 && to > from) w.leaf(ID.LatticeInline, at(from), at(to));
			}
		}
	}

	/** A link's or image's end, from its `]` (or an autolink's text end) to `to`: marks, destination, title, label. */
	function tail(tp: InlineTape, r: number, from: number, to: number, at: (off: number) => number): void {
		const type = tp.links[r + L_TYPE];
		const d0 = tp.links[r + L_DEST0];
		const d1 = tp.links[r + L_DEST1];
		if (type === LINK_AUTO || type === LINK_EMAIL) {
			if (d0 >= 0) w.leaf(ID.URL, at(d0), at(d1));
			w.leaf(ID.LinkMark, at(to - 1), at(to));
			return;
		}
		w.leaf(ID.LinkMark, at(from), at(from + 1));
		if (type === LINK_INLINE) {
			w.leaf(ID.LinkMark, at(from + 1), at(from + 2));
			if (d0 >= 0 && d1 > d0) w.leaf(ID.URL, at(d0), at(d1));
			const t0 = tp.links[r + L_TITLE0];
			if (t0 >= 0) w.leaf(ID.LinkTitle, at(t0 - 1), at(tp.links[r + L_TITLE1] + 1));
			w.leaf(ID.LinkMark, at(to - 1), at(to));
		} else if (type === LINK_REF && to > from + 1) w.leaf(ID.LinkLabel, at(from + 1), at(to));
	}
}

// ── The document ──────────────────────────────────────────────────────────────────────────────────────────────────

/** The front matter's node: its two `---` lines and the YAML between them. */
function frontMatterTree(text: string, end: number): Tree {
	const firstEnd = text.indexOf('\n');
	const closeEnd = text.charCodeAt(end - 1) === 0x0a ? end - 1 : end;
	const lastStart = Math.max(firstEnd + 1, text.lastIndexOf('\n', closeEnd - 1) + 1);
	const buf = [ID.FrontmatterMark, 0, firstEnd, 4];
	if (lastStart > firstEnd + 1) buf.push(ID.FrontmatterContent, firstEnd + 1, lastStart - 1, 4);
	buf.push(ID.FrontmatterMark, lastStart, closeEnd, 4);
	buf.push(ID.Frontmatter, 0, closeEnd, buf.length + 4);
	return Tree.build({ buffer: buf, nodeSet: deckNodeSet, topID: 0, length: end });
}

/** The tree of a whole deck from its model, reusing every slide subtree whose segment the model kept. */
export function deckTree(m: DeckModel, length = m.source.length): Tree {
	const p = inlineParser();
	const keys = referencesOf(m).keys;
	// A source with a BOM: the model's offsets index the text without it, the editor's include it.
	const shift = m.source.length - m.text.length;
	const children: Tree[] = [];
	const positions: number[] = [];
	if (m.bodyStart > 0) {
		children.push(frontMatterTree(m.text, m.bodyStart));
		positions.push(shift);
	}
	for (let seg = 0; seg < m.segs.length; seg++) {
		const g = m.segs[seg];
		let hit = kept.get(g);
		if (hit && hit.keys === keys) deckTreeStats.slidesReused++;
		else {
			const built = slideTree(m, seg, inlineSlide(m, seg, p));
			hit = { keys, tree: built.tree, nodes: built.nodes };
			kept.set(g, hit);
			deckTreeStats.slidesBuilt++;
			deckTreeStats.nodes += built.nodes;
		}
		children.push(hit.tree);
		positions.push(shift + m.bodyStart + m.segOff[seg]);
	}
	return new Tree(deckNodeSet.types[ID.Document], children, positions, length, [[MODEL, m]]);
}

/** The model of `text`, updated from the one an earlier tree carries when there is one. */
function modelFor(text: string, fragments: readonly TreeFragment[]): DeckModel {
	const prev = fragments.length ? fragments[0].tree.prop(MODEL) : undefined;
	if (prev) {
		deckTreeStats.updates++;
		return updateModel(prev, text);
	}
	deckTreeStats.models++;
	return buildModel(text);
}

class DeckParse implements PartialParse {
	parsedPos = 0;
	stoppedAt: number | null = null;
	constructor(
		private readonly input: Input,
		private readonly fragments: readonly TreeFragment[],
	) {}
	advance(): Tree {
		const text = this.input.read(0, this.input.length);
		const tree = deckTree(modelFor(text, this.fragments), this.input.length);
		this.parsedPos = this.input.length;
		return tree;
	}
	stopAt(pos: number): void {
		this.stoppedAt = pos;
	}
}

const nest = /* @__PURE__ */ parseMixed((node) => {
	if (node.type.id === ID.FrontmatterContent) return { parser: yamlLanguage.parser };
	return null;
});
type Wrap = (p: PartialParse, i: Input, f: readonly TreeFragment[], r: readonly { from: number; to: number }[]) => PartialParse;
/** lang-markdown's own wrapper (`parseCode`): HTML parsed inside `HTMLBlock`, `HTMLTag` and `CommentBlock`, by node id. */
const htmlWrap = (base.language.parser as unknown as { wrappers: readonly Wrap[] }).wrappers;

/** A Lezer parser whose tree is the deck model's; nested YAML in the front matter and HTML in tags, as before. */
class DeckTreeParser extends Parser {
	createParse(input: Input, fragments: readonly TreeFragment[], ranges: readonly { from: number; to: number }[]): PartialParse {
		let parse: PartialParse = new DeckParse(input, fragments);
		for (const wrap of htmlWrap) parse = wrap(parse, input, fragments, ranges);
		return nest(parse, input, fragments, ranges);
	}
}

export const deckTreeParser: Parser = /* @__PURE__ */ new DeckTreeParser();

/** The deck language: lang-markdown's data facet (comment tokens, autocomplete hooks), the model's tree. */
export const deckLanguage: Language = /* @__PURE__ */ new Language(base.language.data, deckTreeParser, [], 'markdown');

/** What the deck editor installs in place of `yamlFrontmatter({ content: markdown() })`. */
export function deckMarkdown(): LanguageSupport {
	return new LanguageSupport(deckLanguage, base.support);
}
