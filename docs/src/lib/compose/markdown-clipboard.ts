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
import { AllSelection, type EditorState, Plugin, PluginKey, Selection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import remoteRef from '../../../../lib/core/remote-ref.js';
import { normalizeSourceText } from '../normalize-source-text';
import { CLIP_ORIGIN } from './clip-origin';
import { deckSchema, SEP, serializeSlideNode, slideContent } from './deck-doc';
import { latticeMarkdownSerializer } from './deck-markdown';
import { hasLossyConstruct, parseDeck } from './deck-source';

// ── Reading: does this text mean Markdown? ──────────────────────────────────────────────────────────────

/** Line-level marks only Markdown (or a deck) writes. One is enough: a plain sentence carries none, and a
 *  plain sentence pastes the same either way. */
const BLOCK_SIGNAL = /^(?:#{1,6}\s+\S|\s{0,3}[-*+]\s+\S|\s{0,3}\d{1,3}[.)]\s+\S|>\s?\S|(?:---|\*\*\*|___)\s*$|```|~~~|\|.*\|\s*$|<!--\s*_?[A-Za-z][\w-]*\s*:)/m;
/** Inline marks: emphasis, code, a link or an image. */
const INLINE_SIGNAL = /\*\*[^*\n]+\*\*|__[^_\n]+__|(?:^|[\s(])\*[^*\s][^*\n]*\*|`[^`\n]+`|!?\[[^\]\n]+\]\([^)\s]+\)/;

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

/** Should this paste go through the Markdown reader? `plain` is ⌘⇧V; `inCode` is a caret inside a code block. */
export function pasteAsMarkdown({ text, html, plain, inCode }: { text: string; html: string; plain: boolean; inCode: boolean }): boolean {
	if (plain || inCode || !text.trim()) return false;
	if (html && (isOwnHtml(html) || htmlHasStructure(html))) return false;
	return looksLikeMarkdown(text);
}

// ── Reading: Markdown → a slice of the deck schema ─────────────────────────────────────────────────────

/** A directive comment: `<!-- _name: value -->`, or the global spelling without the `_`. */
const DIRECTIVE_COMMENT = /<!--\s*_?[A-Za-z][\w-]*\s*:([\s\S]*?)-->/g;

/**
 * Does a directive's value name something on another site? Asked of the security spine (HARD RULE #22;
 * 2026-11-03-security-findings-spine.md), never of a private pattern: `remoteCssRefs` reads it as CSS the way
 * the renderer does (`url(…)` in every spelling, escapes, strings), and `isRemoteUrl` is asked of each bare
 * address in it, which covers a value written as a link or an image (`![](https://…)`) rather than CSS.
 */
function namesRemote(value: string): boolean {
	if (remoteRef.remoteCssRefs(value).length > 0) return true;
	return value.split(/[\s()<>"'[\]]+/).some((part) => part !== '' && remoteRef.isRemoteUrl(part));
}

/**
 * Drop every directive comment that would make the deck FETCH something (`_backgroundImage: url(https://…)`),
 * outside fenced code. Compose does not show directives, so a pasted one is content the author never sees; a
 * remote one reaches the export, which fetches it (HARD RULE #22's threat model, and the reason CLIP_ORIGIN
 * exists for the HTML path). The Markdown pane shows directives, and it is where to add one on purpose.
 */
export function stripRemoteDirectives(md: string): { text: string; dropped: number } {
	let dropped = 0;
	let fence: string | null = null;
	const out: string[] = [];
	// Fences are line-scoped, so walk lines and only rewrite lines outside a fence. A comment that spans lines is
	// matched on the joined run of non-fenced lines.
	let run: string[] = [];
	const flush = () => {
		if (!run.length) return;
		out.push(
			run.join('\n').replace(DIRECTIVE_COMMENT, (c) => {
				if (!namesRemote(c.replace(/^<!--\s*_?[A-Za-z][\w-]*\s*:/, '').replace(/-->$/, ''))) return c;
				dropped++;
				return '';
			}),
		);
		run = [];
	};
	for (const line of md.split('\n')) {
		const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
		if (fence) {
			out.push(line);
			if (m && m[1][0] === fence[0] && m[1].length >= fence.length && !line.slice(m.index + m[0].length).trim()) fence = null;
			continue;
		}
		if (m) {
			flush();
			fence = m[1];
			out.push(line);
			continue;
		}
		run.push(line);
	}
	flush();
	return { text: out.join('\n'), dropped };
}

export type MarkdownPaste = {
	slice: Slice;
	/** Remote directive comments left out (see `stripRemoteDirectives`). */
	dropped: number;
	/** The pasted text's front matter, as written ('' when it had none). Never applied to the open deck. */
	frontMatter: string;
	/** Slides the paste brings, 0 when it is prose for the caret's slide. */
	slides: number;
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
 * Pasted Markdown → a slice. Prose with no slide break and no directive goes in AT THE CARET, opened so its
 * first and last paragraph join the paragraph it lands in. Anything with a slide break or a directive, and any
 * prose Compose cannot round-trip (it would be rewritten on the next save), becomes whole slides — the lossy
 * ones locked, carrying their bytes exactly as pasted.
 *
 * FRONT MATTER IS NOT APPLIED. A deck's settings (theme, size, pagination) are the open deck's, and a paste
 * never restyles it: the slides take the destination's look, as PowerPoint, Google Slides and Word all do by
 * default (the prior-art survey in the decision note). The block is recognized and set aside, rather than
 * read as a slide break, a `theme: x` heading and a second break.
 */
export function markdownToSlice(md: string): MarkdownPaste {
	const { text, dropped } = stripRemoteDirectives(normalizeSourceText(md));
	const { fm, slides } = parseDeck(text);
	const list = slides.filter((s, i) => i > 0 || s.raw.trim() || slides.length === 1);
	const single = list.length === 1 && !list[0].directives.length && !hasLossyConstruct(list[0].prose) && !fm;
	if (single) {
		const content = keepEdgeSpaces(slideContent(list[0].prose, []), text);
		return { slice: Slice.maxOpen(content), dropped, frontMatter: '', slides: 0 };
	}
	const nodes = list.map((s) =>
		deckSchema.nodes.slide.create({ directives: s.directives, raw: s.raw, locked: hasLossyConstruct(s.prose) }, slideContent(s.prose, s.directives)),
	);
	return { slice: new Slice(Fragment.from(nodes), 0, 0), dropped, frontMatter: fm, slides: nodes.length };
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
		const body = slides.map(serializeSlideNode).join(SEP);
		const fm = (state.doc.attrs.frontMatter as string) || '';
		return fm ? fm + body : body;
	}
	if (slides.length > 1) return slides.map(serializeSlideNode).join(SEP);
	const only = slides[0];
	const block = innerTextblock(only, slice.openStart - 1, slice.openEnd - 1);
	if (block) {
		if (block.type.spec.code) return block.textContent;
		const para = deckSchema.nodes.paragraph.create(null, block.content);
		return latticeMarkdownSerializer.serialize(deckSchema.nodes.slide.create(null, para)).replace(/\n+$/, '');
	}
	return latticeMarkdownSerializer.serialize(only).replace(/\n+$/, '');
}

/** A drag that carries files (a deck from the desktop), not text or a node from the editor itself. */
function carriesFiles(event: DragEvent): boolean {
	const types = event.dataTransfer?.types;
	return !!types && Array.from(types).includes('Files');
}

// ── The plugin ─────────────────────────────────────────────────────────────────────────────────────

export const markdownClipboardKey = new PluginKey('markdown-clipboard');

export type ClipboardNotice = (message: string) => void;

/** What to tell the author about a paste, or null when it went in as they would expect. */
export function pasteNotice(p: MarkdownPaste): string | null {
	const parts: string[] = [];
	if (p.frontMatter) parts.push("The pasted deck's settings (theme, size, pagination) were not applied — this deck keeps its own. Open it as its own deck to keep them.");
	if (p.dropped) parts.push(`${p.dropped === 1 ? 'A background or link to another site was' : `${p.dropped} backgrounds or links to other sites were`} left out. Add it in Markdown if you meant it.`);
	return parts.length ? parts.join(' ') : null;
}

/**
 * Markdown in, Markdown out. Must sit AFTER any plugin whose `handlePaste` moves the selection first (the note
 * plugin does), because this one reads the selection it is pasting over.
 */
export function markdownClipboardPlugin(notice: ClipboardNotice): Plugin {
	// ⌘⇧V. ProseMirror tracks the same key for its own plain-text paste, privately; this is ours.
	let shift = false;
	const paste = (view: EditorView, md: string): boolean => {
		const p = markdownToSlice(md);
		view.dispatch(view.state.tr.replaceSelection(p.slice).scrollIntoView().setMeta('paste', true).setMeta('uiEvent', 'paste'));
		const why = pasteNotice(p);
		if (why) notice(why);
		return true;
	};
	return new Plugin({
		key: markdownClipboardKey,
		props: {
			clipboardTextSerializer: (slice, view) => sliceToMarkdown(slice, view.state),
			handleKeyDown(_view, event) {
				shift = event.shiftKey;
				return false;
			},
			handlePaste(view, event) {
				const data = event.clipboardData;
				const plain = shift;
				shift = false;
				if (!data) return false;
				const text = data.getData('text/plain');
				const html = data.getData('text/html');
				const inCode = !!view.state.selection.$from.parent.type.spec.code;
				if (!pasteAsMarkdown({ text, html, plain, inCode })) return false;
				return paste(view, text);
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
