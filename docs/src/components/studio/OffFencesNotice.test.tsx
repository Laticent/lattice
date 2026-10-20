import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { admitPlugins } from '../../../../lib/plugins/host-grammar.mjs';
import { OffFencesNotice } from './OffFencesNotice';

// The one off-fence notice every diagram-drawing Share panel shows (#2758). The count and the wording are
// pinned in src/lib/off-fences.test.ts; this pins when the notice shows and what its action writes. The host
// narrowed its defaults to nothing, so a plugin is on only when the deck lists it, as the real playground
// bundle answers (`pluginAdmission`).
const pg = () => window as unknown as { LatticePlayground?: unknown };
beforeEach(() => {
	pg().LatticePlayground = { pluginAdmission: (deck: string) => (admitPlugins(deck, { defaults: [] }).active as { name: string }[]).map((g) => g.name) };
});
afterEach(() => {
	pg().LatticePlayground = undefined;
});

const DECK = '---\ntheme: indaco\n---\n\n# T\n\n```mermaid\nflowchart LR\n  A --> B\n```\n';

describe('OffFencesNotice', () => {
	it('names the fences and offers the action when their plugin is off', () => {
		render(<OffFencesNotice source={DECK} onWrite={() => {}} />);
		expect(document.querySelector('[data-off-fences-notice]')?.textContent).toContain('1 mermaid fence will ship as source');
		expect(screen.getByRole('button', { name: /^Turn on .+ for this deck$/ })).toBeTruthy();
	});

	it('shows nothing for a deck with no such fence, or with the plugin listed', () => {
		const { container, rerender } = render(<OffFencesNotice source={'# T\n\nNo fences.\n'} onWrite={() => {}} />);
		expect(container.innerHTML).toBe('');
		rerender(<OffFencesNotice source={DECK.replace('theme: indaco', 'theme: indaco\nplugins: [mermaid]')} onWrite={() => {}} />);
		expect(container.innerHTML).toBe('');
	});

	it('"Turn on" lists the plugin in the deck\'s front matter, keeping what was listed, and the notice goes', () => {
		let source = DECK.replace('theme: indaco', 'theme: indaco\nplugins: [math]');
		let label = '';
		const { container, rerender } = render(<OffFencesNotice source={source} onWrite={(l, fn) => { label = l; source = fn(source); }} />);
		fireEvent.click(screen.getByRole('button', { name: /^Turn on/ }));
		expect(label).toBe('Plugins → list mermaid');
		expect(source).toMatch(/^plugins: \[math, mermaid\]$/m);
		rerender(<OffFencesNotice source={source} onWrite={() => {}} />);
		expect(container.innerHTML).toBe('');
	});

	it('offers no button to a host that cannot edit the deck', () => {
		render(<OffFencesNotice source={DECK} />);
		expect(document.querySelector('[data-off-fences-notice]')).toBeTruthy();
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('re-reads when the host changes its plugin defaults with the panel open', () => {
		const { container } = render(<OffFencesNotice source={DECK} onWrite={() => {}} />);
		expect(container.innerHTML).not.toBe('');
		act(() => {
			pg().LatticePlayground = undefined;
			window.dispatchEvent(new Event('lattice:plugin-defaults'));
		});
		expect(container.innerHTML).toBe('');
	});
});
