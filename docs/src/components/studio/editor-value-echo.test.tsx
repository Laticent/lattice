import { act, render } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { deckOutliner } from '@/lib/deck-outline';
import { createFocusHub } from '@/lib/fuoco';
import { Editor } from './Editor';

// THE VALUE-SYNC MUST NOT ECHO ITS OWN TEXT BACK OUT.
//
// The phone demo types through the CONTROLLED path: one `setSource(whole text)` per keystroke.
// The editor's value-sync is a passive effect, and React runs a pending passive effect when it
// starts rendering the NEXT update. So when a keystroke's write lands before the previous one's
// sync has run, the sync runs late with the OLD value. It then reported that text through
// `onChange`, and the shell queued it AFTER the newer write, so the newer write was lost. Mid-run
// the next keystroke re-sends everything, which hides the loss. The LAST keystroke stays lost:
// on real WebKit the demo deck persisted as `- Sentiment \`5` with no closing backtick
// (docs/e2e/demo-mobile.spec.ts, followup 2927).
//
// The case below forces that ordering on purpose. The parent issues the second write from a
// layout effect, and React flushes pending passive effects before it renders a sync update.
const DECK = '# One\n\nalpha\n\n---\n\n# Two\n\nbeta';
// STABLE, as the shell's `NO_KNOWN` is. The prop defaults to a fresh `[]` per render, and the
// editor REBUILDS its view when `known` changes, so without this every rerender would seed a new
// view and no value-sync transaction would ever run: both cases would pass on broken code.
const KNOWN: string[] = [];

// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle, as editor-cursor-channel.test.tsx does.
const viewOf = (el: Element | null) => (el as any)?.cmTile?.root?.view;

describe('the editor value-sync', () => {
	it('does not report the value it was handed as a change', () => {
		const changes: string[] = [];
		const { rerender } = render(<Editor value={DECK} onChange={(v) => changes.push(v)} knownComponents={KNOWN} />);
		rerender(<Editor value={`${DECK}!`} onChange={(v) => changes.push(v)} knownComponents={KNOWN} />);
		expect(changes, 'the sync echoed the shell its own text back').toEqual([]);
	});

	it('still reports a sync that CHANGED the text: a leading BOM goes back out stripped', () => {
		const changes: string[] = [];
		const { rerender } = render(<Editor value={DECK} onChange={(v) => changes.push(v)} knownComponents={KNOWN} />);
		rerender(<Editor value={`﻿${DECK}!`} onChange={(v) => changes.push(v)} knownComponents={KNOWN} />);
		expect(changes, 'the canonical text never reached the shell, so `source` keeps the BOM').toEqual([`${DECK}!`]);
	});

	it('a late sync does not overwrite a newer controlled write (the dropped last keystroke)', () => {
		const A = `${DECK}\n- Sentiment \`5`;
		const B = `${A}\``;
		let set: (v: string) => void = () => {};
		let seen = '';
		function Shell() {
			const [value, setValue] = React.useState(DECK);
			set = setValue;
			seen = value;
			// The next keystroke, written the moment A commits, while A's sync is still pending.
			React.useLayoutEffect(() => {
				if (value === A) setValue(B);
			}, [value]);
			return <Editor value={value} onChange={(v) => setValue(v)} knownComponents={KNOWN} />;
		}
		const { container } = render(<Shell />);
		act(() => set(A));
		expect(seen, 'the shell state lost the newer write to a stale sync echo').toBe(B);
		expect(viewOf(container.querySelector('.cm-content'))?.state.doc.toString(), 'the editor does not hold the last keystroke').toBe(B);
	});

	// THE STUDIO COMMITS TYPING AS A TRANSITION (StudioShell.tsx setSourceFromEditor), so `value` can trail the
	// document: the author typed A then B, and a render carrying A commits after the editor already shows B.
	// Syncing A back would delete what the author just typed. The shell marks such a value with `isStaleEcho`.
	it('a trailing value the shell marks as a stale echo does not roll the document back', () => {
		const A = `${DECK}x`;
		const B = `${DECK}xy`;
		const { container, rerender } = render(<Editor value={DECK} onChange={() => {}} knownComponents={KNOWN} isStaleEcho={(v) => v === A} />);
		const view = viewOf(container.querySelector('.cm-content'));
		act(() => view.dispatch({ changes: { from: DECK.length, insert: 'xy' }, userEvent: 'input.type' }));
		expect(view.state.doc.toString()).toBe(B);
		rerender(<Editor value={A} onChange={() => {}} knownComponents={KNOWN} isStaleEcho={(v) => v === A} />);
		expect(view.state.doc.toString(), 'the trailing value undid the last keystroke').toBe(B);
	});

	it('the same value WITHOUT the mark is a real write and is synced', () => {
		const A = `${DECK}x`;
		const { container, rerender } = render(<Editor value={DECK} onChange={() => {}} knownComponents={KNOWN} isStaleEcho={() => false} />);
		const view = viewOf(container.querySelector('.cm-content'));
		act(() => view.dispatch({ changes: { from: DECK.length, insert: 'xy' }, userEvent: 'input.type' }));
		rerender(<Editor value={A} onChange={() => {}} knownComponents={KNOWN} isStaleEcho={() => false} />);
		expect(view.state.doc.toString(), 'a real write (an undo, say) must land').toBe(A);
	});

	// A LOCALIZED write (a slide-settings or note write the shell makes elsewhere in the deck) must not
	// collapse the author's selection. It used to map only the selection's head, so a select-all held
	// over the write became a caret, and the next Delete removed one character: the e2e helper then
	// typed a whole deck into the middle of the old one (webkit-phone, 4 workers).
	it('a localized write keeps a held range, both ends mapped', () => {
		const NOTE = 'alpha'; // inside the range; text added exactly at a range's edge stays outside it, as in any editor
		const { container, rerender } = render(<Editor value={DECK} onChange={() => {}} knownComponents={KNOWN} />);
		const view = viewOf(container.querySelector('.cm-content'));
		act(() => view.dispatch({ selection: { anchor: 0, head: DECK.length } }));
		const next = DECK.replace(NOTE, `${NOTE} gamma`);
		rerender(<Editor value={next} onChange={() => {}} knownComponents={KNOWN} />);
		expect(view.state.doc.toString()).toBe(next);
		const sel = view.state.selection.main;
		expect([sel.from, sel.to], 'the write collapsed the select-all').toEqual([0, next.length]);
	});

	it('a localized write still carries a caret at its start past the inserted text', () => {
		const at = DECK.indexOf('beta');
		const { container, rerender } = render(<Editor value={DECK} onChange={() => {}} knownComponents={KNOWN} />);
		const view = viewOf(container.querySelector('.cm-content'));
		act(() => view.dispatch({ selection: { anchor: at } }));
		const next = `${DECK.slice(0, at)}zz${DECK.slice(at)}`;
		rerender(<Editor value={next} onChange={() => {}} knownComponents={KNOWN} />);
		expect(view.state.selection.main.head).toBe(at + 2);
		expect(view.state.selection.main.empty).toBe(true);
	});

	it('a range strictly inside the replaced span becomes a caret, and the next edit does not throw', () => {
		const at = DECK.indexOf('alpha');
		const { container, rerender } = render(<Editor value={DECK} onChange={() => {}} knownComponents={KNOWN} />);
		const view = viewOf(container.querySelector('.cm-content'));
		act(() => view.dispatch({ selection: { anchor: at + 1, head: at + 4 } })); // 'lph'
		const next = DECK.replace('alpha', 'zzz');
		rerender(<Editor value={next} onChange={() => {}} knownComponents={KNOWN} />);
		const sel = view.state.selection.main;
		expect(sel.from <= sel.to, 'the mapped range is inverted').toBe(true);
		expect(() => act(() => view.dispatch(view.state.replaceSelection('X')))).not.toThrow();
		expect(view.state.doc.toString()).toBe(next.replace('zzz', 'zzzX'));
	});
	// A VIEW BUILT WHILE `value` TRAILS. A layout switch (wide to phone) remounts the editor, and under load it can
	// do that while the shell's transition still carries an older text: the Delete of a select-all, or the deck before
	// the typing began. The view used to seed itself from that `value` and restate it to the hub, which moved the hub,
	// the caret's slide and the preview BACK (logo-wall-revisit.spec.ts on WebKit, 3 runs in 16 under load).
	it('a view built while `value` trails starts from the newest text, and keeps the hub on it', () => {
		const hub = createFocusHub({ outliner: deckOutliner, scheduler: { frame: (cb) => cb(), idle: (cb) => cb() } });
		hub.update(DECK, { by: 'markdown' });
		const latest = () => DECK;
		const { container, rerender } = render(<Editor value="" latestValue={latest} onChange={() => {}} focusHub={hub} knownComponents={KNOWN} docKey="a" />);
		const view = viewOf(container.querySelector('.cm-content'));
		expect(view.state.doc.toString(), 'the view was seeded from the trailing value').toBe(DECK);
		expect(hub.outline()?.source, 'the build restated a trailing text to the hub').toBe(DECK);
		// The trailing renders that are still in flight commit next; neither may roll the view back.
		rerender(<Editor value="" latestValue={latest} onChange={() => {}} focusHub={hub} knownComponents={KNOWN} docKey="a" />);
		rerender(<Editor value="# Welcome" latestValue={latest} onChange={() => {}} focusHub={hub} knownComponents={KNOWN} docKey="a" />);
		expect(view.state.doc.toString(), 'a trailing render rolled the view back').toBe(DECK);
		// …and the render that carries the newest text is a no-op, while a real write after it still lands.
		rerender(<Editor value={DECK} latestValue={latest} onChange={() => {}} focusHub={hub} knownComponents={KNOWN} docKey="a" />);
		const W = `${DECK}\n\n---\n\n# Three`;
		rerender(<Editor value={W} latestValue={() => W} onChange={() => {}} focusHub={hub} knownComponents={KNOWN} docKey="a" />);
		expect(view.state.doc.toString(), 'a real write was refused').toBe(W);
	});
});
