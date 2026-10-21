import { createRequire } from 'node:module';
import { closeHistory, history, redo, undo, undoDepth } from 'prosemirror-history';
import { Fragment, DOMParser as PMDOMParser } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { deckSchema, deckToDoc, docToDeck, emitDeck, initBaseline } from './deck-doc';
import { assetNameOf, bgKeywords, bgSideOf, descriptionAsAlt, editImage, imageSourceKind, insertImage, insertImageBlocker, removeImage, withBgSide } from './image-objects';
import { type InlineKernels, inlineObjectsPlugin, type OpenObject, openObject, openObjectEditor } from './inline-objects';

const kernels = createRequire(import.meta.url)('../../../../lib/authoring/inline-editors.js') as InlineKernels;

const DECK = [
	'<!-- _class: content -->',
	'',
	'## Photos',
	'',
	'Some words here.',
	'',
	'![A harbor at dawn](asset:harbor)',
	'',
	'![bg right:40% blur](asset:forest)',
	'',
	'```text',
	'code',
	'```',
	'',
	'---',
	'',
	'<!-- _class: content -->',
	'',
	'## Locked',
	'',
	'This has ~~strike~~ in it.',
].join('\n');

function mount(source: string, onOpenChange: (o: OpenObject | null) => void = () => {}) {
	const plugin = inlineObjectsPlugin({ getKernels: () => kernels, getDeckLiteral: () => false, onOpenChange });
	return new EditorView(document.createElement('div'), { state: EditorState.create({ doc: deckToDoc(source), plugins: [plugin, history()] }) });
}

function images(view: EditorView) {
	const out: { pos: number; src: string; alt: string | null }[] = [];
	view.state.doc.descendants((node, pos) => {
		if (node.type === deckSchema.nodes.image) out.push({ pos, src: node.attrs.src as string, alt: (node.attrs.alt as string | null) ?? null });
	});
	return out;
}

function caretIn(view: EditorView, needle: string, after = false) {
	let at = -1;
	view.state.doc.descendants((node, pos) => {
		if (at < 0 && node.isText && node.text?.includes(needle)) at = pos + node.text.indexOf(needle) + (after ? needle.length : 0);
	});
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
	return at;
}

describe('what an image source is', () => {
	it('tells a Library photo, an embedded photo and everything else apart', () => {
		expect(imageSourceKind('asset:harbor')).toBe('asset');
		expect(imageSourceKind('data:image/png;base64,iVBORw0KGgo=')).toBe('data');
		expect(imageSourceKind('https://example.com/x.png')).toBe('other');
		expect(imageSourceKind('sample:harbor')).toBe('other');
		expect(imageSourceKind('./local.png')).toBe('other');
		// Not an image type, so not drawn from the document: a data URI of any other kind could be markup.
		expect(imageSourceKind('data:text/html;base64,PGI+')).toBe('other');
		expect(imageSourceKind('data:image/svg+xml;base64,PHN2Zz4=')).toBe('other');
	});

	it('reads the Library name', () => {
		expect(assetNameOf('asset:harbor')).toBe('harbor');
		expect(assetNameOf('asset:team-photo_2')).toBe('team-photo_2');
		expect(assetNameOf('https://x/y.png')).toBeNull();
		expect(assetNameOf('asset:')).toBeNull();
	});
});

describe('the background directive in an alt text', () => {
	it('knows a background from a description', () => {
		expect(bgKeywords('bg')).toBe('');
		expect(bgKeywords('bg right:40% blur')).toBe('right:40% blur');
		expect(bgKeywords('A harbor at dawn')).toBeNull();
		expect(bgKeywords('bgfoo')).toBeNull();
	});

	it('reads the side the way the engine does', () => {
		expect(bgSideOf('bg')).toBe('full');
		expect(bgSideOf('bg left')).toBe('left');
		expect(bgSideOf('bg right:40%')).toBe('right');
		expect(bgSideOf('bg fit')).toBe('full');
	});

	it('changes the side word and keeps every other word, with its share', () => {
		expect(withBgSide('bg', 'left')).toBe('bg left');
		expect(withBgSide('bg right:40% blur', 'left')).toBe('bg left:40% blur');
		expect(withBgSide('bg blur right', 'full')).toBe('bg blur');
		expect(withBgSide('bg right:40%', 'full')).toBe('bg');
		expect(withBgSide('bg blur', 'right')).toBe('bg right blur');
		expect(withBgSide('A harbor', 'left')).toBeNull();
	});
});

describe('editing an image', () => {
	it('opens the editor on a tap, the way a pill does', () => {
		const view = mount(DECK);
		const [harbor] = images(view);
		expect(openObjectEditor(view, harbor.pos)).toBe(true);
		expect(openObject(view.state)).toMatchObject({ pos: harbor.pos, src: 'asset:harbor', alt: 'A harbor at dawn' });
		expect(view.state.selection).toBeInstanceOf(NodeSelection);
	});

	it('writes a new photo, keeps the description, and is one undo step', () => {
		const view = mount(DECK);
		const [harbor] = images(view);
		openObjectEditor(view, harbor.pos);
		const depth = undoDepth(view.state);
		expect(editImage(view, harbor.pos, { src: 'asset:forest' })).toBe(true);
		expect(images(view)[0]).toMatchObject({ src: 'asset:forest', alt: 'A harbor at dawn' });
		expect(docToDeck(view.state.doc)).toContain('![A harbor at dawn](asset:forest)');
		expect(undoDepth(view.state)).toBe(depth + 1);
		undo(view.state, view.dispatch);
		expect(images(view)[0].src).toBe('asset:harbor');
		redo(view.state, view.dispatch);
		expect(images(view)[0].src).toBe('asset:forest');
	});

	it('writes a new description and the open editor follows it (an alt-only edit leaves src alone)', () => {
		const seen: (OpenObject | null)[] = [];
		const view = mount(DECK, (o) => seen.push(o));
		const [harbor] = images(view);
		openObjectEditor(view, harbor.pos);
		expect(editImage(view, harbor.pos, { alt: 'Boats in the harbor' })).toBe(true);
		expect(openObject(view.state)).toMatchObject({ alt: 'Boats in the harbor', src: 'asset:harbor' });
		// The editor was told: a panel that did not redraw would show the old description.
		expect(seen.at(-1)).toMatchObject({ alt: 'Boats in the harbor' });
		expect(docToDeck(view.state.doc)).toContain('![Boats in the harbor](asset:harbor)');
	});

	it('says nothing was written when the value is already there', () => {
		const view = mount(DECK);
		const [harbor] = images(view);
		const depth = undoDepth(view.state);
		expect(editImage(view, harbor.pos, { alt: 'A harbor at dawn', src: 'asset:harbor' })).toBe(true);
		expect(undoDepth(view.state)).toBe(depth);
	});

	it('refuses a source a deck cannot hold, and writes nothing', () => {
		const view = mount(DECK);
		const [harbor] = images(view);
		const before = docToDeck(view.state.doc);
		for (const bad of ['', 'asset:a b', 'asset:a)', 'x"y', 'a`b', 'a\nb', '<b>']) expect(editImage(view, harbor.pos, { src: bad }), JSON.stringify(bad)).toBe(false);
		expect(docToDeck(view.state.doc)).toBe(before);
	});

	it('keeps a line break out of the alt text', () => {
		const view = mount(DECK);
		const [harbor] = images(view);
		editImage(view, harbor.pos, { alt: 'two\nlines' });
		expect(docToDeck(view.state.doc)).toContain('![two lines](asset:harbor)');
		expect(docToDeck(view.state.doc)).not.toMatch(/two\nlines/);
	});

	it('changes only the side of a background and keeps its other words', () => {
		const view = mount(DECK);
		const bg = images(view)[1];
		expect(editImage(view, bg.pos, { alt: withBgSide(bg.alt ?? '', 'left') as string })).toBe(true);
		expect(docToDeck(view.state.doc)).toContain('![bg left:40% blur](asset:forest)');
	});

	it('does nothing to a locked slide', () => {
		// The slide holds strikethrough, which Compose cannot round-trip, so it is edited in Markdown.
		const locked = mount(['<!-- _class: content -->', '', '## L', '', 'Has ~~strike~~ and ![Pic](asset:harbor).'].join('\n'));
		const [pic] = images(locked);
		expect(editImage(locked, pic.pos, { src: 'asset:forest' })).toBe(false);
		expect(images(locked)[0].src).toBe('asset:harbor');
	});
});

describe('removing an image', () => {
	it('takes the image and the paragraph it was alone in', () => {
		const view = mount(DECK);
		const [harbor] = images(view);
		const before = docToDeck(view.state.doc);
		expect(removeImage(view, harbor.pos)).toBe(true);
		const after = docToDeck(view.state.doc);
		expect(after).not.toContain('asset:harbor');
		expect(after).toBe(before.replace('![A harbor at dawn](asset:harbor)\n\n', ''));
		expect(openObject(view.state)).toBeNull();
	});

	it('takes only the image from a line of text', () => {
		const view = mount(['<!-- _class: content -->', '', '## T', '', 'Before ![Pic](asset:harbor) after.'].join('\n'));
		const [pic] = images(view);
		expect(removeImage(view, pic.pos)).toBe(true);
		expect(docToDeck(view.state.doc)).toContain('Before  after.');
	});

	it('is one undo step', () => {
		const view = mount(DECK);
		const [harbor] = images(view);
		removeImage(view, harbor.pos);
		undo(view.state, view.dispatch);
		expect(images(view)[0].src).toBe('asset:harbor');
	});
});

describe('the Image door', () => {
	it('puts a picture in a paragraph of its own after the caret\'s block, selects it and opens its editor', () => {
		const view = mount(DECK);
		caretIn(view, 'Some words', true);
		expect(insertImage('asset:forest', 'Forest')(view.state, view.dispatch)).toBe(true);
		const deck = docToDeck(view.state.doc);
		expect(deck).toContain('Some words here.\n\n![Forest](asset:forest)\n\n![A harbor at dawn](asset:harbor)');
		const sel = view.state.selection;
		expect(sel).toBeInstanceOf(NodeSelection);
		expect(openObject(view.state)).toMatchObject({ src: 'asset:forest', alt: 'Forest', pos: sel.from });
	});

	it('uses the empty paragraph the caret is in instead of leaving a blank one', () => {
		const view = mount(['<!-- _class: content -->', '', '## T', '', 'A line.'].join('\n'));
		// Append an empty paragraph after the line and put the caret in it.
		const para = deckSchema.nodes.paragraph.create();
		const end = view.state.doc.child(0).content.size + 1;
		view.dispatch(view.state.tr.insert(end, para));
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end + 1)));
		expect(insertImage('asset:forest', 'Forest')(view.state, view.dispatch)).toBe(true);
		expect(docToDeck(view.state.doc)).toContain('A line.\n\n![Forest](asset:forest)');
		expect(docToDeck(view.state.doc)).not.toMatch(/\n\n\n/);
	});

	it('puts it after a whole list, never inside one', () => {
		const view = mount(['<!-- _class: content -->', '', '## T', '', '- one', '- two', '', 'Tail.'].join('\n'));
		caretIn(view, 'one', true);
		expect(insertImage('asset:forest', 'F')(view.state, view.dispatch)).toBe(true);
		expect(docToDeck(view.state.doc)).toContain('- two\n\n![F](asset:forest)\n\nTail.');
	});

	it('is one undo step', () => {
		const view = mount(DECK);
		caretIn(view, 'Some words', true);
		view.dispatch(closeHistory(view.state.tr));
		const depth = undoDepth(view.state);
		insertImage('asset:forest', 'F')(view.state, view.dispatch);
		expect(undoDepth(view.state)).toBe(depth + 1);
	});

	it('declines in a code block and in a locked slide, and says why', () => {
		const view = mount(DECK);
		caretIn(view, 'code');
		expect(insertImageBlocker(view.state)).toMatch(/code block/);
		expect(insertImage('asset:forest', 'F')(view.state, view.dispatch)).toBe(false);
		const locked = mount(['<!-- _class: content -->', '', '## L', '', 'Has ~~strike~~ in it.'].join('\n'));
		caretIn(locked, 'Has');
		expect(insertImageBlocker(locked.state)).toMatch(/edited in Markdown/);
		expect(insertImage('asset:forest', 'F')(locked.state, locked.dispatch)).toBe(false);
	});

	it('writes nothing for a source a deck cannot hold', () => {
		const view = mount(DECK);
		caretIn(view, 'Some words', true);
		const before = docToDeck(view.state.doc);
		expect(insertImage('asset:a b', 'F')(view.state, view.dispatch)).toBe(false);
		expect(docToDeck(view.state.doc)).toBe(before);
	});
});

describe('opening a deck with images changes no bytes', () => {
	it('emits the deck as written, with the locked slide verbatim', () => {
		const doc = deckToDoc(DECK);
		expect(emitDeck(doc, initBaseline(doc))).toBe(DECK);
	});

	it('re-serializes an edited slide with the images as the editor has always written them', () => {
		const doc = deckToDoc(DECK);
		expect(docToDeck(doc)).toContain('![A harbor at dawn](asset:harbor)\n\n![bg right:40% blur](asset:forest)');
	});
});

describe('an image cannot forge deck structure (found by the red team)', () => {
	const hostile = 'a\n\n---\n\n<!-- _class: title -->\n\n<!-- _backgroundImage: url(https://evil.example/b.png) -->\n\nb';

	function slidesOf(source: string): number {
		return deckToDoc(source).childCount;
	}

	it('a pasted <img> with a line break in its alt or title becomes one line, and the deck keeps its slides', () => {
		const html = document.createElement('div');
		html.innerHTML = `<p>hi <img src="asset:harbor" alt="${hostile.replace(/\n/g, '&#10;').replace(/</g, '&lt;')}" title="${hostile.replace(/\n/g, '&#10;').replace(/</g, '&lt;')}"></p>`;
		const slice = PMDOMParser.fromSchema(deckSchema).parseSlice(html);
		const view = mount(DECK);
		caretIn(view, 'Some words', true);
		view.dispatch(view.state.tr.replaceSelection(slice));
		const deck = docToDeck(view.state.doc);
		expect(slidesOf(deck)).toBe(2);
		expect(deck).not.toMatch(/\n---\n[\s\S]*_backgroundImage/);
		expect(deck.split('\n').filter((l) => l.includes('_backgroundImage'))).toHaveLength(1); // on the alt/title line itself, inside the image
		expect(deck).not.toMatch(/^<!-- _backgroundImage/m);
	});

	it('a pasted <img> whose source holds a line break, a quote or a bracket is not an image', () => {
		for (const src of ['a\n\n---\n\nb', 'x"y', 'x y', 'x`y', 'x)y', 'javascript:alert(1)\n']) {
			const html = document.createElement('div');
			html.innerHTML = '<p>hi <img></p>';
			(html.querySelector('img') as HTMLElement).setAttribute('src', src);
			const slice = PMDOMParser.fromSchema(deckSchema).parseSlice(html);
			let found = 0;
			slice.content.descendants((n) => {
				if (n.type === deckSchema.nodes.image) found++;
			});
			expect(found, JSON.stringify(src)).toBe(0);
		}
	});

	it('a node built with hostile attributes still serializes onto one line, whatever made it', () => {
		const doc = deckToDoc(['<!-- _class: content -->', '', '## T', '', 'x'].join('\n'));
		const slide = doc.child(0);
		const withBlock = (block: ReturnType<typeof deckSchema.nodes.paragraph.create>) => deckSchema.nodes.doc.create(doc.attrs, [slide.copy(slide.content.append(Fragment.from(block)))]);
		const hostileImage = deckSchema.nodes.image.create({ src: 'asset:harbor', alt: hostile, title: hostile });
		const deck = docToDeck(withBlock(deckSchema.nodes.paragraph.create(null, hostileImage)));
		expect(slidesOf(deck)).toBe(1);
		expect(deck.split('\n').filter((l) => l.startsWith('!['))).toHaveLength(1);
		// A source with whitespace is encoded, so it cannot end the destination or start a new block.
		const spaced = deckSchema.nodes.image.create({ src: 'a b\n---\nc' });
		const spacedDeck = docToDeck(withBlock(deckSchema.nodes.paragraph.create(null, spaced)));
		expect(slidesOf(spacedDeck)).toBe(1);
		expect(spacedDeck).toContain('(a%20b%0A---%0Ac)');
	});

	it('a backslash in a title or source is escaped, so it cannot cancel the quote or parenthesis after it', () => {
		const doc = deckToDoc(['<!-- _class: content -->', '', '## T', '', 'x'].join('\n'));
		const slide = doc.child(0);
		const img = deckSchema.nodes.image.create({ src: 'asset:a\\', alt: 'p', title: 'end\\' });
		const deck = docToDeck(deckSchema.nodes.doc.create(doc.attrs, [slide.copy(slide.content.append(Fragment.from(deckSchema.nodes.paragraph.create(null, img))))]));
		expect(deck).toContain('![p](asset:a\\\\ "end\\\\")');
		expect(deckToDoc(deck).childCount).toBe(1);
	});

	it('an ordinary image, with a title, writes the bytes the upstream rule always wrote', () => {
		const src = ['<!-- _class: content -->', '', '## T', '', '![A (nice) pic](asset:harbor "A title")'].join('\n');
		expect(docToDeck(deckToDoc(src))).toBe(src);
	});
});

describe('a description is never the background directive', () => {
	it('writes a leading bg as a sentence, and leaves every other description alone', () => {
		expect(descriptionAsAlt('bg right:90% sepia')).toBe('Image: bg right:90% sepia');
		expect(descriptionAsAlt('bg')).toBe('Image: bg');
		expect(descriptionAsAlt('A bg photo')).toBe('A bg photo');
		expect(descriptionAsAlt('  Boats\n at dawn ')).toBe('Boats  at dawn');
	});

	it('the Image door writes one line and never a directive from a caption', () => {
		const view = mount(DECK);
		caretIn(view, 'Some words', true);
		insertImage('asset:forest', descriptionAsAlt('bg left\n\n---\n\nx'))(view.state, view.dispatch);
		expect(deckToDoc(docToDeck(view.state.doc)).childCount).toBe(2);
		expect(docToDeck(view.state.doc)).toContain('![Image: bg left --- x](asset:forest)');
	});
});

describe('what the editor draws agrees with what the engine resolves', () => {
	it('an asset name is the engine\'s shape: no extension, no path, any case', () => {
		expect(imageSourceKind('asset:Harbor')).toBe('asset');
		expect(imageSourceKind('asset:team-photo.jpg')).toBe('other');
		expect(imageSourceKind('asset:x/../../etc')).toBe('other');
		expect(assetNameOf('asset:team-photo.jpg')).toBeNull();
	});

	it('draws only the data types the engine accepts', () => {
		for (const t of ['png', 'jpeg', 'gif', 'webp']) expect(imageSourceKind(`data:image/${t};base64,AAAA`), t).toBe('data');
		for (const t of ['avif', 'jpg', 'svg+xml', 'bmp']) expect(imageSourceKind(`data:image/${t};base64,AAAA`), t).toBe('other');
	});
});
