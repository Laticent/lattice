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
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: false, commentScope: 'all', embedSource: false, editable: false , stripNotes: false, steps: false });
	});

	it('opting in exports with comments and the chosen scope', () => {
		addComment(DECK, 1, 'keep');
		const onExport = vi.fn();
		render(<ExportOptionsPanel deckId={DECK} onBack={() => {}} onExport={onExport} />);
		fireEvent.click(screen.getByRole('switch', { name: /add comments as sticky notes/i }));
		// Scope control appears once comments are on; pick "Open only".
		fireEvent.click(screen.getByRole('radio', { name: 'Open only' }));
		fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: true, commentScope: 'open', embedSource: false, editable: false , stripNotes: false, steps: false });
	});

	it('with no comments, the toggle is disabled and export carries none', () => {
		const onExport = vi.fn();
		render(<ExportOptionsPanel deckId={DECK} onBack={() => {}} onExport={onExport} />);
		expect(screen.getByRole('switch', { name: /add comments as sticky notes/i })).toBeDisabled();
		expect(screen.getByText(/no comments on this deck yet/i)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: false, commentScope: 'all', embedSource: false, editable: false , stripNotes: false, steps: false });
	});

	it('re-openable is OFF by default, and opting in is remembered for THIS deck only', () => {
		const onExport = vi.fn();
		const first = render(<ExportOptionsPanel deckId={DECK} onBack={() => {}} onExport={onExport} />);
		const sw = screen.getByRole('switch', { name: /re-openable in lattice/i });
		// Off by default: the source carries speaker notes and hidden slides.
		expect(sw).toHaveAttribute('aria-checked', 'false');
		fireEvent.click(sw);
		fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
		expect(onExport).toHaveBeenLastCalledWith({ commentsInPdf: false, commentScope: 'all', embedSource: true, editable: false , stripNotes: false, steps: false });
		first.unmount();
		// The same deck opens the step with the switch on…
		const again = render(<ExportOptionsPanel deckId={DECK} onBack={() => {}} onExport={onExport} />);
		expect(screen.getByRole('switch', { name: /re-openable in lattice/i })).toHaveAttribute('aria-checked', 'true');
		again.unmount();
		// …and another deck does not inherit it.
		render(<ExportOptionsPanel deckId="another-deck" onBack={() => {}} onExport={onExport} />);
		expect(screen.getByRole('switch', { name: /re-openable in lattice/i })).toHaveAttribute('aria-checked', 'false');
	});

	it('PowerPoint says to send the PDF to an iPhone; ODP, which iPhone Preview does not open, does not', () => {
		const note = /Sending it to an iPhone\?/;
		const pptx = render(<ExportOptionsPanel format="pptx" deckId={DECK} onBack={() => {}} onExport={vi.fn()} />);
		expect(screen.getByText(note)).toBeTruthy();
		pptx.unmount();
		render(<ExportOptionsPanel format="odp" deckId={DECK} onBack={() => {}} onExport={vi.fn()} />);
		expect(screen.queryByText(note)).toBeNull();
	});

	it('PowerPoint offers editable text and re-openable, and never asks for comments', () => {
		addComment(DECK, 1, 'A private review note');
		const onExport = vi.fn();
		render(<ExportOptionsPanel format="pptx" deckId={DECK} onBack={() => {}} onExport={onExport} />);
		expect(screen.queryByRole('switch', { name: /sticky notes/i })).toBeNull();
		fireEvent.click(screen.getByRole('switch', { name: /re-openable in lattice/i }));
		fireEvent.click(screen.getByRole('button', { name: /download powerpoint/i }));
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: false, commentScope: 'all', embedSource: true, editable: false , stripNotes: false, steps: false });
	});

	it('PowerPoint: editable text is OFF by default and rides into the export when switched on', () => {
		const onExport = vi.fn();
		render(<ExportOptionsPanel format="pptx" deckId={DECK} onBack={() => {}} onExport={onExport} />);
		const sw = screen.getByRole('switch', { name: /editable text/i });
		expect(sw.getAttribute('aria-checked')).toBe('false');
		fireEvent.click(sw);
		fireEvent.click(screen.getByRole('button', { name: /download powerpoint/i }));
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: false, commentScope: 'all', embedSource: false, editable: true , stripNotes: false, steps: false });
	});

	it('LibreOffice offers editable text but not re-openable (an .odp cannot carry the source) or comments', () => {
		addComment(DECK, 1, 'A private review note');
		const onExport = vi.fn();
		render(<ExportOptionsPanel format="odp" deckId={DECK} onBack={() => {}} onExport={onExport} />);
		expect(screen.queryByRole('switch', { name: /sticky notes/i })).toBeNull();
		expect(screen.queryByRole('switch', { name: /re-openable/i })).toBeNull();
		fireEvent.click(screen.getByRole('switch', { name: /editable text/i }));
		fireEvent.click(screen.getByRole('button', { name: /download libreoffice/i }));
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: false, commentScope: 'all', embedSource: false, editable: true , stripNotes: false, steps: false });
	});

	it('speaker notes ride by default; the strip switch shows only where the file has a notes pane', () => {
		// A PDF and a picture-per-slide PowerPoint write no notes pane, so the switch would do nothing there.
		const pdf = render(<ExportOptionsPanel deckId={DECK} onBack={() => {}} onExport={vi.fn()} />);
		expect(screen.queryByRole('switch', { name: /strip speaker notes/i })).toBeNull();
		pdf.unmount();
		const pptx = render(<ExportOptionsPanel format="pptx" deckId={DECK} onBack={() => {}} onExport={vi.fn()} />);
		expect(screen.queryByRole('switch', { name: /strip speaker notes/i })).toBeNull();
		// Editable text writes a notes pane: now the switch is offered, off, and says what ships.
		fireEvent.click(screen.getByRole('switch', { name: /editable text/i }));
		expect(screen.getByRole('switch', { name: /strip speaker notes/i })).toHaveAttribute('aria-checked', 'false');
		expect(screen.getByText(/anyone who opens the PowerPoint file can read them/i)).toBeTruthy();
		pptx.unmount();
		render(<ExportOptionsPanel format="odp" deckId={DECK} onBack={() => {}} onExport={vi.fn()} />);
		expect(screen.getByRole('switch', { name: /strip speaker notes/i })).toHaveAttribute('aria-checked', 'false');
	});

	it('stripping notes rides into the export and turns re-openable off, since that copy carries the notes', () => {
		const onExport = vi.fn();
		render(<ExportOptionsPanel format="pptx" deckId={DECK} onBack={() => {}} onExport={onExport} />);
		fireEvent.click(screen.getByRole('switch', { name: /re-openable in lattice/i }));
		fireEvent.click(screen.getByRole('switch', { name: /editable text/i }));
		fireEvent.click(screen.getByRole('switch', { name: /strip speaker notes/i }));
		const reopen = screen.getByRole('switch', { name: /re-openable in lattice/i });
		expect(reopen).toHaveAttribute('aria-checked', 'false');
		expect(reopen).toBeDisabled();
		fireEvent.click(screen.getByRole('button', { name: /download powerpoint/i }));
		expect(onExport).toHaveBeenCalledWith({ commentsInPdf: false, commentScope: 'all', embedSource: false, editable: true, stripNotes: true, steps: false });
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
	it('offers one page per step only on a deck that steps, off by default, and passes it on when turned on', () => {
		const onExport = vi.fn();
		const { unmount } = render(<ExportOptionsPanel deckId={DECK} source={'# A\n\n---\n\n# B'} onBack={() => {}} onExport={onExport} />);
		expect(screen.queryByRole('switch', { name: /one page per step/i })).toBeNull();
		unmount();
		render(<ExportOptionsPanel deckId={DECK} source={'# A\n\n---\n\n<!-- _build -->\n\n- x\n- y'} onBack={() => {}} onExport={onExport} />);
		const toggle = screen.getByRole('switch', { name: /one page per step/i });
		expect(toggle).toHaveAttribute('aria-checked', 'false');
		fireEvent.click(toggle);
		fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));
		expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ steps: true }));
	});
});
