import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PresentOverlay } from './PresentOverlay';

// Present's GREETING and CLOSING (engineering/decisions/2026-09-27-narration-bookends.md).
//
// Driven on the silent rung, as the autoplay-chain test is, with the between-slide beat at 0.
// The deck opens on a SILENT title slide and ends on a SILENT closing slide — the shape the
// feature exists for, and the one the checker caught: over a silent slide 1 the empty-slide skip
// used to advance the moment the greeting ended, and the greeting's gap timer then started slide
// 2 before its own beat.

vi.mock('@/components/DeckPreview', () => ({ default: () => <div data-testid="dp" /> }));
vi.mock('@/playground/voice-model.js', () => ({
	createVoiceModel: () => ({ synthOne: async () => ({ rung: 'silent', bytes: null, key: 'k' }), speakThis() {}, stop() {}, pause() {}, resume() {}, rung: () => 'silent', warm: () => {} }),
}));
vi.mock('./studio-stage', () => ({ buildStageDocument: vi.fn(async () => ({ doc: '', total: 0 })) }));
vi.mock('./narration-projection', () => ({ projectDeckScript: () => new Promise(() => {}) }));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };
const FM = '---\ngreeting: "{greeting}, everyone."\nclosing: "Thank you, and goodbye."\n---\n';
const silent = '<!-- _class: title -->';
const spoken = (heading: string, line: string) => `# ${heading}\n\n<!-- say: ${line} -->`;

let hours: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	localStorage.setItem('lattice-present-pace', 'brisk');
	localStorage.setItem('lattice-present-slide-beat', '0');
	hours = vi.spyOn(Date.prototype, 'getHours').mockReturnValue(15);
});
afterEach(() => {
	localStorage.clear();
	hours.mockRestore();
	vi.clearAllMocks();
});

const said = () => document.body.textContent ?? '';

describe('Present — greeting and closing', () => {
	it('greets over a silent title slide, waits, then chains the deck and closes once', async () => {
		const user = userEvent.setup();
		const slides = [silent, spoken('Two', 'The middle speaks.'), silent];
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} frontMatter={FM} />);
		await user.click(screen.getByRole('button', { name: 'Play the presentation' }));

		await waitFor(() => expect(said()).toContain('Good afternoon, everyone.'), { timeout: 5_000 });
		// The greeting is spoken ON slide 1, and slide 2 must not arrive until it has finished.
		expect(screen.getByText('1 / 3')).toBeInTheDocument();
		await waitFor(() => expect(screen.getByText('2 / 3')).toBeInTheDocument(), { timeout: 10_000 });
		expect(said()).not.toContain('Good afternoon, everyone.');
		await waitFor(() => expect(said()).toContain('The middle speaks.'), { timeout: 5_000 });
		// Autoplay onto the silent last slide says the closing, then the delivery ends.
		await waitFor(() => expect(said()).toContain('Thank you, and goodbye.'), { timeout: 10_000 });
		expect(screen.getByText('3 / 3')).toBeInTheDocument();
		await waitFor(() => expect(screen.getByRole('button', { name: 'Play the presentation' })).toBeInTheDocument(), { timeout: 10_000 });
	}, 40_000);

	it('starting on slide 2 uses the greeting up', async () => {
		const user = userEvent.setup();
		const slides = [spoken('One', 'One speaks.'), spoken('Two', 'Two speaks.')];
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} frontMatter={FM} />);
		await user.click(screen.getAllByRole('button', { name: 'Next slide' })[0]);
		await waitFor(() => expect(screen.getByText('2 / 2')).toBeInTheDocument());
		await user.click(screen.getByRole('button', { name: 'Play the presentation' }));
		await waitFor(() => expect(said()).toContain('Two speaks.'), { timeout: 5_000 });
		expect(said()).not.toContain('Good afternoon');
	}, 20_000);

	it('does not repeat what the slides already say: no greeting after "Welcome", no closing after "Thank you"', async () => {
		const user = userEvent.setup();
		const slides = [spoken('One', 'Welcome to the review.'), spoken('Two', 'Thank you all.')];
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} frontMatter={FM} />);
		// Sample the band through the whole run: a closing that played and cleared before the last
		// assertion would otherwise leave no trace.
		const seen: string[] = [];
		const sample = setInterval(() => seen.push(said()), 25);
		await user.click(screen.getByRole('button', { name: 'Play the presentation' }));
		await waitFor(() => expect(said()).toContain('Welcome to the review.'), { timeout: 5_000 });
		expect(said()).not.toContain('Good afternoon');
		await waitFor(() => expect(screen.getByText('2 / 2')).toBeInTheDocument(), { timeout: 10_000 });
		await waitFor(() => expect(screen.getByRole('button', { name: 'Play the presentation' })).toBeInTheDocument(), { timeout: 10_000 });
		// Let a closing that would follow the gap have its chance to appear.
		await new Promise((r) => setTimeout(r, 1500));
		clearInterval(sample);
		expect(seen.some((t) => t.includes('Thank you, and goodbye.'))).toBe(false);
		expect(seen.some((t) => t.includes('Good afternoon'))).toBe(false);
	}, 30_000);
});
