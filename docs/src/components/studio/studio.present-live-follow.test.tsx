import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PresentOverlay } from './PresentOverlay';

// Live (engineering/decisions/2026-10-20-live-uniform-experience.md §7.2): a member's Present that the room
// opened follows the presenter until the member moves on their own, and starts following again each time it
// reopens. The reopen case is the one a first cut broke: the overlay stays mounted after its first open, and
// the open transition moved through the detaching setter, so every presentation after a member's first
// showed "Rejoin" on the wrong slide.

vi.mock('@/components/DeckPreview', () => ({ default: () => <div data-testid="dp" /> }));
vi.mock('@/playground/voice-model.js', () => ({
	createVoiceModel: () => ({ synthOne: async () => ({ rung: 'silent', bytes: null, key: 'k' }), speakThis() {}, stop() {}, pause() {}, resume() {}, rung: () => 'silent', warm: vi.fn() }),
}));
vi.mock('./studio-stage', () => ({ buildStageDocument: vi.fn(async () => ({ doc: '', total: 0 })) }));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };
const slides = ['# One', '# Two', '# Three', '# Four'];
const follow = (idx: number) => ({ idx, page: 0, lens: 'full', by: 'Sharmarke' });
const live = (idx: number) => ({ follow: follow(idx), inertKeys: true });

afterEach(() => vi.clearAllMocks());

describe('Present — following a live presentation', () => {
	it('opens where the presenter is, and moves with them', () => {
		const { rerender } = render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} live={live(2)} />);
		expect(screen.getByText('3 / 4')).toBeInTheDocument();
		expect(screen.getByText('Following Sharmarke')).toBeInTheDocument();
		rerender(<PresentOverlay open onClose={() => {}} options={options} slides={slides} live={live(3)} />);
		expect(screen.getByText('4 / 4')).toBeInTheDocument();
	});

	it('still follows when the room opens it again after it was closed', () => {
		const { rerender } = render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} live={live(1)} />);
		rerender(<PresentOverlay open={false} onClose={() => {}} options={options} slides={slides} />);
		rerender(<PresentOverlay open onClose={() => {}} options={options} slides={slides} live={live(2)} />);
		expect(screen.getByText('3 / 4')).toBeInTheDocument();
		expect(screen.getByText('Following Sharmarke')).toBeInTheDocument();
		expect(document.querySelector('[data-live-rejoin]')).toBeNull();
	});

	it('swallows keys until the member clicks in, then a key of their own detaches them and Rejoin brings them back', () => {
		const { rerender } = render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} live={live(1)} />);
		const early = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
		act(() => {
			window.dispatchEvent(early);
		});
		expect(early.defaultPrevented).toBe(true);
		expect(screen.getByText('2 / 4')).toBeInTheDocument();
		act(() => {
			window.dispatchEvent(new Event('pointerdown'));
		});
		fireEvent.keyDown(window, { key: 'ArrowRight' });
		expect(screen.getByText('3 / 4')).toBeInTheDocument();
		const rejoin = document.querySelector<HTMLButtonElement>('[data-live-rejoin]');
		expect(rejoin?.textContent).toContain('Rejoin Sharmarke');
		// Detached: the presenter moving does not move them.
		rerender(<PresentOverlay open onClose={() => {}} options={options} slides={slides} live={live(0)} />);
		expect(screen.getByText('3 / 4')).toBeInTheDocument();
		fireEvent.click(rejoin as HTMLButtonElement);
		expect(screen.getByText('1 / 4')).toBeInTheDocument();
	});

	it('says so, rather than "Following", when the presenter is on a view this deck cannot show', () => {
		render(<PresentOverlay open onClose={() => {}} options={options} slides={slides} live={{ follow: { ...follow(1), lens: 'brief' }, inertKeys: false }} />);
		expect(screen.getByText("Sharmarke is on a view this deck can't show")).toBeInTheDocument();
		expect(screen.queryByText('Following Sharmarke')).toBeNull();
	});
});
