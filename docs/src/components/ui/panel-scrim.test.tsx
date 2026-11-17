// A tap on a sheet's scrim closes it from the sheet's first frame.
//
// Radix registers the "pointer down outside" listener that dismisses a dialog on a `setTimeout(0)` after the dialog
// mounts (@radix-ui/react-dismissable-layer, `usePointerDownOutside`). A sheet that is already on screen when it
// mounts has no motion to hide that gap: a lazy panel's real sheet replaces its loading shell with the enter
// animation off (`PanelLoader` in components/studio/lazy-panel.tsx). A tap that lands before the timer runs is not
// "outside" to Radix, so it did nothing. Under load the browser runs the tap ahead of the queued timer, and the
// phone's deck tap on a just-loaded Library was lost: e2e/back-gesture.spec.ts:172 went red 3 to 6 times in 100 on
// `main`. On the iOS Simulator it was worse: the finger went down on the loading sheet's scrim and lifted on the real
// sheet's, and Mobile Safari sent no `click` at all. `SheetContent` now reads the tap from the pointer: a scrim's
// pointerdown is recorded outside any one sheet, the pointerup on a scrim completes it, and it goes through the caller's
// own `onPointerDownOutside` / `onInteractOutside`, closing the sheet only if neither prevented it
// (components/ui/sheet.tsx).
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PanelNav, PanelSheet } from '@/components/ui/panel';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

function Host({ onClose, onLeave }: { onClose: (v: boolean) => void; onLeave: () => void }) {
	const [open, setOpen] = React.useState(true);
	return (
		<PanelNav back="Deck" onLeave={onLeave}>
			<PanelSheet
				open={open}
				phone
				onOpenChange={(v) => {
					onClose(v);
					setOpen(v);
				}}
			>
				<SheetTitle>Library</SheetTitle>
			</PanelSheet>
		</PanelNav>
	);
}

const scrim = () => document.querySelector('[data-slot="sheet-overlay"]') as HTMLElement;
// jsdom has no PointerEvent, and testing-library's pointer helpers drop `pointerType`, `pointerId` and the coordinates,
// so Radix would take every tap for a mouse and a moved finger would read as still. Build the event and pin the fields,
// as help-tip.test.tsx does.
type Ptr = 'pointerdown' | 'pointerup' | 'pointercancel';
function ptr(el: HTMLElement, type: Ptr, pointerType: 'mouse' | 'touch', x = 20) {
	const ev = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 20 });
	Object.defineProperty(ev, 'pointerType', { value: pointerType });
	Object.defineProperty(ev, 'pointerId', { value: pointerType === 'touch' ? 7 : 1 });
	fireEvent(el, ev);
}
/** A mouse tap: pointerdown, pointerup, click. */
const tap = (el: HTMLElement) => {
	ptr(el, 'pointerdown', 'mouse');
	ptr(el, 'pointerup', 'mouse');
	fireEvent.click(el, { clientX: 20, clientY: 20 });
};
/** A finger: pointerdown and pointerup, then the click only when the browser sends one (Mobile Safari did not). */
const touch = (el: HTMLElement, { click = true, to = 20 } = {}) => {
	ptr(el, 'pointerdown', 'touch');
	ptr(el, 'pointerup', 'touch', to);
	if (click) fireEvent.click(el, { clientX: to, clientY: 20 });
};

describe('PanelSheet — a tap on the scrim', () => {
	it('closes the sheet and leaves to the deck before Radix has started listening', () => {
		vi.useFakeTimers();
		try {
			const onClose = vi.fn();
			const onLeave = vi.fn();
			render(<Host onClose={onClose} onLeave={onLeave} />);
			expect(screen.getByText('Library')).toBeTruthy();
			// No timer has run: Radix's outside-pointer listener is not on the document yet.
			tap(scrim());
			vi.runOnlyPendingTimers();
			expect(onLeave).toHaveBeenCalledTimes(1);
			expect(onClose).toHaveBeenCalledWith(false);
		} finally {
			vi.useRealTimers();
		}
	});

	it('closes once when Radix is already listening and handles the tap itself', () => {
		vi.useFakeTimers();
		try {
			const onClose = vi.fn();
			const onLeave = vi.fn();
			render(<Host onClose={onClose} onLeave={onLeave} />);
			vi.runOnlyPendingTimers();
			tap(scrim());
			vi.runOnlyPendingTimers();
			expect(onClose.mock.calls).toEqual([[false]]);
			expect(onLeave).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it('closes once on a finger, whether or not a click follows, in the gap and after it', () => {
		vi.useFakeTimers();
		try {
			for (const [gap, click] of [[true, true], [true, false], [false, true], [false, false]] as const) {
				const onClose = vi.fn();
				const onLeave = vi.fn();
				const { unmount } = render(<Host onClose={onClose} onLeave={onLeave} />);
				if (!gap) vi.runOnlyPendingTimers();
				touch(scrim(), { click });
				vi.runOnlyPendingTimers();
				const at = `${gap ? 'in the gap' : 'with Radix listening'}, ${click ? 'with' : 'without'} a click`;
				expect(onClose.mock.calls, at).toEqual([[false]]);
				expect(onLeave, at).toHaveBeenCalledTimes(1);
				unmount();
			}
		} finally {
			vi.useRealTimers();
		}
	});

	it('closes on a finger that went down on a scrim the next sheet replaced before it lifted', () => {
		vi.useFakeTimers();
		try {
			const onOpenChange = vi.fn();
			const loading = render(
				<Sheet open>
					<SheetContent>
						<SheetTitle>Loading</SheetTitle>
					</SheetContent>
				</Sheet>,
			);
			ptr(scrim(), 'pointerdown', 'touch');
			loading.unmount();
			render(
				<Sheet open onOpenChange={onOpenChange}>
					<SheetContent>
						<SheetTitle>Library</SheetTitle>
					</SheetContent>
				</Sheet>,
			);
			// The finger lifts on the new scrim, and no click comes (as on the iOS Simulator).
			ptr(scrim(), 'pointerup', 'touch');
			vi.runOnlyPendingTimers();
			expect(onOpenChange.mock.calls).toEqual([[false]]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('stays open when the finger moved (a drag or a scroll) or the browser cancelled it', () => {
		vi.useFakeTimers();
		try {
			for (const how of ['moved', 'cancelled'] as const) {
				const onOpenChange = vi.fn();
				const { unmount } = render(
					<Sheet open onOpenChange={onOpenChange}>
						<SheetContent>
							<SheetTitle>Kept</SheetTitle>
						</SheetContent>
					</Sheet>,
				);
				if (how === 'moved') touch(scrim(), { click: false, to: 80 });
				else {
					ptr(scrim(), 'pointerdown', 'touch');
					ptr(scrim(), 'pointercancel', 'touch');
					ptr(scrim(), 'pointerup', 'touch');
				}
				vi.runOnlyPendingTimers();
				expect(onOpenChange, how).not.toHaveBeenCalled();
				unmount();
			}
		} finally {
			vi.useRealTimers();
		}
	});

	it('stays open, in the gap and after it, when the caller keeps an outside tap from closing the sheet', () => {
		vi.useFakeTimers();
		try {
			for (const gap of [true, false]) {
				const onOpenChange = vi.fn();
				const { unmount } = render(
					<Sheet open onOpenChange={onOpenChange}>
						<SheetContent onInteractOutside={(e) => e.preventDefault()}>
							<SheetTitle>Kept</SheetTitle>
						</SheetContent>
					</Sheet>,
				);
				if (!gap) vi.runOnlyPendingTimers();
				tap(scrim());
				vi.runOnlyPendingTimers();
				expect(onOpenChange, gap ? 'in the gap' : 'with Radix listening').not.toHaveBeenCalled();
				unmount();
			}
		} finally {
			vi.useRealTimers();
		}
	});
});
