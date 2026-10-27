import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

// The tap-away layer (tap-away.tsx): a modal list draws it while open, and a pointerdown on it
// closes the list. WebKit delivers no event at all for a tap outside a modal Radix list (the
// body is `pointer-events: none`), so without this layer iOS left the list open and a second
// trigger opened a second list over it. jsdom cannot reproduce WebKit's hit-testing; what this
// pins is the WIRING — every select and every modal menu draws the layer, and it closes them.
const layer = () => document.querySelector('[data-slot="tap-away"]');

function TestSelect({ onOpenChange }: { onOpenChange?: (o: boolean) => void }) {
	return (
		<Select defaultOpen onOpenChange={onOpenChange}>
			<SelectTrigger aria-label="Pick">
				<SelectValue placeholder="Pick" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="a">A</SelectItem>
			</SelectContent>
		</Select>
	);
}

describe('TapAway', () => {
	it('is drawn under an open select, and a tap on it closes the select', () => {
		const onOpenChange = vi.fn();
		render(<TestSelect onOpenChange={onOpenChange} />);
		expect(screen.getByRole('listbox')).toBeTruthy();
		expect(layer()).toBeTruthy();
		act(() => {
			fireEvent.pointerDown(layer() as Element);
		});
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(screen.queryByRole('listbox')).toBeNull();
		expect(layer()).toBeNull();
	});

	it('swallows the click the closing tap produces, so the tap never reaches the page beneath', () => {
		const beneath = vi.fn();
		render(
			<>
				<button type="button" onClick={beneath}>
					Beneath
				</button>
				<TestSelect />
			</>,
		);
		act(() => {
			fireEvent.pointerDown(layer() as Element);
		});
		fireEvent.click(screen.getByText('Beneath'));
		expect(beneath).not.toHaveBeenCalled();
		// Only that one click: the next one goes through.
		fireEvent.click(screen.getByText('Beneath'));
		expect(beneath).toHaveBeenCalledTimes(1);
	});

	it('tells the owner once when a tap closes the list, even with Radix\'s own outside handler armed', async () => {
		// Radix arms its document pointerdown listener a tick after opening, and it sees the same
		// press as outside: without the guard the owner heard `false` twice, and a toggling owner
		// reopened the list.
		const calls: boolean[] = [];
		function Toggling() {
			const [open, setOpen] = useState(true);
			return (
				<Select
					open={open}
					onOpenChange={(o) => {
						calls.push(o);
						setOpen((p) => !p);
					}}
				>
					<SelectTrigger aria-label="Pick">
						<SelectValue placeholder="Pick" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="a">A</SelectItem>
					</SelectContent>
				</Select>
			);
		}
		render(<Toggling />);
		await act(() => new Promise((r) => setTimeout(r, 20)));
		act(() => {
			fireEvent.pointerDown(layer() as Element);
		});
		expect(calls).toEqual([false]);
		expect(screen.queryByRole('listbox')).toBeNull();
	});

	it('stands the click guard down when the gesture ends without a click, so the next tap gets through', () => {
		const beneath = vi.fn();
		render(
			<>
				<button type="button" onClick={beneath}>
					Beneath
				</button>
				<TestSelect />
			</>,
		);
		// A swipe: the press closes the list, the browser cancels it, and no click follows.
		act(() => {
			fireEvent.pointerDown(layer() as Element);
		});
		fireEvent(document, new Event('pointercancel', { bubbles: true }));
		fireEvent.click(screen.getByText('Beneath'));
		expect(beneath).toHaveBeenCalledTimes(1);
		// The same holds when the next press starts before any click arrives.
		render(<TestSelect />);
		act(() => {
			fireEvent.pointerDown(layer() as Element);
		});
		fireEvent.pointerDown(screen.getByText('Beneath'));
		fireEvent.click(screen.getByText('Beneath'));
		expect(beneath).toHaveBeenCalledTimes(2);
	});

	it('is drawn under a modal menu, and not under a non-modal one (which never locks the page)', () => {
		const { unmount } = render(
			<DropdownMenu defaultOpen>
				<DropdownMenuTrigger>Menu</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem>One</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);
		expect(layer()).toBeTruthy();
		act(() => {
			fireEvent.pointerDown(layer() as Element);
		});
		expect(screen.queryByRole('menu')).toBeNull();
		unmount();
		render(
			<DropdownMenu defaultOpen modal={false}>
				<DropdownMenuTrigger>Menu</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem>One</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);
		expect(screen.getByRole('menu')).toBeTruthy();
		expect(layer()).toBeNull();
	});
});
