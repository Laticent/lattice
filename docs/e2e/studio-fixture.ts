import { test as base, expect, type FrameLocator, type Locator, type Page } from '@playwright/test';

// Shared harness for the Studio E2E suite. Playwright gives each test its own
// browser context, so `localStorage` (the `lattice-studio-*` keys) starts empty
// per test — no manual reset needed, and a within-test reload keeps what the app
// persisted (which the persistence spec relies on).

// The live compose preview: the engine renders the deck INSIDE this srcdoc
// iframe; `.lattice` is the slide root. Everything visual the user judges is in
// here, so most cause-effect oracles read through this frame.
export const LIVE_PREVIEW = '[aria-label="Live deck preview"] iframe.live';

export function livePreview(page: Page): FrameLocator {
	return page.frameLocator(LIVE_PREVIEW);
}

/** The current painted slide root inside the live preview. */
export function currentSlide(page: Page): Locator {
	return livePreview(page).locator('.lattice').first();
}

/** Bottom-rail slide buttons — exactly one per slide (a fuzz invariant). */
export function railButtons(page: Page): Locator {
	return page.locator('nav[aria-label="Slide navigator"] button');
}

/** Read a persisted studio value from localStorage. */
export function readStorage(page: Page, key: string): Promise<string | null> {
	return page.evaluate((k) => window.localStorage.getItem(k), key);
}

/**
 * The active deck's persisted source. The seeded deck's `lattice-studio-src-<id>`
 * key only appears after the first edit (nothing is written on load), so we scan
 * for it rather than depend on a deck index that isn't persisted until a deck op.
 * Front-matter and editor edits debounce ~400ms, so read this via `expect.poll`.
 */
export function persistedSource(page: Page): Promise<string> {
	return page.evaluate(() => {
		const key = Object.keys(window.localStorage).find((k) => k.startsWith('lattice-studio-src-'));
		return key ? (window.localStorage.getItem(key) ?? '') : '';
	});
}

/** The `lattice-studio-<prefix>-<deckId>` value for the first matching deck key. */
export function persistedByPrefix(page: Page, prefix: string): Promise<string | null> {
	return page.evaluate((p) => {
		const key = Object.keys(window.localStorage).find((k) => k.startsWith(p));
		return key ? window.localStorage.getItem(key) : null;
	}, `lattice-studio-${prefix}-`);
}

/** The app toast text — the centered, fixed bottom-of-screen status pill.
 *  Scoped to the fixed toast so it never collides with the Inspector's scope-echo
 *  region (also role=status) or the settings Undo toast (role=status, bottom-left)
 *  when the panel is open. */
export function toastText(page: Page): Locator {
	return page.locator('[role="status"].fixed.inset-x-0');
}

/**
 * Navigate to the Studio and wait until the engine has painted. The rendered
 * `.lattice` is the universal ready signal across viewports (the preview pane is
 * the default at every width, and the engine only paints after the island
 * hydrates and loads on demand — so this also proves the shell is interactive).
 * On mobile/tablet the editor lives behind the Edit pane, so we do NOT gate on it
 * here.
 */
export async function gotoStudio(page: Page): Promise<void> {
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await currentSlide(page).waitFor({ state: 'visible' });
	await expect(currentSlide(page)).not.toBeEmpty();
	// Dismiss the first-run welcome banner so it can't overlap controls; best-effort
	// (it only shows on a fresh context, which every test gets).
	const gotIt = page.getByRole('button', { name: 'Got it' });
	if (await gotIt.isVisible().catch(() => false)) {
		await gotIt.click();
	}
}

/** The current slide total (rail buttons), read live so specs don't hard-code the seed deck's size. */
export function slideCount(page: Page): Promise<number> {
	return railButtons(page).count();
}

/** Focus the CodeMirror editor (the `.cm-content` carries aria-label "Deck source"). */
async function focusEditor(page: Page): Promise<void> {
	await page.getByLabel('Deck source').click();
}

/** Move the caret to the end of the editor document and type an appended block. */
export async function appendToEditor(page: Page, text: string): Promise<void> {
	await focusEditor(page);
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type(text);
}

/** Type text at the current caret in the editor. */
export async function typeInEditor(page: Page, text: string): Promise<void> {
	await focusEditor(page);
	await page.keyboard.type(text);
}

/**
 * Replace the entire editor document with `text`. Uses `insertText` (a single
 * input event) rather than per-key typing: the editor's markdown niceties
 * (list auto-continuation) would rewrite a multi-line deck typed key-by-key —
 * `---` separators land inside auto-continued bullets and slides merge.
 */
export async function setEditorContent(page: Page, text: string): Promise<void> {
	await focusEditor(page);
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('Delete');
	await page.keyboard.insertText(text);
}

/** Open the Architect panel (collapsed by default) and wait for its tabs. */
export async function openArchitect(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Toggle Architect' }).click();
	await expect(page.getByRole('button', { name: 'Coach' })).toBeVisible();
}

/**
 * The active deck's version-history checkpoint labels (newest first), from the
 * persisted `lattice-studio-snap-<deckId>` store. Poll this — checkpoints are
 * written synchronously with the edit, but the edit itself may still be settling.
 * Like `persistedSource`, this reads the FIRST matching deck key — sound while a
 * test edits only the active deck; a deck-switching test would need the deck id.
 */
export function checkpointLabels(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const key = Object.keys(window.localStorage).find((k) => k.startsWith('lattice-studio-snap-'));
		if (!key) return [];
		try {
			const snaps = JSON.parse(window.localStorage.getItem(key) ?? '[]') as { label?: string }[];
			return snaps.map((s) => s.label ?? '');
		} catch {
			return [];
		}
	});
}

export const test = base;
export { expect };
