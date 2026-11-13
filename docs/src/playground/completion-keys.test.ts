// @vitest-environment jsdom
import { autocompletion, type CompletionContext, type CompletionResult, completionStatus } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { acceptWithTab, closeAndForget, completionKeys, emptyHintAt, startCompletionOrSayNone } from './completion-keys.js';

// The "No suggestions here" note (completion-keys.js), driven through a real EditorView and a source this test
// controls, so the order of ask, answer and Escape is the test's, not the clock's. The keys themselves are driven in
// the real Studio (docs/e2e/editor-completion-keys.spec.ts).
let view: EditorView | null = null;
afterEach(() => {
	view?.destroy();
	view = null;
});

function editor(doc: string, source: (ctx: CompletionContext) => CompletionResult | null | Promise<CompletionResult | null>) {
	view = new EditorView({
		parent: document.body,
		state: EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [autocompletion({ override: [source], defaultKeymap: false }), completionKeys()] }),
	});
	return view;
}

describe('the "No suggestions here" note', () => {
	it('shows when no source answers', async () => {
		const v = editor('prose', () => null);
		startCompletionOrSayNone(v);
		await vi.waitFor(() => expect(emptyHintAt(v.state)).toBe(5));
	});

	it('shows when a source answers but the typed word filters every option out', async () => {
		const v = editor('zzz', () => ({ from: 0, options: [{ label: 'theme' }, { label: 'title' }], validFor: /^\w*$/ }));
		startCompletionOrSayNone(v);
		await vi.waitFor(() => expect(emptyHintAt(v.state)).toBe(3));
	});

	it('does not show when the menu opens', async () => {
		const v = editor('th', () => ({ from: 0, options: [{ label: 'theme' }] }));
		startCompletionOrSayNone(v);
		await vi.waitFor(() => expect(completionStatus(v.state)).toBe('active'));
		// The answer is in and the menu is up; one more task turn is when a note would have been dispatched.
		await new Promise((r) => setTimeout(r, 0));
		expect(emptyHintAt(v.state)).toBeNull();
	});

	it('does not show after Escape withdraws an ask still waiting on its answer', async () => {
		let answer: (r: CompletionResult | null) => void = () => {};
		const v = editor('prose', () => new Promise((r) => { answer = r; }));
		startCompletionOrSayNone(v);
		await vi.waitFor(() => expect(completionStatus(v.state)).toBe('pending'));
		closeAndForget(v);
		answer(null);
		await vi.waitFor(() => expect(completionStatus(v.state)).toBeNull());
		await new Promise((r) => setTimeout(r, 0));
		expect(emptyHintAt(v.state)).toBeNull();
	});

	it('goes on the next edit', async () => {
		const v = editor('prose', () => null);
		startCompletionOrSayNone(v);
		await vi.waitFor(() => expect(emptyHintAt(v.state)).not.toBeNull());
		v.dispatch({ changes: { from: 5, insert: '.' } });
		expect(emptyHintAt(v.state)).toBeNull();
	});
});

describe('Tab', () => {
	it('keeps the key while a menu is shown, even inside CodeMirror\'s first 75 ms, and leaves it to the page otherwise', async () => {
		const v = editor('th', () => ({ from: 0, options: [{ label: 'theme' }] }));
		// No menu: Tab is not completion's, so focus can move.
		expect(acceptWithTab(v)).toBe(false);
		startCompletionOrSayNone(v);
		await vi.waitFor(() => expect(completionStatus(v.state)).toBe('active'));
		// At once, inside the interaction delay: CodeMirror's accept declines, and the shown menu still keeps the Tab.
		expect(acceptWithTab(v)).toBe(true);
	});
});
