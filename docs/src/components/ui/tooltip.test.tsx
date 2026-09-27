import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tip } from './tooltip';

// `Tip` opens on focus only for a KEYBOARD focus (`:focus-visible`). jsdom reports every focus
// as focus-visible, so the non-keyboard case is stubbed: that is the focus a closing panel hands
// back to its launcher after a tap, which popped the launcher's hint over a phone's toolbar.
function stubFocusVisible(visible: boolean) {
	const real = Element.prototype.matches;
	vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, sel: string) {
		return sel === ':focus-visible' ? visible : real.call(this, sel);
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

	it('stays shut on a focus that is not a keyboard focus, and still opens on the next one', async () => {
		stubFocusVisible(false);
		render(<Tip label="Settings — deck & slide"><button type="button">Settings</button></Tip>);
		const button = screen.getByRole('button', { name: 'Settings' });
		await act(async () => button.focus());
		await act(async () => new Promise((r) => setTimeout(r, 20)));
		expect(screen.queryByRole('tooltip')).toBeNull();
		// The drop is one-shot: a later keyboard focus is not swallowed.
		await act(async () => button.blur());
		vi.restoreAllMocks();
		stubFocusVisible(true);
		await act(async () => button.focus());
		expect(await screen.findByRole('tooltip')).toBeInTheDocument();
	});
});
