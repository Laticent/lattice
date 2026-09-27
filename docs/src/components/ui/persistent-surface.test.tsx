import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DismissableLayer } from 'radix-ui/internal';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { DialogClose, DialogTitle } from '@/components/ui/dialog';
import { PersistentSurface } from '@/components/ui/persistent-surface';

// The property the surface exists for is that its CONTENT IS NEVER UNMOUNTED after the first
// open: WebKit never frees a preview document whose frame is destroyed. The mount counter is that
// contract; the DOM alone cannot tell a kept subtree from a rebuilt one.
let mounts = 0;
let unmounts = 0;
function Probe() {
	React.useEffect(() => {
		mounts++;
		return () => {
			unmounts++;
		};
	}, []);
	return <input data-testid="inside" />;
}

function Harness({ initial = false }: { initial?: boolean }) {
	const [open, setOpen] = React.useState(initial);
	return (
		<>
			<button type="button" onClick={() => setOpen(true)}>
				launch
			</button>
			<PersistentSurface open={open} onOpenChange={setOpen}>
				<DialogTitle>Add a slide</DialogTitle>
				<Probe />
				<DialogClose>close</DialogClose>
			</PersistentSurface>
		</>
	);
}

const dialog = () => document.querySelector('[data-slot="persistent-surface-box"]') as HTMLElement | null;

describe('PersistentSurface', () => {
	it('mounts nothing until the first open', () => {
		render(<Harness />);
		expect(dialog()).toBeNull();
	});

	it('keeps its content mounted, hidden, across close and reopen', () => {
		mounts = 0;
		unmounts = 0;
		render(<Harness />);
		fireEvent.click(screen.getByText('launch'));
		expect(dialog()?.getAttribute('data-state')).toBe('open');
		fireEvent.click(screen.getByText('close'));
		expect(dialog()?.getAttribute('data-state'), 'a closed surface was torn down').toBe('closed');
		fireEvent.click(screen.getByText('launch'));
		expect(mounts).toBe(1);
		expect(unmounts, 'closing unmounted the content — every frame in it would be a fresh document on reopen').toBe(0);
	});

	it('is labelled by the shared DialogTitle', () => {
		render(<Harness initial />);
		const id = dialog()?.getAttribute('aria-labelledby');
		expect(id && document.getElementById(id)?.textContent).toBe('Add a slide');
		expect(dialog()?.getAttribute('aria-modal')).toBe('true');
	});

	it('makes the rest of the page inert only while open, and returns focus', async () => {
		render(<Harness />);
		const launch = screen.getByText('launch');
		launch.focus();
		fireEvent.click(launch);
		const page = launch.closest('body > div') as HTMLElement;
		expect(page.hasAttribute('inert'), 'the page behind stayed reachable').toBe(true);
		expect(dialog()?.contains(document.activeElement)).toBe(true);
		fireEvent.click(screen.getByText('close'));
		expect(page.hasAttribute('inert'), 'the page stayed inert after close').toBe(false);
		await waitFor(() => expect(document.activeElement).toBe(launch));
	});

	it('does not take focus back from something that claimed it during the close', async () => {
		// An insert moves the caret into the new slide a frame after the close. Returning focus to
		// the launcher over it pulled the author back to the old slide.
		render(
			<>
				<Harness />
				<input data-testid="new-slide" />
			</>,
		);
		const launch = screen.getByText('launch');
		launch.focus();
		fireEvent.click(launch);
		fireEvent.click(screen.getByText('close'));
		const caret = screen.getByTestId('new-slide');
		caret.focus();
		await waitFor(() => expect(dialog()?.hasAttribute('data-hidden')).toBe(true));
		expect(document.activeElement, 'focus was taken back from the new slide').toBe(caret);
	});

	it('closes on Escape, but a Radix layer opened from inside takes Escape first', () => {
		function WithMenu() {
			const [open, setOpen] = React.useState(true);
			const [menu, setMenu] = React.useState(false);
			return (
				<PersistentSurface open={open} onOpenChange={setOpen}>
					<DialogTitle>Add a slide</DialogTitle>
					<button type="button" onClick={() => setMenu(true)}>
						looks
					</button>
					{menu && (
						<DismissableLayer.Root data-testid="menu" onDismiss={() => setMenu(false)}>
							menu
						</DismissableLayer.Root>
					)}
				</PersistentSurface>
			);
		}
		render(<WithMenu />);
		fireEvent.click(screen.getByText('looks')); // a menu opened from inside, as a user would
		fireEvent.keyDown(document, { key: 'Escape' });
		expect(screen.queryByTestId('menu'), 'the inner layer did not take the first Escape').toBeNull();
		expect(dialog()?.getAttribute('data-state')).toBe('open');
		fireEvent.keyDown(document, { key: 'Escape' });
		expect(dialog()?.getAttribute('data-state')).toBe('closed');
	});

	it('is the top Radix layer while open, so a sheet beneath it keeps Escape to itself', () => {
		let under = 0;
		function Stack() {
			const [open, setOpen] = React.useState(false);
			return (
				<>
					<DismissableLayer.Root onEscapeKeyDown={() => under++}>
						<button type="button" onClick={() => setOpen(true)}>
							launch
						</button>
					</DismissableLayer.Root>
					<PersistentSurface open={open} onOpenChange={setOpen}>
						<DialogTitle>Add a slide</DialogTitle>
					</PersistentSurface>
				</>
			);
		}
		render(<Stack />);
		fireEvent.click(screen.getByText('launch'));
		fireEvent.keyDown(document, { key: 'Escape' });
		expect(dialog()?.getAttribute('data-state')).toBe('closed');
		expect(under, 'the sheet beneath answered an Escape meant for the surface on top of it').toBe(0);
	});

	it('answers no key while closed — a hidden surface must not eat the page\'s Escape', () => {
		render(<Harness />);
		fireEvent.click(screen.getByText('launch'));
		fireEvent.click(screen.getByText('close'));
		const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		act(() => {
			document.dispatchEvent(esc);
		});
		expect(esc.defaultPrevented).toBe(false);
	});

	it('closes on a backdrop click', () => {
		render(<Harness initial />);
		const backdrop = document.querySelector('[data-slot="persistent-surface"] > [aria-hidden][data-state]') as HTMLElement;
		fireEvent.click(backdrop);
		expect(dialog()?.getAttribute('data-state')).toBe('closed');
	});

	it('plays its exit, then is nothing to anyone: hidden, and no longer a dialog', async () => {
		render(<Harness initial />);
		fireEvent.click(screen.getByText('close'));
		expect(dialog()?.getAttribute('role'), 'the dialog vanished before its exit animation').toBe('dialog');
		expect(dialog()?.hasAttribute('data-hidden')).toBe(false);
		await waitFor(() => expect(dialog()?.hasAttribute('data-hidden')).toBe(true));
		expect(document.querySelector('[role="dialog"]'), 'a closed surface still answers as a dialog').toBeNull();
	});

	it('lifts an aria-hidden a Radix modal left on it while it is open, and puts it back on close', () => {
		// The phone reaches Add slide through the drawer, a Radix modal whose `hideOthers` marks every
		// <body> child aria-hidden — the closed surface's root included, from the second open on.
		render(<Harness />);
		const launch = screen.getByText('launch');
		fireEvent.click(launch);
		fireEvent.click(screen.getByText('close'));
		const root = document.querySelector('[data-slot="persistent-surface"]') as HTMLElement;
		root.setAttribute('aria-hidden', 'true'); // what hideOthers does when the drawer opens again
		fireEvent.click(launch);
		expect(root.hasAttribute('aria-hidden'), 'the open gallery is hidden from assistive tech').toBe(false);
		fireEvent.click(screen.getByText('close'));
		expect(root.getAttribute('aria-hidden'), "the drawer's mark was not restored").toBe('true');
	});

	it('leaves a live region reachable, so a toast raised while open is still announced', () => {
		const island = document.body.appendChild(document.createElement('div'));
		const other = island.appendChild(document.createElement('div'));
		const live = island.appendChild(document.createElement('section'));
		live.setAttribute('aria-live', 'polite');
		render(<Harness initial />);
		expect(live.closest('[inert]'), 'the toaster went inert').toBeNull();
		expect(other.hasAttribute('inert'), 'the rest of that island stayed reachable').toBe(true);
		island.remove();
	});
});
