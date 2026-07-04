import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresentOverlay } from './PresentOverlay';

// Present autoplay wiring: an "Auto" toggle in read-aloud mode that starts the
// read-aloud transport (which then chains across slides on each natural finish).
// The cross-slide chain is timer-driven and verified visually; here we assert the
// toggle exists, flips state, and actually engages the reader.

vi.mock('@/components/DeckPreview', () => ({ default: () => <div data-testid="dp" /> }));
vi.mock('@/playground/voice-model.js', () => ({
	createVoiceModel: () => ({ speak() {}, stop() {}, pause() {}, resume() {}, rung: () => 'silent' }),
}));
// The presenter stage doc needs the engine — stub it out (it's best-effort anyway).
vi.mock('./studio-presenter', () => ({ buildPresenterStageDoc: vi.fn(async () => ({ doc: '', total: 0 })) }));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };
const slides = ['<!-- _class: title -->\n\n# One\n\nThe first slide has some spoken prose.', '<!-- _class: kpi -->\n\n# Two\n\nThe second slide also reads aloud.'];

afterEach(() => {
	document.documentElement.removeAttribute('data-palette');
	vi.clearAllMocks();
});

describe('Present — read-aloud autoplay toggle', () => {
	it('shows the Auto toggle and engages the reader when turned on', async () => {
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={() => {}} />);
		// Starts idle on slide 1 of 2; the read-aloud play control is in its Play state.
		expect(screen.getByText('1 / 2')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Play read-aloud' })).toBeInTheDocument();
		const auto = screen.getByRole('button', { name: 'Autoplay' });
		expect(auto).toHaveAttribute('aria-pressed', 'false');
		// Turning Auto on starts the read-aloud transport (play control flips to Pause).
		await user.click(auto);
		expect(auto).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByRole('button', { name: 'Pause read-aloud' })).toBeInTheDocument();
		// Turning it off stops the transport again.
		await user.click(auto);
		expect(auto).toHaveAttribute('aria-pressed', 'false');
		expect(screen.getByRole('button', { name: 'Play read-aloud' })).toBeInTheDocument();
	});

	it('Rehearse and Autoplay are mutually exclusive transports', async () => {
		const user = userEvent.setup();
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} notify={() => {}} />);
		await user.click(screen.getByRole('button', { name: 'Autoplay' }));
		expect(screen.getByRole('button', { name: 'Autoplay' })).toHaveAttribute('aria-pressed', 'true');
		// Switching into Rehearse clears autoplay (the Auto pill leaves read-aloud mode).
		await user.click(screen.getByRole('button', { name: 'Rehearse' }));
		expect(screen.queryByRole('button', { name: 'Autoplay' })).not.toBeInTheDocument();
	});
});
