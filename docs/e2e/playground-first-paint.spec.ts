import { PG_SPLIT_BUCKET, PG_SPLIT_KEY, PG_SPLIT_MIN, PG_SPLIT_PANEL_IDS } from '../src/components/playground/pg-split';
import { expect, test } from './studio-fixture';

// ── The Playground must not ASSEMBLE IN VIEW (#1563) ──────────────────────────────────
//
// #1553 fixed the two panes' widths. The page still built itself in front of the visitor:
// the preview handed a cached slide off to the live filmstrip at a different size and
// position, the Explore layout arrived a second after the Edit layout had already painted,
// and the toolbar showed values it was about to replace.
//
// The oracle is deliberately NOT "does it end up right" — every existing assertion on this
// surface already waits for the settled state, which is how a dead pre-paint mechanism
// passed CI for months (see the note in playground-paint.spec.ts). It is "how many
// geometries did a person see": sample every animation frame from document start and
// require exactly ONE per element.
//
// The measurement conditions come from the card: an iPad-landscape box (1194x834) with the
// CPU throttled 6x, so the pre-hydration window is wide enough to sample rather than a
// coincidence of a fast machine. Throttling is applied through CDP, which is why these live
// in their own file with their own viewport rather than joining playground-state.spec.ts.
//
// Traps this spec is shaped around, all of them paid for once already:
//   · A service worker serves the island from cache, so blocking the island's JS does NOT
//     freeze the pre-hydration state — it silently hydrates and you measure the settled
//     page. Hence the per-frame sampler rather than a frozen-page snapshot.
//   · `addInitScript` runs before `document.documentElement` exists, so a MutationObserver
//     on it throws and the flag never sets — failing on a build that works. Sample per frame.
//   · A synthetic layout written into localStorage is not the same experiment as the one the
//     app writes. Every case below drives the real control and reloads.

test.use({ viewport: { width: 1194, height: 834 } });

// Stub the heavy externals so the paint is not gated on the network (same set as
// playground-paint.spec.ts).
test.beforeEach(async ({ context }) => {
	await context.route(/mermaid.*\.js($|\?)/, (route) =>
		route.fulfill({ contentType: 'text/javascript', body: 'window.mermaid={initialize(){},run(){},render(){return{svg:""}}};' }),
	);
	await context.route(/katex.*\.css($|\?)/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
	await context.route(/fonts\.googleapis|fonts\.gstatic/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
});

type Sample = { t: number; rect: [number, number, number, number] | null };
type FrameLog = Record<string, Sample[]>;

/** The elements whose geometry a person watches settle, per the card's acceptance check.
 *  `slide` is not a selector: it is whichever slide is ON SCREEN — the replayed cached one
 *  before the engine renders, the live filmstrip's first section after — measured in PAGE
 *  coordinates so the hand-off between them is one comparison, not two. */
const TRACKED = ['bar', 'editorPane', 'previewPane', 'slide'] as const;

/** Install the per-frame sampler. Records a new entry only when an element's rounded rect
 *  CHANGES, so the length of each log is the number of distinct geometries that were shown. */
async function sampleFrames(page: import('@playwright/test').Page, ms = 12_000) {
	await page.addInitScript((durationMs) => {
		const log: Record<string, { t: number; rect: [number, number, number, number] | null }[]> = {};
		(window as unknown as { __frameLog: typeof log }).__frameLog = log;
		const t0 = performance.now();
		const rectOf = (el: Element | null): [number, number, number, number] | null => {
			if (!el) return null;
			const r = el.getBoundingClientRect();
			// A zero box is "not laid out yet", not a geometry a person saw. The shell box is
			// display:none until the replay fires and again once the live filmstrip lands.
			if (r.width < 1 || r.height < 1) return null;
			return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
		};
		// The visible slide, in page coordinates: the replayed cached slide while the
		// instant-shell is up, otherwise the live filmstrip's first section offset by its
		// iframe. Same-origin srcdoc, so the frame's document is readable.
		const visibleSlide = (): [number, number, number, number] | null => {
			const shell = rectOf(document.querySelector('#pg-ssr-slidebox section'));
			if (shell) return shell;
			try {
				const f = document.querySelector('#preview') as HTMLIFrameElement | null;
				const doc = f?.contentDocument;
				const sec = doc?.querySelector('.lattice > section');
				// The FIT agent keeps `.lattice` hidden until it has scaled the sections; an
				// un-scaled 1280px section is not something a person ever sees.
				if (!f || !sec || !doc?.defaultView) return null;
				if (doc.defaultView.getComputedStyle(sec.parentElement as Element).visibility === 'hidden') return null;
				const fr = f.getBoundingClientRect();
				const sr = sec.getBoundingClientRect();
				if (sr.width < 1 || sr.height < 1) return null;
				return [Math.round(fr.x + sr.x), Math.round(fr.y + sr.y), Math.round(sr.width), Math.round(sr.height)];
			} catch {
				return null;
			}
		};
		const tick = () => {
			const now = Math.round(performance.now() - t0);
			const frame: Record<string, [number, number, number, number] | null> = {
				bar: rectOf(document.querySelector('.pg-bar')),
				editorPane: rectOf(document.querySelector('#pg-split-editor')),
				previewPane: rectOf(document.querySelector('#pg-split-preview')),
				slide: visibleSlide(),
			};
			// Did the replay actually fire? Recorded as a sample so the assertions can tell a
			// shell that landed exactly on the live slide from one that never painted at all.
			if (document.documentElement?.getAttribute('data-pg-shell') === 'on') {
				const arr = (log.shellFired ||= []);
				if (!arr.length) arr.push({ t: now, rect: [1, 1, 1, 1] });
			}
			for (const [key, rect] of Object.entries(frame)) {
				const arr = (log[key] ||= []);
				const last = arr[arr.length - 1];
				// Absence is not a geometry — an element that has not laid out yet, and a shell
				// box dismissed after the hand-off, both read as null and neither counts.
				if (rect === null) continue;
				if (!last || last.rect === null || last.rect.join() !== rect.join()) arr.push({ t: now, rect });
			}
			if (performance.now() - t0 < durationMs) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}, ms);
}

/** Two rects are the same geometry when every edge agrees within a pixel or two — the
 *  tolerance absorbs sub-pixel rounding of a fractional pane width, nothing a person sees. */
function sameRect(a: [number, number, number, number], b: [number, number, number, number]) {
	return a.every((v, i) => Math.abs(v - b[i]) <= 2);
}

/** Collapse a log to the distinct geometries it recorded. */
function distinct(samples: Sample[]) {
	const out: Sample[] = [];
	for (const s of samples) {
		if (!s.rect) continue;
		if (!out.some((o) => o.rect && sameRect(o.rect, s.rect as [number, number, number, number]))) out.push(s);
	}
	return out;
}

function assertOneGeometry(log: FrameLog, keys: readonly string[]) {
	for (const key of keys) {
		const samples = log[key] ?? [];
		expect(samples.length, `the sampler never saw ${key} — the assertion below would be vacuous`).toBeGreaterThan(0);
		const seen = distinct(samples);
		expect(
			seen.length,
			`${key} was laid out ${seen.length} different ways between first paint and settled — a person watches it move: ${JSON.stringify(seen)}`,
		).toBe(1);
	}
}

/** Throttle the CPU 6x, per the card's measurement recipe. Applied to the page, so it
 *  survives the reload the sampler measures. */
async function throttle(page: import('@playwright/test').Page) {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
}

/** Drive a real session until it has produced a real snapshot, then drag the real divider —
 *  the state the reload under test restores. A value hand-written into localStorage exercises
 *  clamping and content-sizing paths the app's own value never reaches. */
async function seedRealSession(page: import('@playwright/test').Page) {
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('#pg-split-preview')).toBeVisible();
	await expect
		.poll(async () => await page.evaluate(() => !!localStorage.getItem('lattice-docs-pg-last-slide')), { timeout: 40_000 })
		.toBe(true);
	const handle = page.locator('#pg-split [data-slot="resizable-handle"]').first();
	const box = await handle.boundingBox();
	if (!box) throw new Error('the split divider has no box — the group never laid out');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2, { steps: 12 });
	await page.mouse.up();
	const dragged = Math.round((await page.locator('#pg-split-editor').boundingBox())!.width);
	expect(dragged, 'the drag did not move the divider — the reload below would prove nothing').toBeLessThan(500);
	// The capture runs shortly after the first render and again on leave; give the
	// post-drag geometry a chance to be the one that gets stored.
	await page.waitForTimeout(1500);
}

// ── The card's acceptance check ───────────────────────────────────────────────────────
//
// @smoke — the per-PR tier. It earns that the same way the split guard did: the failure it
// catches is silent (everything still ends up correct), it is what the reporter actually
// complained about, and a nightly-only guard would surface a regression a day after merge.
test('@smoke a reload paints one geometry per element — nothing assembles in view', async ({ page }) => {
	await throttle(page);
	await seedRealSession(page);

	await sampleFrames(page);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	// Sample past the live hand-off: the engine bundle lands ~3s in under 6x throttle, and
	// the cached-slide → filmstrip swap is the last thing that moves.
	await expect(page.locator('.pg-preview-wrap.is-live')).toBeVisible({ timeout: 30_000 });
	await page.waitForTimeout(1500);

	const log = (await page.evaluate(() => (window as unknown as { __frameLog: FrameLog }).__frameLog)) as FrameLog;

	// LIVENESS FIRST, and it is not decoration. `visibleSlide()` falls back from the cached
	// slide to the live one, so "one geometry" is satisfied by EITHER half alone: delete the
	// stored snapshot and this case still passes, with the entire replay — snapshot v2,
	// measureFit, the placement, the cross-fade — never executing. Two independent reviewers
	// demonstrated exactly that, and it is the same trap this file's header describes.
	// So require the mechanism to have RUN before believing anything about the geometry it
	// produced. The only visible difference otherwise is the first slide at ~490ms instead of
	// ~2400ms, which no rect can see.
	expect(
		log.shellFired?.length ?? 0,
		'the pre-paint replay never ran, so the single geometry below is the live filmstrip alone — the assertion is vacuous',
	).toBeGreaterThan(0);
	assertOneGeometry(log, TRACKED);
});

// A saved split is a pair of PERCENTAGES; the panes' minimums are PIXELS. A share that clears
// its minimum at the window it was saved in can fall below it at a narrower one — the library
// clamps at hydration, and the pre-paint seed used to spend the raw share, so the two disagreed
// and the divider moved (#1589). The instant shell is collateral: its slide is placed at a rect
// measured in a box that no longer exists, so it declines outright.
//
// The experiment has to cross two window sizes, which is why it sets its own viewports rather
// than taking the file's. The divider is driven with the KEYBOARD rather than a mouse drag:
// the separator's arrow-key resize is as real a control as a drag (it is the ARIA one), and a
// synthetic drag on this splitter is documented as not re-engaging after a reload
// (2026-08-10-shell-app-boot-state-sharing.md § Known gaps).
test('a share below a pane minimum at a narrower window is clamped BEFORE paint, not after', async ({ page }) => {
	await page.setViewportSize({ width: 1920, height: 900 });
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('#pg-split-preview')).toBeVisible();
	await page.waitForTimeout(1500);

	// Shrink the preview to roughly a quarter of the pair — comfortably above its 320px
	// minimum at 1920, and below it at 1194.
	const separator = page.locator('#pg-split [data-slot="resizable-handle"]').first();
	await separator.focus();
	for (let i = 0; i < 60; i++) {
		const w = await page.locator('#pg-split-preview').evaluate((el) => el.getBoundingClientRect().width);
		if (w <= 500) break;
		await page.keyboard.press('ArrowRight');
	}
	await page.waitForTimeout(1200);

	const share = await page.evaluate(
		([key, bucket, id]) => {
			const store = JSON.parse(localStorage.getItem(key) || 'null');
			return store?.[bucket]?.[id] ?? null;
		},
		[PG_SPLIT_KEY, PG_SPLIT_BUCKET, PG_SPLIT_PANEL_IDS[1]] as const,
	);
	expect(share, 'the keyboard resize did not persist a share — the reload below would prove nothing').toBeGreaterThan(0);
	// THE EXPERIMENT'S OWN PRECONDITION. If the saved share still clears the minimum at 1194
	// there is nothing to clamp and the assertions underneath are vacuous, so fail here
	// instead — with the number, so a future change of `minSize` says why it stopped applying.
	const rawAt1194 = (1194 - 1) * ((share as number) / 100);
	expect(
		rawAt1194,
		`the saved share resolves to ${rawAt1194.toFixed(1)}px at 1194, which is already above the ${PG_SPLIT_MIN.preview}px minimum — nothing is being clamped`,
	).toBeLessThan(PG_SPLIT_MIN.preview);

	await page.setViewportSize({ width: 1194, height: 834 });
	await throttle(page);
	await sampleFrames(page);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.pg-preview-wrap.is-live')).toBeVisible({ timeout: 30_000 });
	await page.waitForTimeout(1500);

	const log = (await page.evaluate(() => (window as unknown as { __frameLog: FrameLog }).__frameLog)) as FrameLog;
	assertOneGeometry(log, ['editorPane', 'previewPane']);
	// …and the one geometry is the CLAMPED one, not the raw share that happens to be stable
	// because nothing ever corrected it.
	const settled = distinct(log.previewPane ?? [])[0]?.rect;
	expect(settled?.[2], `the preview pane settled at ${settled?.[2]}px, not the ${PG_SPLIT_MIN.preview}px minimum`).toBeGreaterThanOrEqual(
		PG_SPLIT_MIN.preview - 2,
	);
});

// Explore is the surface a PRISTINE visitor lands on, so its first paint is the one most
// people see. It is also where the most geometry depends on a value only the client has:
// `body[data-view='read']` removes the editor pane, takes the preview full-bleed, drops the
// pane labels and adds the walk bar. Before the pre-paint seed, all four of those arrived a
// second after the Edit layout had already painted.
test('an Explore reload paints one geometry per element too', async ({ page }) => {
	await throttle(page);
	await seedRealSession(page);
	// One full Explore visit first, so the reload under test is a RETURNING one: the walk
	// bar's height is measured and published by the session that shows it, and the reserve
	// on the next load spends that measurement.
	await page.goto('/playground/?view=read', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('body')).toHaveAttribute('data-view', 'read');
	await expect(page.locator('#pg-walk')).toBeVisible({ timeout: 30_000 });
	await page.waitForTimeout(1000);

	await sampleFrames(page);
	await page.goto('/playground/?view=read', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.pg-preview-wrap.is-live')).toBeVisible({ timeout: 30_000 });
	await page.waitForTimeout(1500);

	const log = (await page.evaluate(() => (window as unknown as { __frameLog: FrameLog }).__frameLog)) as FrameLog;
	// The editor pane does not exist in Explore (the layout removes it), so it is not tracked.
	//
	// The preview pane is NOT tracked either, and that is a stated limit rather than an
	// oversight: the walk bar mounts only once the component's plan has been fetched and takes
	// ~100px off the bottom when it does. A draft of this change reserved that band from a
	// stored measurement; it was withdrawn because the stored height is the PREVIOUS slide's
	// caption while the bar it reserves for belongs to the NEXT boot's first slide, so on an
	// ordinary step-then-return it produced two geometries anyway — and on a failed plan fetch
	// the reserve never came off at all. What this case DOES guarantee is that the Explore
	// layout itself no longer assembles: no phantom editor pane, no full-bleed transition, no
	// pane labels appearing and vanishing.
	assertOneGeometry(log, ['bar', 'slide']);
	expect(
		(log.editorPane ?? []).length,
		'the editor pane was laid out during an Explore boot — the Edit layout painted first and was dismantled in view',
	).toBe(0);
});

// A toolbar control that lights the WRONG option and corrects itself is the same defect as
// a pane that lands in the wrong place. The mode toggle's `is-active` comes from the
// island's `view` state, which defaults to Edit, so an Explore boot server-rendered the
// pencil lit. The seed knows the answer before paint and the stylesheet paints from it.
test('the mode toggle lights the boot mode before the island hydrates', async ({ page }) => {
	// A pristine profile boots Explore, so this is the branch that used to be wrong.
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await page.evaluate(() => localStorage.clear());

	// "Lit" is the accent fill; the inactive button's background is `transparent`, which
	// computes to rgba(0, 0, 0, 0). Read the PAINT, not the class — the class is exactly what
	// is wrong in this window. Sampled per frame from document start, and recorded only while
	// the seed is still on <html>, so this is provably the pre-hydration answer and not a
	// race against how fast the island mounts on the day.
	await page.addInitScript(() => {
		const tick = () => {
			const root = document.documentElement;
			const btns = [...document.querySelectorAll<HTMLElement>('.pg-mode-btn')];
			if (btns.length && root.hasAttribute('data-pg-view')) {
				(window as unknown as { __preLit: unknown }).__preLit = {
					seed: root.getAttribute('data-pg-view'),
					on: btns.filter((b) => getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)').map((b) => b.dataset.pgMode),
				};
				return;
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	await page.goto('/playground/', { waitUntil: 'domcontentloaded' });
	const pre = (await page.evaluate(() => (window as unknown as { __preLit?: { seed: string; on: string[] } }).__preLit)) as
		| { seed: string; on: string[] }
		| undefined;
	expect(pre, 'the toolbar never painted while the seed was still up — nothing to assert').toBeTruthy();
	expect(pre?.seed, 'the seed did not resolve a boot view').toBe('read');
	expect(pre?.on, 'the toggle lit the wrong mode before hydration — a person watches it swap').toEqual(['read']);

	// …and it stays lit through the hand-off, when the class becomes the authority.
	await expect(page.locator('body')).toHaveAttribute('data-view', 'read');
	await expect(page.locator('.pg-mode-btn[data-pg-mode="read"]')).toHaveClass(/is-active/);
	const post = await page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>('.pg-mode-btn')]
			.filter((b) => getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)')
			.map((b) => b.dataset.pgMode),
	);
	expect(post, 'the lit mode changed across hydration').toEqual(['read']);
});

// The editor's SSR placeholder is a stand-in for CodeMirror's text, and a stand-in that
// sits somewhere else is a reflow waiting to happen: at 0.85rem/1.5 against the editor's
// 13.5px/1.6, and 34px from the left against its 43px, every line of the deck slid right
// and down as the editor booted, by a gap that grew 1.2px per line down the file.
//
// The type metrics are declared in playground.css from editor.js's theme, but the gutter
// width is CodeMirror's own computation. So measure the real pair rather than trust the
// arithmetic: this fails if either side moves.
test("the editor placeholder's text starts where CodeMirror's will", async ({ page }) => {
	// The placeholder is torn down the instant the editor mounts, and on an unthrottled run
	// that can beat any `evaluate` sent from here — measuring it "first" is a race that
	// reports NaN. Snapshot it from inside the page, on the first frame it exists.
	await page.addInitScript(() => {
		const tick = () => {
			const el = document.querySelector('.pg-editor-placeholder');
			if (el) {
				const cs = getComputedStyle(el);
				const r = el.getBoundingClientRect();
				(window as unknown as { __ph: unknown }).__ph = {
					x: r.x + Number.parseFloat(cs.paddingLeft),
					y: r.y + Number.parseFloat(cs.paddingTop),
					fontSize: cs.fontSize,
					lineHeight: cs.lineHeight,
				};
				return;
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	const before = (await page.evaluate(() => (window as unknown as { __ph: { x: number; y: number; fontSize: string; lineHeight: string } }).__ph)) as {
		x: number;
		y: number;
		fontSize: string;
		lineHeight: string;
	};
	expect(before, 'the SSR placeholder never painted — there is nothing to align against').toBeTruthy();
	const after = await page.locator('.cm-line').first().evaluate((el) => {
		const cs = getComputedStyle(el);
		const r = el.getBoundingClientRect();
		return { x: r.x + Number.parseFloat(cs.paddingLeft), y: r.y, fontSize: cs.fontSize, lineHeight: cs.lineHeight };
	});
	expect(Math.abs(after.x - before.x), `the first character moves ${(after.x - before.x).toFixed(1)}px sideways when CodeMirror mounts`).toBeLessThanOrEqual(2);
	expect(Math.abs(after.y - before.y), `the first line moves ${(after.y - before.y).toFixed(1)}px vertically when CodeMirror mounts`).toBeLessThanOrEqual(2);
	// Line height is what makes the drift CUMULATIVE — a 1px difference is 20px by line 20.
	expect(before.fontSize, 'the placeholder and the editor set different font sizes').toBe(after.fontSize);
	expect(before.lineHeight, 'the placeholder and the editor set different line heights').toBe(after.lineHeight);
});

// The pre-paint seed only removes jank if it agrees with the app. It is a MIRROR of
// `resolveStartupView` written in the head script (an inline script cannot import), so the
// one thing that can silently break it is the two drifting apart — and the symptom would be
// the jank coming back, invisibly, for one branch of the precedence table.
//
// So: drive every branch on the real page and require the pre-paint answer to equal the
// hydrated one. This is the guard the split seed did not have.
for (const c of [
	// Rule 1 — a handoff forces Edit, and it BEATS a persisted Explore view. This case was
	// missing from the first version of this table, and it was the one that mattered: the app
	// re-read the one-shot handoff key at mount, by which time a child effect had already
	// consumed it, so the highest-precedence rule silently never fired and a visitor handed a
	// deck landed in the Explore gallery instead of the editor holding it.
	{
		name: 'a handoff, over a persisted Explore view',
		url: '/playground/',
		setup: { 'lattice-docs-pg-view': 'read', 'lattice-docs-pg-handoff': '{"md":"# handed off\\n","from":"the Studio","ts":1}' },
		expected: 'edit',
	},
	{ name: 'an explicit ?view=edit', url: '/playground/?view=edit', setup: null, expected: 'edit' },
	{ name: 'an explicit ?view=read', url: '/playground/?view=read', setup: null, expected: 'read' },
	// `?view=explore` is an alias for read, mapped in BOTH the mirror and parsePlaygroundUrl.
	{ name: 'the ?view=explore alias', url: '/playground/?view=explore', setup: null, expected: 'read' },
	{ name: 'a persisted view', url: '/playground/', setup: { 'lattice-docs-pg-view': 'edit' }, expected: 'edit' },
	{ name: 'a persisted Explore view', url: '/playground/', setup: { 'lattice-docs-pg-view': 'read' }, expected: 'read' },
	{ name: 'a pristine draft', url: '/playground/', setup: null, expected: 'read' },
	// Pristine is not the same as EMPTY: a draft that still hashes to the last recorded insert
	// is untouched, so it opens Explore too. This exercises the fp()/isPristine pair rather
	// than the empty-string short-circuit the case above takes.
	{
		name: 'a pristine draft that has content',
		url: '/playground/',
		setup: { 'lattice-docs-pg-source': 'x', 'lattice-docs-pg-inserted-hash': '2b61d' },
		expected: 'read',
	},
	{ name: 'a dirty draft', url: '/playground/', setup: { 'lattice-docs-pg-source': '# a draft the visitor typed\n' }, expected: 'edit' },
] as const) {
	test(`the pre-paint boot view matches the app's: ${c.name}`, async ({ page }) => {
		// Reach the origin first so localStorage is writable, then set up and reload.
		await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
		await page.evaluate((entries) => {
			localStorage.clear();
			for (const [k, v] of Object.entries(entries ?? {})) localStorage.setItem(k, v);
		}, c.setup);

		// Read the seed BEFORE hydration can drop it: the app removes the root attribute in the
		// same effect that sets the body one, so poll for the pair rather than for either alone.
		await page.goto(c.url, { waitUntil: 'commit' });
		const seeded = await page.evaluate(() => {
			// documentElement exists by `commit` for a document that has begun parsing; the head
			// script has already run by then, since it is inline and synchronous.
			return document.documentElement.getAttribute('data-pg-view');
		});
		expect(seeded, `the pre-paint script published no boot view for ${c.name}`).toBe(c.expected);
		await expect(page.locator('body')).toHaveAttribute('data-view', c.expected);
	});
}
