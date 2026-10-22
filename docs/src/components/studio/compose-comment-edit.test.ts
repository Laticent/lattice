import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';
import { writeNote } from '@/lib/compose/comment-block';
import { deckToDoc, docToDeck } from '@/lib/compose/deck-doc';
import { CommentView, commentRunPlugin, structuralGuard } from './ComposeView';

// A note opens in its panel and its words edit in place. followups.d/2846-p5.
// The bytes outside the words (the opener, the closer, the `say:` channel) are the author's, and a note that is opened and left is never written.

const DECK = ['<!-- _class: content -->', '', '## Heading', '', 'First paragraph.', '', '<!-- say: the slide reads as this. -->', '', '<!-- a plain note. -->', '', 'Second paragraph.'].join('\n');

let view: EditorView | null = null;
afterEach(() => {
	view?.destroy();
	view = null;
	document.body.replaceChildren();
});

function mount(src = DECK) {
	const host = document.createElement('div');
	document.body.append(host);
	view = new EditorView(host, {
		state: EditorState.create({ doc: deckToDoc(src), plugins: [structuralGuard(), commentRunPlugin()] }),
		nodeViews: { comment: (node, v, getPos) => new CommentView(node, v, getPos as () => number | undefined) },
	});
	return view;
}
const pills = () => [...document.querySelectorAll('.cs-comment')] as HTMLElement[];
const field = () => document.querySelector('.cs-comment-field') as HTMLTextAreaElement | null;
const why = () => document.querySelector('.cs-comment-why') as HTMLElement;
const saved = () => docToDeck((view as EditorView).state.doc);

function type(value: string) {
	const f = field() as HTMLTextAreaElement;
	f.value = value;
	f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
}

describe('writeNote, by channel', () => {
	it('say and describe text may open with a directive word, because their own key leads', () => {
		expect(writeNote('<!-- say: hi -->', 'footer: the end')).toBe('<!-- say: footer: the end -->');
		expect(writeNote('<!-- describe: a chart -->', 'color: red bars over blue')).toBe('<!-- describe: color: red bars over blue -->');
	});
	it('a plain note may not become a directive or a panes marker', () => {
		expect(writeNote('<!-- old note -->', 'panes: 40/60')).toBeNull();
		expect(writeNote('<!-- old note -->', 'pane: list')).toBeNull();
	});
	it('legitimate prose that only looks close is kept', () => {
		expect(writeNote('<!-- old note -->', 'Footer is too long')).toBe('<!-- Footer is too long -->');
	});
});

describe('writeNote', () => {
	it('replaces the words and keeps the opener, closer and channel', () => {
		expect(writeNote('<!-- a plain note. -->', 'new words')).toBe('<!-- new words -->');
		expect(writeNote('<!-- say: old -->', 'new words')).toBe('<!-- say: new words -->');
		expect(writeNote('<!--- dashes --->', 'x')).toBe('<!--- x --->');
	});
	it('keeps lines the author typed', () => {
		expect(writeNote('<!-- a -->', 'one\n\n- two\n- three')).toBe('<!-- one\n\n- two\n- three -->');
	});
	it.each([
		['empty words', '   '],
		['ends the comment', 'a --> <img src=x onerror=alert(1)>'],
		['ends it with --!>', 'a --!> b'],
		['a directive', '_class: hero'],
		['a bare directive', 'footer: add sources'],
		['a bare class directive', 'class: lead'],
		['a second comment', 'one\n<!-- _class: lead'],
		['a channel change', 'say: now narrated'],
	])('refuses %s', (_n, words) => {
		expect(writeNote('<!-- a plain note. -->', words)).toBeNull();
	});
	it('a say note stays a say note whatever the new words are', () => {
		expect(writeNote('<!-- say: old -->', 'plain')).toBe('<!-- say: plain -->');
	});
	it('refuses more than a paste would carry', () => {
		expect(writeNote('<!-- a -->', 'x'.repeat(9000))).toBeNull();
	});
});

describe('the note panel', () => {
	it('opens with the words already in a field and the caret in it, and opening writes nothing', async () => {
		mount();
		pills()[1].click();
		expect(field()?.value).toBe('a plain note.');
		await Promise.resolve();
		expect(document.activeElement).toBe(field());
		field()?.dispatchEvent(new FocusEvent('blur'));
		await Promise.resolve();
		expect(saved()).toBe(DECK);
	});

	it('opens with the caret at the end of the words, where an author adds to a note', async () => {
		mount();
		pills()[1].click();
		await Promise.resolve();
		const f = field() as HTMLTextAreaElement;
		expect([f.selectionStart, f.selectionEnd]).toEqual([f.value.length, f.value.length]);
	});

	it('has no Edit button: the field is the editor, and Remove is the only control', () => {
		mount();
		pills()[1].click();
		expect([...document.querySelectorAll('.cs-comment-panel button')].map((b) => b.textContent)).toEqual(['Remove']);
	});

	it('writes only the note, and keeps the channel prefix of a say', () => {
		mount();
		pills()[0].click();
		expect(field()?.value).toBe('the slide reads as this.');
		type('it reads as that.');
		expect(saved()).toBe(DECK.replace('say: the slide reads as this.', 'say: it reads as that.'));
		// The panel stays open on the note it just wrote.
		expect((document.querySelector('.cs-comment-body') as HTMLTextAreaElement).value).toBe('it reads as that.');
	});

	it('writes when the author leaves the field', async () => {
		mount();
		pills()[1].click();
		(field() as HTMLTextAreaElement).value = 'changed on blur';
		field()?.dispatchEvent(new FocusEvent('blur'));
		await Promise.resolve();
		expect(saved()).toBe(DECK.replace('a plain note.', 'changed on blur'));
	});

	it('Escape puts the original back and writes nothing', () => {
		mount();
		pills()[1].click();
		(field() as HTMLTextAreaElement).value = 'discarded';
		field()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(saved()).toBe(DECK);
		expect(field()?.value).toBe('a plain note.');
	});

	it('says why a refused note was refused, keeps the words in the field, and writes nothing', () => {
		mount();
		pills()[1].click();
		type('oops --> <b>');
		expect(why().hidden).toBe(false);
		expect(why().textContent).toMatch(/end its comment early/);
		expect(field()?.value).toBe('oops --> <b>');
		expect(saved()).toBe(DECK);
	});

	it('an empty note points at Remove', () => {
		mount();
		pills()[1].click();
		type('  ');
		expect(why().textContent).toMatch(/Remove/);
		expect(saved()).toBe(DECK);
	});

	it('keys typed in the field do not reach the document', () => {
		const v = mount();
		pills()[1].click();
		const before = v.state.doc;
		field()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		expect(v.state.doc.eq(before)).toBe(true);
	});

	it('a note inside a quote stays one line', () => {
		mount('> quote\n>\n> <!-- n -->\n>\n> after');
		pills()[0].click();
		type('one\ntwo');
		expect(why().hidden).toBe(false);
		expect(saved()).toBe('> quote\n>\n> <!-- n -->\n>\n> after');
	});

	it('Remove still removes the note', () => {
		mount();
		pills()[1].click();
		(document.querySelector('.cs-comment-remove') as HTMLButtonElement).click();
		expect(saved()).not.toContain('a plain note.');
	});

	it('a locked slide shows the words as plain text, with no field', () => {
		mount(DECK.replace('First paragraph.', 'First ~~paragraph~~.'));
		pills()[1].click();
		expect(field()).toBeNull();
		expect(document.querySelector('.cs-comment-body')?.textContent).toBe('a plain note.');
	});
});

// The three defects the checker reproduced in a real browser, where an edit above an open note rebuilds its panel and the browser fires a
// blur on the field it removes.
describe('a panel that is rebuilt by an edit elsewhere', () => {
	const insertAbove = (v: EditorView) => {
		let at = 0;
		v.state.doc.descendants((n, p) => {
			if (!at && n.isTextblock && n.textContent === 'First paragraph.') at = p + 1;
		});
		v.dispatch(v.state.tr.insertText('Y', at));
	};

	it('does not take the caret from the editor', async () => {
		const v = mount();
		pills()[1].click();
		await Promise.resolve();
		(document.activeElement as HTMLElement).blur();
		insertAbove(v);
		await Promise.resolve();
		expect(document.activeElement).not.toBe(field());
	});

	it('keeps what the author typed in the note and writes it to the right comment', async () => {
		const v = mount();
		pills()[1].click();
		const old = field() as HTMLTextAreaElement;
		old.value = 'half typed words';
		insertAbove(v);
		// The browser fires blur on the field it removed.
		old.dispatchEvent(new FocusEvent('blur'));
		await Promise.resolve();
		await Promise.resolve();
		expect(saved()).toContain('<!-- half typed words -->');
		expect(saved()).toContain('<!-- say: the slide reads as this. -->');
	});

	it('writes once when Ctrl+Enter replaces the field', async () => {
		const v = mount();
		pills()[1].click();
		const old = field() as HTMLTextAreaElement;
		let writes = 0;
		const dispatch = v.dispatch.bind(v);
		v.dispatch = (tr) => {
			if (tr.docChanged) writes++;
			dispatch(tr);
		};
		old.value = 'saved once';
		old.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
		old.dispatchEvent(new FocusEvent('blur'));
		await Promise.resolve();
		await Promise.resolve();
		expect(writes).toBe(1);
		expect(saved()).toContain('<!-- saved once -->');
	});

	it('a write that changes nothing but spacing leaves a working panel', async () => {
		mount();
		pills()[1].click();
		const f = field() as HTMLTextAreaElement;
		f.value = 'a plain note.\n';
		f.dispatchEvent(new FocusEvent('blur'));
		await Promise.resolve();
		await Promise.resolve();
		expect(saved()).toBe(DECK);
		// The same panel still writes, and still removes.
		const same = field() as HTMLTextAreaElement;
		same.value = 'changed words';
		same.dispatchEvent(new FocusEvent('blur'));
		await Promise.resolve();
		await Promise.resolve();
		expect(saved()).toContain('<!-- changed words -->');
		(document.querySelector('.cs-comment-remove') as HTMLButtonElement).click();
		expect(saved()).not.toContain('changed words');
	});

	it('Remove after typing removes the note and does not write the typing first', () => {
		mount();
		pills()[1].click();
		(field() as HTMLTextAreaElement).value = 'typed then removed';
		(document.querySelector('.cs-comment-remove') as HTMLButtonElement).click();
		expect(saved()).not.toContain('typed then removed');
		expect(saved()).not.toContain('a plain note.');
	});
});

// The checker's last round, reproduced in a real browser.
describe('a panel is built once per opening', () => {
	it('keeps the same field through a write, so the caret and the next keys stay in it', async () => {
		mount();
		pills()[1].click();
		const old = field() as HTMLTextAreaElement;
		old.value = 'saved';
		old.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
		expect(field()).toBe(old);
		old.value = 'saved again';
		old.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
		expect(saved()).toContain('<!-- saved again -->');
		expect(field()).toBe(old);
	});

	it('focus left on Remove does not come back to steal the caret when another note is opened', async () => {
		mount();
		pills()[1].click();
		await Promise.resolve();
		(document.querySelector('.cs-comment-remove') as HTMLButtonElement).focus();
		pills()[0].click();
		await Promise.resolve();
		expect(document.activeElement).toBe(field());
		expect(document.activeElement?.classList.contains('cs-comment-remove')).toBe(false);
	});

	it('a panel that was replaced by opening another note writes nothing', async () => {
		mount();
		pills()[1].click();
		const stale = field() as HTMLTextAreaElement;
		stale.value = 'words for the old panel';
		pills()[0].click();
		stale.dispatchEvent(new FocusEvent('blur'));
		await Promise.resolve();
		expect(saved()).toBe(DECK);
	});

	it('writes nothing, and throws nothing, when the editor is gone before the blur lands', async () => {
		const v = mount();
		pills()[1].click();
		const f = field() as HTMLTextAreaElement;
		f.value = 'unsaved words';
		v.destroy();
		view = null;
		f.dispatchEvent(new FocusEvent('blur'));
		await Promise.resolve();
		await Promise.resolve();
	});
});

describe('leaving the panel', () => {
	it('writes what the field holds when the caret leaves from Remove', async () => {
		mount();
		pills()[1].click();
		const f = field() as HTMLTextAreaElement;
		f.value = 'changed without a blur of the field';
		(document.querySelector('.cs-comment-remove') as HTMLButtonElement).dispatchEvent(new FocusEvent('blur'));
		await Promise.resolve();
		await Promise.resolve();
		expect(saved()).toContain('<!-- changed without a blur of the field -->');
	});

	it('Escape and Remove put the caret at the note, not at the old selection', () => {
		const v = mount(['<!-- _class: content -->', '', '## Plan', '', 'First paragraph.', '', '---', '', '<!-- _class: content -->', '', '## Two', '', 'Slide two text.', '', '<!-- a plain note. -->', '', 'After the note.'].join('\n'));
		pills()[0].click();
		(field() as HTMLTextAreaElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(v.state.doc.textBetween(v.state.selection.from, v.state.selection.to + 5, ' ')).toMatch(/^After/);
		(document.querySelector('.cs-comment-remove') as HTMLButtonElement).click();
		const at = v.state.selection.from;
		expect(v.state.doc.resolve(at).parent.textContent).toMatch(/After the note|Slide two text/);
	});
});

// The seventh check: the caret that Escape and Remove return to must be a text position, in the note's own slide, never a selected note.
describe('where the caret goes after Escape and Remove', () => {
	const TWO_SLIDES = ['<!-- _class: content -->', '', '## Plan', '', 'Para one.', '', '<!-- say: first note. -->', '', '<!-- a second note. -->', '', '---', '', '<!-- _class: content -->', '', '## Second', '', 'Body two.', '', '<!-- last note. -->'].join('\n');
	const slideIndexOf = (v: EditorView) => v.state.selection.$from.index(0);
	const isTextCaret = (v: EditorView) => v.state.selection instanceof TextSelection;

	for (const how of ['Escape', 'Remove'] as const) {
		const leave = () => {
			if (how === 'Escape') (field() as HTMLTextAreaElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			else (document.querySelector('.cs-comment-remove') as HTMLButtonElement).click();
		};

		it(`${how}: when the next block is another note, the caret is text and no note is selected`, () => {
			const v = mount(TWO_SLIDES);
			pills()[0].click();
			leave();
			expect(isTextCaret(v)).toBe(true);
			expect(slideIndexOf(v)).toBe(0);
		});

		it(`${how}: a note that ends its slide keeps the caret in that slide, not the next heading`, () => {
			const v = mount(TWO_SLIDES);
			pills()[1].click();
			leave();
			expect(isTextCaret(v)).toBe(true);
			expect(slideIndexOf(v)).toBe(0);
		});

		it(`${how}: a note that ends the deck keeps a text caret in its slide`, () => {
			const v = mount(TWO_SLIDES);
			pills()[2].click();
			leave();
			expect(isTextCaret(v)).toBe(true);
			expect(slideIndexOf(v)).toBe(1);
		});
	}
});

describe('where the caret goes when the slide has little or no text', () => {
	it('Escape on a note alone in the last slide selects nothing and keeps the caret in the field', async () => {
		const v = mount('## A\n\nPara a.\n\n---\n\n<!-- lonely last. -->');
		pills()[0].click();
		await Promise.resolve();
		const before = v.state.selection;
		(field() as HTMLTextAreaElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(v.state.selection.eq(before)).toBe(true);
		expect(document.querySelector('.ProseMirror-selectednode')).toBeNull();
		expect(document.activeElement).toBe(field());
	});

	it('Remove on a note alone in the last slide leaves a caret in that slide', () => {
		const v = mount('## A\n\nPara a.\n\n---\n\n<!-- lonely last. -->');
		pills()[0].click();
		(document.querySelector('.cs-comment-remove') as HTMLButtonElement).click();
		expect(v.state.selection instanceof TextSelection).toBe(true);
		expect(v.state.selection.$from.index(0)).toBe(1);
	});

	it('Remove on a quoted note that ends its slide keeps the caret in that slide, not the next', () => {
		const v = mount('## A\n\nPara a.\n\n> <!-- quoted last. -->\n\n---\n\n## B\n\nPara b.');
		pills()[0].click();
		(document.querySelector('.cs-comment-remove') as HTMLButtonElement).click();
		expect(v.state.selection instanceof TextSelection).toBe(true);
		expect(v.state.selection.$from.index(0)).toBe(0);
	});
});

describe('an undo from another button', () => {
	it('cannot change the field: what is not typed into it is undone', () => {
		mount();
		pills()[1].click();
		const f = field() as HTMLTextAreaElement;
		f.focus();
		f.value = 'typed';
		f.dispatchEvent(new InputEvent('input', { bubbles: true }));
		f.blur();
		// A native undo pressed elsewhere edits the field while it has no caret.
		f.value = 'a plain note.';
		f.dispatchEvent(new InputEvent('input', { bubbles: true }));
		expect(f.value).toBe('typed');
	});

	it('is stopped before it edits the field', () => {
		mount();
		pills()[1].click();
		const f = field() as HTMLTextAreaElement;
		const e = new InputEvent('beforeinput', { inputType: 'historyUndo', cancelable: true, bubbles: true });
		f.dispatchEvent(e);
		expect(e.defaultPrevented).toBe(true);
	});
});

describe('the pill icons', () => {
	it('say, describe and note each draw their own shape', () => {
		mount(DECK.replace('<!-- a plain note. -->', '<!-- describe: a bar chart. -->\n\n<!-- a plain note. -->'));
		const shapes = pills().map((p) => p.querySelector('.cs-comment-glyph')?.innerHTML);
		expect(new Set(shapes).size).toBe(3);
		expect(pills().map((p) => p.dataset.kind)).toEqual(['say', 'describe', 'note']);
	});
});
