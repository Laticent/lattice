import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadStudioPanels } from '@/test/panels';
import { FIRST_SLIDE_BACKSTOP_MS } from './first-slide';

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

// THE BACKSTOP NEVER FIRES IN THIS FILE. `first-slide` also releases its gate on a real 6 s timer from module load, so
// on a loaded machine the clock, not the code, decided these cases: the backstop built the phone editor "before the
// first slide", and the desktop editor raced a window shorter than it (HARD RULE #32, followups.d/3367-p1 G4). With the
// backstop's timer dropped, only `markFirstSlideShown()` opens the gate, so a held editor stays held for good and every
// check below reads the gate, not the time. The filter matches the backstop's delay AND its caller, because other
// Studio timers also use 6 s.
const realSetTimeout = window.setTimeout;
// How many backstop timers this test dropped: the phone case asserts it, so a renamed module or a changed delay fails
// loudly here instead of quietly bringing the race back.
let droppedBackstops = 0;
beforeEach(() => {
	droppedBackstops = 0;
	vi.spyOn(window, 'setTimeout').mockImplementation(((fn: TimerHandler, ms?: number, ...rest: unknown[]) => {
		if (ms === FIRST_SLIDE_BACKSTOP_MS && /first-slide/.test(new Error().stack ?? '')) {
			droppedBackstops++;
			return 0;
		}
		return realSetTimeout(fn, ms, ...rest);
	}) as typeof window.setTimeout);
});
afterEach(() => {
	vi.restoreAllMocks();
});

// Load the editor's lazy chunk inside act(): React's retry of a suspended <Editor> then lands in act's queue and is
// flushed, effects included, before act returns. So right after this, an editor the gate let through is in the DOM and
// a held one is not, whatever the machine's load.
async function settleEditorChunk() {
	await act(async () => {
		await import('./Editor');
	});
}
async function settleComposeChunk() {
	await act(async () => {
		await import('./ComposeView');
	});
}

beforeEach(() => {
	localStorage.clear();
	localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'write', editMode: 'source' }));
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
		await screen.findByTestId('deck-preview');
		await settleEditorChunk();
		// The first slide is never marked and the backstop never fires, so a gate that held the desktop editor holds it here.
		expect(editorBuilt(), 'the desktop editor waited for the first slide').toBe(true);
	});

	it('phone: held until the first slide, then built, and it stays built', async () => {
		setViewport('mobile');
		const { StudioShell, slide } = await fresh();
		expect(droppedBackstops, 'the backstop filter matched nothing: first-slide renamed or its timer changed').toBe(1);
		render(<StudioShell options={options} />);
		await screen.findByTestId('deck-preview');
		// The window a wrongly-built editor would need: its lazy chunk loaded, and every render that follows from it done.
		// (This was a 300 ms sleep, which a loaded machine could spend before the chunk had even arrived.)
		await settleEditorChunk();
		expect(editorBuilt(), 'built before the first slide').toBe(false);
		await act(async () => slide.markFirstSlideShown());
		await settleEditorChunk();
		expect(editorBuilt(), 'still held after the first slide').toBe(true);
	});

	it('phone: opening the editor pane builds it without waiting for the slide', async () => {
		setViewport('mobile');
		const { StudioShell } = await fresh();
		const user = userEvent.setup();
		render(<StudioShell options={options} />);
		await screen.findByTestId('deck-preview');
		expect(editorBuilt()).toBe(false);
		await user.click(screen.getByRole('button', { name: 'Markdown source' }));
		await settleEditorChunk();
		expect(editorBuilt(), 'opening the pane did not build the editor').toBe(true);
	});

	it('a window narrowed across the breakpoint before the first slide brings a built editor straight back, not at the backstop', async () => {
		setViewport('desktop');
		const { StudioShell } = await fresh();
		render(<StudioShell options={options} />);
		await screen.findByTestId('deck-preview');
		await settleEditorChunk();
		expect(editorBuilt()).toBe(true);
		setViewport('mobile');
		// The layout change may remount the pane; what must not happen is the editor waiting for the gate, which no
		// slide and no backstop will open in this file.
		await settleEditorChunk();
		expect(editorBuilt(), 'the editor stayed gone after the resize').toBe(true);
	});
});

// Compose is the default since 2026-11-10 (2026-11-10-compose-first.md), and ProseMirror is the larger editor: the same
// hold applies to it, or a Compose default would put it in front of the first slide on the slowest devices.
describe('Compose, the default, is held the same way', () => {
	const composeBuilt = () => document.querySelector('.cs-host .ProseMirror') !== null;
	beforeEach(() => {
		localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'write' }));
	});

	it('phone: held until the first slide, then built', async () => {
		setViewport('mobile');
		const { StudioShell, slide } = await fresh();
		render(<StudioShell options={options} />);
		await screen.findByTestId('deck-preview');
		// The signal, not a sleep: the hold draws Compose's own placeholder in the editor pane, and ProseMirror is not built.
		await screen.findByText('Loading Compose…');
		expect(composeBuilt(), 'built before the first slide').toBe(false);
		await act(async () => slide.markFirstSlideShown());
		await settleComposeChunk();
		expect(composeBuilt(), 'still held after the first slide').toBe(true);
	});

	it('desktop: built at once, before any slide', async () => {
		setViewport('desktop');
		const { StudioShell } = await fresh();
		render(<StudioShell options={options} />);
		await screen.findByTestId('deck-preview');
		await settleComposeChunk();
		expect(composeBuilt(), 'the desktop Compose waited for the first slide').toBe(true);
	});
});
