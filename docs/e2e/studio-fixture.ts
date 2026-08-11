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
	/** Activity-bar toggle for the Reader views panel — a first-class peer of the Architect.
	 *  Renamed from "Toggle Reader views" in #1211: the panel it opens is titled "Reader views",
	 *  as is the drawer row, so the launcher agreed with neither. "Lenses" survives only as
	 *  the internal name (lensesBody, lens-picker, /lib/lente). */
	lenses: 'Toggle Reader views',
	/** Activity-bar toggle for the Library (saved themes / components / finishes) panel. */
	library: 'Open Library',
	/** The deck-switcher / workspace launcher in the top bar. */
	workspaceLauncher: 'Workspace launcher',
	/** The workspace-settings sheet trigger. */
	workspaceSettings: 'Workspace settings',
	/** The version-history sheet trigger. */
	versionHistory: 'Version history',
	/**
	 * "Send feedback" — a 1-tap header button on tablet AND desktop, at the same tail
	 * slot in both headers (directly above Settings in the right-hand run), so it holds
	 * position across the Read/Write/Craft dial. On MOBILE there is no header button:
	 * it is a `role="button"` row inside the StudioDrawer, behind `moreControls`.
	 */
	feedback: 'Send feedback',
	/**
	 * The "···" overflow trigger — SAME accessible name and header position at every
	 * breakpoint, but a DIFFERENT surface underneath (2026-07-26-studio-mobile-eight-
	 * cell-bar.md): tablet opens the flat DropdownMenu (rows are `role="menuitem"`);
	 * mobile opens the StudioDrawer, a bottom Sheet (rows are plain `role="button"`).
	 * A spec asserting a row inside it must pick the role for the tier it's testing.
	 */
	moreControls: 'Menu',
} as const;

// ── Share-dialog export contract ───────────────────────────────────────────
// The SAME implicit contract as `CHROME` above, for the Share sheet's format
// rows: which rows download on one click, and which land on a pre-export
// OPTIONS step whose own button is what actually starts the export.
//
// This is the #780 class again, and it bit exactly as predicted (#1507): PDF
// gained an options step ("Export PDF · Choose what rides along" → `Download
// PDF`), four specs kept clicking `PDF` and awaiting a download, and every one
// of them timed out for a month against a working pipeline. Four specs
// open-coding the same two-step flow is how it went unnoticed, so EXPORT flows
// route through `shareExport` below — a step added to a format is a one-line fix
// here. Not yet universal: `share.spec.ts` still open-codes four row regexes for
// its VISIBILITY assertions (it awaits no download, so it never drifted), and the
// three Marp tests in `journeys/author-export.spec.ts` open-code their two-step
// flow because they interact INSIDE the options step, which this helper can't
// express. A row-label rename is still a 3-file sweep — grep before you rename.
//
// Every entry below was driven on the REAL Share sheet (desktop project); the run
// and its artifacts are recorded in #1552. Formats with no dedicated helper still
// live here so the contract is complete and greppable, exactly as
// `CHROME.versionHistory` does — but note those entries are verified-by-sweep, not
// pinned by any spec, so they can rot without failing anything.
export const SHARE_EXPORTS = {
	/** Options step "Export PDF" (comments-as-sticky-notes toggle). → `.pdf` */
	pdf: { row: /^PDF/, confirm: /^Download PDF/ },
	/** One click. → `.pptx` */
	pptx: { row: /^PowerPoint/, confirm: null },
	/** Options step "Export images" (format/size/thumbnails/SVGs). → `.zip`
	 *  NOTE its color-mode segment has a button literally labeled "Print" —
	 *  a loose /^(Download|Print)/ confirm locator grabs that, not the export. */
	images: { row: /^Images \(\.zip\)/, confirm: /^Download images/ },
	/** Options step "Export webpage" (scheme / strip-notes / narration). → `.html` */
	webpage: { row: /^Webpage \(\.html\)/, confirm: /^Download webpage/ },
	/** One click. → `<deck>-captions.zip` — a ZIP of tracks, NOT a bare `.vtt`
	 *  despite the row's label; a spec asserting /\.vtt$/ on it would fail. */
	captions: { row: /^Captions \(\.vtt\)/, confirm: null },
	/** One click. → `.lattice` */
	lattice: { row: /^Lattice project/, confirm: null },
	/** One click. → `.md`. The `^` anchor matters: the "Print source" row's
	 *  description also contains the word "Markdown". */
	markdown: { row: /^Markdown/, confirm: null },
	/** Options step "Export Marp bundle" (overflow marker). → `.zip` */
	marp: { row: /^Marp bundle/, confirm: /^Download bundle/ },
	/** Options step "Print deck" (paper/color + sheet preview). TWO exits:
	 *  `Print` hands off to the browser print dialog and emits NO download, so
	 *  `Download PDF` is the only one a download-oracle spec can await. → `.pdf` */
	print: { row: /^Print deck/, confirm: /^Download PDF/ },
	/** One click, and NEITHER a step nor a download: it opens a print popup and
	 *  the sheet stays on the format menu. Nothing here to await. */
	printSource: { row: /^Print source/, confirm: null },
} as const;

/**
 * Pick a format in the OPEN Share dialog and, when that format lands on a
 * pre-export options step, click the step's own export button too.
 *
 * Takes the dialog as already open (the call sites vary in what they set up
 * between opening it and exporting — chart-export arms a capture-frame probe
 * first), and does NOT await the download: the caller owns that oracle, since
 * `page.waitForEvent('download')` must be armed before the click that fires it.
 */
export async function shareExport(page: Page, format: keyof typeof SHARE_EXPORTS): Promise<void> {
	const { row, confirm } = SHARE_EXPORTS[format];
	const dialog = page.getByRole('dialog');
	// NO `.first()` on either click. Every regex here resolves to exactly one button today,
	// and this map exists to CATCH chrome drift — `.first()` would turn a future label
	// collision into a silent click on whichever row sorts first in the DOM instead of the
	// strict-mode failure that would tell us the contract moved.
	await dialog.getByRole('button', { name: row }).click();
	if (confirm) await dialog.getByRole('button', { name: confirm }).click();
}

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

/**
 * A control backed by an Astro island is INERT until that island hydrates — server HTML with no
 * listeners, so the click is swallowed and the next assertion fails much later blaming the wrong
 * thing. This is what a fixed post-`goto` sleep was standing in for.
 *
 * Asks the control's OWN island, never a global count: `/` keeps two below-fold islands
 * (StudioPreview, RestyleShowcase) unhydrated forever, so `astro-island[ssr]` never reaches zero
 * there. Fails CLOSED — a control with no island ancestor is not "ready" by default, or this
 * silently becomes a no-op the day the chrome moves out of an island (the #780 drift class).
 */
export async function controlReady(control: Locator): Promise<void> {
	await control.waitFor({ state: 'visible' });
	await expect
		.poll(() => control.evaluate((el) => { const i = el.closest('astro-island'); return !!i && !i.hasAttribute('ssr'); }), { timeout: 20_000 })
		.toBe(true);
}

/**
 * Wait until an overlay has REGISTERED the history entry a following `goBack()` pops.
 * `docs/src/lib/overlay-back.ts` records ownership in `history.state` under its STATE_KEY
 * (`__latticeOverlayBack`) — the observable a fixed settle was standing in for.
 *
 * Valid ONLY for the first overlay over a bare page: measured `false → true` at 231ms on the site
 * nav, while a DOOR transition (Menu → Themes) pushes nothing and leaves the flag already `true`,
 * so calling this there returns instantly and is not a wait at all.
 */
export async function backEntryRegistered(page: Page): Promise<void> {
	await expect
		.poll(() => page.evaluate(() => (history.state as { __latticeOverlayBack?: boolean } | null)?.__latticeOverlayBack === true), { timeout: 10_000 })
		.toBe(true);
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

/**
 * The app toast text — Sonner's bottom-center pill region (`ui/sonner.tsx`).
 *
 * Targets the TOASTER (the single `<ol data-sonner-toaster>`), not an individual
 * `[data-sonner-toast]`: Sonner stacks up to three at once, so a per-toast locator
 * would trip Playwright strict mode exactly when a spec chains two actions. The
 * container is always present and always exactly one, and `toContainText` against
 * it means "some visible toast said this" — which is what every call site wants.
 *
 * Do NOT reach for `[role="status"]` here. Sonner's toast carries neither `role`
 * nor `aria-live` on the `<li>` (its live region is the wrapping
 * `<section aria-label="Notifications alt+T">`), and the Studio has several
 * unrelated `role="status"` nodes (Inspector scope echo, Coach "Assessing",
 * PresentCaption) that a broad match would collide with.
 */
export function toastText(page: Page): Locator {
	return page.locator('[data-sonner-toaster]');
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
	// Seed the Craft posture BEFORE the island hydrates, so the full surface (the
	// left activity bar + docked Architect/Inspector) is present — most specs drive
	// it. The shipped default is the calm Write stop, which has no activity bar, so
	// without this the 'Toggle Coach' / 'Toggle Chat' / 'Deck scope' launchers wouldn't exist.
	// (2026-07-17-studio-persona-dial.md; the newcomer Read/Write surfaces get their
	// own dedicated specs.) The runtime read is loadSettings().posture.
	await page.addInitScript(() => {
		try {
			const k = 'lattice-studio-settings';
			const cur = JSON.parse(localStorage.getItem(k) || '{}');
			localStorage.setItem(k, JSON.stringify({ ...cur, posture: 'craft' }));
		} catch {
			/* storage unavailable — the app falls back to its default */
		}
	});
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await waitForStudioPaint(page);
}

/**
 * The budget the Studio's cold first paint gets, instead of inheriting the two 15s
 * defaults in `playwright.config.ts` — `use.actionTimeout` for the bare
 * `locator.waitFor`, `expect.timeout` for the emptiness assertion. (Both are 15s
 * here, which is why one number covered both; they are still two knobs, and a
 * future retune of one would have moved half of this wait.)
 *
 * A first paint is not an assertion about behavior — it is setup, getting the app
 * to the state a spec starts from, and it costs an island hydrate, a lazy engine
 * chunk load and a full render inside a srcdoc iframe. Under CPU oversubscription
 * that legitimately exceeds 15s, and 51 of 64 spec files reach the Studio through
 * `gotoStudio` (14 of them from a `beforeEach`), so inheriting those defaults made
 * this one wait the suite-wide flake surface: the timeout was reported against
 * whichever spec drew the slow worker, so it looked like a different bug every
 * time (#1572).
 *
 * 45s comes from the measured distribution (see the Playwright decision note) —
 * about 2x the worst paint observed under deliberate 4x CPU oversubscription. That
 * it matches the budget `studio-instant-shell.spec.ts` already spends on the same
 * iframe is a cross-check, not the reason: those specs wait for the iframe ELEMENT,
 * a strictly earlier and cheaper milestone than `.lattice` rendering inside it.
 *
 * It is the budget for the WHOLE wait, not per stage — `waitForStudioPaint` runs
 * both halves against one deadline. That matters because a `beforeEach` and its
 * test share ONE 60s slot: two independent 45s waits could not both fit, and the
 * runner would kill the test before the diagnosis below ever ran. Bounded at 45s,
 * a single `gotoStudio` at the top of a test always fails HERE, named. A spec that
 * paints TWICE (a reload) needs more than the 60s default — see `persistence.spec.ts`.
 */
export const FIRST_PAINT_TIMEOUT = 45_000;

/**
 * Did this error come from one of the two waits below running out of time?
 *
 * The two shapes were read off real failures, not guessed, by forcing each one (a
 * 1ms budget, and an inverted assertion). They need SEPARATE branches:
 * `locator.waitFor` rejects with `name: 'TimeoutError'` and a message reading
 * `Timeout 300ms exceeded` — no colon, so the regex below does not see it — while
 * `expect(locator).not.toBeEmpty` rejects with a plain `Error` (name `'Error'`)
 * whose message carries `Timeout:  <n>ms`. Playwright emits that line only when
 * the matcher actually timed out, which is what makes it a sound marker: an
 * `expect` that fails for another reason, or a page closed mid-wait, carries
 * neither shape and escapes unlabeled.
 */
function isWaitTimeout(e: unknown): e is Error {
	return e instanceof Error && (e.name === 'TimeoutError' || /Timeout:\s*\d+ms/.test(e.message));
}

/**
 * Wait until the engine has painted a non-empty slide into the live preview. The
 * rendered `.lattice` is the universal ready signal across viewports (the preview
 * pane is the default at every width, and the engine only paints after the island
 * hydrates and loads on demand — so this also proves the shell is interactive). On
 * mobile/tablet the editor lives behind the Edit pane, so we do NOT gate on it.
 *
 * Exported because a reload is the same wait: a spec that re-enters the Studio
 * without `gotoStudio` must not re-derive it and inherit the 15s defaults again.
 *
 * ONE deadline spans both halves, so the whole call is bounded by
 * `FIRST_PAINT_TIMEOUT` rather than 2x it — see that constant's note for why the
 * arithmetic against the 60s test slot is the point.
 *
 * `timeout` narrows that budget for a caller that already spent part of one. A
 * ready-check built from several waits must bound the WHOLE sequence, not hand each
 * step a fresh 45s — that additive shape is the defect this helper exists to end,
 * and `persistence.spec.ts` had it one level up until an inversion pass caught it.
 */
export async function waitForStudioPaint(page: Page, { timeout = FIRST_PAINT_TIMEOUT } = {}): Promise<void> {
	const slide = currentSlide(page);
	const budget = Math.max(1, timeout);
	const started = Date.now();
	const deadline = started + budget;
	let stalled = 'the live preview never rendered a slide root';
	try {
		await slide.waitFor({ state: 'visible', timeout: budget });
		stalled = 'the slide root rendered but never filled with content';
		// `Math.max(1, …)`: a 0 timeout means "no timeout" to Playwright, so a
		// deadline already spent must ask for the smallest budget, not an endless one.
		await expect(slide).not.toBeEmpty({ timeout: Math.max(1, deadline - Date.now()) });
		// Record what the paint cost, on the real suite at real concurrency, as a
		// `first-paint` annotation in the Playwright report. This is an OBSERVATION,
		// not a budget: nothing asserts on it. A ceiling was written against this
		// number and withdrawn — `engineering/decisions/2026-08-03-performance-guard.md`
		// § Slice 4 has the three reproduced results that killed it, and the four
		// constraints a future guard has to satisfy (#1586). Its value meanwhile is
		// that every nightly run accumulates real-runner boot data, which is exactly
		// what nobody had when trying to pick that number.
		//
		// MEASURED FROM THE PAGE'S NAVIGATION START, not from this function's entry.
		// `performance.now()` inside the document is relative to that document's own
		// navigation, so the span covers connect + HTML + parse + every blocking and
		// deferred script, then hydrate, chunk load and render. Wall time around these
		// two waits would begin AFTER `page.goto(…, 'domcontentloaded')` had already
		// resolved — which excludes the entire pre-DCL slice, so a 2s render-blocking
		// script on the boot path took real boot from 1.1s to 3.2s and moved the
		// number by nothing. A checker demonstrated exactly that, and an independent
		// red-team run reproduced the fixed span against an 18s document stall.
		// A reload re-origins `performance.now()`, so the post-reload path measures
		// the reload rather than the original visit — and a call that does NOT follow
		// a navigation would report time-since-navigation, not time-to-paint. Today
		// every caller follows one.
		//
		// NEVER ALLOWED TO FAIL OR STALL A TEST. `test.info()` throws outside a running
		// test and `evaluate` can lose the page to a teardown race — hence the catch.
		// The RACE matters as much: `page.evaluate` takes no timeout of its own and
		// resolves only when the page's main thread runs the expression, so under the
		// worker starvation this whole module exists to survive (#1572) a wedged main
		// thread would hang here — in 51 spec files — and no catch would see it. An
		// instrument that can hang the suite it measures is worse than no instrument.
		try {
			const sinceNavigation = await Promise.race([
				page.evaluate(() => Math.round(performance.now())),
				new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_000)),
			]);
			if (sinceNavigation !== null) base.info().annotations.push({ type: 'first-paint', description: `${sinceNavigation}ms` });
		} catch {
			/* not inside a test, or the page went away — nothing to annotate */
		}
	} catch (cause) {
		// ONLY a timeout gets re-labeled. Anything else — a closed page, a bug in
		// this file — is a different failure, and dressing it as "never painted"
		// would point the triager at the wrong thing. (Not hypothetical: while
		// instrumenting this very function a stray `ReferenceError` came back
		// wearing the paint-timeout message.) If the predicate ever stops matching,
		// the original error is what escapes — you lose the nicety, not the truth.
		if (!isWaitTimeout(cause)) throw cause;
		// A root that appeared and then WENT AWAY reads, from stage 2's point of view,
		// exactly like a root that never filled — same timeout, same locator. It is a
		// different defect (a frame re-set, a re-mounted preview) and pointing the
		// triager at the engine's render would be pointing at the wrong thing, so ask
		// the page which one happened. A red-team pass demonstrated the mislabeling.
		// The probe is best-effort: if the page is gone, keep the message we have.
		if (stalled.startsWith('the slide root rendered')) {
			try {
				if ((await slide.count()) === 0) stalled = 'the slide root rendered and then vanished (the preview frame was re-set under the wait)';
			} catch {
				/* page/frame unreachable — the original wording stands */
			}
		}
		// A bare locator timeout names the locator and nothing else, which sends a
		// triager reading the reporting spec — the one place the cause is NOT. Say
		// what stalled, and that it is the fixture's setup rather than the subject.
		// Elapsed AND budget, not budget alone: a caller that narrowed the budget to
		// near-zero (having spent it upstream) would otherwise report "within 0.001s".
		// The underlying error is NOT re-printed here: Playwright renders `cause` as
		// its own `[cause]:` block, so quoting the message would print it twice.
		throw new Error(
			`The Studio never painted its first slide — ${stalled} — after ` +
				`${((Date.now() - started) / 1000).toFixed(1)}s of a ${(budget / 1000).toFixed(1)}s budget ` +
				`(\`${LIVE_PREVIEW}\` » \`.lattice\`).\n` +
				'This is the shared fixture wait, not an assertion in the spec that reported it: ' +
				'the usual cause is a starved worker (re-run with --workers=2) or an engine chunk ' +
				'that never loaded, not a defect in that spec’s subject. See #1572.',
			{ cause },
		);
	}
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
