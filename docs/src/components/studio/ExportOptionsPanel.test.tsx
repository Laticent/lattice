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
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: false, commentScope: 'all', embedSource: false });
	});

	it('opting in exports with comments and the chosen scope', () => {
		addComment(DECK, 1, 'keep');
		const onExport = vi.fn();
		render(<ExportOptionsPanel deckId={DECK} onBack={() => {}} onExport={onExport} />);
		fireEvent.click(screen.getByRole('switch', { name: /add comments as sticky notes/i }));
		// Scope control appears once comments are on; pick "Open only".
		fireEvent.click(screen.getByRole('radio', { name: 'Open only' }));
		fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: true, commentScope: 'open', embedSource: false });
	});

	it('with no comments, the toggle is disabled and export carries none', () => {
		const onExport = vi.fn();
		render(<ExportOptionsPanel deckId={DECK} onBack={() => {}} onExport={onExport} />);
		expect(screen.getByRole('switch', { name: /add comments as sticky notes/i })).toBeDisabled();
		expect(screen.getByText(/no comments on this deck yet/i)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: false, commentScope: 'all', embedSource: false });
	});

	it('re-openable is OFF by default, and opting in is remembered for THIS deck only', () => {
		const onExport = vi.fn();
		const first = render(<ExportOptionsPanel deckId={DECK} onBack={() => {}} onExport={onExport} />);
		const sw = screen.getByRole('switch', { name: /re-openable in lattice/i });
		// Off by default: the source carries speaker notes and hidden slides.
		expect(sw).toHaveAttribute('aria-checked', 'false');
		fireEvent.click(sw);
		fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
		expect(onExport).toHaveBeenLastCalledWith({ commentsInPdf: false, commentScope: 'all', embedSource: true });
		first.unmount();
		// The same deck opens the step with the switch on…
		const again = render(<ExportOptionsPanel deckId={DECK} onBack={() => {}} onExport={onExport} />);
		expect(screen.getByRole('switch', { name: /re-openable in lattice/i })).toHaveAttribute('aria-checked', 'true');
		again.unmount();
		// …and another deck does not inherit it.
		render(<ExportOptionsPanel deckId="another-deck" onBack={() => {}} onExport={onExport} />);
		expect(screen.getByRole('switch', { name: /re-openable in lattice/i })).toHaveAttribute('aria-checked', 'false');
	});

	it('PowerPoint shows only the re-openable switch, and never asks for comments', () => {
		addComment(DECK, 1, 'A private review note');
		const onExport = vi.fn();
		render(<ExportOptionsPanel format="pptx" deckId={DECK} onBack={() => {}} onExport={onExport} />);
		expect(screen.queryByRole('switch', { name: /sticky notes/i })).toBeNull();
		fireEvent.click(screen.getByRole('switch', { name: /re-openable in lattice/i }));
		fireEvent.click(screen.getByRole('button', { name: /download powerpoint/i }));
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: false, commentScope: 'all', embedSource: true });
	});

	it('Back returns to the format list', () => {
		const onBack = vi.fn();
		render(<ExportOptionsPanel deckId={DECK} onBack={onBack} onExport={() => {}} />);
		fireEvent.click(screen.getByRole('button', { name: /all formats/i }));
		expect(onBack).toHaveBeenCalled();
	});
});
