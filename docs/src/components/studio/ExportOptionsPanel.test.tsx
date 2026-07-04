import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportOptionsPanel } from './ExportOptionsPanel';
import { addComment } from './slide-comments';

const DECK = 'deck-panel';

beforeEach(() => localStorage.clear());

describe('ExportOptionsPanel', () => {
	it('defaults comments OFF and exports a clean PDF (no annotations) when untouched', () => {
		addComment(DECK, 1, 'A private review note');
		const onExport = vi.fn();
		render(<ExportOptionsPanel deckId={DECK} onBack={() => {}} onExport={onExport} />);
		// The toggle exists (deck has comments) but is off by default — a shared PDF
		// never leaks review notes unless the author opts in.
		expect(screen.getByRole('switch', { name: /add comments as sticky notes/i })).toHaveAttribute('aria-checked', 'false');
		fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: false, commentScope: 'all' });
	});

	it('opting in exports with comments and the chosen scope', () => {
		addComment(DECK, 1, 'keep');
		const onExport = vi.fn();
		render(<ExportOptionsPanel deckId={DECK} onBack={() => {}} onExport={onExport} />);
		fireEvent.click(screen.getByRole('switch', { name: /add comments as sticky notes/i }));
		// Scope control appears once comments are on; pick "Open only".
		fireEvent.click(screen.getByRole('radio', { name: 'Open only' }));
		fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: true, commentScope: 'open' });
	});

	it('with no comments, the toggle is disabled and export carries none', () => {
		const onExport = vi.fn();
		render(<ExportOptionsPanel deckId={DECK} onBack={() => {}} onExport={onExport} />);
		expect(screen.getByRole('switch', { name: /add comments as sticky notes/i })).toBeDisabled();
		expect(screen.getByText(/no comments on this deck yet/i)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: false, commentScope: 'all' });
	});

	it('Back returns to the format list', () => {
		const onBack = vi.fn();
		render(<ExportOptionsPanel deckId={DECK} onBack={onBack} onExport={() => {}} />);
		fireEvent.click(screen.getByRole('button', { name: /all formats/i }));
		expect(onBack).toHaveBeenCalled();
	});
});
