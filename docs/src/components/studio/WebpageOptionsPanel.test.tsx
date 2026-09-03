import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WebpageOptionsPanel } from './WebpageOptionsPanel';

// STRIPPING NOTES MUST NOT DISABLE NARRATION.
//
// This panel used to carry `const narrationBlocked = stripNotes`, vetoing both the
// Captions and the Audio switch whenever "Strip speaker notes" was on. That was correct
// under the old narration ladder, where a speaker note outranked the slide's own content:
// shipping captions or audio really would have handed the stripped text back.
//
// The note rung is gone (lib/core/read-along-build.js, narration-resolve.ts) — narration
// is generated from slide CONTENT, which --strip-notes does not touch — and the CLI was
// made orthogonal in the same change. The Studio was not, and NOTHING PINNED IT, so the
// two render paths silently disagreed about one user intent: the same deck exported with
// notes stripped produced a caption track from `lattice-emulator.js` and no caption track
// from this panel. That is the shape HARD RULE #1 exists to prevent, and it cost a
// stripped deck the caption track a recipient needs for accessibility.
//
// The absence of this test is why it drifted. It exists so the veto cannot come back
// quietly (2026-08-24-stage-console-split.md §10).
const noop = () => {};
const DECK = '---\ntheme: indaco\n---\n\n# One\n\nThe first slide.\n';

function panel() {
	return render(
		<WebpageOptionsPanel
			defaultScheme="light"
			source={DECK}
			// Never called: a narration switch has to be turned ON first, and these cells only
			// assert that it CAN be.
			project={vi.fn(async () => ({ slides: [] })) as never}
			onBack={noop}
			onExport={noop}
			onCancel={noop}
		/>,
	);
}

describe('WebpageOptionsPanel — notes and narration are independent channels', () => {
	it('leaves the narration switches usable when speaker notes are stripped', async () => {
		const user = userEvent.setup();
		panel();
		const strip = screen.getByRole('switch', { name: 'Strip speaker notes' });
		const captions = screen.getByRole('switch', { name: /captions/i });
		expect(captions).toBeEnabled();

		await user.click(strip);
		expect(strip).toBeChecked();
		// THE REGRESSION. Before the fix this switch was disabled the moment notes were
		// stripped, and any switch already on was forced back off.
		expect(captions).toBeEnabled();
	});

	it('does not tell the author that narration is unavailable because of notes', async () => {
		const user = userEvent.setup();
		panel();
		await user.click(screen.getByRole('switch', { name: 'Strip speaker notes' }));
		// The panel used to show "Unavailable while speaker notes are stripped — for most
		// decks the narration you rehearsed IS your notes, so either switch would hand them
		// back." Every clause of that is now false.
		expect(screen.queryByText(/Unavailable while speaker notes are stripped/i)).toBeNull();
		expect(screen.queryByText(/the narration you rehearsed IS your notes/i)).toBeNull();
	});
});

// THE MOTION ROW APPEARS ONLY WHEN THE DECK HAS MOTION TO CARRY.
//
// A switch that does nothing is worse than a missing one: it teaches the reader that the
// panel's controls are decorative. "Animate charts" is meaningful only for a deck that
// actually animates, so it is conditional — and the condition has to track BOTH ways an
// author opts in, the deck-level `motion:` key and a per-slide marker, or a deck that
// animates on one path silently loses the choice on the other.
const MOTION_DECK = '---\ntheme: indaco\nmotion: on\n---\n\n<!-- _class: funnel -->\n\n## F\n\n- A `1`\n';
const SLIDE_MOTION_DECK = '---\ntheme: indaco\n---\n\n<!-- _class: funnel motion-build -->\n\n## F\n\n- A `1`\n';

function panelWith(source: string) {
	return render(
		<WebpageOptionsPanel
			defaultScheme="light"
			source={source}
			project={vi.fn(async () => ({ slides: [] })) as never}
			onBack={noop}
			onExport={noop}
			onCancel={noop}
		/>,
	);
}

describe('WebpageOptionsPanel — chart motion in the exported file', () => {
	it('offers no motion row for a deck with no motion', () => {
		panelWith(DECK);
		expect(screen.queryByRole('switch', { name: 'Animate charts' })).toBeNull();
	});

	it('offers it for a deck-level motion: on, defaulting to ON so the export inherits', () => {
		panelWith(MOTION_DECK);
		const sw = screen.getByRole('switch', { name: 'Animate charts' });
		// Default ON is the contract: a deck that animates here animates for the recipient,
		// and the author opts OUT rather than having to remember to opt in.
		expect(sw.getAttribute('aria-checked')).toBe('true');
	});

	it('offers it for a per-slide marker with no deck-level key', () => {
		panelWith(SLIDE_MOTION_DECK);
		expect(screen.getByRole('switch', { name: 'Animate charts' })).not.toBeNull();
	});

	it('reports the choice to the exporter', async () => {
		const user = userEvent.setup();
		const onExport = vi.fn();
		render(
			<WebpageOptionsPanel
				defaultScheme="light"
				source={MOTION_DECK}
				project={vi.fn(async () => ({ slides: [] })) as never}
				onBack={noop}
				onExport={onExport}
				onCancel={noop}
			/>,
		);
		await user.click(screen.getByRole('switch', { name: 'Animate charts' }));
		await user.click(screen.getByRole('button', { name: 'Download webpage' }));
		expect(onExport).toHaveBeenCalled();
		expect(onExport.mock.calls[0][0].playerMotion).toBe(false);
	});
});
