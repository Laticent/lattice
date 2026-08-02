import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PaletteControls from './PaletteControls';

afterEach(() => {
	const r = document.documentElement;
	r.removeAttribute('data-palette');
	r.removeAttribute('data-mode');
	r.removeAttribute('data-theme');
	localStorage.clear();
	vi.unstubAllGlobals();
});

/** Pin `prefers-color-scheme` so the System stop has a definite answer. */
function stubSystem(dark: boolean) {
	vi.stubGlobal('matchMedia', () => ({ matches: dark, addEventListener() {}, removeEventListener() {} }));
}

const modeButton = () => screen.getByRole('button', { name: /color mode/i });

describe('PaletteControls island', () => {
	it('renders the mode control and a palette select when palettes are given', () => {
		render(<PaletteControls palettes={['indaco', 'cuoio']} />);
		expect(modeButton()).toBeInTheDocument();
		// shadcn/radix SelectTrigger exposes role="combobox" with the aria-label.
		expect(screen.getByRole('combobox', { name: /theme/i })).toBeInTheDocument();
	});

	it('renders only the mode control when palettes is empty (Workbench case)', () => {
		render(<PaletteControls palettes={[]} />);
		expect(modeButton()).toBeInTheDocument();
		expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
	});

	// Three stops (#1285): system → light → dark → system. The control names the
	// CURRENT stop rather than the next one, because System has no opposite.
	it('starts on System and says which mode that currently resolves to', () => {
		stubSystem(true);
		render(<PaletteControls palettes={[]} />);
		expect(modeButton()).toHaveAccessibleName(/system \(dark\)/i);
		expect(document.documentElement.getAttribute('data-mode')).toBe('dark');
	});

	// With the OS on light the cycle runs system → dark → light → system, so the
	// first press always repaints (a fixed system→light order would look dead).
	it('cycles away from the OS first, persisting the PREFERENCE each time', () => {
		stubSystem(false);
		render(<PaletteControls palettes={[]} />);
		expect(document.documentElement.getAttribute('data-mode')).toBe('light');

		fireEvent.click(modeButton());
		expect(localStorage.getItem('lattice-docs-mode')).toBe('dark');
		expect(document.documentElement.getAttribute('data-mode')).toBe('dark');
		expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
		expect(modeButton()).toHaveAccessibleName(/dark/i);

		fireEvent.click(modeButton());
		expect(localStorage.getItem('lattice-docs-mode')).toBe('light');
		expect(document.documentElement.getAttribute('data-mode')).toBe('light');
		expect(modeButton()).toHaveAccessibleName(/light/i);

		fireEvent.click(modeButton());
		expect(localStorage.getItem('lattice-docs-mode')).toBe('system');
		// Back to following the OS, which this test pins to light.
		expect(document.documentElement.getAttribute('data-mode')).toBe('light');
		expect(modeButton()).toHaveAccessibleName(/system/i);
	});

	it('restores a stored pin rather than re-deriving it from the OS', () => {
		stubSystem(true); // OS says dark…
		localStorage.setItem('lattice-docs-mode', 'light'); // …but the user pinned light
		render(<PaletteControls palettes={[]} />);
		expect(document.documentElement.getAttribute('data-mode')).toBe('light');
		expect(modeButton()).toHaveAccessibleName(/light/i);
	});
});
