import { test as base, expect, type FrameLocator, type Locator, type Page } from '@playwright/test';

// Shared harness for the Studio E2E suite. Playwright gives each test its own
// browser context, so `localStorage` (the `lattice-studio-*` keys) starts empty
// per test — no manual reset needed, and a within-test reload keeps what the app
// persisted (which the persistence spec relies on).

// ── E2E-critical chrome selector contract ──────────────────────────────────
// These accessible names are an IMPLICIT CONTRACT between the Studio chrome
// (docs/src/components/studio/*) and this suite: dozens of specs open panels and
// read state by targeting controls via their accessible name. Renaming, moving,
// or retiring one of these WITHOUT updating this map is exactly the drift that
// silently broke 19 e2e specs after the #771/#773 settings-panel redesign — the
// unit tier was updated, the e2e tier (nightly, off the PR gate) was not, so
// nothing failed pre-merge (#780, fixed in #782;
// engineering/decisions/2026-07-06-e2e-chrome-selector-contract.md).
//
// The prevention: this map is the DOCUMENTED LIST a chrome change is required to
// reconcile, and the highest-traffic opens are additionally wrapped in helpers
// below (`openInspector`/`openArchitect`) so a rename is a ONE-FILE fix here, not
// an N-spec sweep. Entries without a dedicated helper (e.g. `versionHistory`) are
// still targeted by name in individual specs — they live here so the contract is
// complete and greppable; when you change a control's accessible name/role/
// presence in the Studio, update its entry here AND grep docs/e2e for stragglers.
export const CHROME = {
	/** Scope-rail button that opens the Inspector at DECK scope. */
	deckScope: 'Deck scope',
	/** Opens the Inspector pointed at SLIDE scope (editor row / mobile preview bar). */
	slideSettings: 'Slide settings',
	/** Activity-bar toggle for the Coach (deterministic deck assessment) panel. */
	coach: 'Toggle Coach',
	/** Activity-bar toggle for the Chat (AI conversation) panel — a separate peer of the Coach. */
	chat: 'Toggle Chat',
	/** Activity-bar toggle for the Lenses (reader-views) panel — a first-class peer of the Architect. */
	lenses: 'Toggle Lenses',
	/** Activity-bar toggle for the Library (saved themes / components / finishes) panel. */
	library: 'Open Library',
	/** The deck-switcher / workspace launcher in the top bar. */
	workspaceLauncher: 'Workspace launcher',
	/** The workspace-settings sheet trigger. */
	workspaceSettings: 'Workspace settings',
	/** The version-history sheet trigger. */
	versionHistory: 'Version history',
	/**
	 * The "···" overflow trigger — SAME accessible name and header position at every
	 * breakpoint, but a DIFFERENT surface underneath (2026-07-26-studio-mobile-eight-
	 * cell-bar.md): tablet opens the flat DropdownMenu (rows are `role="menuitem"`);
	 * mobile opens the StudioDrawer, a bottom Sheet (rows are plain `role="button"`).
	 * A spec asserting a row inside it must pick the role for the tier it's testing.
	 */
	moreControls: 'More controls',
} as const;

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

/** The app toast pill — the canonical name for the centralized toast accessor.
 *  Prefer this in new specs; `toastText` remains as its long-standing alias. */
export const appToast = toastText;

/**
 * Navigate to the Studio and wait until the engine has painted. The rendered
 * `.lattice` is the universal ready signal across viewports (the preview pane is
 * the default at every width, and the engine only paints after the island
 * hydrates and loads on demand — so this also proves the shell is interactive).
 * On mobile/tablet the editor lives behind the Edit pane, so we do NOT gate on it
 * here.
 */
export async function gotoStudio(page: Page): Promise<void> {
	// Seed the Build posture BEFORE the island hydrates, so the full surface (the
	// left activity bar + docked Architect/Inspector) is present — most specs drive
	// it. The shipped default is the calm Write stop, which has no activity bar, so
	// without this the 'Toggle Coach' / 'Toggle Chat' / 'Deck scope' launchers wouldn't exist.
	// (2026-07-17-studio-persona-dial.md; the newcomer Read/Write surfaces get their
	// own dedicated specs.) The runtime read is loadSettings().posture.
	await page.addInitScript(() => {
		try {
			const k = 'lattice-studio-settings';
			const cur = JSON.parse(localStorage.getItem(k) || '{}');
			localStorage.setItem(k, JSON.stringify({ ...cur, posture: 'build' }));
		} catch {
			/* storage unavailable — the app falls back to its default */
		}
	});
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await currentSlide(page).waitFor({ state: 'visible' });
	await expect(currentSlide(page)).not.toBeEmpty();
}

/** The current slide total (rail buttons), read live so specs don't hard-code the seed deck's size. */
export function slideCount(page: Page): Promise<number> {
	return railButtons(page).count();
}

/**
 * Open the Deck inspector via the always-visible scope rail (`CHROME.deckScope`).
 * Centralized so a rename of that control is a one-line fix in `CHROME` above,
 * not an N-spec sweep — the failure mode of #780. `.first()` keeps it robust once
 * the panel is open (the in-panel scope segment adds a second "Deck scope"); from
 * a closed state there is exactly one, so this matches the pre-existing behavior.
 */
export async function openInspector(page: Page): Promise<void> {
	await page.getByRole('button', { name: CHROME.deckScope }).first().click();
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

/** Open the Coach panel (collapsed by default) and wait for it. Coach and Chat are
 *  separate panels now (own toolbar icon, own drawer) — no tabs. */
export async function openArchitect(page: Page): Promise<void> {
	await page.getByRole('button', { name: CHROME.coach }).click();
	await expect(page.getByText('Board readiness')).toBeVisible();
}

/** Open the Chat panel — a separate launcher peer of the Coach. */
export async function openChat(page: Page): Promise<void> {
	await page.getByRole('button', { name: CHROME.chat }).click();
	await expect(page.getByRole('textbox', { name: 'Message the Architect' })).toBeVisible();
}

/** Open the Lenses (reader-views) panel — a first-class launcher peer of the Architect. */
export async function openLenses(page: Page): Promise<void> {
	await page.getByRole('button', { name: CHROME.lenses }).click();
	await expect(page.getByRole('button', { name: /Add a reader view/ })).toBeVisible();
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
