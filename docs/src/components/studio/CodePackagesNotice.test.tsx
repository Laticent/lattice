// The consent strip for plugins (CodePackagesNotice.tsx): the plugin the deck lists but this browser has not
// approved, and the plugin the deck writes a fence for but does not list (plugin-system §9 decision 11).
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codePackagesStamp, isPluginApproved, setPlugins, studioPlugins } from '@/lib/code-packages/door';
import { CodePackagesNotice } from './CodePackagesNotice';

const CODE = 'function render(){return "<p>x</p>"}\nexport { render as default };';
const LISTED = '---\nplugins: [gantt-plugin]\n---\n\n## Plan\n\n```gantt\nA 1\n```\n';
const UNLISTED = '---\ntheme: indaco\n---\n\n## Plan\n\n```gantt\nA 1\n```\n';

beforeEach(async () => {
	localStorage.clear();
	await setPlugins([{ name: 'gantt-plugin', fence: 'gantt', code: CODE }]);
});
afterEach(async () => {
	await setPlugins([]);
});

describe('the strip for a zip plugin', () => {
	it('a listed plugin that is not approved says so, names the plugin, and Run it records the approval', () => {
		let approved = 0;
		render(<CodePackagesNotice source={LISTED} stamp={codePackagesStamp()} onApproved={() => approved++} />);
		const strip = screen.getByRole('status');
		expect(strip.getAttribute('data-state')).toBe('unapproved');
		expect(strip.textContent).toContain('This deck uses code from the plugin “gantt-plugin”, which has not run.');
		fireEvent.click(screen.getByRole('button', { name: 'Run the code of gantt-plugin' }));
		expect(approved).toBe(1);
		expect(isPluginApproved(studioPlugins().get('gantt-plugin') as never)).toBe(true);
	});

	it('an unlisted plugin whose fence the deck writes is offered: Approve writes the plugins: line AND records the approval', () => {
		let source = UNLISTED;
		let approved = 0;
		render(<CodePackagesNotice source={source} stamp={codePackagesStamp()} onApproved={() => approved++} onWrite={(_label, update) => { source = update(source); }} />);
		const strip = screen.getByRole('status');
		expect(strip.getAttribute('data-state')).toBe('offered');
		expect(strip.textContent).toContain('The plugin “gantt-plugin” can draw the ```gantt block in this deck.');
		fireEvent.click(screen.getByRole('button', { name: 'Approve the plugin gantt-plugin' }));
		expect(source).toMatch(/^---\ntheme: indaco\nplugins: \[gantt-plugin\]\n---\n/);
		expect(approved).toBe(1);
		expect(isPluginApproved(studioPlugins().get('gantt-plugin') as never)).toBe(true);
	});

	it('a deck that writes no such fence is offered nothing, and one that already lists the plugin is not offered it again', () => {
		const { container, rerender } = render(<CodePackagesNotice source={'---\ntheme: indaco\n---\n\n## Plain\n'} stamp={codePackagesStamp()} onApproved={() => {}} onWrite={() => {}} />);
		expect(container.querySelector('[data-state="offered"]')).toBeNull();
		rerender(<CodePackagesNotice source={LISTED} stamp={codePackagesStamp()} onApproved={() => {}} onWrite={() => {}} />);
		expect(container.querySelector('[data-state="offered"]')).toBeNull();
	});

	it('the details name the code, its size and its digest, and say what Approve does', () => {
		render(<CodePackagesNotice source={UNLISTED} stamp={codePackagesStamp()} onApproved={() => {}} onWrite={() => {}} />);
		fireEvent.click(screen.getByRole('button', { name: 'What it is' }));
		const detail = document.querySelector('[data-slot="code-packages-detail"]')?.textContent ?? '';
		expect(detail).toMatch(/gantt-plugin\.render\.js \(the ```gantt fence\), [\d,]+ bytes, sha256 [0-9a-f]{64}/);
		expect(detail).toContain('adds gantt-plugin to the deck');
	});
});
