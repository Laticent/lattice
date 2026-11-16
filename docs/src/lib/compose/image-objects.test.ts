import { createRequire } from 'node:module';
import { Fragment, DOMParser as PMDOMParser } from 'prosemirror-model';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { deckSchema, deckToDoc, docToDeck, emitDeck, initBaseline } from './deck-doc';
import { recordOnFilo } from './filo-harness.test-util';
import { assetNameOf, bgKeywords, canPlaceOn, descriptionAsAlt, editImage, imageSourceKind, insertImage, insertImageBlocker, placeImage, placementAt, placementOf, removeImage, tokensWithPlacement } from './image-objects';
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
	return new EditorView(document.createElement('div'), { state: EditorState.create({ doc: deckToDoc(source), plugins: [plugin] }) });
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
});

describe('editing an image', () => {
	it('opens the editor on a tap, the way a pill does', () => {
		const view = mount(DECK);
		const [harbor] = images(view);
		expect(openObjectEditor(view, harbor.pos)).toBe(true);
		expect(openObject(view.state)).toMatchObject({ pos: harbor.pos, src: 'asset:harbor', alt: 'A harbor at dawn' });
		expect(view.state.selection).toBeInstanceOf(NodeSelection);
	});

	// One undo step on the deck's history (Filo, as the Studio drives Compose since slice 4).
	it('writes a new photo, keeps the description, and is one undo step', () => {
		const view = mount(DECK);
		const filo = recordOnFilo(view);
		const [harbor] = images(view);
		openObjectEditor(view, harbor.pos);
		const steps = filo.history.state().steps;
		expect(editImage(view, harbor.pos, { src: 'asset:forest' })).toBe(true);
		expect(images(view)[0]).toMatchObject({ src: 'asset:forest', alt: 'A harbor at dawn' });
		expect(docToDeck(view.state.doc)).toContain('![A harbor at dawn](asset:forest)');
		expect(filo.history.state().steps).toBe(steps + 1);
		filo.undo();
		expect(images(view)[0].src).toBe('asset:harbor');
		filo.redo();
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
		const filo = recordOnFilo(view);
		const [harbor] = images(view);
		expect(editImage(view, harbor.pos, { alt: 'A harbor at dawn', src: 'asset:harbor' })).toBe(true);
		expect(filo.history.state().steps).toBe(0);
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
		const filo = recordOnFilo(view);
		const [harbor] = images(view);
		removeImage(view, harbor.pos);
		expect(filo.history.state().steps).toBe(1);
		filo.undo();
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
		const filo = recordOnFilo(view);
		caretIn(view, 'Some words', true);
		insertImage('asset:forest', 'F')(view.state, view.dispatch);
		expect(filo.history.state().steps).toBe(1);
		filo.undo();
		expect(docToDeck(view.state.doc)).not.toContain('![F](asset:forest)');
	});

	it('declines in a code block and in a locked slide, and says why', () => {
		const view = mount(DECK);
		caretIn(view, 'code');
		expect(insertImageBlocker(view.state)).toMatch(/code block/);
		expect(insertImage('asset:forest', 'F')(view.state, view.dispatch)).toBe(false);
		const locked = mount(['<!-- _class: content -->', '', '## L', '', 'Has ~~strike~~ in it.'].join('\n'));
		caretIn(locked, 'Has');
		expect(insertImageBlocker(locked.state)).toMatch(/edited in Source/);
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

describe('placing a picture writes the SLIDE\'s class, never `![bg]` (owner, 2026-11-10)', () => {
	const one = (cls: string, pic: string) => [`<!-- _class: ${cls} -->`, '', '## T', '', 'Words.', '', pic].join('\n');

	it('the class tokens for each placement keep every other word', () => {
		expect(tokensWithPlacement(['content', 'dark'], 'left')).toEqual(['image', 'dark', 'mirror']);
		expect(tokensWithPlacement(['image', 'mirror', 'dark'], 'right')).toEqual(['image', 'dark']);
		expect(tokensWithPlacement(['image', 'dark'], 'full')).toEqual(['content', 'dark', 'bleed']);
		expect(tokensWithPlacement(['content', 'bleed'], 'none')).toEqual(['content']);
		expect(placementOf(['image', 'mirror'])).toBe('left');
		expect(placementOf(['content', 'bleed'])).toBe('full');
		expect(canPlaceOn(['quote'])).toBe(false);
		expect(canPlaceOn([])).toBe(true);
	});

	it('a lone picture on a content slide: Left makes it `image mirror`, Full a `bleed`, In the text back to content; one undo step each', () => {
		const view = mount(one('content', '![A lake](sample:photo-wide.jpg)'));
		const filo = recordOnFilo(view);
		const [pic] = images(view);
		expect(placementAt(view.state, pic.pos)).toEqual({ placement: 'none', canPlace: true });
		const steps = filo.history.state().steps;
		expect(placeImage(view, pic.pos, 'left')).toBe(true);
		expect(filo.history.state().steps).toBe(steps + 1);
		expect(docToDeck(view.state.doc)).toMatch(/<!-- _class: image mirror -->[\s\S]*!\[A lake\]\(sample:photo-wide\.jpg\)/);
		expect(placeImage(view, images(view)[0].pos, 'full')).toBe(true);
		expect(docToDeck(view.state.doc)).toContain('<!-- _class: content bleed -->');
		expect(placeImage(view, images(view)[0].pos, 'none')).toBe(true);
		expect(docToDeck(view.state.doc)).toContain('<!-- _class: content -->');
		expect(docToDeck(view.state.doc)).not.toMatch(/!\[bg/);
	});

	it('an old `![bg …]` picture loses its keywords when placed, and its description becomes its name', () => {
		const view = mount(one('content', '![bg right:40% blur](asset:forest "A forest")'));
		const [pic] = images(view);
		// The engine draws it as an ordinary picture since the break (2026-11-13), so the badge says so; Placement still moves it.
		expect(placementAt(view.state, pic.pos)).toEqual({ placement: 'none', canPlace: true });
		expect(placeImage(view, pic.pos, 'right')).toBe(true);
		const out = docToDeck(view.state.doc);
		expect(out).toContain('<!-- _class: image -->');
		// The description becomes the name once, not the name and the description both (inversion, F9).
		expect(out).toContain('![A forest](asset:forest)');
		expect(out).not.toMatch(/!\[bg/);
	});

	it('refuses a slide with a layout of its own, a picture in running text, and a compound class comment', () => {
		const quote = mount(one('quote', '![A lake](sample:photo-wide.jpg)'));
		expect(placementAt(quote.state, images(quote)[0].pos).canPlace).toBe(false);
		expect(placeImage(quote, images(quote)[0].pos, 'left')).toBe(false);
		const inline = mount(one('content', 'See ![A lake](sample:photo-wide.jpg) here.'));
		expect(placementAt(inline.state, images(inline)[0].pos).canPlace).toBe(false);
		const compound = mount(['<!-- _class: content --><!-- _paginate: false -->', '', '## T', '', '![A lake](sample:photo-wide.jpg)'].join('\n'));
		const before = docToDeck(compound.state.doc);
		expect(placeImage(compound, images(compound)[0].pos, 'left')).toBe(false);
		expect(docToDeck(compound.state.doc)).toBe(before);
	});

	it('only the slide\'s ONLY lone picture, as a direct paragraph, may be placed (the checker on this change)', () => {
		const two = mount(one('content', '![A](a.jpg)\n\n![B](b.jpg)'));
		expect(placementAt(two.state, images(two)[0].pos).canPlace).toBe(false);
		const list = mount(one('content', '- ![A](a.jpg)'));
		expect(placementAt(list.state, images(list)[0].pos).canPlace).toBe(false);
	});

	it('a deck-wide class decides the placement and is not overridden from here', () => {
		const view = new EditorView(document.createElement('div'), { state: EditorState.create({ doc: deckToDoc('---\ntheme: indaco\nclass: bleed\n---\n\n' + one('content', '![A](a.jpg)')) }) });
		expect(placementAt(view.state, images(view)[0].pos)).toEqual({ placement: 'full', canPlace: false });
		expect(placeImage(view, images(view)[0].pos, 'none')).toBe(false);
	});

	it('what the engine will not place, Compose does not offer: a `![bg]` photo or a record beside it, a keyword alt, an http address (inversion, F1, F4, F5)', () => {
		const besideBg = mount(one('image', '![bg right](https://x.test/photo.jpg)\n\n![Logo](https://x.test/logo.png)'));
		const logo = images(besideBg).find((p) => p.alt === 'Logo');
		expect(placementAt(besideBg.state, logo!.pos)).toEqual({ placement: 'none', canPlace: false });
		const besideRecord = mount(one('image', '`@image{https://x.test/photo.jpg, title="Photo"}`\n\n![Logo](https://x.test/logo.png)'));
		expect(placementAt(besideRecord.state, images(besideRecord)[0].pos)).toEqual({ placement: 'none', canPlace: false });
		const caps = mount(one('image', '![BG right](https://x.test/a.jpg)'));
		expect(placementAt(caps.state, images(caps)[0].pos)).toEqual({ placement: 'none', canPlace: false });
		const http = mount(one('image', '![Lake](http://x.test/a.jpg)'));
		expect(placementAt(http.state, images(http)[0].pos)).toEqual({ placement: 'none', canPlace: false });
	});

	it('a carried class reaches the badge, and a bracketed deck class places nothing, as in the engine (inversion, F6)', () => {
		const carried = mount(['<!-- class: image -->', '', '## One', '', '---', '', '## Two', '', '![A](https://x.test/a.jpg)'].join('\n'));
		expect(placementAt(carried.state, images(carried)[0].pos)).toEqual({ placement: 'right', canPlace: false });
		const bracket = new EditorView(document.createElement('div'), { state: EditorState.create({ doc: deckToDoc('---\ntheme: indaco\nclass: [bleed]\n---\n\n' + one('content', '![A](https://x.test/a.jpg)')) }) });
		expect(placementAt(bracket.state, images(bracket)[0].pos).placement).toBe('none');
	});

	it('a modifier-only slide is a content slide, so Placement is offered there (inversion, F7)', () => {
		expect(canPlaceOn(['dark'])).toBe(true);
		expect(canPlaceOn(['dark', 'quote'])).toBe(false);
		const dark = mount(one('dark', '![A](https://x.test/a.jpg)'));
		expect(placementAt(dark.state, images(dark)[0].pos).canPlace).toBe(true);
	});

	it('`mirror` belongs to the image layout here, and to any other layout there', () => {
		expect(tokensWithPlacement(['content', 'mirror'], 'full')).toEqual(['content', 'mirror', 'bleed']);
		expect(tokensWithPlacement(['content', 'mirror'], 'left')).toEqual(['image', 'mirror']);
		expect(tokensWithPlacement(['image', 'mirror'], 'none')).toEqual(['content']);
	});
});
