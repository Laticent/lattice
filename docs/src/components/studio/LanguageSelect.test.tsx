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

	it('shows the Automatic (inherit) row with its label when includeAuto is on', async () => {
		render(<LanguageSelect value={LANG_AUTO} includeAuto autoLabel="Automatic — English (United States)" onValueChange={() => {}} ariaLabel="Deck language" />);
		await open('Deck language');
		expect(optionLabels()).toContain('Automatic — English (United States)');
		expect((await screen.findByRole('option', { selected: true })).textContent).toBe('Automatic — English (United States)');
	});

	it('reports the picked code — the Automatic sentinel and a concrete language', async () => {
		const onChange = vi.fn();
		render(<LanguageSelect value={LANG_AUTO} includeAuto autoLabel="Automatic" onValueChange={onChange} ariaLabel="Deck language" />);
		const user = await open('Deck language');
		await user.click(await screen.findByRole('option', { name: 'English (United Kingdom)' }));
		expect(onChange).toHaveBeenCalledWith('en-GB');
	});
});
