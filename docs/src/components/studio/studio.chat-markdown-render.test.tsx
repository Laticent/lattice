import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __clearPendingNotices, ArchitectChat } from './ArchitectChat';
import { saveChat } from './studio-store';

// The prose sanitizer's tag profile must keep EXACTLY what chat-markdown.ts emits. A tag
// the renderer produces and the profile lacks is silently flattened to its text — a table
// became a run of words, a numbered list lost its start.

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

describe('Architect chat — rendered Markdown survives sanitizing', () => {
	it('keeps tables, list starts, quotes and rules, and still strips script', () => {
		saveChat('d', [
			{ role: 'user', content: 'score it' },
			{ role: 'assistant', content: '| Dimension | Score |\n|---|--:|\n| Argument | 9.5 |\n\n3. third\n4. fourth\n\n> note\n\n---\n\n<script>alert(1)</script>' },
		]);
		const { container } = render(<ArchitectChat deckId="d" source="# One" aiReady onApply={() => {}} onConnect={() => {}} />);
		expect(screen.getByRole('table')).toBeTruthy();
		expect(container.querySelector('th.cm-al-r')?.textContent).toBe('Score');
		expect(container.querySelector('ol[start="3"]')).toBeTruthy();
		expect(container.querySelector('blockquote')?.textContent).toContain('note');
		expect(container.querySelector('hr')).toBeTruthy();
		expect(container.querySelector('script')).toBeNull();
	});
});
