// RAW BLOCKS AND MATH — the document half of editing them: how one is changed, taken out and told apart.
//
// The nodes and their grammar are `raw-block.ts`. This file is the writes the editor panel (RawPanel.tsx) calls, through the
// same open-editor state a pill and an image use (`objectsKey`, inline-objects.ts), so a tap, Enter, Undo and Done behave the same.
//
//   · A change REPLACES the node, never patches it, for the reason `editImage` does: the open editor's position is mapped
//     through the edit, and a replaced range maps cleanly. It is its own undo step.
//   · The text a node may carry is the same gate a paste goes through (`isRawBlockText`, `isInlineTex`), so a panel cannot write
//     what the document refuses on the way in: a blank line inside an HTML block, a `---` line, a directive comment.
//   · A locked slide's nodes never change.

import { closeHistory } from 'prosemirror-history';
import type { Node as PMNode } from 'prosemirror-model';
import { NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { deckSchema } from './deck-doc';
import { inLockedSlide } from './image-objects';
import { objectsKey } from './inline-objects';
import { isInlineTex, isRawBlockText, type RawKind } from './raw-block';

/** What a node is, as the panel needs to tell them apart. */
export type RawObjectKind = 'inline-math' | 'math' | 'html';

/** Is this node a math span or a raw block? The kind says which, or null when it is neither. */
export function rawObjectKind(node: PMNode | null | undefined): RawObjectKind | null {
	if (!node) return null;
	if (node.type === deckSchema.nodes.inline_math) return 'inline-math';
	if (node.type === deckSchema.nodes.raw_block) return node.attrs.kind === 'math' ? 'math' : 'html';
	return null;
}

/** A `$$` block's TeX: what stands between the delimiters, outer whitespace trimmed. */
export function displayTexOf(text: string): string {
	return /^\$\$([\s\S]*)\$\$$/.exec(text.trim())?.[1].trim() ?? '';
}

/**
 * A `$$` block rewritten around new TeX, keeping the SHAPE the author wrote: `$$\n…\n$$` stays on its own lines and
 * `$$ … $$` stays on one. Null when the TeX holds a `$$` (it would end the block early).
 */
export function displayTextFor(original: string, tex: string): string | null {
	const body = tex.trim();
	if (!body || body.includes('$$')) return null;
	return /^\$\$[ \t]*\n/.test(original) || body.includes('\n') ? `$$\n${body}\n$$` : `$$ ${body} $$`;
}

/** Why `text` cannot be this kind of block, in words the author can use, or null when it can. */
export function rawBlockProblem(kind: RawKind, text: string): string | null {
	if (isRawBlockText(kind, text)) return null;
	if (kind === 'math') return 'A math block needs TeX between the $$ lines, and a line of only dashes cannot sit inside it.';
	if (/\n[ \t]*(?:\n|$)/.test(text)) return 'A blank line ends an HTML block. Take the blank line out, or edit this slide in Markdown.';
	return 'This HTML block starts with a tag and cannot hold a line of only dashes or a directive comment.';
}

/** Why `tex` cannot be an inline math span, or null when it can. */
export function inlineTexProblem(tex: string): string | null {
	if (isInlineTex(tex)) return null;
	if (/[\n\r]/.test(tex)) return 'Inline math is one line. Use a math block for more.';
	if (tex.includes('$')) return 'A $ ends inline math. Write \\$ for a dollar sign.';
	if (/^\s|\s$/.test(tex) || tex.endsWith('\\')) return 'Inline math cannot start or end with a space, or end with a backslash.';
	return 'Write the TeX between the dollars.';
}

/** Replace the node at `pos` with `next`, as one undo step, and keep it selected. Returns whether the document now holds it. */
function replaceNode(view: EditorView, pos: number, node: PMNode, next: PMNode): boolean {
	view.dispatch(closeHistory(view.state.tr));
	const tr = view.state.tr.replaceWith(pos, pos + node.nodeSize, next);
	tr.setSelection(NodeSelection.create(tr.doc, pos)).setMeta(objectsKey, { edited: true });
	view.dispatch(tr);
	return view.state.doc.nodeAt(pos)?.eq(next) ?? false;
}

/** Change an inline math span's TeX. Returns whether the node now says it. */
export function editInlineMath(view: EditorView, pos: number, tex: string): boolean {
	const node = view.state.doc.nodeAt(pos);
	if (rawObjectKind(node) !== 'inline-math' || !node || inLockedSlide(view.state, pos) || !isInlineTex(tex)) return false;
	if (tex === node.attrs.tex) return true;
	return replaceNode(view, pos, node, node.type.create({ tex }, null, node.marks));
}

/** Change a raw block's text. Returns whether the node now says it. */
export function editRawBlock(view: EditorView, pos: number, text: string): boolean {
	const node = view.state.doc.nodeAt(pos);
	const kind = rawObjectKind(node);
	if (!node || (kind !== 'html' && kind !== 'math') || inLockedSlide(view.state, pos) || !isRawBlockText(kind, text)) return false;
	if (text === node.attrs.text) return true;
	return replaceNode(view, pos, node, node.type.create({ kind: node.attrs.kind, text }));
}

/** Take the node out. A paragraph left empty by a math span goes too, so no blank line is left on the slide. */
export function removeRaw(view: EditorView, pos: number): boolean {
	const node = view.state.doc.nodeAt(pos);
	if (!rawObjectKind(node) || !node || inLockedSlide(view.state, pos)) return false;
	const $at = view.state.doc.resolve(pos);
	const before = view.state.doc;
	const alone = node.isInline && $at.parent.type.name === 'paragraph' && $at.parent.childCount === 1 && $at.depth >= 2;
	view.dispatch(closeHistory(view.state.tr));
	const tr = view.state.tr;
	if (alone) tr.delete($at.before(), $at.after());
	else tr.delete(pos, pos + node.nodeSize);
	tr.setMeta(objectsKey, { close: true });
	view.dispatch(tr);
	return view.state.doc !== before;
}
