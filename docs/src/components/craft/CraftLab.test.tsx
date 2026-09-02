import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CraftLab } from './CraftLab';

// The renderer is never involved: we assert what CraftLab ASKED for. The three
// things worth pinning are the seams a page author gets wrong — which CSS channel
// a kind uses, whether Reset restores both panes, and whether the canvas toggle
// reaches the renderer.
const { renderInto } = vi.hoisted(() => ({
	renderInto: vi.fn(() => Promise.resolve({ ok: true, slides: 1, error: null as string | null })),
}));
vi.mock('@/lib/single-slide-render', () => ({
	createSingleSlideRenderer: () => ({
		renderInto,
		whenReady: () => Promise.resolve(),
		onThemeChange: () => () => {},
		scaleFrame() {},
		ready: () => true,
		prefetchTheme() {},
		dispose() {},
	}),
}));

const opts = { themeBase: '', runtimeUrl: '', engineUrl: '' };
const MD = '<!-- _class: content -->\n\n## A slide.\n';
const CSS = 'section.x { color: red; }';

/** The renderer's positional signature: (host, markdown, mermaid, palette, extraTheme, mode, extraCss). */
const lastCall = () => renderInto.mock.calls.at(-1) as unknown as [HTMLElement, string, boolean, string | undefined, { name: string; css: string } | undefined, 'light' | 'dark' | undefined, string | undefined];

beforeEach(() => renderInto.mockClear());

describe('CraftLab — which CSS channel a kind uses', () => {
	it('kind "theme" hands the CSS over as a raw in-memory palette, and pins the palette to it', async () => {
		render(<CraftLab options={opts} kind="theme" css={CSS} markdown={MD} label="L" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		const [, , , palette, extraTheme, , extraCss] = lastCall();
		expect(extraTheme).toEqual({ name: 'craft-lab', css: CSS });
		// Without the matching override the renderer would resolve the site's palette
		// by name and never reach the registered theme.
		expect(palette).toBe('craft-lab');
		expect(extraCss).toBeUndefined();
	});

	it('kind "css" appends the CSS after the active theme, leaving the palette alone', async () => {
		render(<CraftLab options={opts} kind="css" css={CSS} markdown={MD} label="L" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		const [, , , palette, extraTheme, , extraCss] = lastCall();
		expect(extraCss).toBe(CSS);
		expect(extraTheme).toBeUndefined();
		// Undefined, so the preview keeps tracking the site's palette picker.
		expect(palette).toBeUndefined();
	});

	it('kind "none" sends neither channel', async () => {
		render(<CraftLab options={opts} markdown={MD} label="L" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		const [, , , , extraTheme, , extraCss] = lastCall();
		expect(extraTheme).toBeUndefined();
		expect(extraCss).toBeUndefined();
	});
});

describe('CraftLab — the editing loop', () => {
	it('an edit reaches the preview, and Reset puts the seed back', async () => {
		render(<CraftLab options={opts} kind="css" css={CSS} markdown={MD} label="Lab" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		// CodeField falls back to a <textarea> under jsdom, which is what keeps this
		// assertable at all — see its own header.
		const field = screen.getByLabelText('Lab — CSS');
		fireEvent.change(field, { target: { value: 'section.x { color: blue; }' } });
		await waitFor(() => expect(lastCall()[6]).toBe('section.x { color: blue; }'));

		fireEvent.click(screen.getByRole('button', { name: /reset/i }));
		await waitFor(() => expect(lastCall()[6]).toBe(CSS));
	});

	it('Reset is offered only once something has changed', async () => {
		render(<CraftLab options={opts} kind="css" css={CSS} markdown={MD} label="Lab" />);
		expect(screen.queryByRole('button', { name: /reset/i })).toBeNull();
		fireEvent.change(screen.getByLabelText('Lab — CSS'), { target: { value: 'x{}' } });
		expect(screen.getByRole('button', { name: /reset/i })).toBeTruthy();
	});
});

describe('CraftLab — the canvas toggle', () => {
	it('startMode pins the preview to a canvas instead of following the site', async () => {
		render(<CraftLab options={opts} kind="theme" css={CSS} markdown={MD} label="L" startMode="dark" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		expect(lastCall()[5]).toBe('dark');
	});

	it('with no startMode the preview follows the site until the reader flips it', async () => {
		render(<CraftLab options={opts} kind="theme" css={CSS} markdown={MD} label="L" />);
		await waitFor(() => expect(renderInto).toHaveBeenCalled());
		expect(lastCall()[5]).toBeUndefined();
		fireEvent.click(screen.getByRole('button', { name: /dark/i }));
		await waitFor(() => expect(lastCall()[5]).toBe('dark'));
	});
});
