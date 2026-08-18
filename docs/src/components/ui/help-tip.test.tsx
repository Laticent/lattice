import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HelpTip } from './help-tip';

// The point of this primitive is that it opens on a TAP, which the tooltip it replaces
// cannot do — so that is what the suite pins, alongside the focus split (a hover-opened
// popover must not steal the caret; a tap/keyboard-opened one must take focus).

const setup = () =>
	render(
		<HelpTip label="More about Headline alignment">
			Auto keeps each component's own default.
		</HelpTip>,
	);

const trigger = () => screen.getByRole('button', { name: 'More about Headline alignment' });

// jsdom has no PointerEvent, and testing-library's `fireEvent.pointerOver(el, {pointerType})`
// drops the field — so the component's "is this a real mouse?" guard would see `undefined`
// and every hover test would pass for the wrong reason. Build the event and pin the property.
function pointer(kind: 'pointerover' | 'pointerout', pointerType: string) {
	const ev = new MouseEvent(kind, { bubbles: true });
	Object.defineProperty(ev, 'pointerType', { value: pointerType });
	return ev;
}

describe('HelpTip', () => {
	it('is closed until asked, and names itself for a screen reader', () => {
		setup();
		expect(trigger()).toBeTruthy();
		expect(screen.queryByText(/Auto keeps each component/)).toBeNull();
	});

	it('opens on a click — the one gesture touch, mouse and keyboard all share', () => {
		setup();
		fireEvent.click(trigger());
		expect(screen.getByText(/Auto keeps each component/)).toBeTruthy();
	});

	it('opens on a MOUSE hover after the intent delay', () => {
		vi.useFakeTimers();
		try {
			setup();
			fireEvent(trigger(), pointer('pointerover', 'mouse'));
			expect(screen.queryByText(/Auto keeps each component/)).toBeNull(); // not yet — intent delay
			React.act(() => { vi.advanceTimersByTime(400); });
			expect(screen.getByText(/Auto keeps each component/)).toBeTruthy();
		} finally {
			vi.useRealTimers();
		}
	});

	it('ignores a TOUCH pointerenter — the tap that follows is what opens it', () => {
		vi.useFakeTimers();
		try {
			setup();
			fireEvent(trigger(), pointer('pointerover', 'touch'));
			React.act(() => { vi.advanceTimersByTime(400); });
			// No pointerleave ever arrives on touch, so a hover-open here would be a popover
			// with no way to retract itself.
			expect(screen.queryByText(/Auto keeps each component/)).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('retracts what hover opened when the pointer leaves', () => {
		vi.useFakeTimers();
		try {
			setup();
			fireEvent(trigger(), pointer('pointerover', 'mouse'));
			React.act(() => { vi.advanceTimersByTime(400); });
			expect(screen.getByText(/Auto keeps each component/)).toBeTruthy();
			React.act(() => { fireEvent(trigger(), pointer('pointerout', 'mouse')); });
			expect(screen.queryByText(/Auto keeps each component/)).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('does NOT retract what a click opened when the pointer leaves', () => {
		setup();
		fireEvent.click(trigger());
		fireEvent(trigger(), pointer('pointerout', 'mouse'));
		expect(screen.getByText(/Auto keeps each component/)).toBeTruthy();
	});
});
