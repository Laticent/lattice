import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// The Studio top bar is one non-wrapping flex row in which every control is
// `shrink-0` except the deck switcher. When it runs out of width it does not wrap
// or scroll — the controls at its end simply leave the screen, silently. That is
// #1381 (the ⋯ Menu, a tablet's only route to Library / Reader views / Workspace
// settings, pushed clean off a 700px viewport) and it is the standing failure mode
// of every future addition to this row.
//
// Two guards existed for it and NEITHER can block a merge on its own:
//   • `check:overflow` measures the real geometry, but its CI step is
//     `continue-on-error` — it can go red without failing anything.
//   • the `StudioShell.test.tsx` cover runs in jsdom, which has NO LAYOUT. It can
//     assert what renders; it cannot assert that what renders FITS.
// So the fit itself was held by desk arithmetic, and #1401 then had to re-derive it
// from scratch. This spec is the missing MEASURED oracle: a real browser, the real
// built site, the eight widths the header claims to support, on the per-PR `@smoke`
// subset. It does not block a merge either — `studio-smoke` is deliberately advisory
// until a nightly green streak promotes it (#800, and the experience-gating framework
// in 2026-06-28-experience-gating-playwright.md §3) — but it turns "someone should
// re-measure" into a run that reports on every PR touching the docs.
//
// It asserts four things at once, because they are one contract:
//   1. the header fits inside itself (`scrollWidth <= clientWidth`);
//   2. the ⋯ Menu — the control the overflow eats first — is fully on-screen;
//   3. Read / Write / Craft render as WORDS at every width the dial appears at
//      (#1401: below 1100 the words were not merely hidden but unreachable on a
//      touch tablet, where the tooltip carrying them never fires);
//   4. the deck pill's own content fits inside the deck pill (#1417) — the one
//      failure the first three are all structurally blind to, see `readPill`.
// Plus the invariant #1371 shipped: the tail controls hold their x across the three
// dial stops, so stepping the dial never slides the row under your finger.

// 1280 is in this list because it is where the row broke and nothing saw it. `XL` was
// declared below as a threshold the assertions reason ABOUT, while the viewport list
// stepped 1100 → 1440 straight over it — so the one width where Tailwind's `xl` turns on
// the ⌘K label AND the Craft row is at its tightest was never actually rendered. A
// breakpoint this file already names is a width it should visit.
const WIDTHS = [700, 720, 760, 820, 1024, 1099, 1100, 1280, 1440];
const DESKTOP = 1100; // the app's own boundary (use-breakpoint.ts), not Tailwind's `lg`
const XL = 1280; // Tailwind's `xl` — where the deck pill grows its slide-count meta
const TOLERANCE = 2; // sub-pixel rounding, same as check:overflow
const X_DRIFT = 1; // sub-pixel only: #1371's defect was a 70px jump, not a rounded pixel
// Every geometry read waits for the row to STOP MOVING first. Stepping the dial at
// ≥1100 swaps the slim header for the full one, and the deck pill then reflows for
// ~100ms (250px → 240px), dragging Present from 630 to 616 as it goes. A read taken
// the instant React commits the button is a read of a row mid-flight: it reported
// 616 / 616 / 631 locally and 616 / 616 / 617 on CI — the SAME defect, sized by how
// busy the machine is. A tolerance cannot fix that; it only picks which machines
// flake. Waiting for two consecutive identical reads can, and it makes the assertions
// mean what they say: the SETTLED row fits, and the SETTLED cluster does not move.
const SETTLE_STEP_MS = 100;
const SETTLE_TRIES = 40; // 4s ceiling — far past the ~100ms reflow, still bounded
// The row must not merely FIT at its floor — it must fit with room left. `scrollWidth <=
// clientWidth` cannot fail until the row is ALREADY over; this is the tripwire that goes
// off while there is still margin to lose.
//
// READ THE BASIS BEFORE CHANGING THE NUMBER. Spare is measured as extra content the row
// can absorb before `scrollWidth` exceeds `clientWidth`, and that measurement was re-based
// once already: when the header became `overflow-x: auto`, the same physical row went from
// reporting 35px to 25px, because an `overflow: visible` box omits its end padding from
// `scrollWidth` and a scroll container includes it. The row did not change; the ruler did.
// A number compared against the wrong basis is worse than no number.
//
// **RE-BASED A SECOND TIME (#1417), and this one was not a change of ruler — it was the
// discovery that the ruler had been reading a number that did not exist.** The old
// measurement was 25px. Roughly 20 of those 25 were the deck pill shrinking past the
// intrinsic width of its own `shrink-0` children: capacity the row could only "spend" by
// rendering its own chevron outside the pill's box. Floor the pill honestly and the SAME
// pre-fix row measures **-11px** — it did not fit at 700px at all, and never had. So the
// old 25 was not headroom that this change consumed; it was headroom that was never there.
//
// Measured today, on the floored row: **19px** (700px, Craft stop, fonts loaded), agreeing
// to the pixel between `spareAt` here and an independent puppeteer rig. The floor stays at
// **16** — unchanged, and now met HONESTLY for the first time. Note the tolerance is
// thinner than it was (3px, not 9): the fonts are self-hosted woff2 and this spec waits on
// `document.fonts.ready`, so cross-runner metric drift should be sub-pixel rather than the
// several px the original 9 was guarding against. If CI ever does flake here, the answer is
// to free width in the row, NOT to lower this number.
//
// One `icon-sm` control plus its gap is 38px, so a whole new control does not merely trip
// this, it overflows the row outright.
//
// What it is NOT: a guarantee about the FALLBACK font. With the webfont blocked the dial
// grows 219px → 240px and spare falls to ~4px — the row still fits (`over` is 0), but no
// floor in this range would hold there. That state is excluded by design: the spec waits
// for `document.fonts.ready`, so this number always describes the same font state. What
// USED to happen in that state — the pill silently absorbing the extra 21px by clipping
// itself — is now caught by `readPill` regardless of font state, since that assertion is
// about the pill against its own content, not against a width budget.
//
// It is a FLOOR, not a target. If a change frees width, raise it to match — the same
// ratchet discipline every budget in `tools/check-ownership.js` carries, so the margin
// cannot erode one PR at a time. Lowering it is how this row regresses.
const MIN_SPARE_AT_FLOOR = 16;

// Step the dial by ARIA NAME, never by text: an icon-only dial has no text, so a
// textContent lookup would match nothing, the click would be a no-op, and every
// control would report "stable" for the emptiest possible reason. `aria-pressed`
// flipping is what proves the step actually happened.
// Names come from CHROME.postureStops, not hardcoded here: the third stop was
// renamed Build → Craft on 2026-08-11, and this list is nightly-only, so a private
// copy is the #780 drift waiting to happen. The visible WORD is the last space-
// separated token before the em dash — the dial renders exactly that.
const STOPS = CHROME.postureStops.map((name) => ({ name, word: name.split(' —')[0] }));

/** The tail controls whose x must not move when the dial steps (#1371). Present and
 *  Share are in both headers; the rest exist per tier, and a missing one is skipped
 *  rather than failed — the comparison is across STOPS at one width, not across widths.
 *  Names come from `CHROME` where the contract already carries them, so a rename is a
 *  one-file fix there (the #780 failure mode) rather than a sweep. 'Present', 'Share'
 *  and the tablet 'Settings' button have no CHROME entry — 'Slide settings' is a
 *  different control — so they stay literal here. */
// The row's trailing run. `Settings` used to be here and is not any more: it was a
// tablet-only inline button, and the 2026-08-18 width ladder moved it into the overflow
// menu at every width along with Coach and Chat. `searchOverflow` closes the run at every
// width from 700 up — it is the row's permanent right edge.
const TAIL = ['Present', 'Share', CHROME.feedback, CHROME.searchOverflow];

type HeaderShape = { over: number; menu: { x: number; right: number } | null; x: Record<string, number>; tall: { name: string; h: number }[] };

async function readHeader(page: import('@playwright/test').Page, tail: string[], menuName: string): Promise<HeaderShape> {
	return page.evaluate(([names, menuLabel]) => {
		const h = document.querySelector('[data-studio-root] header');
		if (!h) throw new Error('no [data-studio-root] header — the selector or the route moved');
		// Rewind the row before reading any rect. The header is a scroll container now
		// (StudioShell's `overflow-x-auto`), so every `getBoundingClientRect().x` is a
		// function of `scrollLeft` — and merely FOCUSING the ⋯ Menu makes the browser
		// scroll it into view. Without this, "the ⋯ Menu is fully on-screen" could be
		// satisfied by the very scrolling that only happens when the row does NOT fit,
		// i.e. the oracle would go green exactly when its defect is present. Measured:
		// at `minimumFontSize: 24` and 700px, `menu.right` reads 745 at `scrollLeft: 0`
		// and 690 after focus scrolls it 55px, with the row 55px over throughout.
		h.scrollLeft = 0;
		const at = (name: string) => {
			const el = [...h.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === name);
			return el ? el.getBoundingClientRect() : null;
		};
		const menu = at(menuLabel);
		const x: Record<string, number> = {};
		for (const n of names) {
			const r = at(n);
			if (r) x[n] = Math.round(r.x);
		}
		// The VERTICAL oracle. Everything else in this file measures the row's WIDTH, so a
		// control that runs out of horizontal room and resolves it by WRAPPING is invisible
		// to all of it: `scrollWidth === clientWidth` the whole time, because the row did
		// fit — the control just got taller than the bar. That is exactly how the ⌘K pill
		// shipped two-line and 56px tall inside a 54px header at 1280 in Craft, in both
		// color modes, with every horizontal guard green. A control taller than the bar it
		// sits in is clipped by definition, so this needs no tolerance past rounding.
		const tall = [...h.querySelectorAll('button')]
			.map((b) => ({
				name: b.getAttribute('aria-label') || (b.textContent || '').trim().slice(0, 40) || '<button>',
				h: Math.round(b.getBoundingClientRect().height),
			}))
			.filter((c) => c.h > h.clientHeight + 1);
		return {
			over: h.scrollWidth - h.clientWidth,
			menu: menu ? { x: Math.round(menu.x), right: Math.round(menu.right) } : null,
			x,
			tall,
		};
	}, [tail, menuName] as const);
}


type PillShape = { width: number; floor: number; needs: number; spill: number; title: number };

/**
 * The deck pill, measured against ITSELF (#1417).
 *
 * Everything else in this file is downstream of `header.scrollWidth`, and the deck pill is
 * the single element that can never be caught that way: it is the row's designated shock
 * absorber (`min-w-0` + a truncating title, every sibling `shrink-0`), so its whole job is
 * to keep `header.scrollWidth` quiet while it takes the pressure. Left unfloored it shrank
 * BELOW the intrinsic width of its own `shrink-0` children, which then painted outside its
 * border box — a visibly sliced chevron, 20.5px out at 700px in the fallback-font state,
 * with `header.scrollWidth - clientWidth === 0` the whole time.
 *
 * `pill.scrollWidth` does not catch it either, which is why this is a geometric read: an
 * `overflow: visible` box omits its end padding from `scrollWidth`, so 11px of real spill
 * reported as 1px — inside this file's own 2px tolerance. Measured, not assumed.
 *
 * Returns, all in px:
 *   `needs`  the width the pill's non-shrinking content genuinely occupies (paddings +
 *            gaps + every `shrink-0` child), derived LIVE from the rendered box — so it
 *            re-derives itself when the padding, the gap, or the child set changes;
 *   `floor`  the `min-width` the component declares. Asserting `floor >= needs` is what
 *            stops that declared number from rotting the moment someone re-tunes the
 *            padding — the alternative is a magic constant nothing checks;
 *   `spill`  how far the outermost child reaches past the pill's PADDING box. The padding
 *            box, not the border box, so this trips while there is still padding to lose
 *            rather than only once ink is already outside the control;
 *   `title`  the rendered width of the truncating deck title. Not asserted as a floor —
 *            at the 700px tablet stop the row genuinely cannot afford many characters —
 *            but reported, because "the title rendered at 0px" is what this defect looked
 *            like to a human long before anything was measurably outside the box.
 *
 * Returns `null` when the pill is not in the header at all, which is a REAL state and not
 * an error: at desktop the Read stop renders the calm slim header, where the deck is a
 * label rather than a switcher. The caller decides which states may legitimately be null
 * (see `pillExpected`), so an accidentally-vanished pill still fails rather than passing
 * as "nothing to measure".
 */
async function readPill(page: import('@playwright/test').Page): Promise<PillShape | null> {
	return page.evaluate(() => {
		const h = document.querySelector('[data-studio-root] header');
		if (!h) throw new Error('no [data-studio-root] header — the selector or the route moved');
		h.scrollLeft = 0;
		const pill = h.querySelector('[data-demo="deck-switcher"]');
		if (!pill) return null;
		const cs = getComputedStyle(pill);
		const r = pill.getBoundingClientRect();
		const px = (v: string) => Number.parseFloat(v) || 0;
		// `display: none` children are not flex items — no box, no gap, nothing to spill.
		const kids = [...pill.children].filter((el) => getComputedStyle(el).display !== 'none');
		const gap = px(cs.columnGap === 'normal' ? '0' : cs.columnGap);
		const rigid = kids.filter((el) => getComputedStyle(el).flexShrink === '0');
		const needs =
			px(cs.paddingLeft) +
			px(cs.paddingRight) +
			gap * Math.max(0, kids.length - 1) +
			rigid.reduce((a, el) => a + el.getBoundingClientRect().width, 0);
		const padLeft = r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft);
		const padRight = r.right - px(cs.borderRightWidth) - px(cs.paddingRight);
		const spill = Math.max(0, ...kids.map((el) => Math.max(padLeft - el.getBoundingClientRect().left, el.getBoundingClientRect().right - padRight)));
		const titleEl = pill.querySelector('.truncate');
		return {
			// clientWidth = the padding box, which is exactly what `needs` is expressed in.
			width: pill.clientWidth,
			floor: px(cs.minWidth),
			needs: Math.round(needs * 10) / 10,
			spill: Math.round(spill * 10) / 10,
			title: titleEl ? Math.round(titleEl.getBoundingClientRect().width) : -1,
		};
	});
}

/** `readHeader`, but only once two consecutive reads agree — see SETTLE_STEP_MS above. */
async function readHeaderSettled(page: import('@playwright/test').Page, tail: string[], menuName: string): Promise<HeaderShape> {
	let prev = await readHeader(page, tail, menuName);
	for (let i = 0; i < SETTLE_TRIES; i++) {
		await page.waitForTimeout(SETTLE_STEP_MS);
		const next = await readHeader(page, tail, menuName);
		if (JSON.stringify(next) === JSON.stringify(prev)) return next;
		prev = next;
	}
	// Never silently accept an unsettled row: a header still moving after 4s is itself
	// the finding, and reporting it as a measurement would hide it.
	throw new Error(`the header never settled after ${(SETTLE_TRIES * SETTLE_STEP_MS) / 1000}s — last read ${JSON.stringify(prev)}`);
}

/**
 * How much MORE could this row carry before it clips? Binary-searches the width of a
 * rigid probe appended to the header, then removes it.
 *
 * The probe must carry INK. An empty `<div>` of any width does not grow a flex row's
 * `scrollWidth` in Chrome, so an empty probe reports infinite headroom — measured, and
 * it is exactly the kind of silently-passing measurement this file exists to prevent.
 */
async function spareAt(page: import('@playwright/test').Page, tolerance: number): Promise<number> {
	return page.evaluate((tol) => {
		const h = document.querySelector('[data-studio-root] header');
		if (!h) throw new Error('no [data-studio-root] header');
		const probe = document.createElement('span');
		probe.textContent = '·';
		probe.style.cssText = 'flex:0 0 auto;display:inline-block;overflow:hidden;visibility:hidden';
		h.appendChild(probe);
		const fits = (px: number) => {
			probe.style.width = `${px}px`;
			void (h as HTMLElement).offsetWidth; // force layout
			return h.scrollWidth - h.clientWidth <= tol;
		};
		try {
			if (!fits(0)) return -1;
			let lo = 0;
			let hi = 400;
			while (lo < hi) {
				const mid = Math.ceil((lo + hi) / 2);
				if (fits(mid)) lo = mid;
				else hi = mid - 1;
			}
			return lo;
		} finally {
			probe.remove(); // never leave the probe behind — later widths measure the real row
		}
	}, tolerance);
}

test('@smoke the Studio header fits — and keeps its words — at every supported width', async ({ page }) => {
	test.slow(); // 8 widths x 3 dial stops in one page: headroom, not an expectation
	await gotoStudio(page);
	// Measure in ONE font state. `docs/src/styles/fonts.css` ships `font-display: swap`,
	// so the page genuinely renders in system-ui first and reflows when Outfit lands —
	// and the fallback is 21px wider on the dial alone. Timed on this machine, Outfit
	// landed 7ms after `gotoStudio`'s readiness gate; a cold cache or a busy runner puts
	// the measurement on the other side of that. Every number here would then be a
	// coin-flip between two layouts. `document.fonts.ready` makes the state deterministic.
	await page.evaluate(() => document.fonts.ready);
	// EVERY query below is scoped to the Studio header, never to the page. A local
	// `astro dev` run injects its own dev-toolbar buttons — including one named
	// "Menu" — into the accessibility tree, which turns a page-wide role query into
	// a strict-mode failure or, worse, a count assertion that reads 2 and blames the
	// app (responsive.spec.ts carries the same warning for its "Settings" button).
	// Scoping is also just more honest: the claim is about THIS row, not the page.
	const header = page.locator('[data-studio-root] header');

	for (const width of WIDTHS) {
		await page.setViewportSize({ width, height: 900 });
		const compact = width < DESKTOP;
		// Wait on an OBSERVABLE consequence of the re-layout rather than on a sleep, so the
		// measurement can never race it.
		//
		// It used to wait on "the ⋯ Menu exists below 1100 and not at/above it" — a signal
		// that only worked because the row was built in TIERS, which is exactly what the
		// 2026-08-18 pass removed. The overflow menu is now permanent from 700 up: it is the
		// row's right edge at every width, and what sits inside it is decided by width alone.
		// So the settle signal is the SEARCH pill, which is present at every width and whose
		// LABEL appears at `xl` — a width-driven change that still proves the re-render ran.
		await expect(header.getByRole('button', { name: CHROME.searchOverflow, exact: true })).toHaveCount(1);
		await expect(header.getByRole('button', { name: /Search or run/ })).toHaveCount(1);

		const perStop: Record<string, HeaderShape> = {};
		for (const stop of STOPS) {
			const button = header.getByRole('button', { name: stop.name }).first();
			await button.click();
			// The step really happened — see the note on STOPS above.
			await expect(button, `${stop.word} @ ${width}px should be the lit stop`).toHaveAttribute('aria-pressed', 'true');
			// …and the dial SHOWS the word (#1401). "Shows" is the hard part: every cheap
			// proxy leaks, and enumerating CSS shapes is a losing game — the previous version
			// of this block listed eight of them and still let `clip-path: inset(50%)` through,
			// because that idiom hides a word without touching its box. So the check is mostly
			// GENERAL rather than a list: does the browser actually paint this span, here?
			//   `toHaveText`            reads textContent; blind to all CSS.
			//   `toBeVisible`           catches display/visibility/zero-box only.
			//   box >= 8x6              catches `sr-only` and every 1x1 collapse.
			//   opacity + ink alpha     catches `opacity: 0` and `color: transparent` — parsed
			//                           from ANY color syntax, since this app's tokens resolve
			//                           to `oklch(… / a)` and `color(… / a)`, not just `rgba()`.
			//   `clipPath === 'none'`   catches the modern visually-hidden idiom.
			//   hit test at its center  catches what no property check can: painted off-screen,
			//                           clipped by an ancestor, or covered. If the browser does
			//                           not return this node (or its own subtree/ancestry) at the
			//                           middle of its own box, a human is not reading it there.
			await expect(button, `${stop.word} @ ${width}px should render its word`).toHaveText(new RegExp(stop.word));
			const word = button.getByText(stop.word, { exact: true });
			await expect(word, `${stop.word} @ ${width}px should be VISIBLE, not just present`).toBeVisible();
			const legible = await word.evaluate((el) => {
				const r = el.getBoundingClientRect();
				const cs = getComputedStyle(el);
				// Alpha out of any CSS color: modern syntaxes put it after a slash
				// (`oklch(.5 0 0 / 0)`, `color(srgb 0 0 0 / 0)`), legacy `rgba()` puts it
				// fourth. Percentages count too.
				const alphaOf = (color: string) => {
					const slash = color.match(/\/\s*([0-9.]+%?)\s*\)/);
					if (slash) return slash[1].endsWith('%') ? Number.parseFloat(slash[1]) / 100 : Number(slash[1]);
					const legacy = color.match(/rgba?\(([^)]+)\)/);
					if (legacy) {
						const parts = legacy[1].split(',');
						return parts.length > 3 ? Number(parts[3].trim()) : 1;
					}
					return color === 'transparent' ? 0 : 1;
				};
				// `hit === el` or one of ITS OWN descendants — deliberately not "an ancestor
				// was hit". An ancestor showing through at the label's centre is the signature
				// of the label being clipped away, so accepting it would have passed exactly the
				// case this is here to catch (measured: a zero-width `overflow: hidden` wrapper).
				const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
				return {
					width: Math.round(r.width),
					height: Math.round(r.height),
					opacity: Number(cs.opacity),
					inkAlpha: alphaOf(cs.color),
					clipPath: cs.clipPath,
					paintedHere: !!hit && (hit === el || el.contains(hit)),
				};
			});
			expect(legible.width, `${stop.word} @ ${width}px is collapsed or clipped (sr-only and friends land here)`).toBeGreaterThanOrEqual(8);
			expect(legible.height, `${stop.word} @ ${width}px has no height`).toBeGreaterThanOrEqual(6);
			expect(legible.opacity, `${stop.word} @ ${width}px is transparent`).toBeGreaterThan(0.1);
			expect(legible.inkAlpha, `${stop.word} @ ${width}px is painted in a transparent color`).toBeGreaterThan(0.1);
			expect(legible.clipPath, `${stop.word} @ ${width}px is clipped away (the modern visually-hidden idiom)`).toBe('none');
			expect(legible.paintedHere, `${stop.word} @ ${width}px is not painted where its box says it is (off-screen, ancestor-clipped, or covered)`).toBe(true);

			const shape = await readHeaderSettled(page, TAIL, CHROME.searchOverflow);
			expect(shape.over, `header self-overflow at ${width}px on ${stop.word}`).toBeLessThanOrEqual(TOLERANCE);
			expect(
				shape.tall,
				`a header control is taller than the header at ${width}px on ${stop.word} — it wrapped instead of fitting, so it is clipped (${shape.tall.map((c) => `${c.name} ${c.h}px`).join(', ')})`,
			).toEqual([]);

			// #1417 — the pill vs. itself. Read AFTER the row has settled, for the same
			// reason every other geometry read here is: the pill is what reflows on a
			// dial step, so a read taken as React commits is a read of a box mid-flight.
			//
			// The pill is in the header at every stop EXCEPT desktop Read, which renders the
			// calm slim header where the deck is a label, not a switcher. Asserting that
			// exception both ways keeps a vanished pill from passing as "nothing to measure"
			// — the disguised-coverage failure this file already closed twice elsewhere.
			const pill = await readPill(page);
			const pillExpected = compact || stop.word !== 'Read';
			if (!pillExpected) {
				expect(pill, `desktop Read renders the deck as a calm label; a switcher at ${width}px means the slim header changed`).toBeNull();
			} else {
				expect(pill, `the deck switcher should be in the header at ${width}px on ${stop.word}`).not.toBeNull();
				const p = pill as PillShape;
				expect(p.spill, `the deck pill paints ${p.spill}px of its own content outside its padding box at ${width}px on ${stop.word} (title rendered ${p.title}px)`).toBeLessThanOrEqual(TOLERANCE);
				expect(p.width, `the deck pill is ${p.width}px but its own non-shrinking content needs ${p.needs}px at ${width}px on ${stop.word}`).toBeGreaterThanOrEqual(p.needs - TOLERANCE);
				// The declared floor must still cover what the pill actually carries. This is the
				// assertion that catches a padding/gap/child-set change made without re-deriving
				// `min-w-*` in StudioShell — i.e. it keeps the constant from rotting silently.
				//
				// Below `xl` only. At ≥1280 the pill grows a fourth child — the slide-count meta,
				// which the design shows precisely BECAUSE the bar has room (the pill sits ~230px
				// wide against ~300px of spare there), so its floor is structurally unreachable
				// and pinning a `min-width` to it would encode a number that moves with the deck's
				// slide count. What the floor is FOR is the widths where the row is genuinely
				// tight, and those are the ones checked here.
				if (width < XL) {
					expect(p.floor, `the deck pill's declared min-width (${p.floor}px) no longer covers its non-shrinking content (${p.needs}px) at ${width}px — re-derive it in StudioShell's deckSwitcher`).toBeGreaterThanOrEqual(p.needs - TOLERANCE);
				}
			}
			if (compact) {
				expect(shape.menu, `the ⋯ Menu should exist at ${width}px`).not.toBeNull();
				expect(shape.menu?.right ?? Number.POSITIVE_INFINITY, `⋯ Menu right edge at ${width}px on ${stop.word}`).toBeLessThanOrEqual(width);
				expect(shape.menu?.x ?? -1, `⋯ Menu left edge at ${width}px on ${stop.word}`).toBeGreaterThanOrEqual(0);
			}
			perStop[stop.word] = shape;
		}

		// #1371: stepping the dial must not slide the controls beside it. Compared
		// only across controls present in ALL three stops — at desktop the Read/Write
		// slim header genuinely carries fewer of them, and that is not drift.
		//
		// Read from SETTLED geometry (above), so this compares finished layouts. The 1px
		// of allowance left is for genuine sub-pixel rounding between two DIFFERENT rows:
		// at ≥1100 Read and Write render the slim header and Craft the full one.
		//
		// Below 1100 the assertion is structurally satisfied — all three stops render the
		// same full header, so nothing CAN move — and it is kept anyway: it costs nothing
		// and it is what would fail if a future change reintroduced a per-stop header
		// below desktop. The load-bearing widths for it are 1100 and 1440.
		//
		// Be exact about what settling gives up: at ≥1100 the tail DOES slide briefly on
		// Write→Craft (Present travels ~15px over ~75ms at 1440 as the deck pill reflows
		// into the full header), so what is asserted here is "lands in the same place",
		// not "never moves at all". That transient predates this branch — it belongs to
		// the slim↔full header swap, which #1371 did not touch — so it is logged rather
		// than folded in (HARD RULE #18, off-path): #1414.
		const shared = TAIL.filter((n) => STOPS.every((s) => perStop[s.word].x[n] !== undefined));
		for (const name of shared) {
			const xs = STOPS.map((s) => perStop[s.word].x[name]);
			const drift = Math.max(...xs) - Math.min(...xs);
			expect(drift, `${name} moved across the dial at ${width}px (x = ${xs.join(' / ')})`).toBeLessThanOrEqual(X_DRIFT);
		}

		// Headroom, at the floor only — see MIN_SPARE_AT_FLOOR above.
		if (width === WIDTHS[0]) {
			const spare = await spareAt(page, TOLERANCE);
			expect(spare, `spare capacity at the ${width}px floor`).toBeGreaterThanOrEqual(MIN_SPARE_AT_FLOOR);
		}
	}
});

/**
 * THE OPEN STATE OF THE INLINE SEARCH (#1707).
 *
 * Everything above measures the header IDLE, and that blind spot is how the inline search
 * first shipped a burst row: with the field open at 1100 and 1160 in Craft, its min-width
 * floor made the row need 1200px, so `scrollWidth` exceeded `clientWidth` by 100px and
 * 40px. Same shape of blind spot #1687 closed when a width-only oracle missed a VERTICAL
 * burst, same remedy: when a guard misses a state, teach it the state.
 *
 * Why an overflowing row matters MORE in this state: the header's `overflow-x-auto` scroll
 * valve (#1381) is deliberately LIFTED while the field is open, because `overflow-x: auto`
 * computes `overflow-y: auto` and would clip the dropdown into the 54px band. So an
 * overflow here cannot be scrolled back into reach.
 *
 * THE ROW NOW YIELDS ITS WHOLE RIGHT-HAND SIDE while the field is open (owner's call,
 * 2026-08-17), so the tail is not merely on-screen — it is ABSENT, and that is asserted
 * below rather than left implicit. Before the yield, opening the field cost the LEFT: the
 * deck title paid for it, and at tablet (spacer = 0px from 700 through 834) the field could
 * not grow at all.
 *
 * EVERY TIER THAT GETS THE FIELD IS COVERED — desktop AND tablet, down to the 700px floor,
 * because tablet now opens the same inline field. Only the LAUNCHER differs by tier: at
 * desktop the pill is the trigger, at tablet there is no room for one, so ⌘K is the way in.
 * That difference is asserted explicitly, both ways, so a tier silently losing (or gaining)
 * its pill fails here instead of hollowing the test into a no-op.
 */
const OPEN_SEARCH_WIDTHS = [700, 768, 834, 1024, 1099, 1100, 1160, 1200, 1280, 1440, 1920];

test('the inline search does not burst the row when it opens, at every tier that has it', async ({ page }) => {
	test.slow(); // 11 widths x up to 3 stops, each with an open/close cycle
	await gotoStudio(page);
	await page.evaluate(() => document.fonts.ready);
	const header = page.locator('[data-studio-root] header');

	for (const width of OPEN_SEARCH_WIDTHS) {
		await page.setViewportSize({ width, height: 900 });
		// Wait on the observable breakpoint consequence, never a sleep.
		await expect(header.getByRole('button', { name: CHROME.searchOverflow, exact: true })).toHaveCount(1);

		for (const stop of STOPS) {
			const button = header.getByRole('button', { name: stop.name }).first();
			await button.click();
			await expect(button, `${stop.word} @ ${width}px should be the lit stop`).toHaveAttribute('aria-pressed', 'true');

			// THE LAUNCHER IS THE PILL AT EVERY WIDTH, and this assertion is the one that
			// would have caught the bug it used to encode. It read: "desktop draws the pill;
			// tablet draws NONE, because its row measures 0px of spare and a 34px pill would
			// come out of the deck title" — and it passed, while a tablet user had no visible
			// way to search at all. Owner, 2026-08-18: *"portrait on tablet hides the search
			// button? your approach is whack."*
			//
			// The premise was the mistake, not the measurement: the row genuinely had no spare
			// width, but the answer is to demote what matters less, not to delete the control
			// that reaches everything. Under the width ladder the pill persists and Coach,
			// Chat, Settings, feedback, theme and tours overflow into the menu instead.
			// Below `xl` it is an icon-only button; from `xl` it grows its label and ⌘K hint.
			const pill = header.getByRole('button', { name: 'Search or run a command' });
			await expect(
				pill,
				`at ${width}px on ${stop.word} the search pill must be in the row — it persists at EVERY width; things that matter less overflow into the menu instead`,
			).toHaveCount(1);

			await pill.first().click();
			// Wait on the OBSERVABLE consequence of opening, never a sleep.
			await expect(header.getByPlaceholder('Search or run a command…')).toBeVisible();
			await expect(pill).toHaveCount(0);

			const open = await readHeaderSettled(page, TAIL, CHROME.searchOverflow);
			expect(
				open.over,
				`the open search bursts the row at ${width}px on ${stop.word} by ${open.over}px — the scroll valve is lifted while the field is open, so this overflow CANNOT be scrolled and whatever spills is unreachable. Fix the field's sizing in CommandPalette.tsx; do not raise this tolerance.`,
			).toBeLessThanOrEqual(TOLERANCE);

			// THE TAIL YIELDS — but into the overflow menu, not into nothing. This is the
			// contract that lets the field grow without the deck title paying, so it is
			// asserted rather than assumed, and asserting ABSENCE also catches the opposite
			// regression: a tail that renders but off-viewport, which an earlier version of
			// this check allowed.
			//
			// `searchOverflow` is exempt and that exemption is the point. The row used to go
			// completely empty on the right, which the owner reported from a real iPad —
			// *"it looks really odd that it takes up all the space"* — so the hamburger stays
			// as the row's right edge and carries everything that just left. If it ever
			// vanished with the rest, the bar would read as amputated again.
			for (const name of TAIL.filter((n) => n !== CHROME.searchOverflow)) {
				expect(
					open.x[name],
					`${name} is still in the header with the search open at ${width}px on ${stop.word} — the row is supposed to yield its whole right-hand side, and if it no longer does, the width has to come from somewhere else (it used to come out of the deck title)`,
				).toBeUndefined();
			}
			expect(
				open.tall,
				`a header control is taller than the header with the search open at ${width}px on ${stop.word} (${open.tall.map((c) => `${c.name} ${c.h}px`).join(', ')})`,
			).toEqual([]);

			// Close it, so the next stop/width starts from the idle row rather than inheriting
			// an open field — the state leak that would make later widths lie. The tail coming
			// back is the observable consequence of closing at every tier, pill or not.
			await page.keyboard.press('Escape');
			// The pill comes back at EVERY width — `compact ? 0 : 1` was the old tier rule,
			// and it is the same wrong premise as the launcher assertion above.
			await expect(pill).toHaveCount(1);
			await expect(header.getByRole('button', { name: CHROME.searchOverflow, exact: true })).toHaveCount(1);
		}
	}
});
