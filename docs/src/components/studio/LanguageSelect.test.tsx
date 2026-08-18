import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LANG_AUTO, LanguageSelect } from './LanguageSelect';

// Radix Select is a combobox trigger + a portal listbox — drive it the way a user
// does (the jsdom pointer-capture polyfills in vitest.setup.ts make this work):
// open the trigger, then read/click the option by its visible label.
const open = async (name: RegExp | string) => {
	const user = userEvent.setup();
	await user.click(screen.getByRole('combobox', { name }));
	return user;
};
const optionLabels = () => screen.getAllByRole('option').map((o) => o.textContent?.trim() ?? '');

describe('LanguageSelect', () => {
	it('offers the English catalog, no Automatic row when includeAuto is off', async () => {
		render(<LanguageSelect value="en-US" onValueChange={() => {}} ariaLabel="Workspace language" />);
		await open('Workspace language');
		const labels = optionLabels();
		expect(labels).toContain('English (United States)');
		expect(labels).toContain('English (United Kingdom)');
		expect(labels.some((l) => /Automatic/.test(l))).toBe(false);
		expect(labels.some((l) => /unsupported/.test(l))).toBe(false);
	});

	it('normalizes a valid non-canonical English tag instead of branding it unsupported', async () => {
		// `en`, `en-us`, `EN-GB` are the ubiquitous document-lang forms the engine/exports
		// accept; the picker must resolve them, not show an "(unsupported)" row.
		for (const v of ['en', 'en-us', 'EN-GB']) {
			const { unmount } = render(<LanguageSelect value={v} onValueChange={() => {}} ariaLabel="Lang" />);
			await open('Lang');
			expect(optionLabels().some((l) => /unsupported/.test(l))).toBe(false);
			// The resolved catalog item is the selected one.
			expect((await screen.findByRole('option', { selected: true })).textContent).toMatch(/English \((United States|United Kingdom)\)/);
			unmount();
		}
	});

	it('surfaces a genuinely-dropped locale as its own "(unsupported)" row', async () => {
		render(<LanguageSelect value="fr-FR" onValueChange={() => {}} ariaLabel="Lang" />);
		await open('Lang');
		const labels = optionLabels();
		expect(labels).toContain('fr-FR (unsupported)');
		expect((await screen.findByRole('option', { selected: true })).textContent).toBe('fr-FR (unsupported)');
	});

	it('names what Auto resolves to in the row itself, with the fuller sentence in the title', async () => {
		// The row used to read a bare "Auto", with the resolved language demoted to the
		// tooltip, because a long label widened the whole control (the trigger mirrors the
		// selected row). The control now owns a fixed half of its row and truncates
		// (SETTING_ROW in ui/panel), so the value is back where it can be read at a glance —
		// which is the point of an Auto row: what do I get if I leave this alone?
		render(<LanguageSelect value={LANG_AUTO} includeAuto resolvedAuto="English (United States)" autoLabel="Automatic — English (United States)" onValueChange={() => {}} ariaLabel="Deck language" />);
		await open('Deck language');
		expect(optionLabels()).toContain('Auto — English (United States)');
		// …and the fuller sentence still rides in the row's title (hover + a11y description).
		expect(screen.getByRole('option', { name: 'Auto — English (United States)' })).toHaveAttribute('title', 'Automatic — English (United States)');
		expect((await screen.findByRole('option', { selected: true })).textContent).toBe('Auto — English (United States)');
	});

	it('falls back to the tail of autoLabel when no resolvedAuto is passed', async () => {
		// A caller that only knows the old prop still reads correctly rather than showing a
		// bare "Auto" — the inconsistency this change exists to remove.
		render(<LanguageSelect value={LANG_AUTO} includeAuto autoLabel="Automatic — English (United States)" onValueChange={() => {}} ariaLabel="Deck language" />);
		await open('Deck language');
		expect(optionLabels()).toContain('Auto — English (United States)');
	});

	it('reports the picked code — the Automatic sentinel and a concrete language', async () => {
		const onChange = vi.fn();
		render(<LanguageSelect value={LANG_AUTO} includeAuto autoLabel="Automatic" onValueChange={onChange} ariaLabel="Deck language" />);
		const user = await open('Deck language');
		await user.click(await screen.findByRole('option', { name: 'English (United Kingdom)' }));
		expect(onChange).toHaveBeenCalledWith('en-GB');
	});
});
