import { EditorState, Selection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { deckSchema, deckToDoc, emitDeck, initBaseline } from '/home/user/lattice/docs/src/lib/compose/deck-doc';
import { baselineSource, emitPatch, scopedResyncPatch } from '/home/user/lattice/docs/src/lib/compose/scoped-resync';

declare global { interface Window { spike: any } }
window.spike = {
	mount(src: string) {
		const doc = deckToDoc(src);
		const base = initBaseline(doc);
		emitDeck(doc, base);
		const host = document.createElement('div');
		document.body.append(host);
		const view = new EditorView(host, { state: EditorState.create({ doc, schema: deckSchema }) });
		// caret at the end of the last slide's first textblock
		let pos = 0;
		for (let i = 0; i < doc.childCount - 1; i++) pos += doc.child(i).nodeSize;
		const sel = Selection.findFrom(doc.resolve(pos + 1), 1, true)!;
		const $end = sel.$head;
		view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve($end.end()))));
		view.focus();
		this.view = view;
		this.base = base;
	},
	applyEditToFirstSlide() {
		const { view, base } = this;
		const fm = (view.state.doc.attrs.frontMatter as string) || '';
		const cur = emitDeck(view.state.doc, base);
		const raws = base.raws.slice();
		raws[0] = `${raws[0]}\n\nAn undo put this back.`;
		const next = baselineSource(fm, raws);
		const t = performance.now();
		const r = scopedResyncPatch(view.state, base, emitPatch(cur, next)!)!;
		const t1 = performance.now();
		view.dispatch(r.tr);
		const t2 = performance.now();
		r.commit(view.state.doc);
		const ms = performance.now() - t;
		return { ms, resync: t1 - t, dispatch: t2 - t1, ok: emitDeck(view.state.doc, base) === next, curLen: cur.length };
	},
	state() {
		const { view } = this;
		const $h = view.state.selection.$head;
		return { focused: view.hasFocus(), active: document.activeElement === view.dom, slide: $h.index(0), last: view.state.doc.childCount - 1, text: $h.parent.textContent, firstSlideHasUndo: view.state.doc.child(0).textContent.includes('An undo put this back.') };
	},
};
