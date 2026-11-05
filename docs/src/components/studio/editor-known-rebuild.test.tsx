import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadStudioPanels } from '@/test/panels';
import { Editor } from './Editor';

// THE EDITOR SURVIVES THE COMPONENT LIST ARRIVING (followups.d/3034-p8). The Studio hands the
// editor its known component names a moment after it paints. Rebuilding the CodeMirror view then
// replaced the editor's DOM under a word the author had just typed, and WebKit's own undo (Safari's
// Edit → Undo, the iPad keyboard bar, shake) lost its step: ios-safari-undo saw the editor element
// change between the typed word and the undo command, and no `historyUndo` arrived. The linter is
// reconfigured in place instead, so the element, the view and the text all stay.

const DECK = '# One\n\n---\n\n<!-- _class: kpi -->\n\n# Two\n';
const viewOf = (el: Element | null) => (el as unknown as { cmTile: { root: { view: { state: { doc: { toString(): string } } } } } }).cmTile.root.view;

describe('Editor and its known component names', () => {
	beforeAll(loadStudioPanels);

	it('keeps the same editor element and view when the known names arrive', () => {
		const { container, rerender } = render(<Editor value={DECK} onChange={() => {}} knownComponents={[]} />);
		const el = container.querySelector('.cm-content');
		const view = viewOf(el);
		rerender(<Editor value={DECK} onChange={() => {}} knownComponents={['kpi', 'title']} />);
		const after = container.querySelector('.cm-content');
		expect(after, 'the editor DOM must not be replaced').toBe(el);
		expect(viewOf(after)).toBe(view);
		expect(view.state.doc.toString()).toBe(DECK);
	});
});
