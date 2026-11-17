// A tap on a sheet's scrim closes it from the sheet's first frame.
//
// Radix registers the "pointer down outside" listener that dismisses a dialog on a `setTimeout(0)` after the dialog
// mounts (@radix-ui/react-dismissable-layer, `usePointerDownOutside`). A sheet that is already on screen when it
// mounts has no motion to hide that gap: a lazy panel's real sheet replaces its loading shell with the enter
// animation off (`PanelLoader` in components/studio/lazy-panel.tsx). A tap that lands before the timer runs is not
// "outside" to Radix, so it did nothing. Under load the browser runs the tap ahead of the queued timer, and the
// phone's deck tap on a just-loaded Library was lost: e2e/back-gesture.spec.ts:172 went red 3 to 6 times in 100 on
// `main`. `SheetContent` now marks a scrim pointerdown; a tap Radix never reported goes through the caller's own
// `onPointerDownOutside` / `onInteractOutside` once the click has dispatched, and closes the sheet only if neither
// prevented it (components/ui/sheet.tsx).
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
/** A mouse tap: pointerdown, pointerup, click. */
const tap = (el: HTMLElement) => {
	fireEvent.pointerDown(el, { pointerType: 'mouse', button: 0 });
	fireEvent.pointerUp(el, { pointerType: 'mouse', button: 0 });
	fireEvent.click(el);
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
