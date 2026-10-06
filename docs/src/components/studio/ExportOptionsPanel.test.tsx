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
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: false, commentScope: 'all', embedSource: false, editable: false });
	});

	it('opting in exports with comments and the chosen scope', () => {
		addComment(DECK, 1, 'keep');
		const onExport = vi.fn();
		render(<ExportOptionsPanel deckId={DECK} onBack={() => {}} onExport={onExport} />);
		fireEvent.click(screen.getByRole('switch', { name: /add comments as sticky notes/i }));
		// Scope control appears once comments are on; pick "Open only".
		fireEvent.click(screen.getByRole('radio', { name: 'Open only' }));
		fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: true, commentScope: 'open', embedSource: false, editable: false });
	});

	it('with no comments, the toggle is disabled and export carries none', () => {
		const onExport = vi.fn();
		render(<ExportOptionsPanel deckId={DECK} onBack={() => {}} onExport={onExport} />);
		expect(screen.getByRole('switch', { name: /add comments as sticky notes/i })).toBeDisabled();
		expect(screen.getByText(/no comments on this deck yet/i)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: false, commentScope: 'all', embedSource: false, editable: false });
	});

	it('re-openable is OFF by default, and opting in is remembered for THIS deck only', () => {
		const onExport = vi.fn();
		const first = render(<ExportOptionsPanel deckId={DECK} onBack={() => {}} onExport={onExport} />);
		const sw = screen.getByRole('switch', { name: /re-openable in lattice/i });
		// Off by default: the source carries speaker notes and hidden slides.
		expect(sw).toHaveAttribute('aria-checked', 'false');
		fireEvent.click(sw);
		fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
		expect(onExport).toHaveBeenLastCalledWith({ commentsInPdf: false, commentScope: 'all', embedSource: true, editable: false });
		first.unmount();
		// The same deck opens the step with the switch on…
		const again = render(<ExportOptionsPanel deckId={DECK} onBack={() => {}} onExport={onExport} />);
		expect(screen.getByRole('switch', { name: /re-openable in lattice/i })).toHaveAttribute('aria-checked', 'true');
		again.unmount();
		// …and another deck does not inherit it.
		render(<ExportOptionsPanel deckId="another-deck" onBack={() => {}} onExport={onExport} />);
		expect(screen.getByRole('switch', { name: /re-openable in lattice/i })).toHaveAttribute('aria-checked', 'false');
	});

	it('PowerPoint offers editable text and re-openable, and never asks for comments', () => {
		addComment(DECK, 1, 'A private review note');
		const onExport = vi.fn();
		render(<ExportOptionsPanel format="pptx" deckId={DECK} onBack={() => {}} onExport={onExport} />);
		expect(screen.queryByRole('switch', { name: /sticky notes/i })).toBeNull();
		fireEvent.click(screen.getByRole('switch', { name: /re-openable in lattice/i }));
		fireEvent.click(screen.getByRole('button', { name: /download powerpoint/i }));
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: false, commentScope: 'all', embedSource: true, editable: false });
	});

	it('PowerPoint: editable text is OFF by default and rides into the export when switched on', () => {
		const onExport = vi.fn();
		render(<ExportOptionsPanel format="pptx" deckId={DECK} onBack={() => {}} onExport={onExport} />);
		const sw = screen.getByRole('switch', { name: /editable text/i });
		expect(sw.getAttribute('aria-checked')).toBe('false');
		fireEvent.click(sw);
		fireEvent.click(screen.getByRole('button', { name: /download powerpoint/i }));
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: false, commentScope: 'all', embedSource: false, editable: true });
	});

	it('LibreOffice offers editable text but not re-openable (an .odp cannot carry the source) or comments', () => {
		addComment(DECK, 1, 'A private review note');
		const onExport = vi.fn();
		render(<ExportOptionsPanel format="odp" deckId={DECK} onBack={() => {}} onExport={onExport} />);
		expect(screen.queryByRole('switch', { name: /sticky notes/i })).toBeNull();
		expect(screen.queryByRole('switch', { name: /re-openable/i })).toBeNull();
		fireEvent.click(screen.getByRole('switch', { name: /editable text/i }));
		fireEvent.click(screen.getByRole('button', { name: /download libreoffice/i }));
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: false, commentScope: 'all', embedSource: false, editable: true });
	});

	it('a PDF never offers editable text', () => {
		render(<ExportOptionsPanel deckId={DECK} onBack={() => {}} onExport={() => {}} />);
		expect(screen.queryByRole('switch', { name: /editable text/i })).toBeNull();
	});

	it('Back returns to the format list', () => {
		const onBack = vi.fn();
		render(<ExportOptionsPanel deckId={DECK} onBack={onBack} onExport={() => {}} />);
		fireEvent.click(screen.getByRole('button', { name: /all formats/i }));
		expect(onBack).toHaveBeenCalled();
	});
});
