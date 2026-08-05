import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Textarea } from './textarea';

// jsdom has no layout — `offsetWidth` is 0, so the measuring pass deliberately bails and
// the HEIGHT behavior can only be verified on a real surface (it was: the Studio composer
// grows 1→2→4 rows and clamps, in Chromium at a real panel width). What IS pinnable here
// is the part that silently breaks everything else: which growth mechanism is active.
describe('Textarea — autosize', () => {
	it('drops `field-sizing-content` when autosize is on, so CSS and JS cannot both set height', () => {
		const { container } = render(<Textarea autosize value="" onChange={() => {}} />);
		expect(container.querySelector('textarea')?.className).not.toContain('field-sizing-content');
	});

	it('keeps the CSS mechanism when autosize is OFF — that is shadcn\'s default and it is right where it works', () => {
		const { container } = render(<Textarea value="" onChange={() => {}} />);
		expect(container.querySelector('textarea')?.className).toContain('field-sizing-content');
	});

	it('measures nothing when the field has no layout yet, instead of freezing at a bogus height', () => {
		// The bug this guards: measuring while the panel is still closed wrote a height from a
		// meaningless scrollHeight, and nothing re-ran it because the value had not changed.
		const { container } = render(<Textarea autosize value="several lines of text" onChange={() => {}} />);
		expect(container.querySelector('textarea')?.style.height).toBe('');
	});

	it('forwards a ref while keeping its own handle on the element', () => {
		const seen: (HTMLTextAreaElement | null)[] = [];
		render(<Textarea autosize ref={(el) => seen.push(el)} value="" onChange={() => {}} />);
		expect(seen.some((el) => el instanceof HTMLTextAreaElement)).toBe(true);
	});
});
