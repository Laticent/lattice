import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { describedPart, Tip } from './tooltip';

// What a `Tip` hint adds to its trigger's name, which is what a screen reader hears as the
// DESCRIPTION after the name (ui/tooltip.tsx). A hint that only repeats the name describes nothing.
describe('describedPart', () => {
	it('drops a hint that only repeats the name', () => {
		expect(describedPart('Share', 'Share')).toBe(null);
		expect(describedPart('  send   feedback ', 'Send feedback')).toBe(null);
	});
	it('keeps only what follows the name and a separator', () => {
		expect(describedPart('Version history — save & restore snapshots', 'Version history')).toBe('save & restore snapshots');
		expect(describedPart('Settings: deck and slide', 'Settings')).toBe('deck and slide');
		expect(describedPart('Present (P)', 'Present')).toBe('(P)');
	});
	it('needs a space before a hyphen to treat it as a separator', () => {
		expect(describedPart('Re-run the check', 'Re')).toBe('Re-run the check');
		expect(describedPart('Rerun - again from the top', 'Rerun')).toBe('again from the top');
	});
	it('keeps the whole hint when the name is not its opening word', () => {
		expect(describedPart('Slides overview', 'Slide')).toBe('Slides overview');
		expect(describedPart('Coach — deck fixes', 'Toggle Coach')).toBe('Coach — deck fixes');
	});
	it('keeps a hint it cannot compare', () => {
		expect(describedPart('anything', undefined)).toBe('anything');
	});
});

// The wiring: the trigger is described by a hidden copy of the hint while it is CLOSED, so a
// screen reader hears the same thing however focus arrived (a VoiceOver swipe opens no tooltip).
// The copy carries the hint in `aria-label` (see ui/tooltip.tsx), which jsdom's accessible-description
// library does not resolve through a reference, so this reads the wiring itself: each id the
// trigger names, and the text that element gives a screen reader. Chromium's computed tree is
// checked in e2e/studio-descriptions.spec.ts.
function describedAs(el: HTMLElement): string {
	return (el.getAttribute('aria-describedby') ?? '')
		.split(/\s+/)
		.filter(Boolean)
		.map((id) => {
			const ref = document.getElementById(id);
			return ref?.getAttribute('aria-label') ?? ref?.textContent ?? `[missing #${id}]`;
		})
		.join(' ');
}

describe('Tip description', () => {
	it('describes a closed trigger by what the hint adds to its name', () => {
		render(<Tip label="Version history — save & restore snapshots"><button type="button" aria-label="Version history" /></Tip>);
		expect(screen.queryByRole('tooltip')).toBeNull();
		expect(describedAs(screen.getByRole('button', { name: 'Version history' }))).toBe('save & restore snapshots');
	});
	it('gives a hint that only repeats the name no description', () => {
		render(<Tip label="Share"><button type="button" aria-label="Share" /></Tip>);
		const button = screen.getByRole('button', { name: 'Share' });
		expect(button).not.toHaveAttribute('aria-describedby');
	});
	it('reads the name through asChild wrappers', () => {
		// Forwards its props to its one child, as a Radix `asChild` trigger does (`<DropdownMenuTrigger asChild>`).
		const Wrap = ({ children, ...rest }: { children: React.ReactElement }) => React.cloneElement(children, rest);
		render(<Tip label="Refine selection"><Wrap><button type="button" aria-label="Refine selection" /></Wrap></Tip>);
		expect(screen.getByRole('button', { name: 'Refine selection' })).not.toHaveAttribute('aria-describedby');
		render(<Tip label="Theme — the deck's palette"><Wrap><button type="button" aria-label="Theme" /></Wrap></Tip>);
		expect(describedAs(screen.getByRole('button', { name: 'Theme' }))).toBe("the deck's palette");
	});
	it('compares a hint with the visible text when the trigger has no aria-label', () => {
		render(<Tip label="Save"><button type="button">Save</button></Tip>);
		expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute('aria-describedby');
	});
	it('leaves no hint text for a text search to find', () => {
		render(<Tip label="Coach — deterministic deck assessment"><button type="button" aria-label="Toggle Coach" /></Tip>);
		expect(screen.queryByText(/deterministic/)).toBeNull();
	});
	it('removes its copy on unmount', () => {
		const { unmount } = render(<Tip label="Theme — the palette"><button type="button" aria-label="Theme" /></Tip>);
		const id = screen.getByRole('button', { name: 'Theme' }).getAttribute('aria-describedby') as string;
		expect(document.getElementById(id)).not.toBeNull();
		unmount();
		expect(document.getElementById(id)).toBeNull();
	});
	it('keeps another describer beside the hint', () => {
		render(
			<>
				<span id="count">3 issues</span>
				<Tip label="Coach — deck fixes" alsoDescribedBy="count"><button type="button" aria-label="Toggle Coach" /></Tip>
			</>,
		);
		expect(describedAs(screen.getByRole('button', { name: 'Toggle Coach' }))).toBe('Coach — deck fixes 3 issues');
	});
});
