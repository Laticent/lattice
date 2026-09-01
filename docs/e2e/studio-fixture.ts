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
	/**
	 * The Inspector's pill-tab names, per scope. They are the LOCATION of nearly every
	 * setting, so a rename moves controls out from under a spec exactly the way #780's
	 * accessible-name drift did — and the 2026-08-18 regroup renamed and merged several
	 * at once (deck `Marks`→`Chrome`; slide `Status`+`Decoration`→`Marks`; a new deck
	 * `General`). Address a tab through here, never by a bare literal.
	 * Source of truth: DECK_TABS in StudioShell.tsx, tabDefs in SlideContext.tsx.
	 */
	deckTab: {
		look: 'Look',
		chrome: 'Chrome',
		general: 'General',
		accent: 'Accent',
		motion: 'Motion',
		speech: 'Speech',
	},
	slideTab: {
		look: 'Look',
		notes: 'Notes',
		chrome: 'Chrome',
		marks: 'Marks',
		accent: 'Accent',
		motion: 'Motion',
		comments: 'Comments',
	},
	/** Activity-bar toggle for the Coach (deterministic deck assessment) panel. */
	coach: 'Toggle Coach',
	/** Activity-bar toggle for the Chat (AI conversation) panel — a separate peer of the Coach. */
	chat: 'Toggle Chat',
	/** Activity-bar toggle for the Reader views panel — a first-class peer of the Architect.
	 *  Renamed from "Toggle Reader views" in #1211: the panel it opens is titled "Reader views",
	 *  as is the drawer row, so the launcher agreed with neither. "Lenses" survives only as
	 *  the internal name (lensesBody, lens-picker, /lib/lente). */
	lenses: 'Toggle Reader views',
	/** The Reader views panel's deck-level "Readers land on" select — front matter's `lens-default:`,
	 *  the view a reader STARTS in (2026-08-25-lens-view-defaults-and-depth.md §3). A radix
	 *  SelectTrigger, so it is addressed by role="combobox" + this aria-label. */
	landingView: 'The view readers land on',
	/** Activity-bar toggle for the Library (saved themes / components / finishes) panel. */
	library: 'Open Library',
	/** The deck-switcher / workspace launcher in the top bar. */
	workspaceLauncher: 'Workspace launcher',
	/** The workspace-settings sheet trigger. */
	workspaceSettings: 'Workspace settings',
	/** The version-history sheet trigger — DECK checkpoints. Distinct from an ASSET's
	 *  earlier versions (`assetVersions`), which is deliberately not named "Version
	 *  history" so this bare, substring-matched literal stays unambiguous. */
	versionHistory: 'Version history',
	/** A Library card's link to that ASSET's earlier versions. Rendered only when the
	 *  asset HAS history, and the full accessible name carries the label and count
	 *  (`Earlier versions of Handedit (1)`), so specs match it as a prefix. The dialog
	 *  it opens is titled "Earlier versions". See docs/src/components/studio/AssetVersions.tsx. */
	assetVersions: 'Earlier versions of',
	/**
	 * The add-slide gallery — ONE door, and as of #1654 one name on every launcher that
	 * opens it: the preview rail's `+`, the editor header's button, the mobile drawer row
	 * (Edit pane, behind `moreControls`), the command palette's "Add a slide…", and the
	 * Compose divider's "Add slide below". They used to read five different things
	 * ("Add slide" / "Insert component" / "Insert a component…" / "Insert slide below"),
	 * which is what the issue reported.
	 *
	 * Consequence for specs, and it is worse than "two controls share a name". Playwright's
	 * `getByRole` name option is a SUBSTRING match unless you pass `exact: true`, so
	 * `'Add slide'` also matches every Compose divider's **"Add slide below"** — one per
	 * slide. On the 7-slide seed deck in Compose, a bare
	 * `getByRole('button', { name: CHROME.addSlide })` resolves to NINE elements, and the
	 * count grows with the deck. Match it `exact: true` (as `openAddSlide` and
	 * `openAddSlideFromRail` below both do) or scope it, but never bare.
	 */
	addSlide: 'Add slide',
	/** The dialog/sheet the five launchers open — `SlidePicker`'s own title. */
	addSlideDialog: 'Add a slide',
	/**
	 * "Send feedback" — a 1-tap header button on tablet AND desktop, at the same tail
	 * slot in both headers (directly above Settings in the right-hand run), so it holds
	 * position across the Read/Write/Craft dial. On MOBILE there is no header button:
	 * it is a `role="button"` row inside the StudioDrawer, behind `moreControls`.
	 */
	feedback: 'Send feedback',
	/**
	 * The PHONE's "···" overflow trigger — mobile (≤699) ONLY. It opens the StudioDrawer,
	 * a bottom Sheet whose rows are plain `role="button"`.
	 *
	 * THE NAME IS NOT SHARED WITH TABLET/DESKTOP, and this entry used to say it was. Read
	 * that correction before writing a locator, because believing the old text is how #1876
	 * got filed: the ⋯ at tablet is `searchOverflow` ('More controls'), so a spec — or a
	 * person — looking for 'Menu' at 820px finds NOTHING and concludes the overflow is
	 * absent. It is not. Measured on the built site, Craft stop, search closed:
	 *
	 *   | viewport | 'Menu' | 'More controls' |
	 *   |---|---|---|
	 *   | 390  | 1 | 0 |
	 *   | 820  | 0 | 1 |
	 *   | 1440 | 0 | 1 |
	 *
	 * The 2026-08-18 header pass made `overflowMenu` (aria-label "More controls") the row's
	 * permanent right edge from 700 up and left this bare `mobile &&` button as the only
	 * 'Menu' in the tree — `studio-header-fit.spec.ts` was reconciled with that world ("the
	 * overflow menu is now permanent from 700 up") and this map was not. `overflow-trigger-
	 * names.spec.ts` now pins the table above so the two cannot drift apart again.
	 */
	moreControls: 'Menu',
	/**
	 * The "···" overflow trigger at TABLET and DESKTOP (≥700) — the row's permanent right
	 * edge, present whether or not the inline search is open. Rows inside it are
	 * `role="menuitem"` (a flat Radix DropdownMenu), NOT the `role="button"` rows the
	 * phone's drawer ships, so a spec asserting on a row must pick the role for its tier.
	 *
	 * At tablet it is the ONLY route to Coach / Chat / Library / Reader views — the
	 * activity rail that carries them one-tap is gated on `desktop && craft` — so it is
	 * also the control whose disappearance would make four panels genuinely unreachable.
	 * That is #1381, and `studio-header-fit.spec.ts` guards it at nine widths.
	 *
	 * ITS DOCSTRING USED TO SAY "exists only while the field is open", which was true
	 * before the 2026-08-18 pass and is false now: the same button is the row's ⋯ with the
	 * field CLOSED, and it additionally absorbs the right-hand cluster when the field
	 * opens. The header-fit spec already relies on the corrected behavior — it uses this
	 * name as its always-present settle signal at every width from 700 up.
	 *
	 * The two names are never on screen together: 'Menu' is `mobile &&`, this one is
	 * `!mobile` (plus the search-expanded branch). That is also what keeps
	 * `back-gesture.spec.ts` honest — it asserts on a bare 'Menu' at phone widths, and the
	 * `/studio/` SSR skeleton already ships two inert ones.
	 */
	searchOverflow: 'More controls',
	/**
	 * The three posture-dial segments, in dial order. Desktop + tablet only — the
	 * phone header gates the dial on `!mobile`, so there is no posture control there.
	 *
	 * Listed here because the third stop's accessible name CHANGED on 2026-08-11
	 * ("Build — every panel" → "Craft — every panel", the Craft rename), and the
	 * spec that steps the dial had it hardcoded — the exact #780 shape this map
	 * exists to prevent, on a suite that only runs nightly. The transient variant a
	 * summoned panel produces is `<hint>, showing temporarily`.
	 *
	 * LOCATION CHANGED 2026-08-16 (names did not): the dial now sits BEFORE Present
	 * and Share in both headers, where it used to follow them, so the filled CTA is
	 * the last labeled control in the row
	 * (2026-08-16-studio-toolbar-placement.md). Recorded here because the selector
	 * contract covers a control's location as well as its name, and because the
	 * #1371 tail-x invariant now reads `rule · dial · Present · Share · feedback` —
	 * the two headers must keep that order IDENTICAL or the cluster slides on every
	 * dial step. The dial's own x-stability is still not asserted by
	 * `studio-header-fit.spec.ts` (its `TAIL` list omits it), though it does hold —
	 * measured stable at 1100/1280/1440/1920 across all three stops.
	 */
	postureStops: ['Read — just the slides', 'Write — editor + preview', 'Craft — every panel'],
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
 *
 * TWO conditions, because the island attribute ALONE FIRES TOO EARLY (#1815, measured).
 * `@astrojs/react`'s client wraps `hydrateRoot` in `startTransition`, which returns immediately —
 * so the island's `await this.hydrator(...)` resolves and it drops `ssr` while React has not yet
 * done its work, and a click in that window is still swallowed.
 *
 * HOW EARLY: take the ORDERING as the finding and the magnitude as an illustration. Measured on
 * the Playground's Galleries trigger, `ssr` dropped roughly **30–70ms** before React's per-node
 * marker appeared — 31–70ms on a desktop context and 39–48ms under `devices['Pixel 5']`, two
 * independent runs. `ssr` was never late, in any run of either.
 *
 * A NOTE ON THE NUMBER YOU MIGHT EXPECT TO SEE HERE. An earlier probe put this at 81–118ms by
 * measuring `ssr` → the first synthetic click that actually opened the sheet. That probe clicked
 * the control on EVERY animation frame until one worked, which perturbs the very hydration it is
 * timing — so treat its figure as an upper bound produced by the measurement, not as the gap. The
 * marker-based number above is the one to quote; both agree on the sign, which is the part the
 * gate rests on.
 *
 * The second condition is React's OWN per-node marker, `__reactFiber$…` / `__reactProps$…`. Be
 * precise about what that proves: React assigns them in `completeWork` — the RENDER phase, not
 * the commit — so in principle the marker can precede the commit. This is a behavioral gate, not
 * a proof. Be equally honest about what is NOT evidence: there is no sound measurement of when a
 * click starts to work, because the only instrument for that is the per-frame clicking probe this
 * docblock has just disavowed — and an independent run of it put the first apparently-working
 * click BEFORE the marker, which if taken at face value would make this gate conservative rather
 * than coincident. Late is the safe direction — it costs each caller ~30–70ms of wait it may not
 * strictly need, and buys correctness — so that reading is fine either way; what is
 * actually measured is narrower: the marker never precedes the `ssr` drop, and Playwright's own
 * click round-trip covers the remainder. It is a React internal, deliberately: the alternative is
 * a per-surface app signal, and there isn't one that covers every control this helper is pointed
 * at. The failure direction is safe — if a React upgrade renamed it, this poll TIMES OUT LOUDLY
 * rather than certifying an unwired control.
 * (Consequence: this helper is for REACT controls. A non-React island control never satisfies it.)
 *
 * Scope of the claim: this CLOSES A MARGIN, it does not fix an observed failure at the three
 * `back-gesture.spec.ts` call sites. Gated on the island attribute alone, a click still landed
 * 8/8 under the same stress — Playwright's own click round-trip happens to cover a gap this size.
 * The point is that it was covering it by luck, on a budget nobody chose. Nothing PINS this second
 * condition either: delete it and every spec stays green, because the margin re-hides. Its
 * evidence is the measurement above, not a test — so treat it as load-bearing when editing.
 */
export async function controlReady(control: Locator): Promise<void> {
	await control.waitFor({ state: 'visible' });
	await expect
		.poll(
			() =>
				control.evaluate((el) => {
					const i = el.closest('astro-island');
					if (!i || i.hasAttribute('ssr')) return false;
					return Object.keys(el).some((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactProps$'));
				}),
			{ timeout: 20_000 },
		)
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

/**
 * Open the Deck inspector AND select one of its tabs. The panel always opens on Look,
 * so a spec that wants a control in another tab owes the click — two specs were silently
 * red for want of exactly that (see the note above `openChromeTab` in inspector.spec.ts).
 */
export async function openInspectorTab(page: Page, tab: keyof typeof CHROME.deckTab): Promise<void> {
	await openInspector(page);
	await page.getByRole('tab', { name: CHROME.deckTab[tab] }).click();
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
	await expect(page.getByText('Deck read')).toBeVisible();
}

/** Open the Chat panel — a separate launcher peer of the Coach. */
export async function openChat(page: Page): Promise<void> {
	await page.getByRole('button', { name: CHROME.chat }).click();
	await expect(page.getByRole('textbox', { name: 'Message the Architect' })).toBeVisible();
}

/** The gallery is up and interactive. Its placeholder differs per breakpoint
 *  (`Search slides…` vs `Search 61 slides — …`), so the locator covers both. */
function addSlideReady(page: Page): Promise<void> {
	return page.getByPlaceholder(/Search slides|Search \d+ slides/).waitFor();
}

/**
 * Open the add-slide gallery (`SlidePicker`) and wait for it to be usable.
 *
 * There is no header launcher on a phone: the row lives in the StudioDrawer behind "Menu",
 * and only on the Edit pane — so a desktop-shaped open simply times out at 390px. Pass
 * `compact` (`testInfo.project.name === 'mobile'`) to take the drawer route.
 *
 * `exact: true` keeps this off the Compose divider's "Add slide below" (see `CHROME
 * .addSlide`); `.first()` then picks between the rail `+` and the editor-header button,
 * which share the name because they are one door (#1654). Either opens the same gallery,
 * so which one it lands on is not load-bearing — `openAddSlideFromRail` is there for a spec
 * that means the rail specifically.
 */
export async function openAddSlide(page: Page, compact = false): Promise<void> {
	if (compact) {
		await page.getByRole('button', { name: 'Markdown source' }).click();
		await page.waitForTimeout(600);
		await page.getByRole('button', { name: CHROME.moreControls }).click();
	}
	await page.getByRole('button', { name: CHROME.addSlide, exact: true }).first().click();
	await addSlideReady(page);
}

/**
 * Open the gallery from the PREVIEW RAIL specifically — the launcher the issue reporter
 * used, and the one `openAddSlide`'s `.first()` does not reach on desktop (the editor
 * header precedes it in the DOM). Scoped through the rail's own `Duplicate slide` sibling
 * rather than by index: the rail is the one slide-op group that has one, so the scope
 * survives a chrome reshuffle that an `.nth()` would not.
 */
export async function openAddSlideFromRail(page: Page): Promise<void> {
	const rail = page.getByRole('button', { name: 'Duplicate slide', exact: true }).locator('..');
	await rail.getByRole('button', { name: CHROME.addSlide, exact: true }).click();
	await addSlideReady(page);
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
