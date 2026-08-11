import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PaletteControls from './PaletteControls';

afterEach(() => {
	const r = document.documentElement;
	r.removeAttribute('data-palette');
	r.removeAttribute('data-mode');
	r.removeAttribute('data-theme');
	// The control publishes the PREFERENCE here for the next load's pre-paint seed (#1592),
	// and it now READS it during render — so a leaked value would silently decide the next
	// test's starting stop.
	r.removeAttribute('data-mode-pref');
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

// ── The pre-paint contract (#1592) ────────────────────────────────────────────────────
//
// The header's two controls used to be the last things on the site that told the visitor
// something they took back a second later: the theme select rendered EMPTY and filled in
// when the island hydrated, and the mode toggle rendered "System" at someone who had pinned
// dark. Both answers are on <html> before paint (the seed in SiteHeader.astro); these pin
// that the control READS them during its first render rather than waiting for its effect.
describe('PaletteControls reads the pre-paint seed', () => {
	it('names the seeded palette on the trigger, not the first of the list', () => {
		document.documentElement.setAttribute('data-palette', 'burgundy');
		render(<PaletteControls palettes={['indaco', 'cuoio', 'burgundy']} />);
		// The trigger's own text — radix would otherwise leave it empty until the closed
		// content's fragment exists and SelectItemText portals the label in.
		expect(screen.getByRole('combobox', { name: /theme/i })).toHaveTextContent('Burgundy');
	});

	// A palette the build no longer ships names a theme whose CSS 404s. The trigger falls back
	// to its placeholder rather than printing a name nothing can render — and the seed in
	// SiteHeader.astro rewrites `data-palette` to a shipped one before this can be reached on a
	// real page, which is why it is worth pinning that this is the failure mode and not a crash.
	it('shows the placeholder rather than a palette this build does not ship', () => {
		document.documentElement.setAttribute('data-palette', 'retired-thing');
		render(<PaletteControls palettes={['indaco', 'cuoio']} />);
		expect(screen.getByRole('combobox', { name: /theme/i })).toHaveTextContent('Theme');
	});

	// The seed and storage always agree on a real page — the seed READ storage. Testing
	// Library flushes effects, so the pre-effect render this is really about is only
	// observable in a browser: `site-chrome-first-paint.spec.ts` samples it per frame.
	it('starts on the pinned stop, seed and storage agreeing as they do on a real page', () => {
		stubSystem(false); // the OS says light…
		localStorage.setItem('lattice-docs-mode', 'dark'); // …the visitor pinned dark
		document.documentElement.setAttribute('data-mode-pref', 'dark');
		render(<PaletteControls palettes={[]} />);
		expect(modeButton()).toHaveAccessibleName(/dark/i);
		expect(document.documentElement.getAttribute('data-mode-pref')).toBe('dark');
	});

	// The attribute is what the NEXT load's seed reads, and the Drawing Board's bus reports a
	// pin rather than a preference — so the control publishes it from one place.
	it('publishes the preference on <html> for the next load', () => {
		stubSystem(false);
		render(<PaletteControls palettes={[]} />);
		expect(document.documentElement.getAttribute('data-mode-pref')).toBe('system');
		fireEvent.click(modeButton());
		expect(document.documentElement.getAttribute('data-mode-pref')).toBe('dark');
	});
});
