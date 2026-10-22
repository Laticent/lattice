import { EditorState } from 'prosemirror-state';
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
const editButton = () => document.querySelector('.cs-comment-edit') as HTMLButtonElement;
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
	it('keys typed in the field do not reach the document', () => {
		const v = mount();
		pills()[1].click();
		editButton().click();
		const before = v.state.doc;
		const f = field() as HTMLTextAreaElement;
		f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		expect(v.state.doc.eq(before)).toBe(true);
	});

	it('a note inside a quote stays one line', () => {
		mount('> quote\n>\n> <!-- n -->\n>\n> after');
		pills()[0].click();
		editButton().click();
		type('one\ntwo');
		expect(why().hidden).toBe(false);
		expect(saved()).toBe('> quote\n>\n> <!-- n -->\n>\n> after');
	});

	it('shows no field until Edit is pressed, and opening a note writes nothing', () => {
		mount();
		pills()[1].click();
		expect(field()).toBeNull();
		editButton().click();
		expect(field()?.value).toBe('a plain note.');
		field()?.dispatchEvent(new FocusEvent('blur'));
		expect(saved()).toBe(DECK);
		expect(field()).toBeNull();
	});

	it('writes only the note, and keeps the channel prefix of a say', () => {
		mount();
		pills()[0].click();
		editButton().click();
		expect(field()?.value).toBe('the slide reads as this.');
		type('it reads as that.');
		expect(saved()).toBe(DECK.replace('say: the slide reads as this.', 'say: it reads as that.'));
		// The panel stays open on the note it just wrote.
		expect(document.querySelector('.cs-comment-body')?.textContent).toBe('it reads as that.');
	});

	it('Escape drops the change', () => {
		mount();
		pills()[1].click();
		editButton().click();
		(field() as HTMLTextAreaElement).value = 'discarded';
		field()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(saved()).toBe(DECK);
		expect(field()).toBeNull();
	});

	it('says why a refused note was refused, keeps the words in the field, and writes nothing', () => {
		mount();
		pills()[1].click();
		editButton().click();
		type('oops --> <b>');
		expect(why().hidden).toBe(false);
		expect(why().textContent).toMatch(/end its comment early/);
		expect(field()?.value).toBe('oops --> <b>');
		expect(saved()).toBe(DECK);
	});

	it('an empty note points at Remove', () => {
		mount();
		pills()[1].click();
		editButton().click();
		type('  ');
		expect(why().textContent).toMatch(/Remove/);
		expect(saved()).toBe(DECK);
	});

	it('a locked slide offers no Edit', () => {
		mount(DECK.replace('First paragraph.', 'First ~~paragraph~~.'));
		pills()[1].click();
		expect(editButton()).toBeNull();
	});
});
