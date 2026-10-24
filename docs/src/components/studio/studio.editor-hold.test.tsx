import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadStudioPanels } from '@/test/panels';

beforeAll(loadStudioPanels);

// On a phone the Studio opens on the preview with the editor pane hidden, so the editor's build (CodeMirror's module
// and view, a few hundred ms of main thread) waits for the first slide instead of standing in front of it
// (engineering/decisions/2026-10-23-studio-boot-order.md). Where the editor is on screen it must NOT wait.
// This file owns its module state: `first-slide` keeps one promise per page, so each case loads a fresh copy.

// The preview never reports its first render here: the test releases the gate itself, so "held" is observable.
vi.mock('@/components/DeckPreview', () => ({
	default: ({ 'aria-label': label }: { 'aria-label'?: string }) => <div data-testid="deck-preview">{label}</div>,
}));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };
const realMatchMedia = window.matchMedia;
// A matchMedia that can CHANGE: the responsive hook subscribes, and a resize across the 700 px breakpoint is the case
// the editor latch exists for.
let current: 'desktop' | 'mobile' = 'desktop';
const listeners = new Set<() => void>();
function install() {
	window.matchMedia = ((q: string) => {
		const mq = {
			media: q,
			onchange: null,
			addEventListener: (_t: string, cb: () => void) => listeners.add(cb),
			removeEventListener: (_t: string, cb: () => void) => listeners.delete(cb),
			addListener: (cb: () => void) => listeners.add(cb),
			removeListener: (cb: () => void) => listeners.delete(cb),
			dispatchEvent: () => false,
		};
		Object.defineProperty(mq, 'matches', { get: () => (current === 'mobile' ? /699|1099/.test(q) : false) });
		return mq;
	}) as unknown as typeof window.matchMedia;
}
function setViewport(bp: 'desktop' | 'mobile') {
	current = bp;
	install();
	act(() => {
		for (const cb of [...listeners]) (cb as (e: unknown) => void)({ type: 'change', matches: false });
	});
}

async function fresh() {
	vi.resetModules();
	const [{ default: StudioShell }, slide] = await Promise.all([import('./StudioShell'), import('./first-slide')]);
	return { StudioShell, slide };
}
const editorBuilt = () => document.querySelector('.cm-editor') !== null;

beforeEach(() => {
	localStorage.clear();
	localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'write' }));
});
afterEach(() => {
	window.matchMedia = realMatchMedia;
	listeners.clear();
});

describe('the editor waits for the first slide only where it is hidden', () => {
	it('desktop: the editor is built at once, before any slide', async () => {
		setViewport('desktop');
		const { StudioShell } = await fresh();
		render(<StudioShell options={options} />);
		// Well inside the 6 s backstop: a gate that held the desktop editor would still open at 6 s.
		await waitFor(() => expect(editorBuilt()).toBe(true), { timeout: 3_000 });
	});

	it('phone: held until the first slide, then built, and it stays built', async () => {
		setViewport('mobile');
		const { StudioShell, slide } = await fresh();
		render(<StudioShell options={options} />);
		await screen.findByTestId('deck-preview');
		await new Promise((r) => setTimeout(r, 300));
		expect(editorBuilt(), 'built before the first slide').toBe(false);
		await act(async () => slide.markFirstSlideShown());
		await waitFor(() => expect(editorBuilt()).toBe(true), { timeout: 10_000 });
	});

	it('phone: opening the editor pane builds it without waiting for the slide', async () => {
		setViewport('mobile');
		const { StudioShell } = await fresh();
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		await screen.findByTestId('deck-preview');
		expect(editorBuilt()).toBe(false);
		await user.click(screen.getByRole('button', { name: 'Markdown source' }));
		await waitFor(() => expect(editorBuilt()).toBe(true), { timeout: 10_000 });
	});

	it('a window narrowed across the breakpoint before the first slide brings a built editor straight back, not at the backstop', async () => {
		setViewport('desktop');
		const { StudioShell } = await fresh();
		render(<StudioShell options={options} />);
		await waitFor(() => expect(editorBuilt()).toBe(true), { timeout: 3_000 });
		setViewport('mobile');
		// The layout change may remount the pane; what must not happen is the editor waiting for the 6 s backstop.
		await waitFor(() => expect(editorBuilt(), 'the editor stayed gone after the resize').toBe(true), { timeout: 2_500 });
	});
});
