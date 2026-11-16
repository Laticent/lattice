import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { CLIP_ORIGIN } from './clip-origin';
import { deckToDoc, docToDeck, emitDeck, initBaseline } from './deck-doc';
import { looksLikeMarkdown, markdownToSlice, pasteAsMarkdown, pasteNotice, sliceToMarkdown, stripRemoteDirectives } from './markdown-clipboard';

// The paste the owner reported: Markdown from a text editor, two slides, one with a layout.
const TWO = '# Quarterly plan\n\n- **Revenue** up 12%\n- Hiring *paused*\n\n---\n\n<!-- _class: big-number -->\n\n# 42%\n\nGross margin\n';

describe('looksLikeMarkdown', () => {
	it.each([
		['# Heading'],
		['- a\n- b'],
		['1. one'],
		['> quote'],
		['a\n\n---\n\nb'],
		['<!-- _class: big-number -->'],
		['some **bold** words'],
		['a `code` span'],
		['a [link](https://x.test)'],
		['```js\nx\n```'],
		['| a | b |'],
	])('reads %j as Markdown', (text) => {
		expect(looksLikeMarkdown(text)).toBe(true);
	});

	it.each([['Just a sentence.'], ['Price: 5 * 3 = 15'], ['two\n\nparagraphs of prose'], ['#hashtag']])('reads %j as plain text', (text) => {
		expect(looksLikeMarkdown(text)).toBe(false);
	});
});

describe('pasteAsMarkdown', () => {
	const md = '# Title\n\n- a';
	it('takes Markdown that comes as text only (a text editor, a chat reply, a file)', () => {
		expect(pasteAsMarkdown({ text: md, html: '', plain: false, inCode: false })).toBe(true);
	});
	it("takes Markdown under a code editor's colored HTML (VS Code)", () => {
		const vscode = '<meta charset="utf-8"><div style="white-space: pre;"><div><span style="color:#569cd6"># Title</span></div></div>';
		expect(pasteAsMarkdown({ text: md, html: vscode, plain: false, inCode: false })).toBe(true);
	});
	it('leaves structured HTML (a web page, a document) to the HTML parser', () => {
		expect(pasteAsMarkdown({ text: md, html: '<h1>Title</h1><ul><li>a</li></ul>', plain: false, inCode: false })).toBe(false);
	});
	it("leaves this editor's own copy to the lossless HTML path", () => {
		expect(pasteAsMarkdown({ text: md, html: `<section data-lattice-origin="${CLIP_ORIGIN}"></section>`, plain: false, inCode: false })).toBe(false);
	});
	it('never parses ⌘⇧V, a paste inside a code block, or prose with no Markdown in it', () => {
		expect(pasteAsMarkdown({ text: md, html: '', plain: true, inCode: false })).toBe(false);
		expect(pasteAsMarkdown({ text: md, html: '', plain: false, inCode: true })).toBe(false);
		expect(pasteAsMarkdown({ text: 'Just words.', html: '', plain: false, inCode: false })).toBe(false);
	});
});

describe('stripRemoteDirectives', () => {
	it('drops a directive that would fetch, and keeps a layout', () => {
		const { text, dropped } = stripRemoteDirectives('<!-- _class: lead -->\n<!-- _backgroundImage: url(https://evil.test/b.png) -->\n\n# Hi');
		expect(dropped).toBe(1);
		expect(text).toContain('<!-- _class: lead -->');
		expect(text).not.toContain('evil.test');
	});
	it('catches the global spelling, a protocol-relative URL and a comment that spans lines', () => {
		expect(stripRemoteDirectives('<!-- backgroundImage: url(//x.test/a.png) -->').dropped).toBe(1);
		expect(stripRemoteDirectives('<!--\n_backgroundImage:\nurl(https://x.test/a.png)\n-->').dropped).toBe(1);
	});
	it('catches an address written as a link or an image, and leaves a relative one', () => {
		expect(stripRemoteDirectives('<!-- _footer: ![](https://x.test/logo.png) -->').dropped).toBe(1);
		expect(stripRemoteDirectives('<!-- _backgroundImage: url(images/a.png) -->').dropped).toBe(0);
	});

	it('leaves fenced code alone: it is an example, not a directive', () => {
		const md = '```md\n<!-- _backgroundImage: url(https://x.test/a.png) -->\n```';
		expect(stripRemoteDirectives(md)).toEqual({ text: md, dropped: 0 });
	});
});

describe('markdownToSlice', () => {
	it('turns prose into formatted blocks at the caret, opened to join the paragraph it lands in', () => {
		const p = markdownToSlice('some **bold** text');
		expect(p.slides).toBe(0);
		expect(p.slice.openStart).toBeGreaterThan(0);
		const para = p.slice.content.firstChild;
		expect(para?.type.name).toBe('paragraph');
		expect(para?.textContent).toBe('some bold text');
		let bold = false;
		para?.forEach((n) => {
			if (n.marks.some((m) => m.type.name === 'strong')) bold = true;
		});
		expect(bold).toBe(true);
	});

	it('keeps the spaces a joining paste starts and ends with', () => {
		const p = markdownToSlice(' Then **ship** it. ');
		expect(p.slice.content.firstChild?.textContent).toBe(' Then ship it. ');
	});

	it('turns slide breaks into slides and keeps each slide\'s layout', () => {
		const p = markdownToSlice(TWO);
		expect(p.slides).toBe(2);
		expect(p.slice.content.child(0).type.name).toBe('slide');
		expect(p.slice.content.child(1).attrs.directives).toEqual(['<!-- _class: big-number -->']);
		expect(p.slice.content.child(0).firstChild?.type.name).toBe('heading');
	});

	it('normalizes the ingest: a BOM and CRLF never reach the deck', () => {
		const p = markdownToSlice('﻿# A\r\n\r\n---\r\n\r\n# B\r\n');
		expect(p.slides).toBe(2);
		p.slice.content.forEach((s) => {
			expect(s.attrs.raw).not.toMatch(/\r|﻿/);
		});
	});

	it('sets front matter aside rather than reading it as a slide, and says so', () => {
		const p = markdownToSlice(`---\ntheme: cuoio\npaginate: true\n---\n\n${TWO}`);
		expect(p.frontMatter).toContain('theme: cuoio');
		expect(p.slides).toBe(2);
		p.slice.content.forEach((s) => {
			expect(s.textContent).not.toContain('theme:');
		});
		expect(pasteNotice(p)).toMatch(/settings .* were not applied/);
	});

	it('pastes prose Compose cannot round-trip as a locked slide that saves its bytes as pasted', () => {
		// Strikethrough is on deck-source's LOSSY_CONSTRUCTS list, so this slide locks.
		const table = '# Plan\n\n~~gone~~ for now';
		const p = markdownToSlice(table);
		expect(p.slides).toBe(1);
		const slide = p.slice.content.child(0);
		expect(slide.attrs.locked).toBe(true);
		const doc = deckToDoc('# One\n');
		const baseline = initBaseline(doc);
		const next = doc.copy(doc.content.append(p.slice.content));
		expect(emitDeck(next, baseline)).toContain(table);
	});

	it('counts what it left out', () => {
		const p = markdownToSlice('<!-- _backgroundImage: url(https://x.test/a.png) -->\n\n# A\n\n---\n\n# B');
		expect(p.dropped).toBe(1);
		expect(pasteNotice(p)).toMatch(/left out/);
	});
});

describe('sliceToMarkdown', () => {
	const DECK = `---\ntheme: indaco\n---\n\n<!-- _class: title -->\n\n# Hello **world**\n\n---\n\n<!-- _class: big-number -->\n\n# 42%\n\nGross margin\n\n---\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n`;
	const state = (from: number, to: number) => {
		const doc = deckToDoc(DECK);
		return EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });
	};
	const textPos = (s: EditorState, needle: string) => {
		let at = -1;
		s.doc.descendants((n, pos) => {
			if (at < 0 && n.isText && n.text?.includes(needle)) at = pos + (n.text?.indexOf(needle) ?? 0);
		});
		return at;
	};
	const copy = (s: EditorState) => sliceToMarkdown(s.selection.content(), s);

	it('copies a phrase as its inline Markdown', () => {
		const s0 = state(1, 1);
		const from = textPos(s0, 'Hello');
		const to = textPos(s0, 'world') + 'world'.length;
		expect(copy(state(from, to))).toBe('Hello **world**');
	});

	it("copies code as the code, never escaped", () => {
		const s0 = state(1, 1);
		const from = textPos(s0, 'const');
		expect(copy(state(from, from + 'const x = 1;'.length))).toBe('const x = 1;');
	});

	it('copies across slides as slides, with their layouts and the break between them', () => {
		const s0 = state(1, 1);
		const md = copy(state(textPos(s0, 'Hello'), textPos(s0, 'Gross') + 5));
		expect(md).toContain('<!-- _class: big-number -->');
		expect(md).toMatch(/\n---\n/);
		expect(md).toContain('# 42%');
	});

	it('copies the whole deck as the deck file, front matter included', () => {
		const doc = deckToDoc(DECK);
		const s = EditorState.create({ doc, selection: TextSelection.between(doc.resolve(0), doc.resolve(doc.content.size)) });
		const md = copy(s);
		expect(md.startsWith('---\ntheme: indaco\n---')).toBe(true);
		expect(md).toBe(docToDeck(doc));
	});

	it('round-trips: a copied pair of slides pastes back as the same slides', () => {
		const s0 = state(1, 1);
		const md = copy(state(textPos(s0, 'Hello'), textPos(s0, 'Gross') + 'Gross margin'.length));
		const back = markdownToSlice(md);
		expect(back.slides).toBe(2);
		expect(back.slice.content.child(1).attrs.directives).toEqual(['<!-- _class: big-number -->']);
		expect(back.slice.content.child(1).textContent).toContain('Gross margin');
	});
});
