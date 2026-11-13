import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tip } from './tooltip';

// `Tip` opens on focus only for a KEYBOARD focus (`:focus-visible`). jsdom reports every focus
// as focus-visible, so the non-keyboard case is stubbed: that is the focus a closing panel hands
// back to its launcher after a tap, which popped the launcher's hint over a phone's toolbar.
function stubFocusVisible(visible: boolean, hovered = false, canHover = true) {
	vi.spyOn(window, 'matchMedia').mockImplementation(
		(q: string) => ({ matches: q === '(hover: none)' ? !canHover : false, media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
	);
	const real = Element.prototype.matches;
	vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, sel: string) {
		if (sel === ':focus-visible') return visible;
		if (sel === ':hover') return hovered;
		return real.call(this, sel);
	});
}

afterEach(() => vi.restoreAllMocks());

describe('Tip', () => {
	it('opens on a keyboard focus', async () => {
		stubFocusVisible(true);
		render(<Tip label="Settings — deck & slide"><button type="button">Settings</button></Tip>);
		await act(async () => screen.getByRole('button', { name: 'Settings' }).focus());
		expect(await screen.findByRole('tooltip')).toHaveTextContent('Settings — deck & slide');
	});

	it('lets the pointer through a hint that keyboard focus opened, so it never eats the next tap', async () => {
		// Escape that closes a sheet hands focus back to its launcher as a keyboard focus; on a phone the
		// Chat launcher's hint then covered "Workspace settings" and took the tap meant for it.
		stubFocusVisible(true);
		render(<Tip label="Settings — deck & slide"><button type="button">Settings</button></Tip>);
		await act(async () => screen.getByRole('button', { name: 'Settings' }).focus());
		await screen.findByRole('tooltip');
		// The class on the hint, and the marker the stylesheet's `:has()` rule reads to free Radix's wrapper.
		expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveClass('pointer-events-none', 'lx-tip-passthrough');
	});

	it('keeps the hit area of a hint the pointer is resting on when keyboard focus arrives (WCAG 1.4.13)', async () => {
		// No `pointerenter` fires for a pointer that was already there, so the focus itself asks `:hover`.
		stubFocusVisible(true, true);
		render(<Tip label="Settings — deck & slide"><button type="button">Settings</button></Tip>);
		await act(async () => screen.getByRole('button', { name: 'Settings' }).focus());
		await screen.findByRole('tooltip');
		expect(document.querySelector('[data-slot="tooltip-content"]')).not.toHaveClass('lx-tip-passthrough');
		expect(document.querySelector('[data-slot="tooltip-content"]')).not.toHaveClass('pointer-events-none');
	});

	it('does not read a touch screen\'s sticky :hover as a resting pointer', async () => {
		// A phone keeps `:hover` on the last thing tapped: tap the launcher, press Escape on a keyboard, and the
		// launcher still matches `:hover`. The hint must still let the next tap through.
		stubFocusVisible(true, true, false);
		render(<Tip label="Settings — deck & slide"><button type="button">Settings</button></Tip>);
		await act(async () => screen.getByRole('button', { name: 'Settings' }).focus());
		await screen.findByRole('tooltip');
		expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveClass('lx-tip-passthrough');
	});

	it('frees Radix\'s positioning wrapper too: the stylesheet rule the passthrough class relies on', () => {
		// jsdom applies no stylesheet, so the rule is pinned as text (as settings-view.test.tsx pins its own).
		// Without it the hint is see-through and the wrapper around it still takes the tap (model-spine, mobile).
		const css = readFileSync(join(__dirname, '../../styles/tailwind.css'), 'utf8');
		expect(css).toMatch(/\[data-radix-popper-content-wrapper\]:has\(> \.lx-tip-passthrough\)\s*\{\s*pointer-events:\s*none;?\s*\}/);
	});

	it('gives a focus-opened hint its hit area back once the pointer enters the trigger', async () => {
		stubFocusVisible(true);
		render(<Tip label="Settings — deck & slide"><button type="button">Settings</button></Tip>);
		const button = screen.getByRole('button', { name: 'Settings' });
		await act(async () => button.focus());
		await screen.findByRole('tooltip');
		expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveClass('lx-tip-passthrough');
		await act(async () => fireEvent.pointerEnter(button));
		expect(document.querySelector('[data-slot="tooltip-content"]')).not.toHaveClass('lx-tip-passthrough');
	});

	it('stays shut on a focus that is not a keyboard focus, and still opens on the next one', async () => {
		stubFocusVisible(false);
		render(<Tip label="Settings — deck & slide"><button type="button">Settings</button></Tip>);
		const button = screen.getByRole('button', { name: 'Settings' });
		// Fake timers through the shut window: past the one-shot drop's reset and the 200 ms hover delay, so an open
		// that arrived late on any timer would be on screen at the check.
		vi.useFakeTimers();
		try {
			await act(async () => button.focus());
			act(() => vi.advanceTimersByTime(500));
			expect(screen.queryByRole('tooltip')).toBeNull();
		} finally {
			vi.useRealTimers();
		}
		// The drop is one-shot: a later keyboard focus is not swallowed.
		await act(async () => button.blur());
		vi.restoreAllMocks();
		stubFocusVisible(true);
		await act(async () => button.focus());
		expect(await screen.findByRole('tooltip')).toBeInTheDocument();
	});
});
