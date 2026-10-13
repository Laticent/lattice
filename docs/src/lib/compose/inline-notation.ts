// COMPOSE INLINE NOTATION — the pill editor's half that lives in the document.
//
// Compose shows a pill (`{SHIPPED, c2}`) as raw monospace code. This module finds the spans the
// engine reads as pills and paints one small button after each; the button opens the pill editor
// (components/studio/PillEditor.tsx). It also owns the two writes the editor makes: replace one
// word of a span, and insert a new pill.
//
// Design: engineering/decisions/2026-10-13-compose-inline-notation-editors.md.
//   · The chip is a VIEW-ONLY widget decoration (axis A1). The document, the schema and the
//     serializer are untouched, and the raw span stays visible and editable, so the text door is
//     always there (promise 3). It follows the pane bar's pattern: `stopEvent`, `ignoreSelection`.
//   · Everything the editor knows about a pill comes from the engine's own kernel
//     (lib/authoring/inline-editors.js → lib/core/inline-pills.js), never a second parser
//     (HARD RULES #1, #7). `kernels` is null until the authoring bundle has loaded; the plugin
//     paints nothing until then and the host nudges it when the kernels arrive.
//   · A write is one transaction that replaces the span's text and keeps the code mark. The
//     kernel changes only the words the author changed (axis C1), or returns null, and a null
//     writes nothing.

import { closeHistory } from 'prosemirror-history';
import type { Mark, Node as PMNode } from 'prosemirror-model';
import { type Command, type EditorState, Plugin, PluginKey, TextSelection, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { deckSchema } from './deck-doc';
import { PILL_SCOPE } from './pill-sheet';

/** What the engine reads out of a pill span (lib/core/inline-pills.js `resolve`). */
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
}

/** The kernels the editor reads, as lib/authoring/inline-editors.js exports them. */
export interface InlineKernels {
	pill: {
		read(text: string): PillFields | null;
		edit(text: string, edit: PillEdit): string | null;
		/** The same DOM the slide gets (`span.lat-pill[data-shape][data-c]`), or null when it cannot be drawn here. */
		element(doc: Document, text: string): HTMLElement | null;
		readonly SHAPES: readonly string[];
		readonly COLORS: readonly string[];
		readonly SIZES: readonly string[];
	};
	isLiteralFromSource(source: string): boolean;
	INLINE_CODE_LITERAL: string;
}

/** A pill span in the document: the whole text node of one code-marked run. */
export interface PillSpan {
	from: number;
	to: number;
	text: string;
	fields: PillFields;
	/** The slide is edited in Markdown (a construct Compose cannot round-trip). */
	locked: boolean;
}

export interface SpanRange {
	from: number;
	to: number;
}

const code = () => deckSchema.marks.code;

/**
 * Every pill the engine draws, in document order. A span is skipped when the engine would not
 * draw it: the kernel refuses it, or the deck (`deckLiteral`) or the slide
 * (`<!-- _class: inline-code-literal -->`) turned the inline grammar off. A slide Compose cannot
 * round-trip still lists its pills, marked `locked`, so the chip can say why it is disabled.
 */
export function findPillSpans(doc: PMNode, kernels: InlineKernels, deckLiteral: boolean): PillSpan[] {
	if (deckLiteral) return [];
	const spans: PillSpan[] = [];
	const codeMark = code();
	doc.forEach((slide, offset) => {
		if (slide.type.name !== 'slide') return;
		const directives = (slide.attrs.directives as string[]) || [];
		if (directives.some((d) => d.includes(kernels.INLINE_CODE_LITERAL))) return;
		const locked = Boolean(slide.attrs.locked);
		slide.descendants((node, pos) => {
			// `{` first: the kernel's own O(1) reject, applied before any marks are looked at.
			if (!node.isText || !node.text || node.text.charCodeAt(0) !== 0x7b || !codeMark.isInSet(node.marks)) return;
			const fields = kernels.pill.read(node.text);
			if (!fields) return;
			const from = offset + 1 + pos;
			spans.push({ from, to: from + node.nodeSize, text: node.text, fields, locked });
		});
	});
	return spans;
}

/** The pill at exactly `range`, or null when the document no longer has one there. */
export function pillAt(doc: PMNode, range: SpanRange, kernels: InlineKernels): PillSpan | null {
	if (range.from < 0 || range.to > doc.content.size || range.from >= range.to) return null;
	// `nodeAt` answers with the text node that CONTAINS the position, so a range that has slipped
	// left of the pill (by an edit before it) would still pass the size test below; `textOffset`
	// is how far into that node the position is, and it must be 0.
	if (doc.resolve(range.from).textOffset !== 0) return null;
	const node = doc.nodeAt(range.from);
	if (!node?.isText || !node.text || node.nodeSize !== range.to - range.from || !code().isInSet(node.marks)) return null;
	const fields = kernels.pill.read(node.text);
	if (!fields) return null;
	const slide = doc.resolve(range.from).node(1);
	return { from: range.from, to: range.to, text: node.text, fields, locked: Boolean(slide?.attrs.locked) };
}

// ── The write ────────────────────────────────────────────────────────────────

/**
 * Apply `edit` to the pill at `range`. Returns the pill's new range and text, or null when nothing
 * was written: the span is gone, the kernel declined the edit (it would rather leave a span alone
 * than guess), or the slide is locked and the structural guard refused the transaction.
 */
export function applyPillEdit(view: EditorView, range: SpanRange, edit: PillEdit, kernels: InlineKernels): (SpanRange & { text: string }) | null {
	const cur = pillAt(view.state.doc, range, kernels);
	if (!cur || cur.locked) return null;
	const out = kernels.pill.edit(cur.text, edit);
	if (out === null) return null;
	if (out === cur.text) return { ...range, text: out };
	// Close the open history group first, so a pick is its own undo step and never joins the typing before it.
	view.dispatch(closeHistory(view.state.tr));
	view.dispatch(view.state.tr.replaceWith(range.from, range.to, deckSchema.text(out, [code().create()])));
	// A locked slide's guard hands the unchanged state back; say so rather than report a write.
	const now = pillAt(view.state.doc, { from: range.from, to: range.from + out.length }, kernels);
	return now?.text === out ? { from: range.from, to: range.from + out.length, text: out } : null;
}

/** Select the text between the braces, so the author can type over it: the "edit as text" door. */
export function selectPillText(view: EditorView, range: SpanRange): void {
	const inner = Math.min(range.from + 1, range.to);
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, inner, Math.max(inner, range.to - 1))).scrollIntoView());
	view.focus();
}

// ── The open editor's range ──────────────────────────────────────────────────
//
// The pill being edited is a RANGE in the document, and the document keeps moving while the editor
// is open: the author can type earlier on the line, undo, or take a collaborator's edit. The range
// therefore lives in plugin state and is mapped through every transaction, so it always names the
// pill it was opened on. A transaction that deletes into the pill collapses it, and the state
// closes; so does a resync, which rebuilds the plugin state. Held anywhere else (a React state, a
// ref), the range went stale and the next write spliced into the wrong bytes.

export interface OpenPill extends SpanRange {
	/** A new number per open, so a click on a different pill remounts the editor on it. */
	id: number;
}

interface NotationState {
	open: OpenPill | null;
	nextId: number;
}

type NotationMeta = { open: SpanRange } | { close: true };

export const notationKey = new PluginKey<NotationState>('inlineNotation');

/** Open the pill editor on the span at `range`, as part of `tr`. */
export function requestPillEditor(tr: Transaction, range: SpanRange): Transaction {
	return tr.setMeta(notationKey, { open: range } satisfies NotationMeta);
}

/** The pill the editor is open on, with its range as the document stands now. */
export function openPill(state: EditorState): OpenPill | null {
	return notationKey.getState(state)?.open ?? null;
}

export function openPillEditor(view: EditorView, range: SpanRange): void {
	view.dispatch(requestPillEditor(view.state.tr, range));
}

export function closePillEditor(view: EditorView): void {
	if (openPill(view.state)) view.dispatch(view.state.tr.setMeta(notationKey, { close: true } satisfies NotationMeta));
}

/**
 * The "+ Pill" door: put a new pill at the caret and open its editor on it. A selected word
 * becomes the label (a short, plain selection only), so "make this a pill" is one click.
 * Declines inside a fenced block and in a locked slide, where the structural guard would refuse it.
 */
export function insertPill(getKernels: () => InlineKernels | null, sample = 'Status'): Command {
	return (state, dispatch) => {
		const kernels = getKernels();
		if (!kernels) return false;
		const { $from, $to, from, to, empty } = state.selection;
		if (!$from.parent.inlineContent || $from.parent.type.spec.code) return false;
		if ($from.node(1)?.attrs.locked) return false;
		// A selection across blocks would be replaced with one pill and merge the paragraphs.
		if (!$from.sameParent($to)) return false;
		// Inside or against an inline code span the new code text would MERGE into the author's span
		// (`abc|def` becoming `abc{Status}def`), so the door declines there; the caller says why.
		const codeMark = code();
		const touchesCode = [$from.nodeBefore, $from.nodeAfter, $to.nodeBefore, $to.nodeAfter].some((n) => n && codeMark.isInSet(n.marks)) || state.doc.rangeHasMark(from, to, codeMark) || Boolean(state.storedMarks && codeMark.isInSet(state.storedMarks));
		if (touchesCode) return false;
		const picked = empty ? '' : state.doc.textBetween(from, to, ' ').trim();
		const label = picked && picked.length <= 40 && !/\n/.test(picked) ? picked : sample;
		const text = kernels.pill.edit('{X}', { label });
		if (!text || !kernels.pill.read(text)) return false;
		if (dispatch) {
			const tr = state.tr.replaceSelectionWith(deckSchema.text(text, [code().create()]), false);
			tr.removeStoredMark(code()); // typing after the pill must not continue the code span
			dispatch(requestPillEditor(tr, { from, to: from + text.length }).scrollIntoView());
		}
		return true;
	};
}

// ── What Compose shows ───────────────────────────────────────────────────────
//
// THE PILL, NOT ITS GRAMMAR (owner, 2026-10-13). Where the pill sheet is ready, a pill is drawn
// as the slide draws it and its source text is hidden. The text comes back, with a small tag
// button for the editor, whenever the selection touches the span, so every way of editing the text
// still works and nothing is ever edited unseen. A click on the drawn pill opens the editor and
// does not move the caret. Where the sheet is not ready, the text stays and so does the button.

/**
 * Does the selection touch `span` closely enough that its text must be on screen? A caret at either
 * edge counts (typing there extends the code mark, so the author must see the braces), and so does
 * a range that cuts into the span. A range that swallows the whole span does not: the pill is
 * drawn selected, and a Delete takes the whole pill with it.
 */
export function touchesSpan(sel: { from: number; to: number; empty: boolean }, span: SpanRange): boolean {
	if (sel.empty) return sel.from >= span.from && sel.from <= span.to;
	const overlaps = sel.from < span.to && sel.to > span.from;
	return overlaps && !(sel.from <= span.from && sel.to >= span.to);
}

export interface NotationPluginOptions {
	getKernels: () => InlineKernels | null;
	/** Does the deck's front matter turn the inline grammar off? Read at paint time. */
	getDeckLiteral: () => boolean;
	/** Is the pill sheet ready, so a pill can be drawn as the slide draws it? */
	isRendered: () => boolean;
	/** The open editor's range changed (opened, moved by an edit, or closed). Called with the current value. */
	onOpenChange: (open: OpenPill | null) => void;
}

const TAG_ICON =
	'<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>';

/** The tag button shown after a pill whose text is on screen: the way into the editor from the keyboard or the text. */
function buildChip(span: PillSpan, view: EditorView, getPos: () => number | undefined): HTMLElement {
	const wrap = document.createElement('span');
	wrap.className = 'cs-nchip-wrap';
	wrap.contentEditable = 'false';
	wrap.dataset.pillFrom = String(span.from);
	const b = document.createElement('button');
	b.type = 'button';
	b.className = 'cs-nchip';
	b.setAttribute('aria-label', `Edit pill ${span.fields.value || 'icon'}`);
	b.title = span.locked ? 'This slide is edited in Markdown' : 'Edit this pill';
	b.disabled = span.locked;
	b.innerHTML = TAG_ICON;
	// Keep the editor's selection where it is: a mousedown on the button must not move the caret.
	b.addEventListener('mousedown', (e) => e.preventDefault());
	b.addEventListener('click', (e) => {
		e.preventDefault();
		const at = getPos();
		if (typeof at !== 'number' || span.locked) return;
		openPillEditor(view, { from: at - span.text.length, to: at });
	});
	wrap.append(b);
	return wrap;
}

/** The pill as the slide draws it, standing in for its text. Null when the kernel cannot draw it here. */
function buildPill(span: PillSpan, selected: boolean, view: EditorView, getPos: () => number | undefined, kernels: InlineKernels): HTMLElement | null {
	const real = kernels.pill.element(document, span.text);
	if (!real) return null;
	const wrap = document.createElement('span');
	wrap.className = `cs-npill ${PILL_SCOPE}${selected ? ' cs-npill-sel' : ''}${span.locked ? ' cs-npill-locked' : ''}`;
	wrap.contentEditable = 'false';
	wrap.dataset.pillFrom = String(span.from);
	const b = document.createElement('button');
	b.type = 'button';
	b.className = 'cs-npill-btn';
	b.setAttribute('aria-label', `Edit pill ${span.fields.value || 'icon'}`);
	b.title = span.locked ? 'This slide is edited in Markdown' : 'Edit this pill';
	b.disabled = span.locked;
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
	b.append(article);
	b.addEventListener('mousedown', (e) => e.preventDefault());
	b.addEventListener('click', (e) => {
		e.preventDefault();
		const at = getPos();
		if (typeof at !== 'number' || span.locked) return;
		openPillEditor(view, { from: at, to: at + span.text.length });
	});
	wrap.append(b);
	return wrap;
}

/**
 * Draws every pill the engine draws (or, until the pill sheet is ready, a tag button after its
 * text), and reports the open editor's range (a click, or `insertPill`, opens it) to `onOpenChange`. The pill
 * spans are found once per document; the decorations are rebuilt when the selection moves, which
 * is when a pill must show or hide its text.
 */
export function inlineNotationPlugin(opts: NotationPluginOptions): Plugin<NotationState> {
	let cachedDoc: PMNode | null = null;
	let cachedKernels: InlineKernels | null = null;
	let cachedLiteral = false;
	let spans: PillSpan[] = [];
	let cachedKey = '';
	let cached: DecorationSet = DecorationSet.empty;
	return new Plugin<NotationState>({
		key: notationKey,
		state: {
			init: () => ({ open: null, nextId: 1 }),
			apply(tr, value) {
				let open = value.open;
				// Map the open range through the edit: its start stays on the left of an insertion at it,
				// its end on the right. A pill the edit deleted into collapses and the editor closes.
				if (open && tr.docChanged) {
					const from = tr.mapping.map(open.from, -1);
					const to = tr.mapping.map(open.to, 1);
					open = to > from ? { ...open, from, to } : null;
				}
				const meta = tr.getMeta(notationKey) as NotationMeta | undefined;
				if (meta && 'open' in meta) return { open: { ...meta.open, id: value.nextId }, nextId: value.nextId + 1 };
				if (meta && 'close' in meta) return { open: null, nextId: value.nextId };
				return open === value.open ? value : { ...value, open };
			},
		},
		props: {
			decorations(state: EditorState) {
				const kernels = opts.getKernels();
				if (!kernels) return DecorationSet.empty;
				const literal = opts.getDeckLiteral();
				if (state.doc !== cachedDoc || kernels !== cachedKernels || literal !== cachedLiteral) {
					cachedDoc = state.doc;
					cachedKernels = kernels;
					cachedLiteral = literal;
					spans = findPillSpans(state.doc, kernels, literal);
					cachedKey = '';
				}
				const rendered = opts.isRendered();
				const { from, to, empty } = state.selection;
				const key = `${rendered ? 'r' : 'c'}:${from}:${to}`;
				if (key === cachedKey) return cached;
				cachedKey = key;
				const decos: Decoration[] = [];
				for (const span of spans) {
					const touching = touchesSpan({ from, to, empty }, span);
					const covered = !empty && from <= span.from && to >= span.to;
					if (rendered && !touching) {
						const stable = `pill:${span.from}:${span.text}:${covered ? 'S' : ''}${span.locked ? 'L' : ''}`;
						decos.push(
							Decoration.inline(span.from, span.to, { class: 'cs-psrc' }),
							Decoration.widget(span.from, (view, getPos) => buildPill(span, covered, view, getPos, kernels) ?? buildChip(span, view, () => (getPos() ?? 0) + span.text.length), {
								side: -1,
								key: stable,
								stopEvent: () => true,
								ignoreSelection: true,
							}),
						);
					} else {
						decos.push(
							Decoration.widget(span.to, (view, getPos) => buildChip(span, view, getPos), {
								side: 1,
								// Position and text in the key, so the widget is rebuilt (with fresh closures) when either moves.
								key: `chip:${span.from}:${span.text}:${span.locked ? 'L' : ''}`,
								stopEvent: () => true,
								ignoreSelection: true,
							}),
						);
					}
				}
				cached = DecorationSet.create(state.doc, decos);
				return cached;
			},
		},
		view() {
			return {
				update(view, prev) {
					const now = notationKey.getState(view.state)?.open ?? null;
					const was = notationKey.getState(prev)?.open ?? null;
					if (now !== was) opts.onOpenChange(now);
				},
			};
		},
	});
}

/** The mark a pill's text carries, exported for tests that build documents by hand. */
export function codeMark(): Mark {
	return code().create();
}
