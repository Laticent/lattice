import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { deckOutliner } from '@/lib/deck-outline';
import { createFocusHub, type FocusHub } from '@/lib/fuoco';
import { loadStudioPanels } from '@/test/panels';
import { Editor } from './Editor';

// The Studio's panels load on first open; load them up front so no test races a shell.
beforeAll(loadStudioPanels);

// THE DECK EDITOR RUNS A REAL CODEMIRROR IN THIS TIER — measured, not assumed:
// `textarea: false, .cm-content: true`. `Editor.tsx` does carry a `<textarea>` fallback for
// surfaces where the view cannot construct, and this file asserts we are NOT on it, because
// the whole point of these cases is the real `EditorView`. (`docs/vitest.setup.ts` is what
// makes it work: it stubs the rect APIs CodeMirror measures with, which bare jsdom throws on.)
//
// WHY THIS FILE EXISTS AT ALL. The markdown-pane sweep (#2064) shipped a defect whose whole
// shape is "an event that should fire does not", and it went out under the belief that this
// tier could only ever exercise a textarea. It can't be caught end to end cheaply — it needs a
// caret click in a specific slide after a specific restored `activeSlide` — and it is two lines
// here. See `engineering/decisions/2026-09-05-markdown-pane-fuzz-findings.md` §7.
const DECK = '# One\n\nalpha\n\n---\n\n# Two\n\nbeta\n\n---\n\n# Three\n\ngamma\n';

// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle.
const viewOf = (el: Element | null) => (el as any)?.cmTile?.root?.view;

// The editor's only sync channel is the focus hub (docs/src/lib/fuoco). Frame-lane deliveries
// run on a hand-driven scheduler so each case says exactly when the editor hears a move.
function testHub(): { hub: FocusHub; drain: () => void } {
	const q: Array<() => void> = [];
	const hub = createFocusHub({ outliner: deckOutliner, scheduler: { frame: (cb) => void q.push(cb), idle: (cb) => void q.push(cb) } });
	return { hub, drain: () => { for (let n = 0; q.length && n < 20; n++) for (const cb of q.splice(0)) cb(); } };
}

describe('the editor reports the author’s caret to the hub', () => {
	it('mounts a real CodeMirror, not the textarea fallback', () => {
		const { container } = render(<Editor value={DECK} onChange={() => {}} />);
		expect(container.querySelector('textarea'), 'the fallback would make every case below vacuous').toBeNull();
		expect(container.querySelector('.cm-content')).not.toBeNull();
	});

	// The shell boots the focus at the slide you left on while the editor's caret starts at offset
	// 0, so a click into slide 1 is exactly the move that has to reach the hub to reconcile them.
	// Before Fuoco this was a `lastSlideRef` seeded at mount, and a seeding mistake swallowed this
	// move (markdown-pane fuzz findings §7). There is no ref now: every caret move is reported.
	it('a caret move into slide 1 reaches the hub even when the focus booted on slide 3', () => {
		const { hub, drain } = testHub();
		hub.update(DECK);
		hub.go('boot', { unitIndex: 2 });
		const { container } = render(<Editor value={DECK} onChange={() => {}} focusHub={hub} />);
		drain();
		const view = viewOf(container.querySelector('.cm-content'));
		expect(view, 'no view means this case proves nothing').toBeTruthy();
		view.dispatch({ selection: { anchor: DECK.indexOf('alpha') } });
		expect(hub.get().unitIndex).toBe(0);
		expect(hub.get().origin).toBe('markdown');
	});

	it('the same under StrictMode, which mounts twice', () => {
		const { hub, drain } = testHub();
		hub.update(DECK);
		hub.go('boot', { unitIndex: 2 });
		const { container } = render(
			<StrictMode>
				<Editor value={DECK} onChange={() => {}} focusHub={hub} />
			</StrictMode>,
		);
		drain();
		const view = viewOf(container.querySelector('.cm-content'));
		view.dispatch({ selection: { anchor: DECK.indexOf('alpha') } });
		expect(hub.get().unitIndex).toBe(0);
	});

	it('a new view follows the focus rather than announcing its own caret', () => {
		const { hub, drain } = testHub();
		hub.update(DECK);
		hub.go('boot', { unitIndex: 2 });
		const { container } = render(<Editor value={DECK} onChange={() => {}} focusHub={hub} />);
		drain();
		const view = viewOf(container.querySelector('.cm-content'));
		expect(view.state.selection.main.head).toBe(DECK.indexOf('# Three'));
		expect(hub.get().unitIndex).toBe(2);
	});
});

describe('the editor reports against the text it holds', () => {
	// The checker's catch: a deck switch rebuilds the view without a dispatch, so the view kept
	// the previous deck's revision and the hub dropped every caret report as stale.
	it('a caret move after a deck switch still reaches the hub', () => {
		const { hub, drain } = testHub();
		const other = '# Alpha\n\n---\n\n# Beta\n\nbody\n\n---\n\n# Gamma\n';
		const known: string[] = [];
		hub.update(DECK);
		const { container, rerender } = render(<Editor value={DECK} onChange={() => {}} focusHub={hub} carryKey="a" knownComponents={known} />);
		drain();
		// One keystroke in the first deck: that is what stamps the editor with a revision.
		const first = viewOf(container.querySelector('.cm-content'));
		first.dispatch({ changes: { from: DECK.length, insert: 'x' }, userEvent: 'input' });
		expect(hub.outline()?.source).toBe(`${DECK}x`);
		// The shell feeds the hub the new deck during its render, then the editor rebuilds.
		hub.update(other, { by: 'shell' });
		hub.go('shell', { unitIndex: 0 });
		rerender(<Editor value={other} onChange={() => {}} focusHub={hub} carryKey="b" knownComponents={known} />);
		drain();
		const view = viewOf(container.querySelector('.cm-content'));
		expect(view.state.doc.toString()).toBe(other);
		view.dispatch({ selection: { anchor: other.indexOf('body') }, userEvent: 'select' });
		expect(hub.stats.droppedStale).toBe(0);
		expect(hub.get().unitIndex).toBe(1);
	});
});

describe('the editor reveals what other panes ask for', () => {
	it('a navigation moves the caret to the slide’s first editable line, and echoes nothing', () => {
		const { hub, drain } = testHub();
		hub.update(DECK);
		const { container } = render(<Editor value={DECK} onChange={() => {}} focusHub={hub} />);
		const view = viewOf(container.querySelector('.cm-content'));
		hub.go('rail', { unitIndex: 1 });
		const published = hub.stats.published;
		drain();
		expect(view.state.selection.main.head).toBe(DECK.indexOf('# Two'));
		// The caret move the reveal made agrees with the focus that asked for it: no publication.
		expect(hub.stats.published).toBe(published);
		expect(hub.get().origin).toBe('rail');
	});

	it('typing never re-scrolls: the editor does not hear its own moves', () => {
		const { hub, drain } = testHub();
		hub.update(DECK);
		const { container } = render(<Editor value={DECK} onChange={() => {}} focusHub={hub} />);
		const view = viewOf(container.querySelector('.cm-content'));
		const at = DECK.indexOf('gamma');
		view.dispatch({ selection: { anchor: at } });
		view.dispatch({ changes: { from: at, insert: 'x' }, selection: { anchor: at + 1 }, userEvent: 'input' });
		drain();
		expect(view.state.selection.main.head).toBe(at + 1);
		expect(hub.get().unitIndex).toBe(2);
	});

	it('a navigation to text the editor does not hold yet waits for the value-sync', () => {
		const { hub, drain } = testHub();
		hub.update(DECK);
		const next = `${DECK}\n---\n\n# Four\n\ndelta\n`;
		const known: string[] = [];
		const { container, rerender } = render(<Editor value={DECK} onChange={() => {}} focusHub={hub} knownComponents={known} />);
		const view = viewOf(container.querySelector('.cm-content'));
		// The shell's order: feed the hub the new text, then go; the editor gets the text later.
		hub.go('shell', { unitIndex: 3 }, { after: next });
		hub.update(next);
		drain();
		expect(view.state.doc.toString()).toBe(DECK);
		rerender(<Editor value={next} onChange={() => {}} focusHub={hub} knownComponents={known} />);
		drain();
		// Re-read the view: a rerender with a fresh `knownComponents` default may rebuild it.
		const now = viewOf(container.querySelector('.cm-content'));
		expect(now.state.doc.toString()).toBe(next);
		expect(now.state.selection.main.head).toBe(next.indexOf('# Four'));
	});

	it('the value-sync’s own caret is not reported as the author’s', () => {
		const { hub, drain } = testHub();
		hub.update(DECK);
		hub.go('rail', { unitIndex: 2 });
		const { rerender } = render(<Editor value={DECK} onChange={() => {}} focusHub={hub} />);
		drain();
		// A wholesale replace parks the editor's caret at 0; the focus must not follow it there.
		const other = '# Alpha\n\n---\n\n# Beta\n\n---\n\n# Gamma\n';
		hub.go('shell', { unitIndex: 2 }, { after: other });
		rerender(<Editor value={other} onChange={() => {}} focusHub={hub} />);
		drain();
		expect(hub.get().unitIndex).toBe(2);
	});
});
