import { createRequire } from 'node:module';
import { EditorState, type Plugin, TextSelection } from 'prosemirror-state';
import type { Decoration, DecorationSet } from 'prosemirror-view';
import { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { deckToDoc, docToDeck } from './deck-doc';
import {
	applyPillEdit,
	closePillEditor,
	findPillSpans,
	type InlineKernels,
	inlineNotationPlugin,
	insertPill,
	openPill,
	openPillEditor,
	pillAt,
	touchesSpan,
} from './inline-notation';

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
].join('\n');

function mount(source: string, plugins: Plugin[] = []) {
	const doc = deckToDoc(source);
	return new EditorView(document.createElement('div'), { state: EditorState.create({ doc, plugins }) });
}

describe('findPillSpans', () => {
	const doc = deckToDoc(DECK);

	it('finds every readable pill, in document order, at exact positions', () => {
		const spans = findPillSpans(doc, kernels, false);
		expect(spans.map((s) => s.text)).toEqual(['{SHIPPED, c2}', '{BETA, tag, c4}', '{3, circle}', '{DONE, c1}']);
		for (const s of spans) expect(doc.textBetween(s.from, s.to)).toBe(s.text);
		expect(spans.every((s) => !s.locked)).toBe(true);
	});

	it('skips what the engine would not draw: a reserved label, a template tag, and a fenced block', () => {
		const texts = findPillSpans(doc, kernels, false).map((s) => s.text);
		expect(texts).not.toContain('{x}');
		expect(texts).not.toContain('{{name}}');
		expect(texts).not.toContain('{LIVE}');
	});

	it('paints nothing in a deck that turned the inline grammar off', () => {
		expect(findPillSpans(doc, kernels, true)).toEqual([]);
	});

	it('paints nothing on a slide that turned it off for itself', () => {
		const src = DECK.replace('<!-- _class: content -->\n\n## Next', '<!-- _class: inline-code-literal -->\n\n## Next');
		const texts = findPillSpans(deckToDoc(src), kernels, false).map((s) => s.text);
		expect(texts).toEqual(['{SHIPPED, c2}', '{BETA, tag, c4}', '{3, circle}']);
	});

	it('marks a slide Compose cannot round-trip as locked, and still lists its pills', () => {
		const src = '<!-- _class: content -->\n\n## Locked\n\nThis has ~~strike~~ and `{LIVE, c3}`.\n';
		const spans = findPillSpans(deckToDoc(src), kernels, false);
		expect(spans).toHaveLength(1);
		expect(spans[0].locked).toBe(true);
	});
});

describe('pillAt', () => {
	it('answers for the exact span and for nothing else', () => {
		const doc = deckToDoc(DECK);
		const [first] = findPillSpans(doc, kernels, false);
		expect(pillAt(doc, first, kernels)?.text).toBe('{SHIPPED, c2}');
		expect(pillAt(doc, { from: first.from, to: first.to - 1 }, kernels)).toBeNull();
		expect(pillAt(doc, { from: first.from + 1, to: first.to }, kernels)).toBeNull();
		expect(pillAt(doc, { from: 0, to: 4 }, kernels)).toBeNull();
	});
});

describe('applyPillEdit', () => {
	it('changes one word, keeps the code mark, and the deck serializes with every other byte intact', () => {
		const view = mount(DECK);
		const [first] = findPillSpans(view.state.doc, kernels, false);
		const next = applyPillEdit(view, first, { color: 'c7' }, kernels);
		expect(next).toEqual({ from: first.from, to: first.from + '{SHIPPED, c7}'.length, text: '{SHIPPED, c7}' });
		expect(docToDeck(view.state.doc)).toBe(DECK.replace('`{SHIPPED, c2}`', '`{SHIPPED, c7}`'));
	});

	it('keeps editing the same pill with the range it handed back', () => {
		const view = mount(DECK);
		let range: { from: number; to: number } = findPillSpans(view.state.doc, kernels, false)[0];
		for (const edit of [{ shape: 'tag' }, { size: 'lg' }, { label: 'Done, really' }, { shape: null }] as const) {
			const out = applyPillEdit(view, range, edit, kernels);
			expect(out).not.toBeNull();
			range = out as { from: number; to: number };
		}
		expect(docToDeck(view.state.doc)).toContain('`{"Done, really", c2, lg}`');
	});

	it('refuses an edit the kernel declines, and writes nothing', () => {
		const view = mount(DECK);
		const [first] = findPillSpans(view.state.doc, kernels, false);
		const before = view.state.doc;
		expect(applyPillEdit(view, first, { color: 'c13' }, kernels)).toBeNull();
		expect(applyPillEdit(view, first, { label: '' }, kernels)).toBeNull();
		expect(view.state.doc).toBe(before);
	});

	it('refuses a range that is no longer a pill', () => {
		const view = mount(DECK);
		const [first] = findPillSpans(view.state.doc, kernels, false);
		expect(applyPillEdit(view, { from: first.from, to: first.to + 3 }, { color: 'c3' }, kernels)).toBeNull();
	});

	it('does nothing to a locked slide', () => {
		const view = mount('<!-- _class: content -->\n\n## Locked\n\nThis has ~~strike~~ and `{LIVE, c3}`.\n');
		const [span] = findPillSpans(view.state.doc, kernels, false);
		const before = view.state.doc;
		expect(applyPillEdit(view, span, { color: 'c5' }, kernels)).toBeNull();
		expect(view.state.doc).toBe(before);
	});

	it('is undoable as one step per edit', async () => {
		const { history, undo } = await import('prosemirror-history');
		const view = mount(DECK, [history()]);
		const [first] = findPillSpans(view.state.doc, kernels, false);
		applyPillEdit(view, first, { color: 'c9' }, kernels);
		expect(docToDeck(view.state.doc)).toContain('{SHIPPED, c9}');
		undo(view.state, view.dispatch);
		expect(docToDeck(view.state.doc)).toBe(DECK);
	});
});

describe('applyPillEdit and the author\'s typing', () => {
	it('a pick made right after typing undoes alone, and leaves the typing', async () => {
		const { history, undo, undoDepth } = await import('prosemirror-history');
		const view = mount(DECK, [history()]);
		const [first] = findPillSpans(view.state.doc, kernels, false);
		view.dispatch(view.state.tr.insertText('X', 1));
		const typed = docToDeck(view.state.doc);
		const [pill] = findPillSpans(view.state.doc, kernels, false);
		const depth = undoDepth(view.state);
		applyPillEdit(view, pill, { color: 'c9' }, kernels);
		expect(undoDepth(view.state)).toBe(depth + 1);
		undo(view.state, view.dispatch);
		expect(docToDeck(view.state.doc)).toBe(typed);
		expect(first.text).toBe('{SHIPPED, c2}');
	});
});

describe('insertPill', () => {
	const plugin = () => inlineNotationPlugin({ getKernels: () => kernels, getDeckLiteral: () => false, isRendered: () => false, onOpenChange: () => {} });

	function caretIn(view: EditorView, needle: string, after = false) {
		let at = -1;
		view.state.doc.descendants((node, pos) => {
			if (at < 0 && node.isText && node.text?.includes(needle)) at = pos + node.text.indexOf(needle) + (after ? needle.length : 0);
		});
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
		return at;
	}

	it('puts a code-marked pill at the caret and asks for its editor', () => {
		const view = mount(DECK, [plugin()]);
		const at = caretIn(view, 'Plain slide', true);
		expect(insertPill(() => kernels)(view.state, view.dispatch)).toBe(true);
		expect(docToDeck(view.state.doc)).toContain('Plain slide`{Status}` with');
		expect(openPill(view.state)).toMatchObject({ from: at, to: at + '{Status}'.length });
	});

	it('uses a short selected word as the label, quoted when it needs it', () => {
		const view = mount(DECK, [plugin()]);
		let from = -1;
		view.state.doc.descendants((node, pos) => {
			if (from < 0 && node.isText && node.text?.startsWith('Plain slide')) from = pos;
		});
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + 'Plain'.length)));
		insertPill(() => kernels)(view.state, view.dispatch);
		expect(docToDeck(view.state.doc)).toContain('`{Plain}` slide with');
	});

	it('declines inside a fence, in a locked slide, and before the kernels have loaded', () => {
		const view = mount(DECK, [plugin()]);
		caretIn(view, 'a fence with', true);
		expect(insertPill(() => kernels)(view.state, undefined)).toBe(false);
		caretIn(view, 'Plain slide', true);
		expect(insertPill(() => null)(view.state, undefined)).toBe(false);
		const locked = mount('<!-- _class: content -->\n\n## L\n\nHas ~~strike~~ text.\n', [plugin()]);
		caretIn(locked, 'Has', true);
		expect(insertPill(() => kernels)(locked.state, undefined)).toBe(false);
	});
});


describe('a stale range never writes', () => {
	const SRC = '<!-- _class: content -->\n\n## T\n\nShipped ab `{AB, c2}` then more text.';

	function pillRange(view: EditorView) {
		return findPillSpans(view.state.doc, kernels, false)[0];
	}

	it('pillAt rejects a range that has slipped left of the pill (the checker\'s repro)', () => {
		const view = mount(SRC);
		const stale = { ...pillRange(view) };
		// Delete one character before the pill: the pill moves left by one, and the old range now starts one character INTO the previous text.
		view.dispatch(view.state.tr.delete(stale.from - 3, stale.from - 2));
		expect(pillAt(view.state.doc, stale, kernels)).toBeNull();
	});

	it('applyPillEdit on that stale range writes nothing, and the deck is unchanged', () => {
		const view = mount(SRC);
		const stale = { ...pillRange(view) };
		view.dispatch(view.state.tr.delete(stale.from - 3, stale.from - 2));
		const before = docToDeck(view.state.doc);
		expect(applyPillEdit(view, stale, { color: 'c4' }, kernels)).toBeNull();
		expect(docToDeck(view.state.doc)).toBe(before);
	});

	it('the open range follows edits before the pill, so the next write lands on the right bytes', () => {
		const plugins = [inlineNotationPlugin({ getKernels: () => kernels, getDeckLiteral: () => false, isRendered: () => true, onOpenChange: () => {} })];
		const view = mount(SRC, plugins);
		const range = pillRange(view);
		openPillEditor(view, range);
		view.dispatch(view.state.tr.delete(range.from - 3, range.from - 2));
		const open = openPill(view.state);
		expect(open).toMatchObject({ from: range.from - 1, to: range.to - 1 });
		expect(pillAt(view.state.doc, open as { from: number; to: number }, kernels)?.text).toBe('{AB, c2}');
		expect(applyPillEdit(view, open as { from: number; to: number }, { color: 'c4' }, kernels)).not.toBeNull();
		expect(docToDeck(view.state.doc)).toContain('Shipped b `{AB, c4}` then more text.');
		// The edit itself moved nothing: the range still names the (now longer or shorter) pill.
		expect(pillAt(view.state.doc, openPill(view.state) as { from: number; to: number }, kernels)?.text).toBe('{AB, c4}');
	});

	it('the editor closes when an edit deletes into the pill', () => {
		const plugins = [inlineNotationPlugin({ getKernels: () => kernels, getDeckLiteral: () => false, isRendered: () => true, onOpenChange: () => {} })];
		const view = mount(SRC, plugins);
		const range = pillRange(view);
		openPillEditor(view, range);
		view.dispatch(view.state.tr.delete(range.from, range.to));
		expect(openPill(view.state)).toBeNull();
	});

	it('a click on another pill replaces the open one, with a new id', () => {
		const plugins = [inlineNotationPlugin({ getKernels: () => kernels, getDeckLiteral: () => false, isRendered: () => true, onOpenChange: () => {} })];
		const view = mount(DECK, plugins);
		const [a, b] = findPillSpans(view.state.doc, kernels, false);
		openPillEditor(view, a);
		const first = openPill(view.state);
		openPillEditor(view, b);
		const second = openPill(view.state);
		expect(second?.from).toBe(b.from);
		expect(second?.id).not.toBe(first?.id);
		closePillEditor(view);
		expect(openPill(view.state)).toBeNull();
	});

	it('the open range is reported to the host, and cleared on close', () => {
		const seen: Array<unknown> = [];
		const plugins = [inlineNotationPlugin({ getKernels: () => kernels, getDeckLiteral: () => false, isRendered: () => true, onOpenChange: (o) => seen.push(o) })];
		const view = mount(SRC, plugins);
		const range = pillRange(view);
		openPillEditor(view, range);
		closePillEditor(view);
		expect(seen[0]).toMatchObject({ from: range.from, to: range.to });
		expect(seen.at(-1)).toBeNull();
	});
});

describe('insertPill never touches the author\'s own code', () => {
	const plugin = () => inlineNotationPlugin({ getKernels: () => kernels, getDeckLiteral: () => false, isRendered: () => false, onOpenChange: () => {} });
	const caretAt = (view: EditorView, needle: string, offset: number) => {
		let at = -1;
		view.state.doc.descendants((node, pos) => {
			if (at < 0 && node.isText && node.text?.includes(needle)) at = pos + node.text.indexOf(needle) + offset;
		});
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
	};
	const SRC = '<!-- _class: content -->\n\n## T\n\nSee `abcdef` now.\n\nSecond paragraph.';

	it('declines in the middle of an inline code span', () => {
		const view = mount(SRC, [plugin()]);
		caretAt(view, 'abcdef', 3);
		const before = docToDeck(view.state.doc);
		expect(insertPill(() => kernels)(view.state, view.dispatch)).toBe(false);
		expect(docToDeck(view.state.doc)).toBe(before);
	});

	it('declines right at either edge of an inline code span', () => {
		for (const offset of [0, 6]) {
			const view = mount(SRC, [plugin()]);
			caretAt(view, 'abcdef', offset);
			expect(insertPill(() => kernels)(view.state, undefined), `offset ${offset}`).toBe(false);
		}
	});

	it('declines on a selection that crosses paragraphs', () => {
		const view = mount(SRC, [plugin()]);
		let from = -1;
		let to = -1;
		view.state.doc.descendants((node, pos) => {
			if (node.isText && node.text?.startsWith('See ') && from < 0) from = pos + 1;
			if (node.isText && node.text?.startsWith('Second') && to < 0) to = pos + 3;
		});
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
		expect(insertPill(() => kernels)(view.state, undefined)).toBe(false);
	});
});

describe('touchesSpan — when the text must be on screen', () => {
	const span = { from: 10, to: 20 };
	const caret = (n: number) => ({ from: n, to: n, empty: true });
	it('a caret inside the span or at either edge touches it; a caret elsewhere does not', () => {
		for (const n of [10, 15, 20]) expect(touchesSpan(caret(n), span), `caret ${n}`).toBe(true);
		for (const n of [0, 9, 21, 99]) expect(touchesSpan(caret(n), span), `caret ${n}`).toBe(false);
	});
	it('a range that cuts into the span touches it; one that swallows it whole, or misses it, does not', () => {
		expect(touchesSpan({ from: 5, to: 12, empty: false }, span)).toBe(true);
		expect(touchesSpan({ from: 18, to: 30, empty: false }, span)).toBe(true);
		expect(touchesSpan({ from: 12, to: 18, empty: false }, span)).toBe(true);
		expect(touchesSpan({ from: 5, to: 30, empty: false }, span)).toBe(false);
		expect(touchesSpan({ from: 10, to: 20, empty: false }, span)).toBe(false);
		expect(touchesSpan({ from: 0, to: 9, empty: false }, span)).toBe(false);
		expect(touchesSpan({ from: 21, to: 30, empty: false }, span)).toBe(false);
	});
});

describe('what the plugin paints', () => {
	function paint(selectionAt: number | null, isRendered: boolean, src = DECK) {
		const plugin = inlineNotationPlugin({ getKernels: () => kernels, getDeckLiteral: () => false, isRendered: () => isRendered, onOpenChange: () => {} });
		const view = mount(src, [plugin]);
		if (selectionAt !== null) view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selectionAt)));
		const set = plugin.props.decorations?.call(plugin, view.state) as DecorationSet | undefined;
		const decos = (set?.find() ?? []) as Decoration[];
		const keys = decos.map((d) => (d as unknown as { spec: { key?: string } }).spec?.key).filter((k): k is string => Boolean(k));
		const hidden = decos.filter((d) => (d as unknown as { type: { attrs?: { class?: string } } }).type?.attrs?.class === 'cs-psrc').length;
		return { view, keys, hidden, spans: findPillSpans(view.state.doc, kernels, false) };
	}

	it('with the sheet ready and the caret elsewhere, every pill is drawn and its text hidden', () => {
		const { keys, hidden, spans } = paint(null, true);
		expect(keys.filter((k) => k.startsWith('pill:'))).toHaveLength(spans.length);
		expect(keys.filter((k) => k.startsWith('chip:'))).toHaveLength(0);
		expect(hidden).toBe(spans.length);
	});

	it('a caret in or against a pill brings its text back with a tag button, and only that one', () => {
		const first = paint(null, true).spans[0];
		for (const at of [first.from, first.from + 3, first.to]) {
			const { keys, hidden, spans } = paint(at, true);
			expect(keys.filter((k) => k.startsWith('chip:')), `caret ${at}`).toHaveLength(1);
			expect(keys.filter((k) => k.startsWith('pill:')), `caret ${at}`).toHaveLength(spans.length - 1);
			expect(hidden).toBe(spans.length - 1);
		}
	});

	it('without the sheet, every pill keeps its text and gets the tag button', () => {
		const { keys, hidden, spans } = paint(null, false);
		expect(keys.filter((k) => k.startsWith('chip:'))).toHaveLength(spans.length);
		expect(hidden).toBe(0);
	});

	it('a selection that swallows a pill whole draws it selected, text still hidden', () => {
		const plugin = inlineNotationPlugin({ getKernels: () => kernels, getDeckLiteral: () => false, isRendered: () => true, onOpenChange: () => {} });
		const view = mount(DECK, [plugin]);
		const [first] = findPillSpans(view.state.doc, kernels, false);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, first.from - 2, first.to + 2)));
		const set = plugin.props.decorations?.call(plugin, view.state) as DecorationSet | undefined;
		const keys = ((set?.find() ?? []) as Decoration[]).map((d) => (d as unknown as { spec: { key?: string } }).spec?.key ?? '');
		expect(keys.some((k) => k.startsWith('pill:') && k.includes(':S'))).toBe(true);
	});

	it('a deck set to inline-code: literal paints nothing, drawn or not', () => {
		const plugin = inlineNotationPlugin({ getKernels: () => kernels, getDeckLiteral: () => true, isRendered: () => true, onOpenChange: () => {} });
		const view = mount(DECK, [plugin]);
		expect((plugin.props.decorations?.call(plugin, view.state) as DecorationSet | undefined)?.find()).toEqual([]);
	});
});
