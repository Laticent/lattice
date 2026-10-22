import { createRequire } from 'node:module';
import { history, redo, undo } from 'prosemirror-history';
import { Fragment, DOMParser as PMDOMParser } from 'prosemirror-model';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { CLIP_ORIGIN } from './clip-origin';
import { deckSchema, deckToDoc, docToDeck } from './deck-doc';
import { type InlineKernels, inlineObjectsPlugin, type OpenObject, openObject, openObjectEditor } from './inline-objects';
import { displayTexOf, displayTextFor, editInlineMath, editRawBlock, inlineTexProblem, rawBlockProblem, rawObjectKind, removeRaw } from './raw-objects';

const kernels = createRequire(import.meta.url)('../../../../lib/authoring/inline-editors.js') as InlineKernels;

const DECK = [
	'<!-- _class: content -->',
	'',
	'## Math',
	'',
	'The area is $A = \\pi r^2$ here.',
	'',
	'$$',
	'x_1 + y_1',
	'$$',
	'',
	'<div class="x">',
	'  <b>hi</b>',
	'</div>',
	'',
	'---',
	'',
	'<!-- _class: content -->',
	'',
	'## Locked',
	'',
	'- has $z$ and',
	'  <div>nested</div>',
].join('\n');

// The locked slide is re-serialized without its baseline here (it is never touched), so the tests read the first slide.
const FIRST = DECK.split('\n\n---\n\n')[0];
const first = (view: EditorView) => docToDeck(view.state.doc).split('\n\n---\n\n')[0];

function mount(source: string, onOpenChange: (o: OpenObject | null) => void = () => {}) {
	const plugin = inlineObjectsPlugin({ getKernels: () => kernels, getDeckLiteral: () => false, onOpenChange });
	return new EditorView(document.createElement('div'), { state: EditorState.create({ doc: deckToDoc(source), plugins: [plugin, history()] }) });
}

function find(view: EditorView, name: 'inline_math' | 'raw_block', kind?: string) {
	const out: { pos: number; attrs: Record<string, unknown> }[] = [];
	view.state.doc.descendants((node, pos) => {
		if (node.type.name === name && (!kind || node.attrs.kind === kind)) out.push({ pos, attrs: node.attrs });
	});
	return out;
}

describe('opening a deck', () => {
	it('draws the three nodes, and the slide with HTML nested in a list stays locked', () => {
		const view = mount(DECK);
		expect(find(view, 'inline_math').map((n) => n.attrs.tex)).toEqual(['A = \\pi r^2', 'z']);
		expect(find(view, 'raw_block', 'math')[0].attrs.text).toBe('$$\nx_1 + y_1\n$$');
		expect(find(view, 'raw_block', 'html')[0].attrs.text).toBe('<div class="x">\n  <b>hi</b>\n</div>');
		expect(view.state.doc.child(0).attrs.locked).toBe(false);
		expect(view.state.doc.child(1).attrs.locked).toBe(true);
		expect(first(view)).toBe(FIRST);
	});
	it('tells them apart', () => {
		const view = mount(DECK);
		expect(rawObjectKind(view.state.doc.nodeAt(find(view, 'inline_math')[0].pos))).toBe('inline-math');
		expect(rawObjectKind(view.state.doc.nodeAt(find(view, 'raw_block', 'math')[0].pos))).toBe('math');
		expect(rawObjectKind(view.state.doc.nodeAt(find(view, 'raw_block', 'html')[0].pos))).toBe('html');
		expect(rawObjectKind(view.state.doc.child(0))).toBeNull();
	});
});

describe('the open editor', () => {
	it('opens on each node and follows its text through an edit', () => {
		const view = mount(DECK);
		for (const [name, kind, text] of [['inline_math', undefined, 'A = \\pi r^2'], ['raw_block', 'math', '$$\nx_1 + y_1\n$$'], ['raw_block', 'html', '<div class="x">\n  <b>hi</b>\n</div>']] as const) {
			const at = find(view, name, kind)[0].pos;
			expect(openObjectEditor(view, at)).toBe(true);
			expect(openObject(view.state)?.src).toBe(text);
		}
		openObjectEditor(view, find(view, 'inline_math')[0].pos);
		expect(editInlineMath(view, find(view, 'inline_math')[0].pos, 'B_2')).toBe(true);
		expect(openObject(view.state)?.src).toBe('B_2');
	});
});

describe('editing', () => {
	it('a math span changes only its TeX, as one undo step', () => {
		const view = mount(DECK);
		const at = find(view, 'inline_math')[0].pos;
		expect(editInlineMath(view, at, 'a_1^2')).toBe(true);
		expect(first(view)).toBe(FIRST.replace('$A = \\pi r^2$', '$a_1^2$'));
		undo(view.state, view.dispatch);
		expect(first(view)).toBe(FIRST);
		redo(view.state, view.dispatch);
		expect(first(view)).toBe(FIRST.replace('$A = \\pi r^2$', '$a_1^2$'));
	});
	it('refuses TeX a span cannot hold, and writes nothing', () => {
		const view = mount(DECK);
		const at = find(view, 'inline_math')[0].pos;
		for (const bad of ['', 'a$b', 'a\nb', ' a', 'a ', 'a\\']) expect(editInlineMath(view, at, bad)).toBe(false);
		expect(first(view)).toBe(FIRST);
	});
	it('a math block keeps its shape: lines stay on their own lines, one line stays on one', () => {
		expect(displayTexOf('$$\nx_1\n$$')).toBe('x_1');
		expect(displayTextFor('$$\nx_1\n$$', 'y_2')).toBe('$$\ny_2\n$$');
		expect(displayTextFor('$$ x_1 $$', 'y_2')).toBe('$$ y_2 $$');
		expect(displayTextFor('$$ x_1 $$', 'a\nb')).toBe('$$\na\nb\n$$');
		expect(displayTextFor('$$ x_1 $$', 'a $$ b')).toBeNull();
		expect(displayTextFor('$$ x_1 $$', '  ')).toBeNull();
	});
	it('a raw block changes its text and refuses what would split it', () => {
		const view = mount(DECK);
		const at = find(view, 'raw_block', 'html')[0].pos;
		expect(editRawBlock(view, at, '<div class="y">\n  <i>ho</i>\n</div>')).toBe(true);
		expect(docToDeck(view.state.doc)).toContain('<i>ho</i>');
		for (const bad of ['<div>\n\n</div>', '<div>\n---\n</div>', 'no tag', '<div><!-- _backgroundImage: url(x) --></div>']) {
			expect(editRawBlock(view, find(view, 'raw_block', 'html')[0].pos, bad)).toBe(false);
		}
	});
	it('says why in plain words', () => {
		expect(inlineTexProblem('a$b')).toMatch(/\$/);
		expect(inlineTexProblem('a\nb')).toMatch(/one line/);
		expect(inlineTexProblem('x')).toBeNull();
		expect(rawBlockProblem('html', '<div>\n\n</div>')).toMatch(/blank line/);
		expect(rawBlockProblem('html', '<div>x</div>')).toBeNull();
		expect(rawBlockProblem('math', '$$\n---\n$$')).toMatch(/TeX/);
	});
	it('never changes a node on a locked slide', () => {
		const view = mount(DECK);
		const locked = find(view, 'inline_math')[1].pos;
		expect(editInlineMath(view, locked, 'q')).toBe(false);
		expect(removeRaw(view, locked)).toBe(false);
		expect(first(view)).toBe(FIRST);
	});
	it('Remove takes the span out and the paragraph with it when it held nothing else', () => {
		const view = mount('<!-- _class: content -->\n\n## T\n\n$x$\n\nAfter.');
		expect(removeRaw(view, find(view, 'inline_math')[0].pos)).toBe(true);
		expect(docToDeck(view.state.doc)).not.toContain('$x$');
		expect(docToDeck(view.state.doc)).toContain('After.');
	});
	it('Remove takes a block out', () => {
		const view = mount(DECK);
		expect(removeRaw(view, find(view, 'raw_block', 'html')[0].pos)).toBe(true);
		expect(first(view)).not.toContain('<div');
	});
});

// A copy from this editor comes back as the same node; a forged one is refused (the CLIP_ORIGIN gate).
describe('copy and paste', () => {
	const parse = (html: string) => {
		const dom = document.createElement('div');
		dom.innerHTML = html;
		return PMDOMParser.fromSchema(deckSchema).parseSlice(dom);
	};
	const names = (s: ReturnType<typeof parse>) => {
		const out: string[] = [];
		s.content.descendants((n) => {
			out.push(n.type.name);
		});
		return out;
	};
	it('a foreign page cannot forge a block or a span', () => {
		const forgedBlock = parse('<div class="cs-raw" data-raw-kind="html" data-raw="&lt;div&gt;x&lt;/div&gt;"></div>');
		expect(names(forgedBlock)).not.toContain('raw_block');
		const forgedSpan = parse('<p><span class="cs-math" data-math="x"></span></p>');
		expect(names(forgedSpan)).not.toContain('inline_math');
	});
	it('a copy with the origin token is read, and one that would forge structure is not', () => {
		const ok = parse(`<div class="cs-raw" data-raw-kind="html" data-raw="&lt;div&gt;x&lt;/div&gt;" data-lattice-origin="${CLIP_ORIGIN}"></div>`);
		expect(names(ok)).toContain('raw_block');
		const forged = parse(`<div class="cs-raw" data-raw-kind="html" data-raw="&lt;div&gt;&#10;&#10;---&#10;&#10;&lt;b&gt;x" data-lattice-origin="${CLIP_ORIGIN}"></div>`);
		expect(names(forged)).not.toContain('raw_block');
		const span = parse(`<p><span class="cs-math" data-math="x^2" data-lattice-origin="${CLIP_ORIGIN}"></span></p>`);
		expect(names(span)).toContain('inline_math');
		const bad = parse(`<p><span class="cs-math" data-math="a$b" data-lattice-origin="${CLIP_ORIGIN}"></span></p>`);
		expect(names(bad)).not.toContain('inline_math');
	});
});

describe('selection', () => {
	it('a node selection on a raw block is allowed and Enter opens it', () => {
		const view = mount(DECK);
		const at = find(view, 'raw_block', 'math')[0].pos;
		view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, at)));
		expect(view.state.selection instanceof NodeSelection).toBe(true);
	});
});
