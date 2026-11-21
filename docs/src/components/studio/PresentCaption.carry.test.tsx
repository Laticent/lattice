// The carried crawl (owner, 2026-11-20: the Star Wars opening text). Docked under the slide, the caption crawl keeps
// the sentences of the slide just left ABOVE the new slide's lines, so moving on scrolls the crawl on up instead of
// jumping it back to the top. Over the slide (closed captions) nothing is carried.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CaptionTrack } from '@/lib/cadenza';
import { PresentCaption } from './PresentCaption';

const track = (...sentences: string[]) => ({ cues: sentences.map((t) => ({ words: t.split(' ').map((w) => ({ display: w, spoken: w })) })) }) as unknown as CaptionTrack;
const lines = (c: HTMLElement) => [...c.querySelectorAll('.latt-cc-line')].map((l) => `${l.getAttribute('data-state')}:${l.textContent?.trim()}`);

describe('PresentCaption — the carried crawl', () => {
	it('keeps the slide just left above the new one, read, in order', () => {
		const a = track('First slide opens.', 'First slide closes.');
		const b = track('Second slide speaks.');
		const { container, rerender } = render(<PresentCaption track={a} active={{ cueIndex: 1, wordIndex: 2 }} carry />);
		rerender(<PresentCaption track={b} active={null} carry />);
		expect(lines(container)).toEqual(['read:First slide opens.', 'read:First slide closes.', 'now:Second slide speaks.']);
	});

	it('restarts the cursor on the new slide, so a latched cue from the last one never points into it', () => {
		const a = track('One.', 'Two.', 'Three.');
		const b = track('Only line.', 'Second line.');
		const { container, rerender } = render(<PresentCaption track={a} active={{ cueIndex: 2, wordIndex: 0 }} carry />);
		rerender(<PresentCaption track={b} active={null} carry />);
		expect(container.querySelector('.latt-cc-line[data-state="now"]')?.textContent?.trim()).toBe('Only line.');
	});

	it('keeps at most twelve read sentences', () => {
		const { container, rerender } = render(<PresentCaption track={track('s0.')} active={null} carry />);
		for (let i = 1; i <= 15; i++) rerender(<PresentCaption track={track(`s${i}.`)} active={null} carry />);
		expect(container.querySelectorAll('[data-past]').length).toBe(12);
	});

	it('carries nothing without `carry` (the closed captions over the slide)', () => {
		const { container, rerender } = render(<PresentCaption track={track('Gone.')} active={null} />);
		rerender(<PresentCaption track={track('Here.')} active={null} />);
		expect(lines(container)).toEqual(['now:Here.']);
	});
});
