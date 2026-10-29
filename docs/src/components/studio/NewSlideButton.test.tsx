import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NewSlideButton } from './NewSlideButton';

// The split's lifetime (2026-10-27-slide-structure-strip.md §5): it closes when focus MOVES outside or a press lands
// outside, never because focus went nowhere.
describe('NewSlideButton — the Before | After split', () => {
	it('a tap on After still chooses After when the tap blurs it with no new focus (iOS Safari)', () => {
		// iOS does not focus a tapped button, so the autofocused After loses focus to nothing as the tap begins. Closing
		// the split on that blur unmounted the buttons before the click: "nothing happens after tapping After".
		const onChoose = vi.fn();
		render(<NewSlideButton variant="fab" onChoose={onChoose} />);
		fireEvent.click(screen.getByRole('button', { name: 'New slide' }));
		const after = screen.getByRole('button', { name: 'New slide after' });
		fireEvent.pointerDown(after);
		fireEvent.blur(after, { relatedTarget: null });
		fireEvent.click(screen.getByRole('button', { name: 'New slide after' }));
		expect(onChoose).toHaveBeenCalledWith('after');
	});

	it('a finger chooses on lift, without waiting for a click, and cancels the click that would follow', () => {
		const onChoose = vi.fn();
		render(<NewSlideButton variant="fab" onChoose={onChoose} />);
		fireEvent.click(screen.getByRole('button', { name: 'New slide' }));
		const before = screen.getByRole('button', { name: 'New slide before' });
		const r = before.getBoundingClientRect();
		const end = fireEvent.touchEnd(before, { changedTouches: [{ clientX: r.left, clientY: r.top }] });
		expect(onChoose).toHaveBeenCalledWith('before');
		expect(end).toBe(false); // preventDefault: no synthesized click lands on the pill coming back
	});

	it('a touch-opened split does not move focus; a mouse-opened one focuses After', async () => {
		render(<NewSlideButton variant="fab" onChoose={() => {}} />);
		const pill = screen.getByRole('button', { name: 'New slide' });
		fireEvent.touchStart(pill);
		fireEvent.click(pill, { detail: 1 });
		expect(document.activeElement?.getAttribute('aria-label')).not.toBe('New slide after');
		fireEvent.keyDown(screen.getByRole('button', { name: 'New slide after' }), { key: 'Escape' });
		await new Promise((r) => setTimeout(r, 850)); // past the touch, so the next click is a mouse's
		fireEvent.click(screen.getByRole('button', { name: 'New slide' }), { detail: 1 });
		expect(document.activeElement?.getAttribute('aria-label')).toBe('New slide after');
	});

	it('the click that opened the split does not close it', async () => {
		render(<NewSlideButton variant="fab" onChoose={() => {}} />);
		screen.getByRole('button', { name: 'New slide' }).click();
		await new Promise((r) => setTimeout(r, 20));
		expect(screen.getByRole('button', { name: 'New slide after' })).toBeTruthy();
	});

	it('a confirmation is a message, not a button: a tap on it does nothing', () => {
		const onChoose = vi.fn();
		const { container, rerender } = render(<NewSlideButton variant="fab" onChoose={onChoose} />);
		expect(screen.getByRole('button', { name: 'New slide' }).className).toContain('bg-[var(--accent)]');
		rerender(<NewSlideButton variant="fab" onChoose={onChoose} confirmation="Added after “Intro”" />);
		expect(screen.queryByRole('button')).toBeNull();
		const note = container.querySelector('[data-confirming]') as HTMLElement;
		expect(note.textContent).toContain('Added after “Intro”');
		expect(note.className).not.toContain('bg-[var(--accent)]');
		fireEvent.click(note);
		expect(container.querySelector('[data-split]')).toBeNull();
		expect(onChoose).not.toHaveBeenCalled();
		rerender(<NewSlideButton variant="fab" onChoose={onChoose} confirmation={null} />);
		expect(screen.getByRole('button', { name: 'New slide' })).toBeTruthy();
	});

	it('says what each half does in words', () => {
		render(<NewSlideButton variant="fab" onChoose={() => {}} />);
		fireEvent.click(screen.getByRole('button', { name: 'New slide' }));
		expect(screen.getByRole('button', { name: 'New slide before' }).textContent).toBe('Before this slide');
		expect(screen.getByRole('button', { name: 'New slide after' }).textContent).toBe('After this slide');
	});

	it('closes when focus moves outside, or a click lands outside', async () => {
		render(
			<>
				<NewSlideButton variant="fab" onChoose={() => {}} />
				<button type="button">elsewhere</button>
			</>,
		);
		fireEvent.click(screen.getByRole('button', { name: 'New slide' }));
		fireEvent.blur(screen.getByRole('button', { name: 'New slide after' }), { relatedTarget: screen.getByRole('button', { name: 'elsewhere' }) });
		expect(screen.queryByRole('button', { name: 'New slide after' })).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'New slide' }));
		await new Promise((r) => setTimeout(r, 20));
		fireEvent.click(screen.getByRole('button', { name: 'elsewhere' }));
		expect(screen.queryByRole('button', { name: 'New slide after' })).toBeNull();
	});
});
