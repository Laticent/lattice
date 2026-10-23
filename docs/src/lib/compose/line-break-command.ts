import { newlineInCode } from 'prosemirror-commands';
import type { Command } from 'prosemirror-state';
import { deckSchema } from './deck-doc';

/**
 * Shift-Enter writes ONE new line inside the paragraph the caret is in. The rule the editor follows everywhere:
 * one newline is a line break, a blank line is a new paragraph (the engine runs markdown-it with `breaks: true`).
 * Enter splits the block as before; no key added a line to a paragraph until this one.
 *
 * It inserts a soft `hard_break`, which `deck-markdown.ts` writes back as a bare newline. The break carries no marks
 * (markdown cannot hold a line break inside a code span, so inside one the span splits in two). It acts only in a
 * paragraph: a fence takes a plain newline, and a heading or a table cell is a single line in markdown, so the key does
 * nothing there (and is swallowed, so the browser does not put a stray `<br>` into a cell).
 * ComposeView binds it as a DOM keydown handler, because on iOS the keymaps never see an Enter keydown.
 */
export const insertLineBreak: Command = (state, dispatch) => {
	const { $from } = state.selection;
	if ($from.parent.type === deckSchema.nodes.code_block) return newlineInCode(state, dispatch);
	if ($from.parent.type !== deckSchema.nodes.paragraph) return true;
	if (dispatch) dispatch(state.tr.replaceSelectionWith(deckSchema.nodes.hard_break.create({ soft: true }), false).scrollIntoView());
	return true;
};
