import type { Page } from '@playwright/test';
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// The Studio's PREVIEW FIDELITY overlay, on the real running surface.
//
// WHY THIS FILE EXISTS. The overlay shipped with zero e2e coverage, and the defect that found
// was an INTERACTION one no unit tier could have caught: pressing the diff button and then
// typing left the panel reading "comparing…" with its only control disabled — permanently,
// recoverable only by toggling the overlay off and on. `run()` guarded both the result and the
// `busy` reset on the same generation token, so a superseded compare never released the flag and
// nothing else did. It survived a full checker pass on the diff, `npm test`, and CI, because
// none of those drive a keystroke into a compare window (HARD RULE #23 — a synthetic harness
// confirms only what it exercises).
//
// The chassis itself — drag, persist, clamp, close — is covered once for all six overlays in
// diagnostics-overlay.spec.ts. This file covers only what is specific to THIS readout: that it
// reports the route truthfully, that it names what differs, and that it cannot get stuck.
//
// SCOPE. Desktop headless Chromium, the shipped bundle. Two things are deliberately NOT here:
//   - Real touch (tap-to-pin a row) — needs a real device; UNVERIFIED from this sandbox.
//   - The stuck-button invariant itself. I tried three ways to force that race from e2e (type
//     mid-compare; the same under CPU throttling; navigate mid-compare on a 180-slide deck) and
//     each one PASSED against the reintroduced bug — instrumenting the button showed it never even
//     reaches "comparing…", because the compare resolves inside a single frame. A guard that cannot
//     fail is worse than none, so it lives where the race is controllable instead:
//     PreviewFidelityOverlay.test.tsx drives the component with a compare promise it resolves by
//     hand, and IS mutation-checked.

const PANEL = '[data-testid="preview-fidelity-overlay"]';

// A deck whose FIRST slide sets a running `header:` the second inherits — the smallest real case
// where the fast route would lose something, so the registry diverts to the whole-deck render and
// the diff has a genuine, nameable difference to report.
const RUNNING_HEADER_DECK = `---
paginate: true
---

<!-- header: Q3 Board Review -->

# Opening

Running header set here.

---

# Second slide

This slide inherits the header from slide one.
`;

// A deck with nothing deck-derived on it — the cheap route, where a position is supplied.
const PLAIN_DECK = `# One

First slide.

---

# Two

Second slide.

---

# Three

Third slide.
`;

/** The panel's diff control, whatever state it is in ("render both ways and diff" / "diff again"). */
function diffButton(page: Page) {
	return page.locator(PANEL).getByRole('button', { name: /render both ways and diff|diff again|comparing/i });
}

/**
 * One readout row, located by its label column. Rows are real buttons (tap to expand).
 *
 * NO `\b` AFTER THE LABEL: `hasText` matches the button's concatenated `textContent`, and the
 * label and value sit in adjacent spans with no whitespace between them — so the row reads
 * `▶becauserunning-global directive`, and a word boundary after `because` never matches.
 */
function row(page: Page, label: string) {
	return page.locator(PANEL).getByRole('button').filter({ hasText: new RegExp(`^\\s*▶?\\s*${label}`) });
}

async function openWithDeck(page: Page, deck: string): Promise<void> {
	// Seed the shared pref BEFORE hydration rather than navigating with `?fidelity`: the param
	// path would need its own `page.goto`, and this suite's Studio setup (the Build posture, which
	// is what puts the editor on screen at all) lives in `gotoStudio`. One init script composes
	// with the fixture's instead of forking it.
	await page.addInitScript(() => {
		try {
			localStorage.setItem('lattice-fidelity-overlay', 'on');
		} catch {
			/* storage unavailable — the overlay stays off and the spec fails loudly below */
		}
	});
	await gotoStudio(page);
	await expect(page.locator(PANEL)).toBeVisible();
	await setEditorContent(page, deck);
	// The readout is published per render; wait for it to describe the deck we just typed.
	await expect(page.locator(PANEL)).toContainText(/this slide alone|the whole deck/, { timeout: 15_000 });
}

test('preview fidelity: names the slow route and the registry fact that forced it', async ({ page }) => {
	await openWithDeck(page, RUNNING_HEADER_DECK);

	// A running-global directive is a deck-derived fact, so the preview must render the WHOLE deck —
	// and the panel must say so, and say why. "the preview got slow" needs an answer an author can act on.
	await expect(page.locator(PANEL)).toContainText('the whole deck');
	await expect(row(page, 'because')).toContainText('running-global directive');

	// Tapping a row reveals its plain-language meaning — the house readout contract.
	await row(page, 'route').click();
	await expect(page.locator(PANEL)).toContainText(/cannot know anything its neighbors decide/i);
});

test('preview fidelity: the diff names WHAT differs instead of quoting markup', async ({ page }) => {
	await openWithDeck(page, RUNNING_HEADER_DECK);

	await diffButton(page).click();

	// The inherited running header is exactly what a lone slide loses, so the readout must carry a
	// row named for it — labeled the way the AUTHOR wrote it (`header`, not `data-header`).
	const header = row(page, 'header');
	await expect(header).toBeVisible({ timeout: 20_000 });
	await expect(header).toContainText('missing');

	// The verdict is read against the ROUTE: on the whole-deck route the preview is already correct,
	// so a difference means the gate is earning its cost — never "your preview is wrong".
	await expect(page.locator(PANEL)).toContainText('earning its cost');
	await expect(page.locator(PANEL)).not.toContainText('this preview is wrong');
});

test('preview fidelity: the fast route reports the deck position it was handed', async ({ page }) => {
	await openWithDeck(page, PLAIN_DECK);

	// Nothing here depends on other slides, so the cheap render runs — and the caller hands the
	// engine the position, which is what lets a lone slide still print a true page number. The
	// alternative the panel is built to expose is `withheld`, i.e. an honest "1 of 1".
	await expect(page.locator(PANEL)).toContainText('this slide alone');
	await expect(row(page, 'position')).toContainText(/\d+ of 3/);
});
