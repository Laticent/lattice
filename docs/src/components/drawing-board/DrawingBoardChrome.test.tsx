import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PaletteControls from '../site/PaletteControls';
import DrawingBoardExportMenu from './DrawingBoardExportMenu';

afterEach(() => {
	const r = document.documentElement;
	r.removeAttribute('data-palette');
	r.removeAttribute('data-mode');
	// Reset the chrome/export bus globals between tests.
	(window as unknown as { __dbChrome?: unknown }).__dbChrome = undefined;
	(window as unknown as { __dbExport?: unknown }).__dbExport = undefined;
});

describe('PaletteControls on the Drawing Board (deck-theme picker via __dbChrome)', () => {
	it('renders the deck-theme select + mode toggle', () => {
		render(<PaletteControls palettes={['indaco', 'cuoio']} />);
		expect(screen.getByRole('button', { name: /color mode/i })).toBeInTheDocument();
		expect(screen.getByRole('combobox', { name: /theme/i })).toBeInTheDocument();
	});

	it('a palette pick drives the chrome bus applyTheme (writes the deck theme, not page chrome)', async () => {
		const applyTheme = vi.fn();
		(window as unknown as { __dbChrome: unknown }).__dbChrome = {
			getPalette: () => 'indaco',
			getMode: () => 'light' as const,
			getPalettes: () => ['indaco', 'cuoio'],
			applyTheme,
			toggleMode: () => 'dark' as const,
		};
		render(<PaletteControls palettes={['indaco', 'cuoio']} />);
		// Open the radix select and choose cuoio.
		fireEvent.click(screen.getByRole('combobox', { name: /theme/i }));
		const opt = await screen.findByRole('option', { name: /cuoio/i });
		fireEvent.click(opt);
		expect(applyTheme).toHaveBeenCalledWith('cuoio');
	});

	it('groups a11y-* palettes under an Accessibility label (they are plain themes, picked here)', async () => {
		render(<PaletteControls palettes={['indaco', 'cuoio', 'a11y-deuteranopia', 'a11y-achromatopsia']} />);
		fireEvent.click(screen.getByRole('combobox', { name: /theme/i }));
		// Brand themes are offered…
		expect(await screen.findByRole('option', { name: /^Indaco$/ })).toBeInTheDocument();
		expect(screen.getByRole('option', { name: /^Cuoio$/ })).toBeInTheDocument();
		// …and the accessibility themes appear, prefix-stripped, under an Accessibility label.
		expect(screen.getByText(/accessibility/i)).toBeInTheDocument();
		expect(screen.getByRole('option', { name: /^Deuteranopia$/ })).toBeInTheDocument();
		expect(screen.getByRole('option', { name: /^Achromatopsia$/ })).toBeInTheDocument();
	});

	it('picking an a11y theme writes theme: a11y-<type> via applyTheme (same path as any theme)', async () => {
		const applyTheme = vi.fn();
		(window as unknown as { __dbChrome: unknown }).__dbChrome = {
			getPalette: () => 'indaco',
			getMode: () => 'light' as const,
			getPalettes: () => ['indaco', 'cuoio', 'a11y-deuteranopia'],
			applyTheme,
			toggleMode: () => 'dark' as const,
		};
		render(<PaletteControls palettes={['indaco', 'cuoio', 'a11y-deuteranopia']} />);
		fireEvent.click(screen.getByRole('combobox', { name: /theme/i }));
		const opt = await screen.findByRole('option', { name: /^Deuteranopia$/ });
		fireEvent.click(opt);
		expect(applyTheme).toHaveBeenCalledWith('a11y-deuteranopia');
	});

	it('reflects a db-chrome-sync event (deck theme changed underneath)', async () => {
		render(<PaletteControls palettes={['indaco', 'cuoio']} />);
		act(() => {
			window.dispatchEvent(
				new CustomEvent('db-chrome-sync', { detail: { palette: 'cuoio', mode: 'dark', palettes: ['indaco', 'cuoio'] } }),
			);
		});
		await waitFor(() => expect(screen.getByRole('combobox', { name: /theme/i })).toHaveTextContent(/cuoio/i));
	});

	it('the mode toggle drives the chrome bus toggleMode', () => {
		const toggleMode = vi.fn(() => 'dark' as const);
		(window as unknown as { __dbChrome: unknown }).__dbChrome = {
			getPalette: () => 'indaco',
			getMode: () => 'light' as const,
			getPalettes: () => ['indaco'],
			applyTheme: vi.fn(),
			toggleMode,
		};
		render(<PaletteControls palettes={['indaco']} />);
		fireEvent.click(screen.getByRole('button', { name: /color mode/i }));
		expect(toggleMode).toHaveBeenCalled();
	});
});

describe('DrawingBoardExportMenu (chrome only — export logic untouched)', () => {
	beforeEach(() => {
		(window as unknown as { __dbExport: unknown }).__dbExport = {
			run: vi.fn(),
			hasActiveChart: () => false,
		};
	});

	// Radix DropdownMenu opens on keyboard activation reliably in jsdom (mouse
	// uses pointerdown, which jsdom doesn't fully model); Enter on the focused
	// trigger is the supported path and exercises the same open + onOpenChange.
	const openMenu = () => {
		const trigger = screen.getByRole('button', { name: /export this deck/i });
		trigger.focus();
		fireEvent.keyDown(trigger, { key: 'Enter', code: 'Enter' });
	};

	it('opens and drives the export bus on item select', async () => {
		const run = vi.fn();
		(window as unknown as { __dbExport: unknown }).__dbExport = { run, hasActiveChart: () => false };
		render(<DrawingBoardExportMenu />);
		openMenu();
		const pdf = await screen.findByRole('menuitem', { name: /PDF/i });
		fireEvent.click(pdf);
		expect(run).toHaveBeenCalledWith('pdf');
	});

	it('hides "Export chart" unless the active slide has a chart', async () => {
		render(<DrawingBoardExportMenu />);
		openMenu();
		await screen.findByRole('menuitem', { name: /PDF/i });
		expect(screen.queryByRole('menuitem', { name: /Export chart/i })).not.toBeInTheDocument();
	});

	it('shows "Export chart" when hasActiveChart() is true', async () => {
		(window as unknown as { __dbExport: unknown }).__dbExport = { run: vi.fn(), hasActiveChart: () => true };
		render(<DrawingBoardExportMenu />);
		openMenu();
		expect(await screen.findByRole('menuitem', { name: /Export chart/i })).toBeInTheDocument();
	});
});
