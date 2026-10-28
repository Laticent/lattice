import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DeckConfigPanel } from './DeckConfigPanel';

// The Playground's Deck settings rows. The front-matter rules themselves (what is written,
// what is dropped at a baseline) are test/unit/playground/deck-config.test.js; this suite
// pins what the panel draws and that each control reaches the writer.

const CLEAN = '<!-- _class: title silent -->\n\n# A new deck\n\nStart sketching.\n';

function mount(initial: string, props: Partial<React.ComponentProps<typeof DeckConfigPanel>> = {}) {
	let source = initial;
	const user = userEvent.setup();
	render(
		<div className="deck-config">
			<DeckConfigPanel
				getSource={() => source}
				setSource={(next) => {
					source = next;
				}}
				palettes={['indaco', 'cuoio', 'atelier', 'a11y-tritanopia']}
				finishes={['none', 'atrium', 'gallery']}
				getDefaultTheme={() => 'indaco'}
				{...props}
			/>
		</div>,
	);
	return { user, get: () => source };
}

/** Every option in an open list, by accessible name. */
const optionNames = () => screen.getAllByRole('option').map((o) => o.textContent ?? '');

describe('DeckConfigPanel — every select row is the Studio picker', () => {
	it('each list opens on ONE Auto head and does not repeat the value Auto lands on', async () => {
		const { user } = mount(CLEAN);
		const pickers = screen.getAllByRole('combobox');
		// Theme, Color mode, Preset, Finish, Headline, Rule, Eyebrow, Corners, Mode, Size, Venue, Splitting.
		expect(pickers).toHaveLength(12);
		for (const picker of pickers) {
			await user.click(picker);
			const names = optionNames();
			const label = picker.getAttribute('aria-label');
			expect(names[0], `${label}: the head`).toMatch(/^Auto/);
			expect(names.filter((n) => n.startsWith('Auto')), `${label}: one Auto row`).toHaveLength(1);
			const resolved = names[0].replace(/^Auto — /, '');
			expect(names.slice(1), `${label}: the resolved value is the head, not a row`).not.toContain(resolved);
			await user.keyboard('{Escape}');
		}
	});

	it('every option carries a preview: a chip or an icon', async () => {
		const { user } = mount(CLEAN);
		for (const picker of screen.getAllByRole('combobox')) {
			await user.click(picker);
			for (const option of screen.getAllByRole('option')) {
				// SwatchChip is a bordered span; option-glyphs and the Auto mark are svgs.
				const preview = option.querySelector('svg, span.shrink-0');
				expect(preview, `${picker.getAttribute('aria-label')} › ${option.textContent}`).not.toBeNull();
			}
			await user.keyboard('{Escape}');
		}
	});

	it('names where Auto lands: the site palette, the preset’s value, the designed size', async () => {
		mount('---\nmarp: true\npreset: editorial\n---\n\n# Hi\n');
		expect(screen.getByRole('combobox', { name: 'Choose theme' })).toHaveTextContent('Auto — follow the site (Indaco)');
		// Editorial's headline is left, so the deck resolves there with no key of its own.
		expect(screen.getByRole('combobox', { name: 'Choose headline alignment' })).toHaveTextContent(/^Auto — Left/);
		expect(screen.getByRole('combobox', { name: 'Choose preset' })).toHaveTextContent('Editorial');
		expect(screen.getByRole('combobox', { name: 'Choose venue' })).toHaveTextContent(/^Auto — Laptop/);
	});

	it('a pick writes the key, and Auto takes it back out', async () => {
		const { user, get } = mount(CLEAN);
		await user.click(screen.getByRole('combobox', { name: 'Choose theme' }));
		await user.click(screen.getByRole('option', { name: 'Atelier' }));
		expect(get()).toContain('theme: atelier');
		await user.click(screen.getByRole('combobox', { name: 'Choose theme' }));
		await user.click(screen.getByRole('option', { name: /^Auto/ }));
		expect(get()).not.toContain('theme:');

		await user.click(screen.getByRole('combobox', { name: 'Choose finish' }));
		await user.click(screen.getByRole('option', { name: /Atrium/ }));
		expect(get()).toContain('finish: atrium');

		await user.click(screen.getByRole('combobox', { name: 'Choose venue' }));
		await user.click(screen.getByRole('option', { name: /^Hall/ }));
		expect(get()).toContain('venue: hall');
		await user.click(screen.getByRole('combobox', { name: 'Choose venue' }));
		await user.click(screen.getByRole('option', { name: /^Auto/ }));
		expect(get()).not.toContain('venue:');
	});

	it('under a preset, Auto restores the preset’s value and a different pick is the override', async () => {
		const { user, get } = mount('---\nmarp: true\npreset: editorial\n---\n\n# Hi\n');
		await user.click(screen.getByRole('combobox', { name: 'Choose finish' }));
		await user.click(screen.getByRole('option', { name: /^None/ }));
		expect(get()).toMatch(/\nfinish: none\n/);
		await user.click(screen.getByRole('combobox', { name: 'Choose finish' }));
		await user.click(screen.getByRole('option', { name: /^Auto/ }));
		expect(get()).not.toContain('finish:');
	});

	it('groups the color-vision palettes under their heading', async () => {
		const { user } = mount(CLEAN);
		await user.click(screen.getByRole('combobox', { name: 'Choose theme' }));
		const group = screen.getByRole('group');
		expect(within(group).getByText(/Accessibility/)).toBeInTheDocument();
		expect(within(group).getByRole('option')).toHaveTextContent('Tritanopia');
	});

	it('an unknown deck theme shows Auto and a caution note naming the fallback', () => {
		mount('---\nmarp: true\ntheme: made-up\n---\n\n# Deck\n');
		expect(screen.getByRole('combobox', { name: 'Choose theme' })).toHaveTextContent(/^Auto/);
		expect(screen.getByText(/made-up/)).toHaveTextContent(/Indaco/);
	});

	it('a value the list does not name shows as itself, on every row', () => {
		mount('---\nmarp: true\nheadline: diagonal\ncolor-mode: sepia\nfinish: foo\nmode: woodcut\n---\n\n# Deck\n');
		expect(screen.getByRole('combobox', { name: 'Choose headline alignment' })).toHaveTextContent('diagonal — not recognized');
		expect(screen.getByRole('combobox', { name: 'Choose color mode' })).toHaveTextContent('sepia — not recognized');
		expect(screen.getByRole('combobox', { name: 'Choose finish' })).toHaveTextContent('foo — not recognized');
		expect(screen.getByRole('combobox', { name: 'Choose mode' })).toHaveTextContent('woodcut — not recognized');
	});
});

describe('DeckConfigPanel — switches and text fields', () => {
	it('Page numbers start on; turning them off writes paginate: false', async () => {
		const { user, get } = mount(CLEAN);
		const sw = screen.getByRole('checkbox', { name: 'Page numbers' });
		expect(sw).toBeChecked();
		await user.click(sw);
		expect(get()).toContain('paginate: false');
		expect(get().startsWith('---\nmarp: true')).toBe(true);
	});

	it('Auto-glossary writes glossary: auto and clears it back off', async () => {
		const { user, get } = mount(CLEAN);
		const sw = screen.getByRole('checkbox', { name: 'Auto-glossary' });
		expect(sw).not.toBeChecked();
		await user.click(sw);
		expect(get()).toContain('glossary: auto');
		await user.click(sw);
		expect(get()).not.toContain('glossary');
	});

	it('leaving a field you did not type in writes nothing, even after the deck moved under it', async () => {
		// The sheet is non-modal: the editor beside it can change `header:` while it is open.
		let source = '---\nmarp: true\nheader: A\n---\n\n# Deck\n';
		const user = userEvent.setup();
		const props = { getSource: () => source, setSource: (n: string) => { source = n; }, palettes: ['indaco'], finishes: ['none'] };
		const { rerender } = render(<DeckConfigPanel {...props} />);
		source = source.replace('header: A', 'header: B');
		rerender(<DeckConfigPanel {...props} />);
		const header = screen.getByRole('textbox', { name: 'Header' });
		expect(header).toHaveValue('B');
		await user.click(header);
		await user.tab();
		expect(source).toContain('header: B');
	});

	it('closing the sheet mid-debounce still writes what was typed', async () => {
		let source = CLEAN;
		const user = userEvent.setup();
		const { unmount } = render(<DeckConfigPanel getSource={() => source} setSource={(n) => { source = n; }} palettes={['indaco']} finishes={['none']} />);
		await user.type(screen.getByRole('textbox', { name: 'Footer' }), 'Conf');
		act(() => unmount());
		expect(source).toContain('footer: Conf');
	});

	it('the Header field writes on blur', async () => {
		const { user, get } = mount(CLEAN);
		await user.type(screen.getByRole('textbox', { name: 'Header' }), 'Acme — Q3');
		await user.tab();
		expect(get()).toContain('header: Acme — Q3');
	});
});

describe('DeckConfigPanel — the fields allow-list', () => {
	it('an explicit list draws only the rows it names', () => {
		mount(CLEAN, { fields: ['finish', 'size', 'paginate', 'glossary'] });
		expect(screen.getAllByRole('combobox').map((c) => c.getAttribute('aria-label'))).toEqual(['Choose finish', 'Choose slide size']);
		expect(screen.getByRole('checkbox', { name: 'Auto-glossary' })).toBeInTheDocument();
		expect(screen.queryByRole('textbox', { name: 'Header' })).toBeNull();
		expect(screen.queryByText('Advanced')).toBeNull();
	});

	it('no list draws every row, Advanced included, and a custom note replaces the intro', () => {
		mount(CLEAN, { note: 'Behind the scenes.' });
		expect(screen.getByText('Behind the scenes.')).toBeInTheDocument();
		expect(screen.getByText('Advanced')).toBeInTheDocument();
		expect(screen.getByRole('textbox', { name: 'Default slide class' })).toBeInTheDocument();
	});
});
