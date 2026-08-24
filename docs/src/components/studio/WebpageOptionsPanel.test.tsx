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
