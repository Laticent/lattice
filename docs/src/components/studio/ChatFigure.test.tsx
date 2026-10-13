import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatFigure, ChatFigureContext, type ChatFigureRender } from './ChatFigure';

// The pool draws; this file proves what it is ASKED to draw and what the author can do about it.
// The real pool, frames and engine are exercised by docs/e2e/chat-polish.spec.ts.

const asked = vi.hoisted(() => vi.fn());
vi.mock('./preview-pool', () => ({
	PooledThumbFace: (p: { sample: string }) => {
		asked(p);
		return <div data-testid="tile" data-sample={p.sample} />;
	},
}));

const ctx: ChatFigureRender = { options: { themeBase: '', runtimeUrl: '', engineUrl: '' }, palette: 'indaco', mode: 'dark', frontMatter: '---\ntheme: indaco\n---\n\n' };

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('ChatFigure', () => {
	it('asks the pool for a one-slide deck in the open deck\'s theme and mode', () => {
		render(
			<ChatFigureContext.Provider value={ctx}>
				<ChatFigure lang="mermaid" code={'flowchart LR\n A-->B'} />
			</ChatFigureContext.Provider>,
		);
		expect(screen.getByTestId('tile').getAttribute('data-sample')).toContain('```mermaid\nflowchart LR\n A-->B\n```');
		expect(asked.mock.calls[0][0]).toMatchObject({ paletteOverride: 'indaco', modeOverride: 'dark', specimen: true });
	});

	it('flips to the source and back, so the reply\'s own fence is never out of reach', async () => {
		const user = userEvent.setup();
		render(
			<ChatFigureContext.Provider value={ctx}>
				<ChatFigure lang="math" code="E = mc^2" />
			</ChatFigureContext.Provider>,
		);
		await user.click(screen.getByRole('button', { name: 'Show the equation source' }));
		expect(screen.queryByTestId('tile')).toBeNull();
		expect(screen.getByText('E = mc^2')).toBeTruthy();
		await user.click(screen.getByRole('button', { name: 'Show the equation' }));
		expect(screen.getByTestId('tile')).toBeTruthy();
	});

	it('falls back to a code block when the host gave no render context', () => {
		render(<ChatFigure lang="mermaid" code="flowchart LR" />);
		expect(screen.queryByTestId('tile')).toBeNull();
		expect(screen.getByText('flowchart LR')).toBeTruthy();
	});

	it('falls back to a code block for a figure too large to draw', () => {
		render(
			<ChatFigureContext.Provider value={ctx}>
				<ChatFigure lang="mermaid" code={'x'.repeat(9000)} />
			</ChatFigureContext.Provider>,
		);
		expect(screen.queryByTestId('tile')).toBeNull();
	});
});
