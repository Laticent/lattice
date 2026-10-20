import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __clearPendingNotices, ArchitectChat } from './ArchitectChat';
import { saveChat } from './studio-store';

// Live (engineering/decisions/2026-10-20-live-uniform-experience.md §5.3): an AI chat turn reaches the
// session only when its owner presses Share, and the panel says only that a turn is in flight.

vi.mock('./architect', () => ({
	chatComplete: vi.fn(),
	useArchitectStatus: () => ({ ready: true, generation: 'openrouter', modelName: 'test', remaining: null, price: null }),
	applyProposedEditsChecked: () => ({ source: '', applied: 0, refusals: [] }),
	estimateUsd: () => 0,
	CHAT_OUTPUT_EST: 4096,
	chatSystemTokens: () => 0,
	agentTurnUsd: () => null,
	CHAT_MAX_TOKENS: 16384,
	architectSpend: () => ({ total: 0, session: 0, totalTokens: 0, sessionTokens: 0, cap: 0, mode: 'alert', status: { level: 'ok', blocked: false, message: null } }),
}));

beforeEach(() => {
	localStorage.clear();
	__clearPendingNotices();
});
afterEach(cleanup);

describe('Architect chat in a live session', () => {
	it('offers Share on a finished turn only inside a session, and shares exactly that question and answer', () => {
		saveChat('d', [
			{ role: 'user', content: 'Make slide 3 punchier' },
			{ role: 'assistant', content: 'Here is a tighter headline.' },
		]);
		const { unmount } = render(<ArchitectChat deckId="d" source="# One" aiReady onApply={() => {}} onConnect={() => {}} />);
		expect(document.querySelector('[data-live-share-turn]')).toBeNull();
		unmount();
		const shared: Array<{ ask: string; answer: string }> = [];
		render(<ArchitectChat deckId="d" source="# One" aiReady onApply={() => {}} onConnect={() => {}} onShareTurn={(t) => shared.push(t)} />);
		fireEvent.click(screen.getByRole('button', { name: /Share with the session/ }));
		expect(shared).toEqual([{ ask: 'Make slide 3 punchier', answer: 'Here is a tighter headline.' }]);
		expect(document.querySelector('[data-live-share-turn]')).toBeNull();
		expect(screen.getByText('Shared with the session')).toBeTruthy();
	});

	it('reports idle when it mounts and when it goes away', () => {
		const busy: boolean[] = [];
		const { unmount } = render(<ArchitectChat deckId="d" source="# One" aiReady onApply={() => {}} onConnect={() => {}} onBusyChange={(b) => busy.push(b)} />);
		unmount();
		expect(busy).toEqual([false, false]);
	});
});
