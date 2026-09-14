import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SlideOverview } from './SlideOverview';

// The slide sorter renders one TILE per slide (the real engine render is stubbed — these assert
// the grid, the current marker, and jump/close wiring).
//
// The tile is the unit here, not the preview, and that changed with the pool (#1538). A tile no
// longer owns a `DeckPreview`: the previews live in a shared layer that mounts at most a few of
// them, for the tiles on screen, one throttled pass later. Counting rendered previews would now
// be counting the POOL's policy from the wrong module — `preview-pool.test.tsx` owns that, with
// the timers it needs — while this file's actual subject is that every slide gets a button, the
// current one is marked, and clicking one jumps and closes.
vi.mock('@/components/DeckPreview', () => ({
	default: ({ 'aria-label': label }: { 'aria-label'?: string }) => <div data-testid="thumb">{label}</div>,
}));

const options = { themeBase: '', runtimeUrl: '', engineUrl: '' };
const set = ['<!-- _class: title -->\n\n# One', '<!-- _class: kpi -->\n\n# Two', '<!-- _class: quote -->\n\n# Three'];

describe('SlideOverview — the slide sorter', () => {
	it('renders nothing when closed', () => {
		render(<SlideOverview open={false} onClose={() => {}} options={options} set={set} current={0} onJump={() => {}} />);
		expect(screen.queryByRole('dialog', { name: 'Slide overview' })).not.toBeInTheDocument();
	});

	it('renders a tile per slide and marks the current one', () => {
		render(<SlideOverview open onClose={() => {}} options={options} set={set} current={1} onJump={() => {}} />);
		expect(screen.getByText('All slides — 3')).toBeInTheDocument();
		expect(screen.getAllByRole('button', { name: /^Slide \d+$/ })).toHaveLength(3);
		// Slide 2 is current → its button carries aria-current.
		const slide2 = screen.getByRole('button', { name: 'Slide 2' });
		expect(slide2).toHaveAttribute('aria-current', 'true');
		expect(screen.getByRole('button', { name: 'Slide 1' })).not.toHaveAttribute('aria-current');
	});

	it('jumps to the clicked slide and closes', async () => {
		const user = userEvent.setup();
		const onJump = vi.fn();
		const onClose = vi.fn();
		render(<SlideOverview open onClose={onClose} options={options} set={set} current={0} onJump={onJump} />);
		await user.click(screen.getByRole('button', { name: 'Slide 3' }));
		expect(onJump).toHaveBeenCalledWith(2);
		expect(onClose).toHaveBeenCalled();
	});
});
