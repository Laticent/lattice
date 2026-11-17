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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PanelNav, PanelSheet } from '@/components/ui/panel';
import { resetScrimPointers, Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

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
type Ptr = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel';
type Kind = 'mouse' | 'touch' | 'pen';
function ptr(el: HTMLElement, type: Ptr, pointerType: Kind, x = 20, { id = pointerType === 'mouse' ? 1 : 7, at }: { id?: number; at?: number } = {}) {
	const ev = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 20 });
	Object.defineProperty(ev, 'pointerType', { value: pointerType });
	Object.defineProperty(ev, 'pointerId', { value: id });
	if (at !== undefined) Object.defineProperty(ev, 'timeStamp', { value: at });
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
	if (to !== 20) ptr(el, 'pointermove', 'touch', to);
	// Mobile Safari reports a touch's pointerup at 0,0, so the test does too: the tap must not depend on it.
	ptr(el, 'pointerup', 'touch', 0);
	if (click) fireEvent.click(el, { clientX: to, clientY: 20 });
};

describe('PanelSheet — a tap on the scrim', () => {
	beforeEach(() => resetScrimPointers());

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

	it('closes once on a mouse and on a pen, as before', () => {
		vi.useFakeTimers();
		try {
			for (const kind of ['mouse', 'pen'] as const) {
				const onOpenChange = vi.fn();
				const { unmount } = render(
					<Sheet open onOpenChange={onOpenChange}>
						<SheetContent>
							<SheetTitle>Kept</SheetTitle>
						</SheetContent>
					</Sheet>,
				);
				vi.runOnlyPendingTimers();
				ptr(scrim(), 'pointerdown', kind);
				ptr(scrim(), 'pointerup', kind);
				fireEvent.click(scrim(), { clientX: 20, clientY: 20 });
				vi.runOnlyPendingTimers();
				expect(onOpenChange.mock.calls, kind).toEqual([[false]]);
				unmount();
			}
		} finally {
			vi.useRealTimers();
		}
	});

	it('is not a tap: an up with no down, a second finger, a press held past the limit, a stale pointer id', () => {
		vi.useFakeTimers();
		try {
			const cases: Record<string, (el: () => HTMLElement) => void> = {
				'an up with no down': (el) => ptr(el(), 'pointerup', 'touch'),
				'a second finger': (el) => {
					ptr(el(), 'pointerdown', 'touch', 20, { id: 7 });
					ptr(el(), 'pointerdown', 'touch', 60, { id: 8 });
					ptr(el(), 'pointerup', 'touch', 60, { id: 8 });
					ptr(el(), 'pointerup', 'touch', 20, { id: 7 });
				},
				'a press held past the limit': (el) => {
					ptr(el(), 'pointerdown', 'touch', 20, { at: 1000 });
					ptr(el(), 'pointerup', 'touch', 20, { at: 2500 });
				},
				'a stale pointer id': (el) => {
					// A finger that lifted somewhere else leaves its entry; long after, a pointer reuses the id and only lifts here.
					ptr(el(), 'pointerdown', 'touch', 20, { id: 9, at: 1000 });
					ptr(el(), 'pointerdown', 'touch', 20, { id: 7, at: 5000 });
					ptr(el(), 'pointercancel', 'touch', 20, { id: 7, at: 5010 });
					ptr(el(), 'pointerup', 'touch', 20, { id: 9, at: 5020 });
				},
			};
			for (const [name, run] of Object.entries(cases)) {
				resetScrimPointers();
				const onOpenChange = vi.fn();
				const { unmount } = render(
					<Sheet open onOpenChange={onOpenChange}>
						<SheetContent>
							<SheetTitle>Kept</SheetTitle>
						</SheetContent>
					</Sheet>,
				);
				run(scrim);
				vi.runOnlyPendingTimers();
				expect(onOpenChange, name).not.toHaveBeenCalled();
				unmount();
			}
		} finally {
			vi.useRealTimers();
		}
	});

	it('forgets a finger once the last scrim is gone, so a later sheet does not take its lift for a tap', async () => {
		// A CLOSED sheet stays in the tree (the site nav's is on every page) and must not count as a scrim still there.
		render(
			<Sheet open={false}>
				<SheetContent>
					<SheetTitle>Closed</SheetTitle>
				</SheetContent>
			</Sheet>,
		);
		const first = render(
			<Sheet open>
				<SheetContent>
					<SheetTitle>First</SheetTitle>
				</SheetContent>
			</Sheet>,
		);
		ptr(scrim(), 'pointerdown', 'touch');
		first.unmount();
		await Promise.resolve(); // the unmount's microtask: no scrim took its place
		const onOpenChange = vi.fn();
		render(
			<Sheet open onOpenChange={onOpenChange}>
				<SheetContent>
					<SheetTitle>Later</SheetTitle>
				</SheetContent>
			</Sheet>,
		);
		ptr(scrim(), 'pointerup', 'touch');
		expect(onOpenChange).not.toHaveBeenCalled();
	});

	it('leaves the sheet open when a menu is open above it: the tap closes the menu, as Radix decides', () => {
		vi.useFakeTimers();
		try {
			for (const kind of ['mouse', 'touch'] as const) {
				resetScrimPointers();
				const onOpenChange = vi.fn();
				const { unmount } = render(
					<Sheet open onOpenChange={onOpenChange}>
						<SheetContent>
							<SheetTitle>Settings</SheetTitle>
							<DropdownMenu open>
								<DropdownMenuTrigger>Theme</DropdownMenuTrigger>
								<DropdownMenuContent>
									<DropdownMenuItem>Indaco</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</SheetContent>
					</Sheet>,
				);
				vi.runOnlyPendingTimers();
				if (kind === 'mouse') tap(scrim());
				else touch(scrim(), { click: false });
				vi.runOnlyPendingTimers();
				expect(onOpenChange, kind).not.toHaveBeenCalled();
				unmount();
			}
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not close on a right-click or a ctrl-click on the scrim, in the gap either', () => {
		vi.useFakeTimers();
		try {
			for (const how of ['right', 'ctrl'] as const) {
				resetScrimPointers();
				const onOpenChange = vi.fn();
				const { unmount } = render(
					<Sheet open onOpenChange={onOpenChange}>
						<SheetContent>
							<SheetTitle>Kept</SheetTitle>
						</SheetContent>
					</Sheet>,
				);
				const el = scrim();
				for (const type of ['pointerdown', 'pointerup'] as const) {
					const ev = new MouseEvent(type, { bubbles: true, cancelable: true, button: how === 'right' ? 2 : 0, ctrlKey: how === 'ctrl', clientX: 20, clientY: 20 });
					Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
					Object.defineProperty(ev, 'pointerId', { value: 1 });
					fireEvent(el, ev);
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
