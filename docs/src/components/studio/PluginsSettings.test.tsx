import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PluginsSettings } from './PluginsSettings';

// The deck settings' Plugins tab: one row per shipped plugin saying whether it is on and why, and a
// checkbox that writes the deck's `plugins:` import list. The list's reader and writer are covered in
// test/unit/plugins/admit.test.js; this pins what the tab shows and what it writes.

/** Render the tab over `source` and capture what a checkbox writes. */
function harness(source: string) {
	let written: string | null = null;
	let label = '';
	render(<PluginsSettings source={source} onWrite={(l, fn) => { label = l; written = fn(source); }} />);
	return { written: () => written, label: () => label };
}

describe('PluginsSettings', () => {
	it('shows every shipped plugin as on by default, listed in none', () => {
		harness('# A deck\n');
		for (const name of ['math', 'function-plot', 'mermaid', 'anima']) {
			const row = document.querySelector(`[data-plugin-row="${name}"]`);
			expect(row, name).toBeTruthy();
			expect(row?.textContent).toContain('On by default');
			expect(row?.textContent).not.toContain('Listed in this deck');
		}
		for (const sw of screen.getAllByRole('checkbox')) expect(sw.getAttribute('aria-checked')).toBe('false');
	});

	it('says why: listed in the deck, and needed by a slide class', () => {
		harness('---\nplugins: [math]\n---\n\n<!-- _class: diagram -->\n# Flow\n');
		expect(document.querySelector('[data-plugin-row="math"]')?.textContent).toContain('Listed in this deck');
		expect(document.querySelector('[data-plugin-row="mermaid"]')?.textContent).toContain('Needed by diagram slides');
		expect(screen.getByRole('checkbox', { name: /List Math in this deck/ }).getAttribute('aria-checked')).toBe('true');
	});

	it('writes the plugin into the deck front matter, keeping what was there', () => {
		const h = harness('---\ntheme: indaco\n---\n\n# Hi\n');
		fireEvent.click(screen.getByRole('checkbox', { name: /List Mermaid diagrams in this deck/ }));
		expect(h.written()).toBe('---\ntheme: indaco\nplugins: [mermaid]\n---\n\n# Hi\n');
		expect(h.label()).toBe('Plugins → list mermaid');
	});

	it('removes the key when the last listed plugin is unlisted', () => {
		const h = harness('---\ntheme: indaco\nplugins: [math]\n---\n\n# Hi\n');
		fireEvent.click(screen.getByRole('checkbox', { name: /List Math in this deck/ }));
		expect(h.written()).toBe('---\ntheme: indaco\n---\n\n# Hi\n');
	});

	it('flags a listed name no plugin has, and removes it', () => {
		const h = harness('---\nplugins: [math, mermiad]\n---\n\n# Hi\n');
		const row = document.querySelector('[data-plugin-unknown="mermiad"]');
		expect(row?.textContent).toContain('No plugin is named mermiad');
		fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
		expect(h.written()).toBe('---\nplugins: [math]\n---\n\n# Hi\n');
	});
});
