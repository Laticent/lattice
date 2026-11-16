import { Slice } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { CLIP_ORIGIN } from './clip-origin';
import { deckToDoc, docToDeck, emitDeck, initBaseline } from './deck-doc';
import { looksLikeMarkdown, markdownClipboardPlugin, markdownToSlice, pasteAsMarkdown, pasteNotice, placeSlides, rawBlocksOk, sliceToMarkdown } from './markdown-clipboard';

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
		const vscode = '<meta charset="utf-8"><div style="white-space: pre;"><div><span style="color:#569cd6"># Title</span></div><br><div><span>- a</span></div></div>';
		expect(pasteAsMarkdown({ text: md, html: vscode, plain: false, inCode: false })).toBe(true);
	});
	it('leaves structured HTML (a web page, a document) to the HTML parser', () => {
		expect(pasteAsMarkdown({ text: md, html: '<h1>Title</h1><ul><li>a</li></ul>', plain: false, inCode: false })).toBe(false);
	});
	it("leaves this editor's own copy to the lossless HTML path", () => {
		expect(pasteAsMarkdown({ text: md, html: `<section data-lattice-origin="${CLIP_ORIGIN}"></section>`, plain: false, inCode: false })).toBe(false);
	});
	it('takes the HTML when a page put different words on text/plain than it showed', () => {
		const shown = '<meta charset="utf-8"><span>Quarterly results</span>';
		expect(pasteAsMarkdown({ text: '**Quarterly results**\n\n<!-- {footer="x"} -->', html: shown, plain: false, inCode: false })).toBe(false);
		expect(pasteAsMarkdown({ text: '**Quarterly results**', html: shown, plain: false, inCode: false })).toBe(true);
	});
	it('never parses ⌘⇧V, a paste inside a code block, or prose with no Markdown in it', () => {
		expect(pasteAsMarkdown({ text: md, html: '', plain: true, inCode: false })).toBe(false);
		expect(pasteAsMarkdown({ text: md, html: '', plain: false, inCode: true })).toBe(false);
		expect(pasteAsMarkdown({ text: 'Just words.', html: '', plain: false, inCode: false })).toBe(false);
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

	it('reads front matter as settings, never as a slide, and names what it applies', () => {
		const p = markdownToSlice(`---\ntheme: cuoio\npaginate: true\n---\n\n${TWO}`);
		expect(p.frontMatter).toContain('theme: cuoio');
		expect(p.slides).toBe(2);
		p.slice.content.forEach((s) => {
			expect(s.textContent).not.toContain('theme:');
		});
		expect(pasteNotice(p)).toBe("Applied the pasted deck's settings (theme, paginate). Undo takes them back.");
	});

	it('settings and nothing else add no slide', () => {
		const p = markdownToSlice('---\ntheme: cuoio\n---\n');
		expect(p.slides).toBe(0);
		expect(p.slice.size).toBe(0);
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

	it('copies a locked slide as its exact bytes', () => {
		const doc = deckToDoc('# One\n\n---\n\n- one ~~two~~ three\n');
		const s = EditorState.create({ doc, selection: TextSelection.between(doc.resolve(0), doc.resolve(doc.content.size)) });
		expect(sliceToMarkdown(s.selection.content(), s)).toContain('- one ~~two~~ three');
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

// The inversion review's repros (2026-11-15): each was measured wrong before its fix.
describe('where a paste lands', () => {
	const BIG = '<!-- _class: big-number -->\n\n# 42%\n\nGross margin is up. More here.\n';
	const at = (src: string, needle: string, offset = 0) => {
		const doc = deckToDoc(src);
		let pos = -1;
		doc.descendants((n, p) => {
			if (pos < 0 && n.isText && n.text?.includes(needle)) pos = p + (n.text?.indexOf(needle) ?? 0) + offset;
		});
		return EditorState.create({ doc, selection: TextSelection.create(doc, pos) });
	};
	const pasted = (s: EditorState, md: string) => {
		const p = markdownToSlice(md);
		const tr = p.slides ? placeSlides(s, p.slice.content) : s.tr.replaceSelection(p.slice);
		return docToDeck(tr.doc);
	};

	it('puts pasted slides after the caret\'s slide and never splits it', () => {
		const out = pasted(at(BIG, 'More here.'), '## Summary\n\nWe grew.\n\n---\n\n## Risks\n\nChurn.');
		expect(out).toContain('Gross margin is up. More here.');
		expect(out.match(/_class: big-number/g)).toHaveLength(1);
		expect(out.indexOf('More here.')).toBeLessThan(out.indexOf('## Summary'));
	});

	it('puts them before the slide when the caret is at its very start, and fills an empty slide', () => {
		const before = pasted(at(BIG, '42%'), '# A\n\n---\n\n# B');
		expect(before.indexOf('# A')).toBeLessThan(before.indexOf('42%'));
		const blank = deckToDoc('# One\n\n---\n\n');
		const s = EditorState.create({ doc: blank, selection: TextSelection.atEnd(blank) });
		const out = docToDeck(placeSlides(s, markdownToSlice('# A\n\n---\n\n# B').slice.content).doc);
		expect(out.split('---').length).toBe(3);
	});

	it('keeps block types: a heading and bullets pasted after a paragraph stay a heading and bullets', () => {
		const out = pasted(at('# T\n\nFirst para.\n', 'First para.', 'First para.'.length), '## Heading\n\n- a\n- b');
		expect(out).toContain('First para.\n\n## Heading');
		expect(out).toMatch(/^- a$/m);
	});

	it('a paste that is only a break adds one empty slide', () => {
		const p = markdownToSlice('---');
		expect(p.slides).toBe(1);
	});

	it('says so when prose becomes a locked slide', () => {
		const p = markdownToSlice('Note ~~old~~ new **x**');
		expect(p.lockedProse).toBe(true);
		expect(pasteNotice(p)).toMatch(/its own slide/);
	});

	it('does not read a dunder identifier as bold', () => {
		expect(looksLikeMarkdown('call __init__ here')).toBe(false);
	});

	it('copies an unformatted phrase as plain text, without escapes', () => {
		const s = at('# T\n\n-3% churn in Q3\n', '-3% churn');
		const sel = EditorState.create({ doc: s.doc, selection: TextSelection.create(s.doc, s.selection.from, s.selection.from + '-3% churn'.length) });
		expect(sliceToMarkdown(sel.selection.content(), sel)).toBe('-3% churn');
	});
});

describe('rawBlocksOk', () => {
	it('refuses an HTML block too long to show whole, as the HTML paste path does', () => {
		expect(rawBlocksOk(markdownToSlice('# A\n\n<div>\nok\n</div>').slice)).toBe(true);
		const tall = `<div>\n${'x\n'.repeat(20000)}</div>`;
		expect(rawBlocksOk(markdownToSlice(`# A\n\n${tall}`).slice)).toBe(false);
	});
});

// The plugin end to end in jsdom, with the engine check stubbed: the real one is driven by the e2e spec.
describe('markdownClipboardPlugin', () => {
	const setup = (refs: string[] | Error) => {
		const notices: string[] = [];
		const plugin = markdownClipboardPlugin(
			(m) => notices.push(m),
			async () => {
				if (refs instanceof Error) throw refs;
				return refs;
			},
		);
		const doc = deckToDoc('# One\n\nBody.\n');
		const state = EditorState.create({ doc, selection: TextSelection.atEnd(doc), plugins: [plugin] });
		const view = new EditorView(document.createElement('div'), { state });
		const paste = async (text: string) => {
			const event = { clipboardData: { getData: (t: string) => (t === 'text/plain' ? text : '') } } as unknown as ClipboardEvent;
			const taken = plugin.props.handlePaste?.call(plugin, view, event, Slice.empty);
			for (let i = 0; i < 5; i++) await Promise.resolve();
			await new Promise((r) => setImmediate(r));
			return taken;
		};
		return { view, notices, paste };
	};

	it('lands a paste the check passes', async () => {
		const { view, paste } = setup([]);
		expect(await paste('# Two\n\n---\n\n# Three')).toBe(true);
		expect(docToDeck(view.state.doc)).toContain('# Three');
	});

	it('refuses, with a message, a paste that would load from another site, and inserts nothing', async () => {
		const { view, notices, paste } = setup(['https://evil.test/a.png']);
		const before = view.state.doc;
		await paste('# Two\n\n<!-- _backgroundImage: url(https://evil.test/a.png) -->');
		expect(view.state.doc).toBe(before);
		expect(notices.join(' ')).toMatch(/loads something from another site/);
	});

	it("applies a pasted deck's front matter to the open deck, key by key, with its slides", async () => {
		const { view, paste } = setup([]);
		await paste('---\ntheme: cuoio\npaginate: true\n---\n\n# Two\n\n---\n\n# Three');
		const out = docToDeck(view.state.doc);
		expect(out.startsWith('---\ntheme: cuoio\npaginate: true\n---')).toBe(true);
		expect(out).toContain('# Three');
	});

	it('refuses when the check cannot run: an unchecked paste is not waved through', async () => {
		const { view, notices, paste } = setup(new Error('engine did not load'));
		const before = view.state.doc;
		await paste('# Two\n\n---\n\n# Three');
		expect(view.state.doc).toBe(before);
		expect(notices.join(' ')).toMatch(/could not be checked/);
	});
});
