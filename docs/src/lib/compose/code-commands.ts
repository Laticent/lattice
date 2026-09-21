import type { Node as PMNode, ResolvedPos } from 'prosemirror-model';
import { type Command, type EditorState, TextSelection } from 'prosemirror-state';
import { deckSchema } from './deck-doc';
import { CLASS_RE } from './deck-source';
import { isEngineFence, PLAIN_FENCE } from './fence-catalog';

// Pure fenced-code commands for Compose — no DOM, no React. Shared by the editor's
// keymap (ComposeView), the divider-bar insert door and the language picker, so none
// of them re-implements one. Twin of `table-commands.ts`.
// Design: engineering/decisions/2026-09-21-compose-fenced-code.md.

/** The `code_block` the caret sits in, with its position — or null. */
export function codeBlockAt(state: EditorState): { node: PMNode; pos: number; $pos: ResolvedPos } | null {
	const { $from } = state.selection;
	for (let d = $from.depth; d > 0; d--) {
		const node = $from.node(d);
		if (node.type === deckSchema.nodes.code_block) return { node, pos: $from.before(d), $pos: $from };
	}
	return null;
}

/** Is the caret inside a fence? The twin of prosemirror-tables' `isInTable`. */
export function isInCode(state: EditorState): boolean {
	return !!codeBlockAt(state);
}

/** The caret fence's language tag (the leading word of its info string), or ''. */
export function currentFenceTag(state: EditorState): string {
	const block = codeBlockAt(state);
	if (!block) return '';
	return leadingTag((block.node.attrs.params as string) || '');
}

/** The leading word of an info string — the language. markdown-it reads only this,
 *  and marp-core attribute syntax (```js {1,3}) lives in the remainder. */
export function leadingTag(params: string): string {
	return (params.trim().split(/[\s{,]/)[0] || '').trim();
}

/**
 * Replace ONLY the leading tag of the caret fence's info string, keeping whatever
 * follows it.
 *
 * The remainder is not ours to drop. ```js {highlight=1,3} is marp-core's
 * line-highlight syntax and it round-trips through `params` today; a picker that
 * rewrote the whole info string would silently delete an author's line highlights
 * the first time they changed the language.
 */
export function setFenceTag(tag: string): Command {
	return (state, dispatch) => {
		const block = codeBlockAt(state);
		if (!block) return false;
		const params = (block.node.attrs.params as string) || '';
		const rest = params.trim().slice(leadingTag(params).length);
		const next = `${tag}${rest}`.trim();
		if (next === params.trim()) return false;
		if (dispatch) dispatch(state.tr.setNodeMarkup(block.pos, undefined, { ...block.node.attrs, params: next }));
		return true;
	};
}

/**
 * Insert an empty fence at the caret, tagged, and put the caret inside it.
 *
 * TAGGED, never bare: `code.docs.md` says three times that an untagged fence renders
 * as undifferentiated mono, and no shipped deck disagrees — so a door that produced
 * one would be a door that produces a defect.
 *
 * A no-op inside an existing fence (nesting a fence is not a thing an author means)
 * and inside a table cell, whose content is `inline*` and cannot hold a block.
 */
export function insertFence(tag: string): Command {
	return (state, dispatch) => {
		if (isInCode(state)) return false;
		const { $from } = state.selection;
		if (!$from.parent.type.spec.code && !canHoldBlock($from)) return false;
		const node = deckSchema.nodes.code_block.create({ params: tag || PLAIN_FENCE.tag });
		if (dispatch) {
			const tr = state.tr.replaceSelectionWith(node);
			// Park the caret INSIDE the new fence rather than after it. `replaceSelectionWith`
			// leaves the selection past the inserted node, so without this the author's next
			// keystroke lands in the following paragraph and the fence they asked for stays
			// empty — measured on the table door's sibling path.
			const pos = tr.mapping.map(state.selection.from);
			const $inside = tr.doc.resolve(Math.min(pos, tr.doc.content.size));
			const found = findCodeBlockNear($inside);
			if (found !== null) tr.setSelection(TextSelection.create(tr.doc, found));
			dispatch(tr.scrollIntoView());
		}
		return true;
	};
}

/** Can a block node be placed at this position at all? (False inside a GFM cell.) */
function canHoldBlock($pos: ResolvedPos): boolean {
	for (let d = $pos.depth; d > 0; d--) {
		const name = $pos.node(d).type.name;
		if (name === 'table_cell' || name === 'table_header') return false;
	}
	return true;
}

/** The inside-start position of the code block at or just before `$pos`. */
function findCodeBlockNear($pos: ResolvedPos): number | null {
	const before = $pos.nodeBefore;
	if (before?.type === deckSchema.nodes.code_block) return $pos.pos - before.nodeSize + 1;
	const after = $pos.nodeAfter;
	if (after?.type === deckSchema.nodes.code_block) return $pos.pos + 1;
	return null;
}

const INDENT = '  ';

/**
 * Tab / Shift-Tab inside a fence: indent or outdent by two spaces.
 *
 * This exists because `Tab` was a TRAP. The table and list keymaps both bind it and
 * both return false outside their own context, and `baseKeymap` does not bind it at
 * all — so a Tab pressed inside a code sample fell through to the browser and moved
 * FOCUS OUT of the editor. Two spaces rather than a tab character because every
 * shipped fence is space-indented and a literal tab renders at whatever width the
 * export's font decides.
 */
export function indentInCode(outdent = false): Command {
	return (state, dispatch) => {
		const block = codeBlockAt(state);
		if (!block) return false;
		const { from, to, empty } = state.selection;
		const start = block.pos + 1;
		const text = block.node.textContent;
		if (empty && !outdent) {
			if (dispatch) dispatch(state.tr.insertText(INDENT, from, to).scrollIntoView());
			return true;
		}
		// A range (or any outdent) works line-wise, like every code editor: the whole
		// touched region shifts, and the selection is not replaced by a space run.
		const relFrom = Math.max(0, from - start);
		const relTo = Math.max(relFrom, to - start);
		const lineStart = text.lastIndexOf('\n', relFrom - 1) + 1;
		const lineEnd = text.indexOf('\n', relTo) === -1 ? text.length : text.indexOf('\n', relTo);
		const slice = text.slice(lineStart, lineEnd);
		const next = slice
			.split('\n')
			.map((line) => (outdent ? line.replace(/^ {1,2}/, '') : INDENT + line))
			.join('\n');
		if (next === slice) return true; // nothing to outdent — still swallow Tab, never leak focus
		if (dispatch) {
			const tr = state.tr.insertText(next, start + lineStart, start + lineEnd);
			dispatch(tr.scrollIntoView());
		}
		return true;
	};
}

/**
 * Enter on a BLANK last line of a fence leaves the fence, dropping that blank line.
 *
 * The way out used to be `Mod-Enter` (`exitCode`, from `baseKeymap`) and nothing
 * else — undiscoverable on a desktop and unreachable on a phone, which is the device
 * this was reported from. This is the convention every rich editor uses, and it is
 * the only exit a touch keyboard can reach.
 *
 * Deliberately narrow: it fires only with an empty caret on the fence's LAST line,
 * and only when that line is blank. Anywhere else Enter is a newline, as it must be.
 */
export const exitCodeOnBlankLine: Command = (state, dispatch) => {
	const block = codeBlockAt(state);
	if (!block) return false;
	const { $from, empty } = state.selection;
	if (!empty) return false;
	const text = block.node.textContent;
	const offset = $from.parentOffset;
	if (offset !== text.length) return false; // not at the very end
	const lineStart = text.lastIndexOf('\n') + 1;
	if (lineStart === 0 || text.slice(lineStart).trim() !== '') return false; // no blank last line
	const after = deckSchema.nodes.paragraph.createAndFill();
	if (!after) return false;
	if (dispatch) {
		const tr = state.tr;
		// Drop the blank line (and the newline that made it) with the exit, so leaving a
		// fence does not leave a trailing empty line in the rendered snippet.
		tr.delete(block.pos + 1 + lineStart - 1, block.pos + 1 + text.length);
		const end = tr.mapping.map(block.pos + block.node.nodeSize);
		tr.insert(end, after);
		tr.setSelection(TextSelection.create(tr.doc, end + 1));
		dispatch(tr.scrollIntoView());
	}
	return true;
};

// ── Which layouts get the door ───────────────────────────────────────────────
// PERMISSIVE BY DEFAULT, with a small unsuited set — exactly `slideTakesTable`'s
// posture (registers.ts) and for the same reason: the engine CAN render a fence on a
// title slide, but offering one there produces a mis-set slide. Typing or pasting a
// fence still works everywhere; only the button stands down.
//
// DELIBERATELY SHORTER THAN `TABLE_UNSUITED`, and the difference is the point. That
// list withholds the table door from every chart layout, because a chart slide's
// figure already owns the stage. A fence is not a table: on four layouts the fence IS
// the figure — `diagram` (```mermaid), `scene` (```anima), `math` (```functionplot),
// `code` / `compare-code` — and those are exactly the slides an author most needs the
// door on, not least to put a fence BACK after deleting one. So the withheld set is
// only the layouts with no body flow at all.
const CODE_UNSUITED = new Set([
	// ── No body flow to hold a block: bookends and single-utterance statements ──
	'title',
	'closing',
	'divider',
	'big-number',
	'quote',
	'premise',
	// ── The picture (or the code) IS the slide, and it is not a fence ───────────
	'image',
	'video',
	'contact', // QR code
	'wifi', // QR code
	'logo-wall',
]);

/** The whole `_class:` payload — every token, matching the running-global spelling too. */
const CLASS_PAYLOAD_RE = /<!--\s*_?class:\s*([^>]*?)\s*-->/;

/** Does this slide's layout get the insert-fence door? */
export function slideTakesCode(directives: string[]): boolean {
	let declared: boolean | undefined;
	for (const d of directives) {
		const m = d.match(CLASS_PAYLOAD_RE);
		if (!m) continue;
		for (const token of m[1].trim().split(/\s+/)) {
			if (token && CODE_UNSUITED.has(token)) declared = false;
		}
	}
	return declared ?? true;
}

/** The unsuited names, exported so a test can fail when a component is renamed or
 *  retired out from under this list. Not for runtime use — call `slideTakesCode`. */
export const CODE_UNSUITED_NAMES: readonly string[] = [...CODE_UNSUITED];

/**
 * The tag the insert door should write on THIS slide.
 *
 * The layout already knows what fence it wants — `diagram`'s own skeleton is
 * ```mermaid, `code`'s and `compare-code`'s are ```js — so the door reads it from the
 * component grammar rather than opening a modal to ask. Falling back, in order: the
 * tag this deck already uses most (an author writing a Python deck means Python), then
 * plain text.
 *
 * `fences` is the per-class map built from the component manifests at the docs-site
 * build, injected exactly like `SlideHeadings` / `SlideBlocks`. Absent or unknown →
 * the deck's own habit, which is the safe direction.
 */
export type SlideFences = Record<string, string>;

export function defaultFenceTag(directives: string[], fences: SlideFences | undefined, deckTags: string[]): string {
	if (fences) {
		for (const d of directives) {
			const m = d.match(CLASS_PAYLOAD_RE);
			if (!m) continue;
			for (const token of m[1].trim().split(/\s+/)) {
				// `Object.hasOwn` keeps a slide naming `constructor` off the prototype chain —
				// the same guard `rendersBlock` carries, for the same reason.
				if (token && Object.hasOwn(fences, token) && typeof fences[token] === 'string') return fences[token];
			}
		}
	}
	// The deck's habit: its most-used tag, engine sub-languages included — a deck of
	// mermaid diagrams adding one more fence almost certainly means another diagram.
	const counts = new Map<string, number>();
	for (const t of deckTags) counts.set(t, (counts.get(t) || 0) + 1);
	let best = '';
	let bestN = 0;
	for (const [tag, n] of counts) {
		if (n > bestN) {
			best = tag;
			bestN = n;
		}
	}
	return best || PLAIN_FENCE.tag;
}

/** The leading `_class` token of a slide's directives — re-exported shape used by the
 *  chip's "pairs with" hint, so the picker can say when a tag and a layout disagree. */
export function slideClassToken(directives: string[]): string {
	for (const d of directives) {
		const m = d.match(CLASS_RE);
		if (m) return m[1];
	}
	return 'content';
}

/** The layout an engine fence belongs on, for the one-line mismatch hint. */
const ENGINE_FENCE_CLASS: Record<string, string> = { mermaid: 'diagram', anima: 'scene', functionplot: 'math' };

/**
 * "You tagged this `mermaid` but the slide is `_class: content`" — one line, shown,
 * never enforced. We warn and we coach: the engine renders a mermaid fence on a
 * content slide perfectly well, it just is not what the author probably meant.
 */
export function fenceClassHint(tag: string, directives: string[]): string | null {
	if (!isEngineFence(tag)) return null;
	const want = ENGINE_FENCE_CLASS[leadingTag(tag)];
	if (!want) return null;
	const have = slideClassToken(directives);
	return have === want ? null : `\`${tag}\` usually sits on a \`_class: ${want}\` slide — this one is \`${have}\`.`;
}
