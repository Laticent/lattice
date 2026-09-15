import { EditorState, NodeSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { deckToDoc } from '@/lib/compose/deck-doc';
import { CommentView, structuralGuard } from './ComposeView';

// The Compose view for an authoring comment. These tests exist because the interaction model here
// was got WRONG once in a way no round-trip test could see: an earlier build let the chip's
// mousedown reach ProseMirror, which made clicking a note a NodeSelection — and with an atom
// selected, the next printed character REPLACES it. Clicking a note to read it and carrying on
// typing silently destroyed the note. The arms below pin the corrected model.
//
// WHAT THESE TESTS CANNOT SEE, stated so nobody trusts them further than they reach: jsdom does not
// run ProseMirror's real click-to-NodeSelection path, so re-breaking `stopEvent` fails ONLY the arm
// that calls it directly — the "clicking the chip leaves the selection alone" arm stays green either
// way (measured, by reverting the fix). The bug was found by driving the real Studio with real
// keystrokes (`#23`), and that is still the surface that would catch its return.

const DECK = ['<!-- _class: content -->', '', '## Heading', '', 'First paragraph.', '', '<!-- A note.', '', '     With a second paragraph. -->', '', 'Second paragraph.'].join('\n');

let view: EditorView | null = null;
afterEach(() => {
	view?.destroy();
	view = null;
});

function mount(src = DECK) {
	const host = document.createElement('div');
	document.body.append(host);
	view = new EditorView(host, {
		state: EditorState.create({ doc: deckToDoc(src), plugins: [structuralGuard()] }),
		nodeViews: { comment: (node, v, getPos) => new CommentView(node, v, getPos as () => number | undefined) },
	});
	return view;
}

const chip = () => document.querySelector('.cs-comment-chip') as HTMLButtonElement;
const body = () => document.querySelector('.cs-comment-body') as HTMLElement;
const removeBtn = () => document.querySelector('.cs-comment-remove') as HTMLButtonElement;
const commentCount = (v: EditorView) => {
	let n = 0;
	v.state.doc.descendants((node) => {
		if (node.type.name === 'comment') n++;
	});
	return n;
};

describe('the comment chip stands in for the note', () => {
	it('renders a chip and no prose, with the note closed', () => {
		mount();
		expect(chip()).toBeTruthy();
		expect(body().hidden).toBe(true);
		// The note's words must NOT be in the editable prose — that is the whole point.
		const prose = [...document.querySelectorAll('.ProseMirror > .cs-slide p')].map((p) => p.textContent).join(' ');
		expect(prose).not.toContain('A note.');
	});

	it('shows the note reflowed, fence and hanging indent gone, paragraphs kept', () => {
		mount();
		chip().click();
		expect(body().hidden).toBe(false);
		const text = body().textContent || '';
		expect(text).not.toContain('<!--');
		expect(text).not.toContain('-->');
		expect(text).toBe('A note.\n\nWith a second paragraph.');
	});

	it('closes again on a second click', () => {
		mount();
		chip().click();
		chip().click();
		expect(body().hidden).toBe(true);
	});
});

describe('reading a note never arms a delete (the regression that cost a note)', () => {
	it('clicking the chip leaves the document selection alone — no NodeSelection on the atom', () => {
		const v = mount();
		const before = v.state.selection;
		chip().click();
		expect(v.state.selection instanceof NodeSelection).toBe(false);
		expect(v.state.selection.eq(before)).toBe(true);
	});

	it('stopEvent claims every event inside the view — the mechanism behind that', () => {
		const v = mount();
		let pos = 0;
		v.state.doc.descendants((node, p) => {
			if (node.type.name === 'comment') pos = p;
		});
		const cv = new CommentView(v.state.doc.nodeAt(pos) as never, v, () => pos);
		const inside = new MouseEvent('mousedown', { bubbles: true });
		cv.dom.querySelector('.cs-comment-chip')?.dispatchEvent(inside);
		expect(cv.stopEvent(inside)).toBe(true);
		// An event from elsewhere in the document is not this view's to claim.
		const outside = new MouseEvent('mousedown', { bubbles: true });
		document.body.dispatchEvent(outside);
		expect(cv.stopEvent(outside)).toBe(false);
		cv.destroy();
	});

	it('a printed character after reading does not replace the note', () => {
		const v = mount();
		chip().click(); // read it
		// Whatever the selection is, it is not on the atom — so typing lands in the prose.
		expect(v.state.selection instanceof NodeSelection).toBe(false);
		v.dispatch(v.state.tr.insertText('x'));
		expect(commentCount(v)).toBe(1);
	});

	it('the note survives a doc edit elsewhere', () => {
		const v = mount();
		const end = v.state.doc.content.size - 2;
		v.dispatch(v.state.tr.insertText(' more', end));
		expect(commentCount(v)).toBe(1);
	});
});

describe('removal is a deliberate second act', () => {
	it('offers no remove control until the note is open', () => {
		mount();
		expect(removeBtn().hidden).toBe(true);
		chip().click();
		expect(removeBtn().hidden).toBe(false);
	});

	it('removes exactly the note, leaving the prose and the slide directive', () => {
		const v = mount();
		chip().click();
		removeBtn().click();
		expect(commentCount(v)).toBe(0);
		const text = v.state.doc.textContent;
		expect(text).toContain('First paragraph.');
		expect(text).toContain('Second paragraph.');
		expect(text).toContain('Heading');
		expect(v.state.doc.child(0).attrs.directives).toEqual(['<!-- _class: content -->']);
	});

	it('leaves the slide count alone, so the structural guard never has to reject it', () => {
		const v = mount();
		const before = v.state.doc.childCount;
		chip().click();
		removeBtn().click();
		expect(v.state.doc.childCount).toBe(before);
	});
});
