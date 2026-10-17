// COMPOSE INLINE OBJECTS — the half of the pill editor that lives in the document.
//
// A pill (`{SHIPPED, c2}`), and later a spark or an avatar, is one ATOM node in the Compose document
// (`inline-object.ts`). Compose draws it as the slide draws it. A tap selects it and opens its editor;
// an arrow key steps over it; Backspace takes all of it. There is no caret inside it, so a touch
// keyboard has nothing to chase and the editor's position never goes stale: the open object is a
// position in plugin state, validated against the node that sits there.
//
// Design: engineering/decisions/2026-10-13-compose-inline-notation-editors.md (§12, the rework).
//   · THE SOURCE TEXT IS THE OBJECT. The node carries the code span's text verbatim and writes it
//     back byte for byte, so the deck source never changes because an object was drawn.
//   · ONE RULE keeps text and nodes in step (`normalizeObjects`): a code-marked run the engine's kernel
//     reads as an object is a node, and anything else is text. It runs when the kernels load, after a
//     resync, and as an author's edit moves away from a span they were typing. "Edit as text" is the
//     other direction, and the rule leaves a span alone while the selection touches it.
//   · EVERY KIND PLUGS IN THROUGH `OBJECT_KINDS`: how to read, draw and edit one source. A spark or an
//     avatar adds a kind and a panel; the node, the plugin, the host and the undo do not change.
//   · Everything a kind knows comes from the engine's own kernel
//     (lib/authoring/inline-editors.js → lib/core/inline-pills.js), never a second parser
//     (HARD RULES #1, #7).

import { closeHistory, isHistoryTransaction } from 'prosemirror-history';
import { Mark, type Node as PMNode } from 'prosemirror-model';
import { type Command, type EditorState, NodeSelection, Plugin, PluginKey, TextSelection, type Transaction } from 'prosemirror-state';
import type { EditorView, NodeView } from 'prosemirror-view';
import { deckSchema } from './deck-doc';
import { isObjectSource } from './inline-object';
import { PILL_SCOPE } from './pill-sheet';
import { classTokens } from './registers';

/** What the engine reads out of a pill (lib/core/inline-pills.js `resolve`). */
export interface PillFields {
	value: string;
	shape: string;
	c: string | null;
	size: string | null;
	icon: string | null;
}

/** One change to a pill: an absent key leaves the axis alone, `null` returns it to the default. */
export interface PillEdit {
	label?: string;
	shape?: string | null;
	color?: string | null;
	size?: string | null;
	/** An icon name from the icons plugin, or null to take the icon off. */
	icon?: string | null;
}

/** What the engine reads out of a spark (lib/plugins/sparks/sparks.inline.js `read`). */
export interface SparkFields {
	/** The numbers as the author wrote them (`12 14 17`, `72/80`, `72%`). */
	dataText: string;
	data: { kind: 'series'; values: number[] } | { kind: 'ratio'; value: number; target: number; pct: boolean };
	type: string;
	size: string;
	c: string | null;
	fill: boolean;
	zero: boolean;
	markers: string[];
}

/** One change to a spark (lib/plugins/sparks/sparks.inline.js `editSpark`): an absent key leaves the axis alone. */
export interface SparkEdit {
	/** The numbers as an array, or the data text (`72/80`, `72%`, `12 14 17`). */
	data?: string | number[];
	type?: string | null;
	size?: string | null;
	color?: string | null;
	end?: boolean;
	minmax?: boolean;
	fill?: boolean;
	zero?: boolean;
}

/** The kernels the editor reads, as lib/authoring/inline-editors.js exports them. */
export interface InlineKernels {
	spark: {
		read(text: string): SparkFields | null;
		edit(text: string, edit: SparkEdit): string | null;
		element(doc: Document, text: string): HTMLElement | null;
		readonly TYPES: readonly string[];
		readonly SERIES_TYPES: readonly string[];
		readonly SIZES: readonly string[];
		readonly COLORS: readonly string[];
		readonly MARKERS: readonly string[];
		readonly MAX_POINTS: number;
	};
	pill: {
		read(text: string): PillFields | null;
		edit(text: string, edit: PillEdit): string | null;
		/** The same DOM the slide gets (`span.lat-pill[data-shape][data-c]`), or null when it cannot be drawn here. */
		element(doc: Document, text: string): HTMLElement | null;
		readonly SHAPES: readonly string[];
		readonly COLORS: readonly string[];
		readonly SIZES: readonly string[];
		/** A circle or diamond whose label is too long for it (the linter's `pill-shape-crowded`). */
		crowded(fields: PillFields): boolean;
	};
	isLiteralFromSource(source: string): boolean;
	INLINE_CODE_LITERAL: string;
	/**
	 * Is this span a chart row's data record (`{4.2M, target=5.0M}`), which the chart reads itself and
	 * the pill pass leaves alone (lib/core/chart-rows.js `ownsRecordSpan`)? Absent in a kernel set from
	 * before the chart authoring model, which owns nothing.
	 */
	ownsChartRecord?(classTokens: readonly string[], text: string, place: ChartRecordPlace): boolean;
}

/** Where a span sits in its row, as `ownsRecordSpan` asks. */
export interface ChartRecordPlace {
	cell?: boolean;
	depth?: number;
	lastInRow: boolean;
	afterCode?: boolean;
	quoted?: boolean;
	firstList?: boolean;
	/** Is this the row's own lead (its first block), and the code spans in it, with this span's index among them. */
	lead?: boolean;
	leadSpans?: string[];
	at?: number;
	/** The code spans of each enclosing row's lead, outermost first. */
	ancestors?: string[][];
}

// ── The kinds ────────────────────────────────────────────────────────────────

/**
 * One kind of inline object. `read` is also the test of ownership: it returns null for a source the
 * kind does not own, so the registry needs no sigil table of its own.
 */
export interface ObjectKind<F = unknown, E = unknown> {
	readonly id: string;
	/** The fields the engine reads from `src`, or null when this kind does not own it. */
	read(src: string, kernels: InlineKernels): F | null;
	/** The object as the slide draws it, or null when it cannot be drawn here. */
	draw(doc: Document, src: string, kernels: InlineKernels): HTMLElement | null;
	/** The new source after `edit`, or null when nothing should be written. */
	edit(src: string, edit: E, kernels: InlineKernels): string | null;
	/** The accessible name of the object's button. */
	name(fields: F): string;
}

export const pillKind: ObjectKind<PillFields, PillEdit> = {
	id: 'pill',
	read: (src, k) => k.pill.read(src),
	draw: (doc, src, k) => k.pill.element(doc, src),
	edit: (src, edit, k) => k.pill.edit(src, edit),
	name: (f) => `Edit pill ${f.value || 'icon'}`,
};

export const sparkKind: ObjectKind<SparkFields, SparkEdit> = {
	id: 'spark',
	read: (src, k) => k.spark.read(src),
	draw: (doc, src, k) => k.spark.element(doc, src),
	edit: (src, edit, k) => k.spark.edit(src, edit),
	name: (f) => `Edit spark, ${f.type}`,
};

/** Every kind Compose can edit. An avatar is one more entry and one more panel. */
export const OBJECT_KINDS: readonly ObjectKind[] = [pillKind as ObjectKind, sparkKind as ObjectKind];

/** Which kind owns `src`, and the fields it reads. Null when none does (the span stays text). */
export function kindOf(src: string, kernels: InlineKernels): { kind: ObjectKind; fields: unknown } | null {
	if (!isObjectSource(src)) return null;
	for (const kind of OBJECT_KINDS) {
		const fields = kind.read(src, kernels);
		if (fields) return { kind, fields };
	}
	return null;
}

const objectType = () => deckSchema.nodes.inline_object;
const code = () => deckSchema.marks.code;

// ── Text → object ────────────────────────────────────────────────────────────

/** Is this inline node a code span in the deck source: an object, or text carrying the code mark? */
function isCodeish(node: PMNode | null | undefined): boolean {
	return Boolean(node && (node.type === objectType() || (node.isText && code().isInSet(node.marks))));
}

/**
 * Do two neighboring inline nodes WRITE as touching code spans? Both are code spans (one at least an
 * object) and no other mark opens or closes between them. Where one does (`**`{A}`**`{B}`: the closing
 * `**` sits between the backticks), they are already apart and need no space.
 */
export function touchesAsCode(a: PMNode, b: PMNode): boolean {
	if (!isCodeish(a) || !isCodeish(b)) return false;
	if (a.type !== objectType() && b.type !== objectType()) return false;
	const plain = (n: PMNode) => n.marks.filter((m) => m.type !== code());
	return Mark.sameSet(plain(a), plain(b));
}

/** Where a `<pos>` lies in `doc` as indexes of the slides it touches. */
function slidesTouching(doc: PMNode, ranges: readonly { from: number; to: number }[]): Set<number> {
	const out = new Set<number>();
	doc.forEach((slide, offset, index) => {
		const from = offset;
		const to = offset + slide.nodeSize;
		if (ranges.some((r) => r.from <= to && r.to >= from)) out.add(index);
	});
	return out;
}

/**
 * The slides a batch of transactions touched: where they changed the document, and where the selection
 * was and is. An edit-time pass looks only there, so it can never re-serialize a slide the author did
 * not touch (a slide that gets new nodes is re-serialized, not re-emitted from its cached bytes).
 */
function touchedSlides(trs: readonly Transaction[], oldState: EditorState, state: EditorState): Set<number> {
	let ranges: { from: number; to: number }[] = [{ from: oldState.selection.from, to: oldState.selection.to }];
	for (const tr of trs) {
		for (const map of tr.mapping.maps) {
			ranges = ranges.map((r) => ({ from: map.map(r.from, -1), to: map.map(r.to, 1) }));
			map.forEach((_a, _b, from, to) => {
				ranges.push({ from, to });
			});
		}
	}
	ranges.push({ from: state.selection.from, to: state.selection.to });
	return slidesTouching(state.doc, ranges);
}

export interface NormalizeOptions {
	/**
	 * Leave a span alone while the selection touches it (default). An edit-time pass wants that: the author
	 * is in the span, and typing at an edge extends the code mark. The silent passes (kernels loaded,
	 * deck resynced) do NOT: a fresh editor state has its selection at the start of the document, and a
	 * pill sitting there would stay text and then convert, unsilenced, on the first click.
	 */
	sparing?: boolean;
	/** Only these slides (by index). Default: every slide. */
	slides?: ReadonlySet<number>;
}

/**
 * Is this code-marked run a chart row's data record: the last thing in a list row's lead (or the whole of a
 * table cell) of a chart slide, with no code run right before it, outside a quote, in the slide's first list,
 * on a row that is data and not the detail of a valued row? Then the chart reads it and it stays a code span,
 * as the engine leaves it (`ownsRecordSpan`). The twin of the engine's token check, the runtime's DOM check
 * and lint's source check.
 */
function ownsRecord(doc: PMNode, from: number, index: number, node: PMNode, directives: string[], kernels: InlineKernels): boolean {
	if (!kernels.ownsChartRecord) return false;
	const codeMark = deckSchema.marks.code;
	// A span wrapped in emphasis or a link is not the row's last child in the engine's token stream.
	if (node.marks.length !== 1 || !codeMark.isInSet(node.marks)) return false;
	const $at = doc.resolve(from);
	const row = $at.parent;
	const cell = row.type.name === 'table_cell';
	const inItem = (row.type.name === 'paragraph' || row.type.name === 'heading') && $at.depth >= 2 && $at.node($at.depth - 1).type.name === 'list_item';
	if (!cell && !inItem) return false;
	const blank = (n: PMNode) => n.isText && !(n.text ?? '').trim();
	let lastInRow = true;
	for (let i = index + 1; i < row.childCount; i++) if (!blank(row.child(i))) lastInRow = false;
	let prev = index - 1;
	while (prev >= 0 && blank(row.child(prev))) prev--;
	if (cell && prev >= 0) lastInRow = false; // the record is the whole cell
	let depth = 0;
	let quoted = false;
	const ancestors: string[][] = [];
	for (let d = 1; d <= $at.depth; d++) {
		const anc = $at.node(d);
		if (anc.type.name === 'blockquote') quoted = true;
		if (anc.type.name !== 'list_item') continue;
		depth++;
		// An enclosing item's lead spans: the code runs of its first paragraph or heading.
		if (d < $at.depth - 1) {
			const lead = anc.firstChild;
			ancestors.push(lead && (lead.type.name === 'paragraph' || lead.type.name === 'heading') ? codeSpans(lead) : []);
		}
	}
	// Only the slide's first list is the chart's (`spliceFirstList`): no list before this one in the slide.
	let firstList = true;
	if ($at.depth >= 2) {
		const slide = $at.node(1);
		const here = $at.index(1);
		// A list inside an earlier quote counts, as it does for the engine; a grid chart owns the first table only.
		const kind = cell ? /^table$/ : /_list$/;
		for (let i = 0; i < here; i++) {
			const child = slide.child(i);
			let found = kind.test(child.type.name);
			if (!found && child.type.name === 'blockquote') child.descendants((n) => { if (kind.test(n.type.name)) found = true; return !found; });
			if (found) firstList = false;
		}
	}
	// The row's lead is its item's first block; only there does a span count as the row's value or record.
	const item = inItem ? $at.node($at.depth - 1) : null;
	const isLead = Boolean(item && item.firstChild === row);
	const leadSpans = isLead ? codeSpans(row) : [];
	let at = -1;
	if (isLead) {
		let n = 0;
		row.forEach((child, _o, i) => {
			if (!isCodeish(child)) return;
			if (i === index) at = n;
			n++;
		});
	}
	return kernels.ownsChartRecord(classTokens(directives), node.text ?? '', {
		lead: cell ? undefined : isLead,
		leadSpans,
		at,
		cell,
		depth,
		lastInRow,
		quoted,
		firstList,
		ancestors,
		// An object already drawn from an earlier span (a pill) was code in the source, as it is for the engine.
		afterCode: prev >= 0 && (codeMark.isInSet(row.child(prev).marks) !== undefined || row.child(prev).type === objectType()),
	});
}

/** The source text of each code span in a block: a code-marked run, or a drawn object's `src`. */
function codeSpans(block: PMNode): string[] {
	const out: string[] = [];
	block.forEach((child) => {
		if (child.type === objectType()) out.push(String(child.attrs.src ?? ''));
		else if (child.isText && code().isInSet(child.marks)) out.push(child.text ?? '');
	});
	return out;
}

/**
 * The transaction that turns every code span the engine reads as an object into a node, and keeps
 * two code spans from touching, or null when there is nothing to do. A span is skipped when:
 *   · the selection touches it and `sparing` is on (see NormalizeOptions);
 *   · its slide is locked (edited in Markdown; the structural guard would refuse, and a locked
 *     slide must keep its node identity so `emitDeck` re-emits its `raw` bytes);
 *   · the deck or the slide turned the inline grammar off (`inline-code: literal`);
 *   · it is not one whole code-marked run (two spans that merged into one run stay text).
 * Other marks (bold, italic) stay on the node, so `**`{X}`**` round-trips.
 *
 * KEEPING SPANS APART. Two code spans cannot touch in Markdown: `` `{A}``{B}` `` is ONE span, so an
 * object beside another object (or beside code text) would be written as one span and both would stop
 * being pills on the next load. Reached by inserting a pill after one, or by deleting the text between
 * two. A single space goes between them (carrying the object's own marks), and `serializeInlineObject`
 * does the same as a last resort.
 */
export function normalizeObjects(state: EditorState, kernels: InlineKernels, deckLiteral: boolean, opts: NormalizeOptions = {}): Transaction | null {
	const sparing = opts.sparing ?? true;
	const codeMark = code();
	const type = objectType();
	const sel = state.selection;
	const found: { from: number; to: number; src: string; marks: readonly Mark[] }[] = [];
	// Objects in a place the engine draws no pills (the deck or the slide is `inline-code: literal`), which
	// a paste can bring in from another deck: they go back to the code span they are.
	const strays: { from: number; to: number; src: string; marks: readonly Mark[] }[] = [];
	state.doc.forEach((slide, offset, index) => {
		if (slide.type.name !== 'slide' || slide.attrs.locked) return;
		if (opts.slides && !opts.slides.has(index)) return;
		const literal = deckLiteral || ((slide.attrs.directives as string[]) || []).some((d) => d.includes(kernels.INLINE_CODE_LITERAL));
		slide.descendants((node, pos, _parent, at) => {
			const from = offset + 1 + pos;
			if (literal) {
				if (node.type === type) strays.push({ from, to: from + 1, src: node.attrs.src as string, marks: node.marks });
				return;
			}
			if (!node.isText || !node.text || !codeMark.isInSet(node.marks)) return;
			// The sigil first: the cheapest reject, before the kernel is asked anything.
			const c = node.text.charCodeAt(0);
			if (c !== 0x7b && c !== 0x7e && c !== 0x21) return;
			const to = from + node.nodeSize;
			if (sparing && sel.from <= to && sel.to >= from) return;
			if (!kindOf(node.text, kernels)) return;
			if (ownsRecord(state.doc, from, at, node, slide.attrs.directives as string[], kernels)) return;
			found.push({ from, to, src: node.text, marks: node.marks.filter((m) => m.type !== codeMark) });
		});
	});
	const tr = state.tr;
	// Back to front, so each replacement leaves the positions of the ones before it alone.
	const edits = [
		...found.map((f) => ({ ...f, make: () => type.create({ src: f.src }, null, f.marks) })),
		...strays.map((f) => ({ ...f, make: () => deckSchema.text(f.src, codeMark.create().addToSet([...f.marks])) })),
	].sort((a, b) => b.from - a.from);
	for (const e of edits) tr.replaceWith(e.from, e.to, e.make());
	// Then keep code spans apart, on the document as it now stands, back to front for the same reason.
	const gaps: { pos: number; marks: readonly Mark[] }[] = [];
	tr.doc.forEach((slide, offset, index) => {
		if (slide.type.name !== 'slide' || slide.attrs.locked || (opts.slides && !opts.slides.has(index))) return;
		slide.descendants((block, pos) => {
			if (!block.isTextblock) return;
			let at = offset + 1 + pos + 1;
			let prev: PMNode | null = null;
			block.forEach((child) => {
				if (prev && touchesAsCode(prev, child)) gaps.push({ pos: at, marks: child.marks.filter((m) => m.type !== codeMark) });
				at += child.nodeSize;
				prev = child;
			});
			return false;
		});
	});
	// The caret keeps its place BEFORE a space put in at it. A step mapping moves a cursor past an insertion
	// at its position, so typing code just before a pill (where the space has to go) would carry the caret
	// out of the code span and every later keystroke would land outside it.
	const before = tr.selection;
	const stepsBefore = tr.steps.length;
	for (let i = gaps.length - 1; i >= 0; i--) tr.insert(gaps[i].pos, deckSchema.text(' ', gaps[i].marks));
	if (gaps.length && before instanceof TextSelection) {
		const m = tr.mapping.slice(stepsBefore);
		tr.setSelection(TextSelection.create(tr.doc, m.map(before.anchor, -1), m.map(before.head, -1)));
	}
	return tr.docChanged ? tr : null;
}

// ── The open editor ──────────────────────────────────────────────────────────
//
// The object being edited is a POSITION in plugin state, mapped through every transaction and
// checked against the node that sits there. It closes when that node is gone or is not the one it
// was, and when the selection leaves it. Held anywhere else (React state, a ref) a position goes
// stale the moment the author types earlier on the line.

export interface OpenObject {
	pos: number;
	/** The source as the document has it now (it changes with every edit the editor makes). */
	src: string;
	/** A new number per open, so a tap on a different object remounts the editor on it. */
	id: number;
}

interface ObjectsState {
	open: OpenObject | null;
	nextId: number;
	/**
	 * Was the document's last change an undo or a redo? While it was, the edit-time pass stays out: a pass
	 * after an undo is a NEW edit in the history, and it would clear the redo stack on a plain click.
	 * The next change the author makes themselves clears the flag.
	 */
	afterHistory: boolean;
}

type ObjectsMeta = { open: number } | { close: true } | { edited: true } | { silent: true };

export const objectsKey = new PluginKey<ObjectsState>('inlineObjects');

/** The object the editor is open on, as the document stands now. */
export function openObject(state: EditorState): OpenObject | null {
	return objectsKey.getState(state)?.open ?? null;
}

/** Select the object at `pos` and open its editor. */
export function openObjectEditor(view: EditorView, pos: number): boolean {
	const node = view.state.doc.nodeAt(pos);
	if (node?.type !== objectType()) return false;
	view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)).setMeta(objectsKey, { open: pos } satisfies ObjectsMeta));
	return true;
}

export function closeObjectEditor(view: EditorView): void {
	if (openObject(view.state)) view.dispatch(view.state.tr.setMeta(objectsKey, { close: true } satisfies ObjectsMeta));
}

/**
 * Close the editor and put the caret just after the object. A selected node stays selected, and the
 * next keystroke would replace it, so "Done" must move the selection off it, not just hide the panel.
 */
export function leaveObject(view: EditorView): void {
	const open = openObject(view.state);
	if (!open) return;
	const at = Math.min(open.pos + 1, view.state.doc.content.size);
	view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at), 1)).setMeta(objectsKey, { close: true } satisfies ObjectsMeta));
}

/** Was this transaction one of the silent passes (kernels loaded, deck resynced)? Those change how a slide is represented, not what it says. */
export function isSilentPass(tr: Transaction): boolean {
	return Boolean((tr.getMeta(objectsKey) as { silent?: boolean } | undefined)?.silent);
}

/**
 * Turn every eligible code span into an object, outside the author's history and without emitting
 * (the caller re-points its emit baseline at the new slide nodes). Returns whether anything changed.
 */
export function normalizeDeck(view: EditorView, kernels: InlineKernels, deckLiteral: boolean): boolean {
	const tr = normalizeObjects(view.state, kernels, deckLiteral, { sparing: false });
	if (!tr) return false;
	view.dispatch(tr.setMeta('addToHistory', false).setMeta(objectsKey, { silent: true } satisfies ObjectsMeta));
	return true;
}

// ── The writes ───────────────────────────────────────────────────────────────

/**
 * Apply `edit` to the object at `pos`. Returns whether something was written or the object already
 * said that. False means nothing was written: the node is gone, the kernel declined (it would rather
 * leave a source alone than guess), or the structural guard refused the transaction.
 */
export function editObject(view: EditorView, pos: number, edit: unknown, kernels: InlineKernels): boolean {
	const node = view.state.doc.nodeAt(pos);
	if (node?.type !== objectType()) return false;
	const src = node.attrs.src as string;
	const owner = kindOf(src, kernels);
	if (!owner) return false;
	const out = owner.kind.edit(src, edit, kernels);
	if (out === null || !isObjectSource(out) || !kindOf(out, kernels)) return false;
	if (out === src) return true;
	// A pick is its own undo step: close the open history group first, so it never joins the typing before it.
	view.dispatch(closeHistory(view.state.tr));
	const tr = view.state.tr.replaceWith(pos, pos + 1, objectType().create({ src: out }, null, node.marks));
	// A replaced node is a deleted one to the selection's mapping, so say where the selection is.
	tr.setSelection(NodeSelection.create(tr.doc, pos)).setMeta(objectsKey, { edited: true } satisfies ObjectsMeta);
	view.dispatch(tr);
	// A locked slide's guard hands the unchanged state back; say so rather than report a write.
	return view.state.doc.nodeAt(pos)?.attrs.src === out;
}

/** "Edit as text": turn the object back into its code span and select what is between the braces. */
export function editObjectAsText(view: EditorView, pos: number): boolean {
	const node = view.state.doc.nodeAt(pos);
	if (node?.type !== objectType()) return false;
	const src = node.attrs.src as string;
	const tr = view.state.tr.replaceWith(pos, pos + 1, deckSchema.text(src, code().create().addToSet(node.marks)));
	const inner = pos + src.indexOf('{') + 1;
	tr.setSelection(TextSelection.create(tr.doc, inner, pos + src.length - 1)).setMeta(objectsKey, { close: true } satisfies ObjectsMeta);
	view.dispatch(tr.scrollIntoView());
	view.focus();
	return view.state.doc.nodeAt(pos)?.type !== objectType();
}

/**
 * Why the "+ Pill" door cannot insert here, in words the author can use, or null when it can. Declines in
 * a fenced block, across blocks, inside the author's own code span (the new object would split it), in a
 * locked slide, and where the engine draws no pills (`inline-code: literal`, deck or slide), where an
 * object would be drawn here as a pill the slide does not draw.
 */
export function insertBlocker(state: EditorState, kernels: InlineKernels | null, deckLiteral: boolean, noun = 'pill'): string | null {
	if (!kernels) return `The ${noun} editor is still loading.`;
	const { $from, $to, empty } = state.selection;
	if ($from.node(1)?.attrs.locked) return `This slide is edited in Markdown, so ${noun}s cannot be added here.`;
	if (deckLiteral || (($from.node(1)?.attrs.directives as string[]) || []).some((d) => d.includes(kernels.INLINE_CODE_LITERAL))) return `${noun[0].toUpperCase()}${noun.slice(1)}s are turned off here (inline-code: literal).`;
	if (!$from.parent.inlineContent || $from.parent.type.spec.code || !$from.sameParent($to) || !$from.parent.canReplaceWith($from.index(), $to.index(), objectType())) return `Put the cursor in plain text on one line to insert a ${noun}.`;
	// Inside the author's own code span the new object would split it in two.
	const before = $from.nodeBefore;
	const after = $to.nodeAfter;
	if (empty && before?.isText && after?.isText && isCodeish(before) && isCodeish(after)) return `The cursor is inside a code span. Move it outside to insert a ${noun}.`;
	// A selection that reaches into the author's code span would split it too, at either end.
	for (const $p of [$from, $to]) {
		if (!empty && $p.nodeBefore?.isText && $p.nodeAfter?.isText && isCodeish($p.nodeBefore) && isCodeish($p.nodeAfter)) return `The selection ends inside a code span. Move it outside to insert a ${noun}.`;
	}
	if (!empty && $from.nodeBefore?.isText && $from.nodeAfter?.isText && isCodeish($from.nodeAfter) && $from.nodeAfter === $to.nodeAfter) return `The selection is inside a code span. Move it outside to insert a ${noun}.`;
	return null;
}

/**
 * The "+ Pill" door: put a new pill at the caret and open its editor on it. A selected word becomes
 * the label (a short, plain selection only), so "make this a pill" is one tap. `insertBlocker` says
 * when it declines. At a code span's edge, or beside another object, a space keeps the two code spans
 * apart (`{A}``{B}` is one span in Markdown).
 */
export function insertObject(getKernels: () => InlineKernels | null, opts: { sample?: string; getDeckLiteral?: () => boolean; kind?: 'pill' | 'spark' } = {}): Command {
	return (state, dispatch) => {
		const kernels = getKernels();
		const spark = opts.kind === 'spark';
		if (insertBlocker(state, kernels, opts.getDeckLiteral?.() ?? false, spark ? 'spark' : 'pill') || !kernels) return false;
		const { $from, $to, from, to, empty } = state.selection;
		const picked = empty ? '' : state.doc.textBetween(from, to, ' ').trim();
		const label = picked && picked.length <= 40 && !/\n/.test(picked) ? picked : (opts.sample ?? 'Status');
		// A spark starts as a small rising line: the author edits the numbers, the shape is already right. A selected
		// word is left where it is (a number has no place in a label), so the spark goes in after it.
		const src = spark ? SPARK_SAMPLE : kernels.pill.edit('{X}', { label });
		if (!src || !isObjectSource(src) || !kindOf(src, kernels)) return false;
		if (dispatch) {
			const node = objectType().create({ src });
			// A spark goes after the word the caret is in, never through it.
			const rest = spark && $to.nodeAfter?.isText && !isCodeish($to.nodeAfter) ? /^\S*/.exec($to.nodeAfter.text ?? '')?.[0].length ?? 0 : 0;
			const at0 = spark ? $to.pos + rest : from;
			const end0 = spark ? at0 : to;
			const $at = spark ? state.doc.resolve(at0) : $from;
			const before = $at.nodeBefore;
			const after = spark ? $at.nodeAfter : $to.nodeAfter;
			// A spark sits beside words, so it follows one with a space; a pill is meant to be flush with its text.
			const needsGap = spark && Boolean(before?.isText && before.text && !/\s$/.test(before.text) && !isCodeish(before));
			const lead = needsGap || Boolean(before && touchesAsCode(before, node));
			const trail = Boolean(after && touchesAsCode(node, after));
			const space = () => deckSchema.text(' ');
			const tr = state.tr.replaceWith(at0, end0, [...(lead ? [space()] : []), node, ...(trail ? [space()] : [])]);
			const at = at0 + (lead ? 1 : 0);
			tr.setSelection(NodeSelection.create(tr.doc, at)).setMeta(objectsKey, { open: at } satisfies ObjectsMeta);
			dispatch(tr.scrollIntoView());
		}
		return true;
	};
}

/** What "+ Spark" inserts: a short rising line, readable on a slide the moment it lands. */
export const SPARK_SAMPLE = '~{12 14 13 17 21}';

// ── What Compose shows ───────────────────────────────────────────────────────

/** The live node views, so a change in what can be drawn (the pill sheet becoming ready) repaints them all. */
const liveViews = new Set<ObjectView>();

/** Repaint every object (the pill sheet became ready, or changed). */
export function repaintObjects(): void {
	for (const v of liveViews) v.paint();
}

export interface ObjectViewDeps {
	getKernels: () => InlineKernels | null;
	/** Is the pill sheet ready, so an object can be drawn as the slide draws it? */
	isRendered: () => boolean;
}

/**
 * The node view: the object drawn as the slide draws it, inside one button. A tap selects the node
 * and opens its editor. Until the pill sheet is ready the button shows the source text, so the
 * object is still there to tap.
 */
class ObjectView implements NodeView {
	dom: HTMLElement;
	private btn: HTMLButtonElement;
	private node: PMNode;

	constructor(
		node: PMNode,
		private view: EditorView,
		private getPos: () => number | undefined,
		private deps: ObjectViewDeps,
	) {
		this.node = node;
		this.dom = document.createElement('span');
		this.dom.contentEditable = 'false';
		this.btn = document.createElement('button');
		this.btn.type = 'button';
		this.btn.className = 'cs-npill-btn';
		// A press on the button must not move the editor's caret or raise a touch keyboard: the
		// selection becomes the node, in the click below.
		this.btn.addEventListener('mousedown', (e) => e.preventDefault());
		this.btn.addEventListener('click', (e) => {
			e.preventDefault();
			const pos = this.getPos();
			if (typeof pos === 'number') openObjectEditor(this.view, pos);
		});
		this.dom.append(this.btn);
		liveViews.add(this);
		this.paint();
	}

	paint(): void {
		const src = this.node.attrs.src as string;
		const kernels = this.deps.getKernels();
		const owner = kernels ? kindOf(src, kernels) : null;
		this.btn.replaceChildren();
		this.btn.setAttribute('aria-label', owner ? owner.kind.name(owner.fields) : 'Edit inline object');
		this.btn.title = 'Edit this one';
		this.dom.className = 'cs-npill';
		const real = kernels && owner && this.deps.isRendered() ? owner.kind.draw(document, src, kernels) : null;
		if (!real) {
			// Not drawable yet (or here): the source in the code face, still one tappable thing.
			this.dom.classList.add('cs-npill-text');
			const c = document.createElement('code');
			c.textContent = src;
			this.btn.append(c);
			return;
		}
		this.dom.classList.add(PILL_SCOPE);
		// The engine writes every pill rule under `article.lattice > section …`, so the pill needs that
		// ancestry to be styled. The two wrappers are `display: contents`: they add no box, and the
		// engine's own rules for `article` and `section` are not in the pill sheet, so they add no look.
		const article = document.createElement('article');
		article.className = 'lattice';
		article.style.display = 'contents';
		const section = document.createElement('section');
		section.style.display = 'contents';
		section.append(real);
		article.append(section);
		this.btn.append(article);
	}

	update(node: PMNode): boolean {
		if (node.type !== this.node.type) return false;
		if (node.attrs.src !== this.node.attrs.src) {
			this.node = node;
			this.paint();
		}
		return true;
	}

	// Events on the button are ours (the click above); the editor leaves them alone.
	stopEvent(e: Event): boolean {
		return e.target instanceof Node && this.btn.contains(e.target);
	}

	ignoreMutation(): boolean {
		return true;
	}

	destroy(): void {
		liveViews.delete(this);
	}
}

/** The `nodeViews` entry for the inline object node. */
export function objectNodeView(deps: ObjectViewDeps) {
	return (node: PMNode, view: EditorView, getPos: () => number | undefined): NodeView => new ObjectView(node, view, getPos, deps);
}

export interface ObjectsPluginOptions {
	getKernels: () => InlineKernels | null;
	/** Does the deck's front matter turn the inline grammar off? Read when a span is considered. */
	getDeckLiteral: () => boolean;
	/** The open editor changed (opened, followed an edit, or closed). Called with the current value. */
	onOpenChange: (open: OpenObject | null) => void;
}

/**
 * Keeps text and objects in step as the author edits, and owns the open editor's position.
 * `onOpenChange` hears about every change to it.
 */
export function inlineObjectsPlugin(opts: ObjectsPluginOptions): Plugin<ObjectsState> {
	return new Plugin<ObjectsState>({
		key: objectsKey,
		state: {
			init: () => ({ open: null, nextId: 1, afterHistory: false }),
			apply(tr, prev, _old, next) {
				// An undo or redo sets the flag; the author's own next change clears it. The silent passes
				// change representation only, so they leave it alone.
				const afterHistory = tr.docChanged && !isSilentPass(tr) ? isHistoryTransaction(tr) : prev.afterHistory;
				const value = afterHistory === prev.afterHistory ? prev : { ...prev, afterHistory };
				const meta = tr.getMeta(objectsKey) as ObjectsMeta | undefined;
				if (meta && 'open' in meta) {
					const src = next.doc.nodeAt(meta.open)?.attrs.src;
					return typeof src === 'string' ? { ...value, open: { pos: meta.open, src, id: value.nextId }, nextId: value.nextId + 1 } : value;
				}
				if (meta && 'close' in meta) return value.open ? { ...value, open: null } : value;
				let open = value.open;
				if (open) {
					const pos = tr.docChanged ? tr.mapping.map(open.pos, 1) : open.pos;
					const node = next.doc.nodeAt(pos);
					const sel = next.selection;
					// Still the object it was opened on, and still the selected node?
					const here = node?.type === objectType() && sel instanceof NodeSelection && sel.from === pos;
					if (!here) {
						open = null;
					} else if (pos !== open.pos || node?.attrs.src !== open.src) {
						open = { ...open, pos, src: node?.attrs.src as string };
					}
				}
				return open === value.open ? value : { ...value, open };
			},
		},
		props: {
			// Enter on a selected object opens its editor: the keyboard's way in (arrow keys step over it).
			handleKeyDown(view, event) {
				const sel = view.state.selection;
				if (event.key !== 'Enter' || !(sel instanceof NodeSelection) || sel.node.type !== objectType()) return false;
				event.preventDefault();
				return openObjectEditor(view, sel.from);
			},
		},
		appendTransaction(trs, old, state) {
			if (!trs.some((t) => t.docChanged || t.selectionSet)) return null;
			// The silent passes are not the author's edits.
			if (trs.some((t) => isSilentPass(t))) return null;
			// After an undo or redo the document holds a state the history already knows. A pass now would
			// be a NEW edit in it, and a plain click would cost the author their redo stack. Spans left as
			// text wait for the author's next change of their own.
			if (objectsKey.getState(state)?.afterHistory) return null;
			const kernels = opts.getKernels();
			if (!kernels) return null;
			// Only where the author was and what they changed: a slide that gets new nodes is re-serialized.
			return normalizeObjects(state, kernels, opts.getDeckLiteral(), { slides: touchedSlides(trs, old, state) });
		},
		view() {
			return {
				update(view, prev) {
					const now = objectsKey.getState(view.state)?.open ?? null;
					const was = objectsKey.getState(prev)?.open ?? null;
					if (now !== was) opts.onOpenChange(now);
				},
			};
		},
	});
}
