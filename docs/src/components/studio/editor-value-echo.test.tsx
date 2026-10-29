import { act, render } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
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
});
