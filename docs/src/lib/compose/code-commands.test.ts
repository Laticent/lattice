// @vitest-environment node
// This file touches no DOM — the commands are pure, and so is the document they run
// against (see 2026-09-20-dom-library-bakeoff.md for why the environment is pinned).
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import {
	CODE_UNSUITED_NAMES,
	currentFenceTag,
	defaultFenceTag,
	exitCodeOnBlankLine,
	fenceClassHint,
	indentInCode,
	insertFence,
	isInCode,
	leadingTag,
	setFenceTag,
	slideTakesCode,
} from './code-commands';
import { deckToDoc, docToDeck } from './deck-doc';
import { deckFenceTags } from './fence-catalog';

// Exercised against a REAL deck document (`deckToDoc`), so the positions are the ones
// the editor resolves, and every assertion that matters is made on the SOURCE the
// round-trip emits — that string is the deliverable, not the node tree.

const DECK = [
	'---',
	'theme: indaco',
	'---',
	'',
	'<!-- _class: diagram -->',
	'',
	'## A diagram slide',
	'',
	'```mermaid',
	'graph LR',
	'  A[Markdown source] --> B[Engine render]',
	'```',
	'',
	'---',
	'',
	'<!-- _class: content -->',
	'',
	'## Prose',
	'',
	'A paragraph.',
	'',
].join('\n');

const stateFor = (source = DECK) => EditorState.create({ doc: deckToDoc(source) });

/** Put the caret at the first position inside the deck's first code block. */
function caretInFence(state: EditorState, offsetInText = 0): EditorState {
	let pos = -1;
	state.doc.descendants((node, p) => {
		if (pos === -1 && node.type.name === 'code_block') pos = p + 1;
	});
	if (pos === -1) throw new Error('no code block in fixture');
	return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos + offsetInText)));
}

/** Put the caret at the end of the last paragraph of the LAST slide. */
function caretInProse(state: EditorState): EditorState {
	let pos = -1;
	state.doc.descendants((node, p) => {
		if (node.type.name === 'paragraph' && node.textContent === 'A paragraph.') pos = p + 1 + node.content.size;
	});
	if (pos === -1) throw new Error('no prose paragraph in fixture');
	return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
}

function run(state: EditorState, command: (s: EditorState, d?: (tr: ReturnType<EditorState['tr']['setMeta']>) => void) => boolean) {
	let next = state;
	// biome-ignore lint/suspicious/noExplicitAny: ProseMirror's Command dispatch signature is structurally typed.
	const ok = (command as any)(state, (tr: any) => {
		next = state.apply(tr);
	});
	return { ok, state: next };
}

describe('reading the caret fence', () => {
	it('knows when the caret is in one, and which language it is', () => {
		const inFence = caretInFence(stateFor());
		expect(isInCode(inFence)).toBe(true);
		expect(currentFenceTag(inFence)).toBe('mermaid');
		const inProse = caretInProse(stateFor());
		expect(isInCode(inProse)).toBe(false);
		expect(currentFenceTag(inProse)).toBe('');
	});

	it('reads only the LEADING word of an info string', () => {
		expect(leadingTag('js {highlight=1,3}')).toBe('js');
		expect(leadingTag('  python  ')).toBe('python');
		expect(leadingTag('')).toBe('');
	});
});

describe('changing the language', () => {
	it('rewrites the tag in the emitted source', () => {
		const { ok, state } = run(caretInFence(stateFor()), setFenceTag('python'));
		expect(ok).toBe(true);
		expect(docToDeck(state.doc)).toContain('```python\ngraph LR');
		expect(docToDeck(state.doc)).not.toContain('```mermaid');
	});

	it('keeps marp attribute syntax that follows the tag', () => {
		// A picker that rewrote the whole info string would silently delete an author's
		// line highlights the first time they switched language.
		const src = DECK.replace('```mermaid', '```js {highlight=1,3}');
		const { state } = run(caretInFence(stateFor(src)), setFenceTag('python'));
		expect(docToDeck(state.doc)).toContain('```python {highlight=1,3}');
	});

	it('leaves the body untouched, byte for byte', () => {
		const { state } = run(caretInFence(stateFor()), setFenceTag('python'));
		expect(docToDeck(state.doc)).toContain('graph LR\n  A[Markdown source] --> B[Engine render]');
	});

	it('is a no-op outside a fence, and when the tag is already set', () => {
		expect(run(caretInProse(stateFor()), setFenceTag('python')).ok).toBe(false);
		expect(run(caretInFence(stateFor()), setFenceTag('mermaid')).ok).toBe(false);
	});
});

describe('inserting a fence', () => {
	it('inserts a TAGGED fence and parks the caret inside it', () => {
		const { ok, state } = run(caretInProse(stateFor()), insertFence('python'));
		expect(ok).toBe(true);
		// An empty fence serializes with one empty content line — `state.text('')` plus the
		// serializer's own closing newline. It round-trips, and the author is typing into it.
		expect(docToDeck(state.doc)).toContain('```python\n\n```');
		expect(isInCode(state)).toBe(true);
	});

	it('never produces a bare fence — an untagged one renders as undifferentiated mono', () => {
		const { state } = run(caretInProse(stateFor()), insertFence(''));
		expect(docToDeck(state.doc)).toContain('```text\n\n```');
	});

	it('refuses to nest inside an existing fence', () => {
		expect(run(caretInFence(stateFor()), insertFence('python')).ok).toBe(false);
	});

	it('refuses inside a GFM table cell, whose content cannot hold a block', () => {
		const withTable = ['<!-- _class: compare-table -->', '', '## T', '', '| A | B |', '| --- | --- |', '| 1 | 2 |', ''].join('\n');
		const state = stateFor(withTable);
		let pos = -1;
		state.doc.descendants((node, p) => {
			if (pos === -1 && node.type.name === 'table_cell') pos = p + 1;
		});
		const inCell = state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
		expect(run(inCell, insertFence('js')).ok).toBe(false);
	});

	it('leaves every other slide byte-identical', () => {
		const { state } = run(caretInProse(stateFor()), insertFence('python'));
		expect(docToDeck(state.doc)).toContain('```mermaid\ngraph LR');
	});
});

describe('Tab inside a fence', () => {
	it('indents at the caret instead of leaking focus out of the editor', () => {
		const { ok, state } = run(caretInFence(stateFor()), indentInCode());
		expect(ok).toBe(true);
		expect(docToDeck(state.doc)).toContain('```mermaid\n  graph LR');
	});

	it('outdents a line by up to two spaces', () => {
		const at = caretInFence(stateFor(), 'graph LR\n  A'.length);
		const { ok, state } = run(at, indentInCode(true));
		expect(ok).toBe(true);
		expect(docToDeck(state.doc)).toContain('\nA[Markdown source]');
	});

	it('swallows Tab even when there is nothing to outdent', () => {
		// Returning false here would hand Tab back to the browser, which is the trap.
		expect(run(caretInFence(stateFor()), indentInCode(true)).ok).toBe(true);
	});

	it('does nothing outside a fence, so lists and tables keep their Tab', () => {
		expect(run(caretInProse(stateFor()), indentInCode()).ok).toBe(false);
	});
});

describe('getting back out of a fence', () => {
	it('exits on Enter at a blank last line, and drops that blank line', () => {
		// A blank LAST line — the shape an author makes by pressing Enter at the end of
		// the snippet, which is the gesture this command turns into an exit.
		const src = DECK.replace('  A[Markdown source] --> B[Engine render]\n```', '  A[Markdown source] --> B[Engine render]\n\n```');
		const state = stateFor(src);
		let end = -1;
		state.doc.descendants((node, p) => {
			if (end === -1 && node.type.name === 'code_block') end = p + 1 + node.content.size;
		});
		const atEnd = state.apply(state.tr.setSelection(TextSelection.create(state.doc, end)));
		const { ok, state: next } = run(atEnd, exitCodeOnBlankLine);
		expect(ok).toBe(true);
		expect(isInCode(next)).toBe(false);
		// The blank line the author typed to get out is not left behind in the snippet.
		expect(docToDeck(next.doc)).toContain('--> B[Engine render]\n```');
	});

	it('leaves Enter alone mid-fence — there it must stay a newline', () => {
		expect(run(caretInFence(stateFor()), exitCodeOnBlankLine).ok).toBe(false);
	});

	it('leaves Enter alone at the end of a NON-blank last line', () => {
		const state = stateFor();
		let end = -1;
		state.doc.descendants((node, p) => {
			if (end === -1 && node.type.name === 'code_block') end = p + 1 + node.content.size;
		});
		const atEnd = state.apply(state.tr.setSelection(TextSelection.create(state.doc, end)));
		expect(run(atEnd, exitCodeOnBlankLine).ok).toBe(false);
	});
});

describe('which layouts get the door', () => {
	it('is permissive by default and for an unrecognized class', () => {
		expect(slideTakesCode([])).toBe(true);
		expect(slideTakesCode(['<!-- _class: content -->'])).toBe(true);
		expect(slideTakesCode(['<!-- _class: not-a-component -->'])).toBe(true);
	});

	it('stands down where a fence would mis-set the slide', () => {
		expect(slideTakesCode(['<!-- _class: title -->'])).toBe(false);
		expect(slideTakesCode(['<!-- _class: quote -->'])).toBe(false);
	});

	it('reads EVERY token of the payload, not just the leading one', () => {
		// `<!-- _class: dark quote -->` is ordinary authoring; matching only the first
		// token resolved it to `dark`, found nothing, and offered the door.
		expect(slideTakesCode(['<!-- _class: dark quote -->'])).toBe(false);
	});

	it('names components that still exist', () => {
		const grammar = require('node:fs').existsSync(require('node:path').resolve(__dirname, '../../../../dist/docs/grammar.json'));
		if (!grammar) return;
		const g = JSON.parse(require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../../../dist/docs/grammar.json'), 'utf8'));
		const known = new Set((g.components as { name: string }[]).map((c) => c.name));
		expect(CODE_UNSUITED_NAMES.filter((n) => !known.has(n))).toEqual([]);
	});
});

describe('the tag the door writes', () => {
	const FENCES = { diagram: 'mermaid', code: 'js', 'compare-code': 'js', scene: 'anima', math: 'functionplot' };

	it('takes the layout s own fence when the class declares one', () => {
		expect(defaultFenceTag(['<!-- _class: diagram -->'], FENCES, [])).toBe('mermaid');
		expect(defaultFenceTag(['<!-- _class: code -->'], FENCES, [])).toBe('js');
	});

	it('falls back to the deck s own habit', () => {
		expect(defaultFenceTag(['<!-- _class: content -->'], FENCES, ['python', 'js', 'python'])).toBe('python');
	});

	it('falls back to plain text when there is nothing to go on', () => {
		expect(defaultFenceTag([], undefined, [])).toBe('text');
	});

	it('cannot be walked up the prototype chain by a hostile class name', () => {
		expect(defaultFenceTag(['<!-- _class: constructor -->'], FENCES, [])).toBe('text');
	});

	it('reads a real deck s habit through the catalog', () => {
		expect(defaultFenceTag(['<!-- _class: content -->'], undefined, deckFenceTags(DECK))).toBe('mermaid');
	});
});

describe('the layout hint', () => {
	it('says when an engine fence sits on the wrong layout', () => {
		expect(fenceClassHint('mermaid', ['<!-- _class: content -->'])).toMatch(/_class: diagram/);
	});

	it('stays quiet when they agree, and for an ordinary language', () => {
		expect(fenceClassHint('mermaid', ['<!-- _class: diagram -->'])).toBeNull();
		expect(fenceClassHint('js', ['<!-- _class: content -->'])).toBeNull();
	});
});
