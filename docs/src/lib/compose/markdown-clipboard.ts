// THE CLIPBOARD SPEAKS MARKDOWN (engineering/decisions/2026-11-15-compose-markdown-clipboard.md).
//
// The deck IS its Markdown, and Compose is a view onto it. ProseMirror's default clipboard knows neither:
// a Markdown paste arrived as literal paragraphs, which the serializer then ESCAPED into the source
// (`\- \*\*Revenue\*\*`, `\---`), and a copy put only the visible words on `text/plain`. Measured on the real
// Studio before this file existed. Here, both directions go through the editor's own reader and writer:
//   · copy and cut write the selection's Markdown to `text/plain` (the `text/html` copy is untouched, so
//     Compose-to-Compose stays lossless and a paste into a document or an email keeps its formatting);
//   · a paste whose text reads as Markdown is parsed the way a deck is opened (`parseDeck`), so slide breaks
//     become slides, `_class` comments become layouts, and inline syntax becomes formatting.
// What it does NOT take over: Compose's own HTML (lossless already), rich HTML from a page or a document (its
// structure is the better source), a paste inside a code block, and ⌘⇧V, which always pastes the text literally.
import { Fragment, type Node as PMNode, Slice } from 'prosemirror-model';
import { AllSelection, type EditorState, Plugin, PluginKey, Selection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { stripFrontMatter } from '../front-matter';
import { normalizeSourceText } from '../normalize-source-text';
import { CLIP_ORIGIN } from './clip-origin';
import { deckSchema, SEP, serializeSlideNode, slideContent } from './deck-doc';
import { latticeMarkdownSerializer } from './deck-markdown';
import { hasLossyConstruct, parseDeck } from './deck-source';
import { isRawBlockText } from './raw-block';

// ── Reading: does this text mean Markdown? ──────────────────────────────────────────────────────────────

/** Line-level marks only Markdown (or a deck) writes. One is enough: a plain sentence carries none, and a
 *  plain sentence pastes the same either way. */
const BLOCK_SIGNAL = /^(?:#{1,6}\s+\S|\s{0,3}[-*+]\s+\S|\s{0,3}\d{1,3}[.)]\s+\S|>\s?\S|(?:---|\*\*\*|___)\s*$|```|~~~|\|.*\|\s*$|<!--\s*_?[A-Za-z][\w-]*\s*:)/m;
/** Inline marks: emphasis, code, a link or an image. Not `__x__`: in prose that is far more often an identifier
 *  (`__init__`) than bold, and reading it as Markdown would eat the underscores. */
const INLINE_SIGNAL = /\*\*[^*\n]+\*\*|(?:^|[\s(])\*[^*\s][^*\n]*\*|`[^`\n]+`|!?\[[^\]\n]+\]\([^)\s]+\)/;

export function looksLikeMarkdown(text: string): boolean {
	return BLOCK_SIGNAL.test(text) || INLINE_SIGNAL.test(text);
}

/** HTML that carries document STRUCTURE (a web page, Google Docs, Word): parse the HTML, it knows more than the
 *  text does. HTML without any (VS Code, a terminal, a code viewer: colored `div`s and `span`s) is a picture of
 *  the text, so the Markdown in `text/plain` is the real content. */
export function htmlHasStructure(html: string): boolean {
	return /<(?:h[1-6]|p|ul|ol|li|table|blockquote|section|article)\b/i.test(html);
}

/** This session's own copy, which the HTML path round-trips losslessly (see CLIP_ORIGIN). */
export function isOwnHtml(html: string): boolean {
	return html.includes(CLIP_ORIGIN);
}

/** The letters and digits of a string, in order: what a reader sees, with Markdown's punctuation set aside. */
const words = (t: string): string => t.replace(/[^\p{L}\p{N}]+/gu, '');

/** The visible text of a piece of HTML. Parsed inert (`DOMParser` runs no script and loads nothing). */
function htmlText(html: string): string {
	if (typeof DOMParser === 'undefined') return '';
	return new DOMParser().parseFromString(html, 'text/html').body?.textContent ?? '';
}

/**
 * Should this paste go through the Markdown reader? `plain` is ⌘⇧V; `inCode` is a caret inside a code block.
 *
 * When the clipboard ALSO holds structureless HTML (VS Code), Markdown is taken only if the two carry the same
 * words. A page's copy handler can set the two flavors independently, and the HTML is what the author saw: a
 * `text/plain` that says more than it is someone else's text (the red team's finding), so the HTML path takes it.
 * VS Code's HTML is the source text itself, colored, so it always agrees.
 */
export function pasteAsMarkdown({ text, html, plain, inCode }: { text: string; html: string; plain: boolean; inCode: boolean }): boolean {
	if (plain || inCode || !text.trim()) return false;
	if (html && (isOwnHtml(html) || htmlHasStructure(html) || words(htmlText(html)) !== words(text))) return false;
	return looksLikeMarkdown(text);
}

// ── Reading: Markdown → a slice of the deck schema ─────────────────────────────────────────────────────

export type MarkdownPaste = {
	slice: Slice;
	/** The pasted text's front matter, as written ('' when it had none). Never applied to the open deck. */
	frontMatter: string;
	/** Slides the paste brings, 0 when it is prose for the caret's slide. */
	slides: number;
	/** Of those, the ones Compose cannot edit (locked; edited in Source). */
	locked: number;
	/** True when the text had no slide break or directive, and became a slide only because Compose cannot edit it. */
	lockedProse: boolean;
};

/**
 * Markdown trims a paragraph's leading and trailing spaces, but a paste that JOINS a paragraph needs them:
 * `Where we start.` + ` Then **ship** it.` must not read `start.Then`. Put back the spaces the text began and
 * ended with, on the first and last paragraph, where the slice opens into the caret's paragraph.
 */
function keepEdgeSpaces(content: Fragment, text: string): Fragment {
	const lead = /^[ \t]+/.exec(text)?.[0].replace(/\t/g, ' ') ?? '';
	const trail = /[ \t]+$/.exec(text)?.[0].replace(/\t/g, ' ') ?? '';
	if ((!lead && !trail) || !content.childCount) return content;
	const pad = (node: PMNode, before: string, after: string) => {
		if (node.type !== deckSchema.nodes.paragraph) return node;
		let inner = node.content;
		if (before) inner = Fragment.from(deckSchema.text(before)).append(inner);
		if (after) inner = inner.append(Fragment.from(deckSchema.text(after)));
		return node.copy(inner);
	};
	const first = content.child(0);
	if (content.childCount === 1) return Fragment.from(pad(first, lead, trail));
	const nodes: PMNode[] = [];
	content.forEach((n, _o, i) => {
		nodes.push(i === 0 ? pad(n, lead, '') : i === content.childCount - 1 ? pad(n, '', trail) : n);
	});
	return Fragment.from(nodes);
}

/**
 * Pasted Markdown → a slice.
 *
 * PROSE (no slide break, no directive) goes in at the caret. ONE paragraph is inline text: the slice opens so it
 * joins the paragraph there, with the edge spaces Markdown trims put back. Anything with block structure (a
 * heading, a list, a quote, several paragraphs) is a CLOSED slice, so each block keeps its type and the caret's
 * paragraph is split around it; opening it folded the heading or the first bullet into that paragraph (the
 * inversion review measured `First para.Heading`).
 *
 * SLIDES (a break, a directive, or prose Compose cannot round-trip, which becomes a locked slide carrying its bytes
 * as pasted) are placed BETWEEN slides by `placeSlides`, never at the caret.
 *
 * FRONT MATTER IS NOT APPLIED. A deck's settings (theme, size, pagination) are the open deck's, and a paste
 * never restyles it: the slides take the destination's look, as PowerPoint, Google Slides and Word all do by
 * default (the prior-art survey in the decision note). The block is recognized and set aside, rather than
 * read as a slide break, a `theme: x` heading and a second break.
 */
export function markdownToSlice(md: string): MarkdownPaste {
	const text = normalizeSourceText(md);
	const { fm, slides } = parseDeck(text);
	const empty = (x: { raw: string }) => !x.raw.trim();
	// A break at the very start or end of the text (a `---` under a pasted section) adds no empty slide; a paste
	// that is nothing but a break adds one empty slide.
	let list = slides;
	while (list.length > 1 && empty(list[0])) list = list.slice(1);
	while (list.length > 1 && empty(list[list.length - 1])) list = list.slice(0, -1);
	// A paste of nothing but a break (`---`) has no prose at all; the reader takes the lone `---` for an unclosed
	// front matter fence. It means a new slide, so it adds one.
	if (list.length === 1 && empty(list[0]) && !fm && text.trim()) {
		const blank = deckSchema.nodes.slide.create(null, slideContent('', []));
		return { slice: new Slice(Fragment.from(blank), 0, 0), frontMatter: '', slides: 1, locked: 0, lockedProse: false };
	}
	const prose = slides.length === 1 && !list[0].directives.length && !fm;
	if (prose && !hasLossyConstruct(list[0].prose)) {
		const content = slideContent(list[0].prose, []);
		const inline = content.childCount === 1 && content.child(0).type === deckSchema.nodes.paragraph;
		const slice = inline ? Slice.maxOpen(keepEdgeSpaces(content, text)) : new Slice(content, 0, 0);
		return { slice, frontMatter: '', slides: 0, locked: 0, lockedProse: false };
	}
	const nodes = list.map((x) =>
		deckSchema.nodes.slide.create({ directives: x.directives, raw: x.raw, locked: hasLossyConstruct(x.prose) }, slideContent(x.prose, x.directives)),
	);
	const locked = nodes.filter((n) => n.attrs.locked).length;
	return { slice: new Slice(Fragment.from(nodes), 0, 0), frontMatter: fm, slides: nodes.length, locked, lockedProse: prose };
}

/**
 * Put pasted slides BETWEEN slides, never inside one. Slide nodes inserted at a caret mid-slide make ProseMirror
 * split that slide, and the piece after the caret keeps the slide's layout: a big-number slide became two (the
 * inversion review). Slide tools add pasted slides after the current one, and so does this:
 *   · the selection is deleted first, as any paste deletes it;
 *   · an EMPTY slide with no layout (a fresh "New slide") is replaced by the pasted slides;
 *   · a caret at the very start of a slide puts them before it;
 *   · anywhere else, after it.
 * The caret lands at the end of the last pasted slide.
 */
export function placeSlides(state: EditorState, slides: Fragment): Transaction {
	const tr = state.tr;
	if (!state.selection.empty) tr.deleteSelection();
	const $at = tr.selection.$from;
	const slide = tr.doc.child($at.index(0));
	const start = $at.before(1);
	const end = $at.after(1);
	const blank = !slide.attrs.locked && !(slide.attrs.directives as string[]).length && slide.childCount === 1 && slide.child(0).isTextblock && slide.child(0).content.size === 0;
	let at: number;
	if (blank) {
		tr.replaceWith(start, end, slides);
		at = start;
	} else {
		const first = Selection.findFrom(tr.doc.resolve(start + 1), 1, true);
		at = first && $at.pos <= first.from ? start : end;
		tr.insert(at, slides);
	}
	const caret = Selection.findFrom(tr.doc.resolve(Math.min(at + slides.size, tr.doc.content.size)), -1, true);
	if (caret) tr.setSelection(caret);
	return tr;
}

/**
 * Every raw block a paste built passes the gate a pasted raw block meets on the HTML path (`isRawBlockText`):
 * one block, bounded, no directive or slide rule inside. Compose shows a raw block's first lines only, so an
 * unbounded one is text the author cannot see.
 */
export function rawBlocksOk(slice: Slice): boolean {
	let ok = true;
	slice.content.descendants((n) => {
		if (n.type.name === 'raw_block' && !isRawBlockText(n.attrs.kind, n.attrs.text)) ok = false;
		return ok;
	});
	return ok;
}

// ── Writing: a selection → its Markdown ──────────────────────────────────────────────────────────────

/** The textblock a selection sits inside, when it starts and ends in that one block (a word, a phrase). */
function innerTextblock(slide: PMNode, openStart: number, openEnd: number): PMNode | null {
	let node = slide;
	let s = openStart;
	let e = openEnd;
	while (s > 0 && e > 0 && node.childCount === 1) {
		node = node.firstChild as PMNode;
		if (node.isTextblock) return node;
		s--;
		e--;
	}
	return null;
}

/** A slide's Markdown for the clipboard. A LOCKED slide is one Compose cannot round-trip, and it cannot change, so
 *  its `raw` IS its source: the serializer would write its strikethrough as `\~\~` (the red team's finding). */
function slideMarkdown(slide: PMNode): string {
	return slide.attrs.locked && slide.attrs.raw ? (slide.attrs.raw as string) : serializeSlideNode(slide);
}

/** Does the selection cover the whole deck? */
function coversDeck(state: EditorState): boolean {
	const { doc, selection } = state;
	if (selection instanceof AllSelection) return true;
	return selection.from <= Selection.atStart(doc).from && selection.to >= Selection.atEnd(doc).to;
}

/**
 * The Markdown a copy writes to `text/plain`. Three shapes, by what was selected:
 *   · a run inside ONE block (a word, a phrase): its inline Markdown (`**bold**`), or a code block's text as is;
 *   · anything else inside one slide, even all of it: its blocks' Markdown, WITHOUT the slide's layout. Selecting
 *     a slide's whole text and pasting it elsewhere adds that text; a layout comment would turn it into a new
 *     slide, which is not what a text selection asks for;
 *   · across slides: every slide with its directives, joined by `---`; the WHOLE deck also carries the front
 *     matter, so ⌘A ⌘A ⌘C is the deck file.
 */
export function sliceToMarkdown(slice: Slice, state: EditorState): string {
	const slides: PMNode[] = [];
	slice.content.forEach((n) => {
		slides.push(n);
	});
	if (!slides.length || slides.some((n) => n.type !== deckSchema.nodes.slide)) {
		// Not a slide-rooted slice (a node selection the editor built itself): its text, which is never wrong.
		return slice.content.textBetween(0, slice.content.size, '\n\n');
	}
	if (coversDeck(state)) {
		const body = slides.map(slideMarkdown).join(SEP);
		const fm = (state.doc.attrs.frontMatter as string) || '';
		return fm ? fm + body : body;
	}
	if (slides.length > 1) return slides.map(slideMarkdown).join(SEP);
	const only = slides[0];
	const block = innerTextblock(only, slice.openStart - 1, slice.openEnd - 1);
	if (block) {
		if (block.type.spec.code) return block.textContent;
		// Plain text with no formatting copies as itself: `-3% churn` must not reach a title field as `\-3% churn`.
		let plain = true;
		block.forEach((n) => {
			if (!n.isText || n.marks.length) plain = false;
		});
		if (plain) return block.textContent;
		const para = deckSchema.nodes.paragraph.create(null, block.content);
		return latticeMarkdownSerializer.serialize(deckSchema.nodes.slide.create(null, para)).replace(/\n+$/, '');
	}
	return latticeMarkdownSerializer.serialize(only).replace(/\n+$/, '');
}

/** A drag that carries files (a deck from the desktop), not text or a node from the editor itself. */
function carriesFiles(event: DragEvent): boolean {
	const types = Array.from(event.dataTransfer?.types ?? []);
	// A file from the desktop carries `Files` alone. An image dragged from another page carries its HTML too, and
	// that stays ProseMirror's, as it was.
	return types.includes('Files') && !types.includes('text/html') && !types.includes('text/uri-list');
}

// ── The plugin ─────────────────────────────────────────────────────────────────────────────────────

export const markdownClipboardKey = new PluginKey('markdown-clipboard');

export type ClipboardNotice = (message: string) => void;

/** What to tell the author about a paste, or null when it went in as they would expect. */
export function pasteNotice(p: MarkdownPaste): string | null {
	const parts: string[] = [];
	if (p.frontMatter) parts.push("The pasted deck's settings (theme, size, pagination) were not applied — this deck keeps its own. Open it as its own deck to keep them.");
	if (p.lockedProse) parts.push('That text uses Markdown Compose cannot edit (such as strikethrough or a footnote), so it was added as its own slide. Edit it in Source.');
	else if (p.locked) parts.push(`${p.locked === 1 ? 'One pasted slide uses' : `${p.locked} pasted slides use`} Markdown Compose cannot edit, so ${p.locked === 1 ? 'it is' : 'they are'} edited in Source.`);
	return parts.length ? parts.join(' ') : null;
}

/** What a Markdown paste would load from the network, rendered through the engine and read with the security
 *  spine's `remoteRefsInHtml` (HARD RULE #22): the gate Insert uses for a sample slide (`gallery-gate.ts`). The
 *  Studio hands it in (ComposeView), because the engine lives a layer above this module. */
export type RemoteCheck = (md: string) => Promise<string[]>;

/** ProseMirror's own plain-paste test (prosemirror-view `input.ts`): Shift held at the paste, and the paste not
 *  Shift+Insert (key code 45), which is how Windows and Linux paste with no other modifier. Read from the view
 *  so the two can never disagree; an editor without the field takes the paste as ordinary. */
function plainPaste(view: EditorView): boolean {
	const input = (view as unknown as { input?: { shiftKey?: boolean; lastKeyCode?: number | null } }).input;
	return !!input?.shiftKey && input.lastKeyCode !== 45;
}

/** Is the caret inside a table cell? A cell takes inline text; a block or a slide pasted there splits the table. */
function inTableCell(state: EditorState): boolean {
	const { $from } = state.selection;
	for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.spec.tableRole === 'cell' || $from.node(d).type.spec.tableRole === 'header_cell') return true;
	return false;
}

/**
 * Markdown in, Markdown out. Must sit AFTER any plugin whose `handlePaste` moves the selection first (the note
 * plugin does), because this one reads the selection it is pasting over.
 *
 * A Markdown paste is CHECKED BEFORE IT LANDS: the text is rendered through the engine and every address the
 * markup would fetch is read with the spine's reader. Any at all, or a check that cannot run, refuses the paste
 * with a message, and nothing is inserted. A private pattern over the source cannot be made to agree with the
 * renderer; the red team bypassed one six ways (nested comments, record directives, fences markdown-it does not
 * read as fences, unquoted attributes, raw HTML), and `remote-ref.js`'s header lists eleven more.
 */
export function markdownClipboardPlugin(notice: ClipboardNotice, check: RemoteCheck): Plugin {
	const land = async (view: EditorView, md: string): Promise<void> => {
		const p = markdownToSlice(md);
		if (!rawBlocksOk(p.slice)) {
			notice('That Markdown holds an HTML block Compose cannot show whole, so it was not pasted. Paste it in Source.');
			return;
		}
		let refs: string[];
		try {
			// Front matter is set aside, never applied, so it is not what the check reads.
			refs = await check(stripFrontMatter(normalizeSourceText(md)));
		} catch {
			notice('That Markdown could not be checked, so it was not pasted. Try again in a moment, or paste it in Source.');
			return;
		}
		if (refs.length) {
			notice('That Markdown loads something from another site, so it was not pasted. Paste it in Source if you trust it.');
			return;
		}
		if ((view as unknown as { isDestroyed?: boolean }).isDestroyed) return;
		const state = view.state;
		const tr = p.slides ? placeSlides(state, p.slice.content) : state.tr.replaceSelection(p.slice);
		view.dispatch(tr.scrollIntoView().setMeta('paste', true).setMeta('uiEvent', 'paste'));
		// The structural guard may refuse it (a locked slide): then nothing landed, and nothing is said about it.
		if (view.state.doc === state.doc) {
			notice('Nothing was pasted: this part of the deck is edited in Source.');
			return;
		}
		const why = pasteNotice(p);
		if (why) notice(why);
	};
	return new Plugin({
		key: markdownClipboardKey,
		props: {
			clipboardTextSerializer: (slice, view) => sliceToMarkdown(slice, view.state),
			handlePaste(view, event) {
				const data = event.clipboardData;
				if (!data) return false;
				const text = data.getData('text/plain');
				const html = data.getData('text/html');
				const inCode = !!view.state.selection.$from.parent.type.spec.code;
				if (!pasteAsMarkdown({ text, html, plain: plainPaste(view), inCode })) return false;
				// In a table cell only inline text goes in; anything with blocks or slides takes the literal path.
				if (inTableCell(view.state)) {
					const p = markdownToSlice(text);
					if (p.slides || p.slice.openStart === 0) return false;
				}
				void land(view, text);
				return true;
			},
			handleDOMEvents: {
				// A FILE dropped on Compose opens as a new deck, as it does anywhere else in the Studio (the shell's
				// funnel, deck-drop.ts). Returning true keeps ProseMirror's drop handler, which cancels the event and
				// then has nothing to insert, from swallowing it; the event then bubbles to the shell uncancelled.
				// `dragover`/`dragenter` too: ProseMirror cancels those, which would tell the shell the editor took the drag.
				dragenter: (_view, event) => carriesFiles(event),
				dragover: (_view, event) => carriesFiles(event),
				drop: (_view, event) => carriesFiles(event),
			},
		},
	});
}
