import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { toggleMark } from 'prosemirror-commands';
import { closeHistory, history, redo, redoDepth, undo, undoDepth } from 'prosemirror-history';
import { DOMParser as PMDOMParser } from 'prosemirror-model';
import { EditorState, NodeSelection, type Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { deckSchema, deckToDoc, docToDeck, emitDeck, initBaseline, rebaselineSlides } from './deck-doc';
import { serializeInlineObject } from './inline-object';
import {
	closeObjectEditor,
	editObject,
	editObjectAsText,
	type InlineKernels,
	inlineObjectsPlugin,
	insertBlocker,
	insertObject,
	kindOf,
	leaveObject,
	normalizeDeck,
	normalizeObjects,
	type OpenObject,
	openObject,
	openObjectEditor,
} from './inline-objects';

// The REAL kernels, the same module the Studio loads through the authoring bundle.
const kernels = createRequire(import.meta.url)('../../../../lib/authoring/inline-editors.js') as InlineKernels;

const DECK = [
	'<!-- _class: content -->',
	'',
	'## Status',
	'',
	'Shipped `{SHIPPED, c2}` and `{BETA, tag, c4}`, but `{x}` is not a pill and `{{name}}` is not either.',
	'',
	'- Item `{3, circle}`',
	'',
	'```text',
	'a fence with `{LIVE}` inside',
	'```',
	'',
	'---',
	'',
	'<!-- _class: content -->',
	'',
	'## Next',
	'',
	'Plain slide with `{DONE, c1}`.',
	'',
	'---',
	'',
	'<!-- _class: content -->',
	'',
	'## Locked',
	'',
	'This has ~~strike~~ and `{LOCKED, c6}`.',
].join('\n');

function mount(source: string, onOpenChange: (o: OpenObject | null) => void = () => {}, extra: Plugin[] = [history()]) {
	const doc = deckToDoc(source);
	const plugin = inlineObjectsPlugin({ getKernels: () => kernels, getDeckLiteral: () => false, onOpenChange });
	const view = new EditorView(document.createElement('div'), { state: EditorState.create({ doc, plugins: [plugin, ...extra] }) });
	normalizeDeck(view, kernels, false);
	return view;
}

/** Every object node in the document, in order, with its position. */
function objects(doc: ReturnType<typeof deckToDoc>) {
	const out: { pos: number; src: string }[] = [];
	doc.descendants((node, pos) => {
		if (node.type === deckSchema.nodes.inline_object) out.push({ pos, src: node.attrs.src as string });
	});
	return out;
}

const texts = (view: EditorView) => objects(view.state.doc).map((o) => o.src);

/** The objects a fresh load of the deck this document writes would have: the round trip an author's next visit makes. */
function reparsed(view: EditorView): string[] {
	const doc = deckToDoc(docToDeck(view.state.doc));
	const tr = normalizeObjects(EditorState.create({ doc }), kernels, false, { sparing: false });
	return objects(tr?.doc ?? doc).map((o) => o.src);
}

describe('the inline object node', () => {
	it('turns the code spans the engine reads as pills into nodes, and nothing else', () => {
		const view = mount(DECK);
		expect(texts(view)).toEqual(['{SHIPPED, c2}', '{BETA, tag, c4}', '{3, circle}', '{DONE, c1}']);
		// `{x}` and `{{name}}` are not pills, the fenced one is not inline, and the locked slide stays text.
		const deck = docToDeck(view.state.doc);
		expect(deck).toContain('`{x}`');
		expect(deck).toContain('`{LOCKED, c6}`');
	});

	it('writes back exactly the bytes it came from', () => {
		const view = mount(DECK);
		expect(docToDeck(view.state.doc)).toBe(docToDeck(deckToDoc(DECK)));
	});

	it('keeps the formatting around it', () => {
		const src = '<!-- _class: content -->\n\n## T\n\nBold **`{SHIPPED, c2}`** and *`{BETA}`* here.';
		const view = mount(src);
		expect(texts(view)).toEqual(['{SHIPPED, c2}', '{BETA}']);
		expect(docToDeck(view.state.doc)).toBe(docToDeck(deckToDoc(src)));
		const first = view.state.doc.nodeAt(objects(view.state.doc)[0].pos);
		expect(first?.marks.map((m) => m.type.name)).toEqual(['strong']);
	});

	it('leaves two adjacent spans that merged into one run as text', () => {
		const view = mount('<!-- _class: content -->\n\n## T\n\n`{A}``{B}`');
		expect(texts(view)).toEqual([]);
	});

	it('does nothing in a deck that turned the inline grammar off', () => {
		const state = EditorState.create({ doc: deckToDoc(DECK) });
		expect(normalizeObjects(state, kernels, true)).toBeNull();
		const slideOff = deckToDoc(`<!-- _class: inline-code-literal -->\n\n## T\n\n\`{SHIPPED, c2}\``);
		expect(normalizeObjects(EditorState.create({ doc: slideOff }), kernels, false)).toBeNull();
	});

	it('plain text copy and textContent still see the notation', () => {
		const view = mount(DECK);
		expect(view.state.doc.textContent).toContain('{SHIPPED, c2}');
	});

	it('the document and the slide both ask the kernel, never a second parser', () => {
		expect(kindOf('{SHIPPED, c2}', kernels)?.kind.id).toBe('pill');
		expect(kindOf('{x}', kernels)).toBeNull();
		expect(kindOf('{a}\n---\n{b}', kernels)).toBeNull();
	});
});

// The property that matters for every deck an author opens: drawing the objects must not change
// one byte of the deck. Run over every deck, gallery and baseline the repo ships.
describe('opening a deck changes no bytes (the shipped corpus)', () => {
	const ROOT = path.resolve(__dirname, '../../../..');
	function markdownIn(dir: string, out: string[] = []): string[] {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
			const full = path.join(dir, e.name);
			if (e.isDirectory()) markdownIn(full, out);
			else if (e.name.endsWith('.md')) out.push(full);
		}
		return out;
	}
	const files = [
		...markdownIn(path.join(ROOT, 'examples')),
		...markdownIn(path.join(ROOT, 'lib')).filter((f) => f.endsWith('.gallery.md')),
		...markdownIn(path.join(ROOT, 'test/integration/baseline-decks')),
	];

	it('has a real corpus', () => {
		expect(files.length).toBeGreaterThan(100);
	});

	it('emits the same deck with and without the objects, and keeps every untouched slide verbatim', () => {
		let withObjects = 0;
		let converted = 0;
		for (const file of files) {
			const source = fs.readFileSync(file, 'utf8');
			let doc: ReturnType<typeof deckToDoc>;
			try {
				doc = deckToDoc(source);
			} catch {
				continue; // a deck Compose cannot parse is not Compose's to open
			}
			const base = initBaseline(doc);
			const before = emitDeck(doc, base);
			const state = EditorState.create({ doc });
			const tr = normalizeObjects(state, kernels, kernels.isLiteralFromSource(source));
			if (!tr) continue;
			withObjects++;
			converted += objects(tr.doc).length;
			// The silent pass re-points the baseline; the emit must be byte-identical to the one without objects.
			const base2 = initBaseline(doc);
			rebaselineSlides(tr.doc, base2);
			expect(emitDeck(tr.doc, base2), file).toBe(before);
			// And a full re-serialize (the edited-slide path) agrees too.
			expect(docToDeck(tr.doc), file).toBe(docToDeck(doc));
		}
		// Measured when this was written: 112 pills in 6 decks convert (4 more sit in literal decks).
		expect(withObjects).toBeGreaterThanOrEqual(5);
		expect(converted).toBeGreaterThanOrEqual(100);
	});
});

describe('the selection decides text or object', () => {
	it('leaves a span as text while the selection touches it, and turns it into an object when the selection leaves', () => {
		const view = mount(DECK, undefined, [history()]);
		// Turn the first object back into text and keep the caret in it.
		const [first] = objects(view.state.doc);
		expect(editObjectAsText(view, first.pos)).toBe(true);
		expect(texts(view)).toEqual(['{BETA, tag, c4}', '{3, circle}', '{DONE, c1}']);
		const sel = view.state.selection;
		expect(view.state.doc.textBetween(sel.from, sel.to)).toBe('SHIPPED, c2');
		// Typing inside it stays text.
		view.dispatch(view.state.tr.insertText('X', sel.from));
		expect(texts(view)).not.toContain('{XSHIPPED, c2}');
		// Moving away completes it: the span is an object again (the engine reads `{XSHIPPED, c2}` as a pill).
		view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)));
		expect(texts(view)).toContain('{XSHIPPED, c2}');
	});

	it('does not touch a span the caret is at the edge of', () => {
		const view = mount(DECK);
		const [first] = objects(view.state.doc);
		editObjectAsText(view, first.pos);
		const node = view.state.doc.nodeAt(first.pos);
		expect(node?.isText).toBe(true);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, first.pos + (node?.nodeSize ?? 0))));
		expect(view.state.doc.nodeAt(first.pos)?.isText).toBe(true);
	});

	it('does not run after an undo, so the redo stack survives', () => {
		const view = mount(DECK);
		const [first] = objects(view.state.doc);
		openObjectEditor(view, first.pos);
		expect(editObject(view, first.pos, { color: 'c9' }, kernels)).toBe(true);
		undo(view.state, view.dispatch);
		expect(view.state.doc.nodeAt(first.pos)?.attrs.src).toBe('{SHIPPED, c2}');
	});
});

describe('the open editor', () => {
	it('opens on a tap: the node is selected and the editor is open on it', () => {
		const seen: (OpenObject | null)[] = [];
		const view = mount(DECK, (o) => seen.push(o));
		const [first] = objects(view.state.doc);
		expect(openObjectEditor(view, first.pos)).toBe(true);
		expect(view.state.selection).toBeInstanceOf(NodeSelection);
		expect(openObject(view.state)).toMatchObject({ pos: first.pos, src: '{SHIPPED, c2}' });
		expect(seen.at(-1)).toMatchObject({ pos: first.pos });
	});

	it('refuses a position that is not an object', () => {
		const view = mount(DECK);
		expect(openObjectEditor(view, 1)).toBe(false);
		expect(openObject(view.state)).toBeNull();
	});

	it('every pick lands, keeps the editor open and the node selected, and keeps the id', () => {
		const view = mount(DECK);
		const [first] = objects(view.state.doc);
		openObjectEditor(view, first.pos);
		const id = openObject(view.state)?.id;
		expect(editObject(view, first.pos, { color: 'c9' }, kernels)).toBe(true);
		expect(docToDeck(view.state.doc)).toContain('`{SHIPPED, c9}`');
		expect(editObject(view, first.pos, { size: 'lg' }, kernels)).toBe(true);
		expect(docToDeck(view.state.doc)).toContain('`{SHIPPED, c9, lg}`');
		expect(view.state.selection).toBeInstanceOf(NodeSelection);
		expect(openObject(view.state)).toMatchObject({ pos: first.pos, src: '{SHIPPED, c9, lg}', id });
	});

	it('writes nothing the kernel declines, and nothing when the object already says it', () => {
		const view = mount(DECK);
		const [first] = objects(view.state.doc);
		const before = view.state.doc;
		expect(editObject(view, first.pos, { color: 'c13' }, kernels)).toBe(false);
		expect(editObject(view, first.pos, { label: '' }, kernels)).toBe(false);
		expect(view.state.doc).toBe(before);
		expect(editObject(view, first.pos, { color: 'c2' }, kernels)).toBe(true);
		expect(view.state.doc).toBe(before);
	});

	it('a label with a backtick is never written, and a line break never reaches the deck', () => {
		const view = mount(DECK);
		const [first] = objects(view.state.doc);
		expect(editObject(view, first.pos, { label: 'a`b' }, kernels)).toBe(false);
		editObject(view, first.pos, { label: 'a\nb' }, kernels);
		expect(docToDeck(view.state.doc)).not.toMatch(/`\{[^`]*\n[^`]*\}`/);
		for (const o of objects(view.state.doc)) expect(o.src).not.toMatch(/[\r\n`]/);
	});

	it('follows the object when the author types or deletes before it (the stale position regression)', () => {
		const view = mount(DECK);
		const [first, second] = objects(view.state.doc);
		openObjectEditor(view, second.pos);
		// Type ahead of it, on its line.
		view.dispatch(view.state.tr.insertText('abc', first.pos - 1));
		// The selection maps onto the node, so the editor stays open, now three characters later.
		const moved = openObject(view.state);
		expect(moved).toMatchObject({ pos: second.pos + 3, src: '{BETA, tag, c4}' });
		expect(view.state.doc.nodeAt(moved?.pos as number)?.attrs.src).toBe('{BETA, tag, c4}');
		expect(editObject(view, moved?.pos as number, { color: 'c7' }, kernels)).toBe(true);
		expect(docToDeck(view.state.doc)).toContain('`{BETA, tag, c7}`');
		expect(docToDeck(view.state.doc)).toContain('`{SHIPPED, c2}`');
	});

	it('a deletion before the open object (history, a collaborator) moves the position with it', () => {
		const view = mount(DECK);
		const [first, second] = objects(view.state.doc);
		openObjectEditor(view, second.pos);
		// A transaction that deletes text before the object but leaves the selection mapped onto it.
		const tr = view.state.tr.delete(first.pos + 1, second.pos);
		view.dispatch(tr);
		const open = openObject(view.state);
		expect(open?.src).toBe('{BETA, tag, c4}');
		expect(view.state.doc.nodeAt(open?.pos as number)?.attrs.src).toBe('{BETA, tag, c4}');
		expect(editObject(view, open?.pos as number, { color: 'c8' }, kernels)).toBe(true);
		expect(docToDeck(view.state.doc)).toContain('{BETA, tag, c8}');
	});

	it('closes when the object is deleted, and when the selection leaves it', () => {
		const view = mount(DECK);
		const [first] = objects(view.state.doc);
		openObjectEditor(view, first.pos);
		view.dispatch(view.state.tr.delete(first.pos, first.pos + 1));
		expect(openObject(view.state)).toBeNull();
		const [again] = objects(view.state.doc);
		openObjectEditor(view, again.pos);
		view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)));
		expect(openObject(view.state)).toBeNull();
	});

	it('Done moves the caret off the object, so the next keystroke cannot replace it', () => {
		const view = mount(DECK);
		const [first] = objects(view.state.doc);
		openObjectEditor(view, first.pos);
		leaveObject(view);
		expect(openObject(view.state)).toBeNull();
		expect(view.state.selection).toBeInstanceOf(TextSelection);
		expect(view.state.selection.from).toBe(first.pos + 1);
		view.dispatch(view.state.tr.insertText('x'));
		expect(texts(view)).toContain('{SHIPPED, c2}');
	});

	it('closeObjectEditor closes without moving anything', () => {
		const view = mount(DECK);
		const [first] = objects(view.state.doc);
		openObjectEditor(view, first.pos);
		closeObjectEditor(view);
		expect(openObject(view.state)).toBeNull();
		expect(view.state.selection).toBeInstanceOf(NodeSelection);
	});

	it('does nothing to a locked slide', () => {
		const view = mount(DECK);
		const lockedPos = (() => {
			let at = -1;
			view.state.doc.descendants((n, pos) => {
				if (at < 0 && n.isText && n.text?.includes('{LOCKED')) at = pos;
			});
			return at;
		})();
		expect(view.state.doc.nodeAt(lockedPos)?.isText).toBe(true);
		expect(openObjectEditor(view, lockedPos)).toBe(false);
	});
});

describe('undo', () => {
	it('is one step per pick', () => {
		const view = mount(DECK);
		const [first] = objects(view.state.doc);
		openObjectEditor(view, first.pos);
		editObject(view, first.pos, { color: 'c9' }, kernels);
		editObject(view, first.pos, { size: 'lg' }, kernels);
		undo(view.state, view.dispatch);
		expect(docToDeck(view.state.doc)).toContain('`{SHIPPED, c9}`');
		undo(view.state, view.dispatch);
		expect(docToDeck(view.state.doc)).toBe(docToDeck(deckToDoc(DECK)));
	});

	it('a pick made right after typing undoes alone, and leaves the typing', () => {
		const view = mount(DECK);
		view.dispatch(view.state.tr.insertText('X', 1));
		const typed = docToDeck(view.state.doc);
		const [first] = objects(view.state.doc);
		openObjectEditor(view, first.pos);
		editObject(view, first.pos, { color: 'c9' }, kernels);
		undo(view.state, view.dispatch);
		expect(docToDeck(view.state.doc)).toBe(typed);
	});
});

describe('insertObject', () => {
	const door = () => insertObject(() => kernels);

	function caretIn(view: EditorView, needle: string, after = false) {
		let at = -1;
		view.state.doc.descendants((node, pos) => {
			if (at < 0 && node.isText && node.text?.includes(needle)) at = pos + node.text.indexOf(needle) + (after ? needle.length : 0);
		});
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
		return at;
	}

	it('puts an object at the caret, selects it and opens its editor', () => {
		const view = mount(DECK);
		const at = caretIn(view, 'Plain slide', true);
		expect(door()(view.state, view.dispatch)).toBe(true);
		expect(view.state.doc.nodeAt(at)?.attrs.src).toBe('{Status}');
		expect(view.state.selection).toBeInstanceOf(NodeSelection);
		expect(openObject(view.state)).toMatchObject({ pos: at, src: '{Status}' });
		expect(docToDeck(view.state.doc)).toContain('Plain slide`{Status}` with');
	});

	it('uses a short selected word as the label', () => {
		const view = mount(DECK);
		let from = -1;
		view.state.doc.descendants((node, pos) => {
			if (from < 0 && node.isText && node.text?.startsWith('Plain slide')) from = pos;
		});
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + 5)));
		expect(door()(view.state, view.dispatch)).toBe(true);
		expect(view.state.doc.nodeAt(from)?.attrs.src).toBe('{Plain}');
	});

	it('declines where it would damage the document, and says nothing was done', () => {
		const view = mount(DECK);
		const before = view.state.doc;
		// In a fenced block.
		caretIn(view, 'a fence with');
		expect(door()(view.state, view.dispatch)).toBe(false);
		// In a locked slide.
		caretIn(view, 'This has');
		expect(door()(view.state, view.dispatch)).toBe(false);
		// Across two blocks.
		let a = -1;
		let b = -1;
		view.state.doc.descendants((node, pos) => {
			if (a < 0 && node.isText && node.text?.includes('Shipped')) a = pos + 2;
			if (b < 0 && node.isText && node.text?.includes('Item')) b = pos + 2;
		});
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, a, b)));
		expect(door()(view.state, view.dispatch)).toBe(false);
		expect(view.state.doc).toBe(before);
	});

	it('declines inside the author\'s own code span, which it would split in two', () => {
		const view = mount('<!-- _class: content -->\n\n## T\n\nA `some code` here.');
		const before = view.state.doc;
		caretIn(view, 'some', true);
		expect(door()(view.state, view.dispatch)).toBe(false);
		expect(view.state.doc).toBe(before);
	});

	it('at the edge of the author\'s code span, or beside a pill, a space keeps the two spans apart', () => {
		// The two cases that used to write ONE code span: `some``{Status}` and `{SHIPPED, c2}``{Status}`.
		const view = mount('<!-- _class: content -->\n\n## T\n\nA `some` and `{SHIPPED, c2}` here.');
		caretIn(view, 'some', true);
		expect(door()(view.state, view.dispatch)).toBe(true);
		expect(docToDeck(view.state.doc)).toContain('`some` `{Status}` and');
		// Next to the pill: put the caret right after it (what Done does), then insert.
		const pill = objects(view.state.doc).find((o) => o.src === '{SHIPPED, c2}');
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, (pill?.pos as number) + 1)));
		expect(door()(view.state, view.dispatch)).toBe(true);
		expect(docToDeck(view.state.doc)).toContain('`{SHIPPED, c2}` `{Status}`');
		// And what was written reads back as the same objects.
		expect(reparsed(view)).toEqual(texts(view));
	});

	it('declines until the kernels have loaded', () => {
		const view = mount(DECK);
		caretIn(view, 'Plain slide', true);
		expect(insertObject(() => null)(view.state, view.dispatch)).toBe(false);
	});
});

describe('two pills never touch (the checker\'s first finding)', () => {
	const two = '<!-- _class: content -->\n\n## T\n\nA `{ONE, c2}` `{TWO, c4}` B';

	it('deleting the text between two pills leaves them apart, and both are still pills on the next load', () => {
		const view = mount(two);
		const [a, b] = objects(view.state.doc);
		expect(b.pos).toBe(a.pos + 2); // one object, one space, the other object
		view.dispatch(view.state.tr.delete(a.pos + 1, b.pos));
		// The DOCUMENT keeps them apart (the serializer's own space is only a last resort).
		expect(view.state.doc.nodeAt(a.pos + 1)?.text).toBe(' ');
		expect(texts(view)).toEqual(['{ONE, c2}', '{TWO, c4}']);
		expect(docToDeck(view.state.doc)).toContain('`{ONE, c2}` `{TWO, c4}`');
		expect(reparsed(view)).toEqual(['{ONE, c2}', '{TWO, c4}']);
	});

	it('as a last resort the serializer separates two objects that reached it touching', () => {
		const obj = (src: string) => deckSchema.nodes.inline_object.create({ src });
		const para = deckSchema.nodes.paragraph.create(null, [obj('{ONE, c2}'), obj('{TWO, c4}')]);
		const doc = deckSchema.nodes.doc.create(null, [deckSchema.nodes.slide.create(null, [para])]);
		expect(docToDeck(doc)).toBe('`{ONE, c2}` `{TWO, c4}`');
	});

	it('the serializer\'s last resort leaves two objects alone when a mark sits between them', () => {
		const obj = (src: string, marks: readonly import('prosemirror-model').Mark[] = []) => deckSchema.nodes.inline_object.create({ src }, null, marks);
		const strong = deckSchema.marks.strong.create();
		const para = deckSchema.nodes.paragraph.create(null, [obj('{ONE, c2}', [strong]), obj('{TWO, c4}')]);
		const doc = deckSchema.nodes.doc.create(null, [deckSchema.nodes.slide.create(null, [para])]);
		expect(docToDeck(doc)).toBe('**`{ONE, c2}`**`{TWO, c4}`');
	});

	it('an object beside code text is separated too', () => {
		const view = mount('<!-- _class: content -->\n\n## T\n\nA `{ONE, c2}` `code` B');
		const [a] = objects(view.state.doc);
		view.dispatch(view.state.tr.delete(a.pos + 1, a.pos + 2));
		expect(view.state.doc.nodeAt(a.pos + 1)?.text).toBe(' ');
		expect(docToDeck(view.state.doc)).toContain('`{ONE, c2}` `code`');
		expect(reparsed(view)).toEqual(['{ONE, c2}']);
	});
});

describe('opening a deck, then clicking, writes nothing (the checker\'s second finding)', () => {
	const SRC = '<!-- _class: content -->\n\n`{DRAFT, c2}` Quarterly review\n\n* one\n* two\n\n---\n\n<!-- _class: content -->\n\n## Two\n\nMore.';

	function open() {
		const doc = deckToDoc(SRC);
		const base = initBaseline(doc);
		const before = emitDeck(doc, base);
		const view = mount(SRC, undefined, [history()]);
		return { view, base, before };
	}

	it('converts a pill that sits at the start of the document, where a fresh selection is', () => {
		const { view } = open();
		expect(texts(view)).toEqual(['{DRAFT, c2}']);
	});

	it('then a click into another slide changes nothing, and leaves no undo step', () => {
		const { view, base, before } = open();
		rebaselineSlides(view.state.doc, base);
		const docBefore = view.state.doc;
		let at = -1;
		view.state.doc.descendants((n, pos) => {
			if (at < 0 && n.isText && n.text === 'More.') at = pos + 2;
		});
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
		expect(view.state.doc).toBe(docBefore);
		expect(undoDepth(view.state)).toBe(0);
		expect(emitDeck(view.state.doc, base)).toBe(before);
		expect(before).toContain('* one\n* two');
	});
});

describe('undo and redo (the checker\'s third finding)', () => {
	it('a plain click after an undo does not clear the redo stack', () => {
		const view = mount(DECK);
		const [first] = objects(view.state.doc);
		editObjectAsText(view, first.pos);
		// Separate history groups, as real typing with pauses makes them.
		view.dispatch(closeHistory(view.state.tr));
		view.dispatch(view.state.tr.insertText('X', view.state.selection.from));
		view.dispatch(closeHistory(view.state.tr));
		view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)));
		expect(texts(view)).toContain('{XSHIPPED, c2}');
		undo(view.state, view.dispatch);
		// The undo left the span as text with the caret in it, and a redo to go to.
		expect(view.state.doc.nodeAt(first.pos)?.isText).toBe(true);
		expect(redoDepth(view.state)).toBeGreaterThan(0);
		const depth = redoDepth(view.state);
		// A plain click somewhere else.
		let at = -1;
		view.state.doc.descendants((n, pos) => {
			if (at < 0 && n.isText && n.text?.includes('Plain slide')) at = pos + 2;
		});
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
		expect(redoDepth(view.state)).toBe(depth);
		redo(view.state, view.dispatch);
		expect(texts(view)).toContain('{XSHIPPED, c2}');
	});

	it('the author\'s next edit after an undo converts what the undo left as text', () => {
		const view = mount(DECK);
		const [first] = objects(view.state.doc);
		editObjectAsText(view, first.pos);
		view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)));
		undo(view.state, view.dispatch);
		view.dispatch(view.state.tr.insertText('!', 1));
		view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
		expect(texts(view)).toContain('{SHIPPED, c2}');
	});
});

describe('an edit-time pass stays on the slides the author touched', () => {
	it('an edit on slide 1 converts slide 1\'s span and leaves slide 2\'s text span, and slide 2 keeps its node', () => {
		// No load pass: both slides still hold their pills as text.
		const doc = deckToDoc('<!-- _class: content -->\n\nOne `{ONE, c2}`\n\n---\n\n<!-- _class: content -->\n\nTwo `{TWO, c4}`');
		const plugin = inlineObjectsPlugin({ getKernels: () => kernels, getDeckLiteral: () => false, onOpenChange: () => {} });
		const view = new EditorView(document.createElement('div'), { state: EditorState.create({ doc, plugins: [plugin, history()] }) });
		const slide2 = view.state.doc.child(1);
		view.dispatch(view.state.tr.insertText('!', 2));
		expect(texts(view)).toEqual(['{ONE, c2}']);
		expect(view.state.doc.child(1)).toBe(slide2);
	});

	it('turning one pill back into text and leaving it does not give any other slide new nodes', () => {
		const view = mount(DECK);
		const slidesBefore = [] as unknown[];
		view.state.doc.forEach((slide) => {
			slidesBefore.push(slide);
		});
		const [first] = objects(view.state.doc);
		editObjectAsText(view, first.pos);
		view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)));
		const slidesAfter = [] as unknown[];
		view.state.doc.forEach((slide) => {
			slidesAfter.push(slide);
		});
		expect(slidesAfter[1]).toBe(slidesBefore[1]);
		expect(slidesAfter[2]).toBe(slidesBefore[2]);
	});
});

describe('the second checker\'s findings', () => {
	const base = '<!-- _class: content -->\n\n## T\n\n';

	it('typing code just before a pill keeps the caret in the code span (the gap goes after it)', () => {
		const view = mount(`${base}Say ab\`{ONE, c2}\` B`);
		let from = -1;
		view.state.doc.descendants((n, pos) => {
			if (from < 0 && n.isText && n.text?.startsWith('Say ab')) from = pos + 4;
		});
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + 2)));
		toggleMark(deckSchema.marks.code)(view.state, view.dispatch);
		view.dispatch(view.state.tr.insertText('x'));
		view.dispatch(view.state.tr.insertText('y'));
		expect(docToDeck(view.state.doc)).toContain('Say `xy` `{ONE, c2}` B');
		expect(reparsed(view)).toEqual(['{ONE, c2}']);
	});

	it('pills that a mark already separates get no space the author never wrote', () => {
		for (const src of [`X **\`{A, c2}\`**\`{B, c4}\` Y`, `X [\`{A, c2}\`](http://x)\`{B, c4}\` Y`, `X *\`{A, c2}\`*\`code\` Y`]) {
			const view = mount(base + src);
			const written = docToDeck(deckToDoc(base + src));
			expect(docToDeck(view.state.doc)).toBe(written);
			// And an edit in the same slide leaves the touching marks as they were.
			view.dispatch(view.state.tr.insertText('¤', 2));
			expect(docToDeck(view.state.doc).replace('¤', '')).toBe(written);
		}
	});

	it('the door declines in a deck or a slide set to inline-code: literal, and says why', () => {
		const deckLit = mount('---\ninline-code: literal\n---\n\n## T\n\nPlain text here.');
		const slideLit = mount('<!-- _class: content inline-code-literal -->\n\n## T\n\nPlain text here.');
		for (const [view, literal] of [[deckLit, true], [slideLit, false]] as const) {
			let at = -1;
			view.state.doc.descendants((n, pos) => {
				if (at < 0 && n.isText && n.text?.includes('Plain text')) at = pos + 5;
			});
			view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
			expect(insertBlocker(view.state, kernels, literal)).toMatch(/inline-code: literal/);
			expect(insertObject(() => kernels, { getDeckLiteral: () => literal })(view.state, view.dispatch)).toBe(false);
			expect(texts(view)).toEqual([]);
		}
	});

	it('an object pasted into a literal slide goes back to the code span it is', () => {
		const state = EditorState.create({ doc: deckToDoc('<!-- _class: content inline-code-literal -->\n\n## T\n\nHere: and there.') });
		let at = -1;
		state.doc.descendants((n, pos) => {
			if (at < 0 && n.isText && n.text?.startsWith('Here:')) at = pos + 5;
		});
		const withObject = state.apply(state.tr.insert(at, deckSchema.nodes.inline_object.create({ src: '{SHIPPED, c2}' })));
		expect(objects(withObject.doc)).toHaveLength(1);
		const tr = normalizeObjects(withObject, kernels, false, { sparing: false });
		expect(tr).not.toBeNull();
		expect(objects((tr as NonNullable<typeof tr>).doc)).toHaveLength(0);
		expect(docToDeck((tr as NonNullable<typeof tr>).doc)).toContain('Here:`{SHIPPED, c2}` and there.');
	});
});

describe('a paste carries an object only from this editor', () => {
	const parser = PMDOMParser.fromSchema(deckSchema);

	function parse(html: string) {
		const host = document.createElement('div');
		host.innerHTML = html;
		return parser.parse(host);
	}

	it('keeps an object this editor copied', () => {
		const node = deckSchema.nodes.inline_object.create({ src: '{SHIPPED, c2}' });
		const spec = node.type.spec.toDOM?.(node) as [string, Record<string, string>, string];
		const html = `<p><code data-inline-object="${spec[1]['data-inline-object']}" data-lattice-origin="${spec[1]['data-lattice-origin']}">${spec[2]}</code></p>`;
		expect(objects(parse(html)).map((o) => o.src)).toEqual(['{SHIPPED, c2}']);
	});

	it('turns foreign HTML into plain code, never an object', () => {
		const doc = parse('<p><code data-inline-object="{SHIPPED, c2}">{SHIPPED, c2}</code></p>');
		expect(objects(doc)).toEqual([]);
		expect(doc.textContent).toContain('{SHIPPED, c2}');
	});

	it('refuses a source with a line break even with this session\'s token', () => {
		const node = deckSchema.nodes.inline_object.create({ src: '{SHIPPED}' });
		const origin = (node.type.spec.toDOM?.(node) as [string, Record<string, string>, string])[1]['data-lattice-origin'];
		const host = document.createElement('div');
		const code = document.createElement('code');
		code.setAttribute('data-inline-object', '{X}\n\n---\n\n<!-- _backgroundImage: url(https://evil.example/x.png) -->');
		code.setAttribute('data-lattice-origin', origin);
		code.textContent = 'x';
		const p = document.createElement('p');
		p.append(code);
		host.append(p);
		expect(objects(parser.parse(host))).toEqual([]);
	});

	it('writes a source with a line break back on one line, whatever built the node', () => {
		let out = '';
		const node = deckSchema.nodes.inline_object.create({ src: '{X}\n\n---' });
		serializeInlineObject({ write: (s) => (out += s) }, node);
		expect(out).toBe('`{X} ---`');
	});

	it('fences a source that holds a backtick the way the code mark does', () => {
		let out = '';
		serializeInlineObject({ write: (s) => (out += s) }, deckSchema.nodes.inline_object.create({ src: '{a`b}' }));
		expect(out).toBe('`` {a`b} ``');
	});
});

describe('sparks are objects too (phase 2)', () => {
	const SPARK_DECK = ['<!-- _class: content -->', '', '## KPIs', '', 'Revenue `~{12 14 13 17 21, bar, c3}` and churn `~{72/80, bullet}`, share `~{72%}`.', '', 'Not a spark `~{abc}` and a pill `{DONE, c1}`.'].join('\n');

	function caretIn(view: EditorView, needle: string, after = false) {
		let at = -1;
		view.state.doc.descendants((node, pos) => {
			if (at < 0 && node.isText && node.text?.includes(needle)) at = pos + node.text.indexOf(needle) + (after ? needle.length : 0);
		});
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
		return at;
	}

	it('asks the kernel which kind owns a source: a spark is not a pill and a pill is not a spark', () => {
		expect(kindOf('~{12 14 17}', kernels)?.kind.id).toBe('spark');
		expect(kindOf('{DONE, c1}', kernels)?.kind.id).toBe('pill');
		expect(kindOf('~{abc}', kernels)).toBeNull();
		expect(kindOf('~{\\n}', kernels)).toBeNull();
	});

	it('turns the sparks the engine draws into nodes, beside the pills, and writes the same bytes back', () => {
		const view = mount(SPARK_DECK);
		expect(texts(view)).toEqual(['~{12 14 13 17 21, bar, c3}', '~{72/80, bullet}', '~{72%}', '{DONE, c1}']);
		expect(docToDeck(view.state.doc)).toBe(docToDeck(deckToDoc(SPARK_DECK)));
		expect(reparsed(view)).toEqual(texts(view));
	});

	it('an edit through the host writes the changed word and the deck re-reads it', () => {
		const view = mount(SPARK_DECK);
		const [first] = objects(view.state.doc);
		expect(editObject(view, first.pos, { size: 'lg', color: null }, kernels)).toBe(true);
		expect(view.state.doc.nodeAt(first.pos)?.attrs.src).toBe('~{12 14 13 17 21, bar, lg}');
		expect(reparsed(view)[0]).toBe('~{12 14 13 17 21, bar, lg}');
	});

	it('a refused edit writes nothing', () => {
		const view = mount(SPARK_DECK);
		const [first] = objects(view.state.doc);
		const before = view.state.doc;
		expect(editObject(view, first.pos, { end: true }, kernels)).toBe(false); // a marker on a bar
		expect(view.state.doc.eq(before)).toBe(true);
	});

	it('undo takes a spark edit back in one step', () => {
		const view = mount(SPARK_DECK);
		const [first] = objects(view.state.doc);
		editObject(view, first.pos, { data: [1, 2, 3] }, kernels);
		expect(view.state.doc.nodeAt(first.pos)?.attrs.src).toBe('~{1 2 3, bar, c3}');
		undo(view.state, view.dispatch);
		expect(view.state.doc.nodeAt(first.pos)?.attrs.src).toBe('~{12 14 13 17 21, bar, c3}');
	});

	it('the spark door inserts after the word, with a space, and opens the editor', () => {
		const view = mount(SPARK_DECK);
		const at = caretIn(view, 'Not a spark ', true);
		const door = insertObject(() => kernels, { kind: 'spark' });
		expect(door(view.state, view.dispatch)).toBe(true);
		expect(openObject(view.state)).toMatchObject({ src: '~{12 14 13 17 21}' });
		// Beside the author's own code span, a space keeps the two apart (`a``b` is one span in Markdown).
		expect(docToDeck(view.state.doc)).toContain('Not a spark `~{12 14 13 17 21}` `~{abc}`');
		expect(view.state.doc.nodeAt(at)?.attrs.src).toBe('~{12 14 13 17 21}');
		expect(reparsed(view)).toContain('~{12 14 13 17 21}');
	});

	it('the spark door leaves a selected word as it is and goes in after it', () => {
		const view = mount(SPARK_DECK);
		let from = -1;
		view.state.doc.descendants((node, pos) => {
			if (from < 0 && node.isText && node.text?.startsWith('Not a spark')) from = pos;
		});
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + 3)));
		expect(insertObject(() => kernels, { kind: 'spark' })(view.state, view.dispatch)).toBe(true);
		expect(docToDeck(view.state.doc)).toContain('Not `~{12 14 13 17 21}` a spark');
	});

	it('the blocker names the thing in its message', () => {
		const view = mount(SPARK_DECK);
		const why = insertBlocker(view.state, null, false, 'spark');
		expect(why).toMatch(/spark editor/);
	});

	it('goes after the word the caret is in, never through it', () => {
		const view = mount('<!-- _class: content -->\n\n## T\n\nRevenue grew fast.');
		caretIn(view, 'grew', false);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.selection.from + 2)));
		expect(insertObject(() => kernels, { kind: 'spark' })(view.state, view.dispatch)).toBe(true);
		expect(docToDeck(view.state.doc)).toContain('Revenue grew `~{12 14 13 17 21}` fast.');
	});

	it('declines when a selection reaches into the author\'s own code span, at either end', () => {
		const view = mount('<!-- _class: content -->\n\n## T\n\nSee `foo` here.');
		const before = view.state.doc;
		let code = -1;
		let start = -1;
		view.state.doc.descendants((n, pos) => {
			if (n.isText && n.text?.startsWith('foo') && code < 0) code = pos;
			if (n.isText && n.text?.startsWith('See') && start < 0) start = pos;
		});
		// From "See" into the middle of `foo`.
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start, code + 2)));
		expect(insertObject(() => kernels, { kind: 'spark' })(view.state, view.dispatch)).toBe(false);
		expect(insertBlocker(view.state, kernels, false, 'spark')).toMatch(/code span/);
		// Wholly inside it.
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, code, code + 2)));
		expect(insertObject(() => kernels, { kind: 'spark' })(view.state, view.dispatch)).toBe(false);
		expect(view.state.doc.eq(before)).toBe(true);
	});
});
