import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeckPreview from './DeckPreview';

// A shared renderInto spy so we can assert what the component asked the renderer
// to draw across re-renders. The engine itself is never involved.
const { renderInto } = vi.hoisted(() => ({
	renderInto: vi.fn(
		(
			_host: HTMLElement,
			_markdown: string,
			_mermaid: boolean,
			_paletteOverride?: string,
			_extra?: { name: string; css: string },
			_modeOverride?: 'light' | 'dark',
			_extraCss?: string,
		) => Promise.resolve({ ok: true, slides: 1, error: null }),
	),
}));
vi.mock('@/lib/single-slide-render', () => ({
	createSingleSlideRenderer: () => ({
		renderInto,
		whenReady: () => Promise.resolve(),
		onThemeChange() {},
		scaleFrame() {},
		ready: () => true,
		prefetchTheme() {},
	}),
}));

const opts = { themeBase: '', runtimeUrl: '', engineUrl: '' };

beforeEach(() => renderInto.mockClear());

describe('DeckPreview — theme threading', () => {
	it('re-renders when the extra-theme CSS changes under a STABLE name (re-saved edit)', async () => {
		const { rerender } = render(<DeckPreview options={opts} sample="# A" mermaid={false} paletteOverride="ocean" extraTheme={{ name: 'ocean', css: '/* @theme ocean */ v1' }} aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		const before = renderInto.mock.calls.length;

		// Same NAME, NEW css — a saved theme edited then re-saved. Keying re-renders
		// on the name alone (a stable slug) would silently keep the old css; we key on
		// the css too, so this must trigger a fresh render carrying v2.
		rerender(<DeckPreview options={opts} sample="# A" mermaid={false} paletteOverride="ocean" extraTheme={{ name: 'ocean', css: '/* @theme ocean */ v2' }} aria-label="p" />);
		await waitFor(() => expect(renderInto.mock.calls.length).toBeGreaterThan(before));
		expect(renderInto.mock.calls.at(-1)?.[4]).toEqual({ name: 'ocean', css: '/* @theme ocean */ v2' });
	});

	it('does NOT re-render when identical props recur (no thrash)', async () => {
		const theme = { name: 'ocean', css: '/* @theme ocean */ v1' };
		const { rerender } = render(<DeckPreview options={opts} sample="# A" mermaid={false} paletteOverride="ocean" extraTheme={theme} aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		const before = renderInto.mock.calls.length;
		// A fresh wrapper object with the SAME name + css content must not re-render.
		rerender(<DeckPreview options={opts} sample="# A" mermaid={false} paletteOverride="ocean" extraTheme={{ name: 'ocean', css: '/* @theme ocean */ v1' }} aria-label="p" />);
		await new Promise((r) => setTimeout(r, 50));
		expect(renderInto.mock.calls.length).toBe(before);
	});

	it('forwards the modeOverride to the renderer', async () => {
		render(<DeckPreview options={opts} sample="# A" mermaid={false} modeOverride="dark" aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		expect(renderInto.mock.calls.at(-1)?.[5]).toBe('dark');
	});
});

describe('DeckPreview — debounced render (per-keystroke coalescing)', () => {
	it('paints the first sample immediately, then COALESCES a rapid burst into one trailing render', async () => {
		const { rerender } = render(<DeckPreview options={opts} sample="# A" mermaid={false} debounceMs={120} aria-label="p" />);
		// First paint is always immediate — a fresh host must show something at once.
		await waitFor(() => expect(renderInto).toHaveBeenCalledTimes(1));
		expect(renderInto.mock.calls.at(-1)?.[1]).toBe('# A');

		// A burst of edits with no pause — like typing. Each resets the trailing timer.
		rerender(<DeckPreview options={opts} sample="# AB" mermaid={false} debounceMs={120} aria-label="p" />);
		rerender(<DeckPreview options={opts} sample="# ABC" mermaid={false} debounceMs={120} aria-label="p" />);
		rerender(<DeckPreview options={opts} sample="# ABCD" mermaid={false} debounceMs={120} aria-label="p" />);
		// Still mid-burst (< debounceMs): the engine has NOT re-rendered for each keystroke.
		await new Promise((r) => setTimeout(r, 40));
		expect(renderInto).toHaveBeenCalledTimes(1);

		// After the pause, exactly ONE more render fires — carrying only the latest text.
		await waitFor(() => expect(renderInto).toHaveBeenCalledTimes(2), { timeout: 600 });
		expect(renderInto.mock.calls.at(-1)?.[1]).toBe('# ABCD');
	});

	it('with debounceMs=0 (default) every change renders eagerly — static hosts keep their behavior', async () => {
		const { rerender } = render(<DeckPreview options={opts} sample="# A" mermaid={false} aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalledTimes(1));
		rerender(<DeckPreview options={opts} sample="# B" mermaid={false} aria-label="p" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalledTimes(2));
		expect(renderInto.mock.calls.at(-1)?.[1]).toBe('# B');
	});
});
