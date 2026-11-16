// THE LAYOUT MENU HOLDS ITS QUESTION THROUGH A RENDER WHERE COMPOSE CANNOT READ THE SLIDE (LayoutMenu.tsx, LayoutMenuHost).
//
// The menu's rows come from Compose (`layoutOf`), recomputed whenever the deck's slides change, a save's echo included. For a
// render where Compose cannot read the slide (its view rebuilding, a resync), `layoutOf` is null. The host used to close the
// menu for that render and open it again on the next, and the menu treats every open as a new visit: the open "Replace this
// slide's text?" question vanished under the author's finger (a Gecko e2e run, once in 251).
import { act, fireEvent, render, screen } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ComposeHandle } from './ComposeView';
import { LayoutMenuHost } from './LayoutMenu';
import type { ComponentEntry } from './SlidePicker';

// The previews are frames; this test is about the menu's state, so they draw nothing.
vi.mock('./preview-pool', () => ({
	PreviewPool: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	PooledThumbFace: () => null,
}));

const STATS = '<!-- _class: stats -->\n\n## By the numbers.\n\n1. 80\n   - components\n';
const components = [
	{ name: 'stats', bucket: 'evidence', purpose: 'A row of figures.', variants: [], related: [{ name: 'chart-bar', when: 'bars for one series' }], skeleton: STATS },
	{ name: 'chart-bar', bucket: 'chart', purpose: 'Bars.', variants: [], skeleton: '<!-- _class: chart-bar -->\n\n## Bars\n' },
] as unknown as ComponentEntry[];

function setup() {
	let readable = true;
	const info = { current: 'stats', fit: (n: string) => (n === 'chart-bar' ? 'fresh' : 'keeps'), original: {} };
	const handle = {
		layoutOf: vi.fn(() => (readable ? info : null)),
		starterEditable: () => true,
		applyLayout: vi.fn(() => true),
		restoreLayout: vi.fn(() => true),
	} as unknown as ComposeHandle;
	const compose = { current: handle };
	const anchor = document.createElement('button');
	document.body.append(anchor);
	const req = { slideIndex: 0, anchor };
	const props = { req, onDone: vi.fn(), compose, components, frontMatter: '', axes: {}, phone: false, preview: { options: {} as never } };
	const view = render(<LayoutMenuHost {...props} slides={[STATS]} />);
	return {
		/** The deck's slides arrive again (a save's echo: same text, a new array), with Compose able to read the slide or not. */
		echo(canRead: boolean) {
			readable = canRead;
			act(() => view.rerender(<LayoutMenuHost {...props} slides={[STATS]} />));
		},
	};
}

describe('the layout menu keeps its open question through a render where the slide is unreadable', () => {
	it('a save’s echo while Compose rebuilds its view leaves "Replace text" standing', () => {
		const deck = setup();
		fireEvent.click(screen.getByRole('button', { name: /^chart-bar/ }));
		expect(screen.getByRole('button', { name: 'Replace text' })).toBeTruthy();
		deck.echo(false);
		deck.echo(true);
		expect(screen.getByRole('button', { name: 'Replace text' })).toBeTruthy();
	});
});
