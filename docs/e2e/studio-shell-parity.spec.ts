import { expect, test } from './studio-fixture';

// SHELL ↔ APP CONTROL PARITY (#1438 follow-up).
//
// `studio-instant-shell.spec.ts` asserts a HAND-LISTED set of things: four bands, the eight
// phone bar cells, two utility buttons, the deck pill. That guards what someone thought to
// list, which is exactly the wrong shape for this problem — the adversarial trio found five
// divergences it passed green over, every one of them in a control nobody had listed:
//
//   · the Craft stop adds a 52px activity rail and swaps the header — bands 29-52px off
//   · a splitter dragged toward the editor puts the split line 288px off
//   · the launcher's `sm:` (640) was hand-copied as `min-[700px]:` — 6px across 640-699
//   · the posture dial was hardcoded to Write — wrong segment lit at Read and Craft
//   · Present/Share lost their labels across 1024-1099, moving them ~100px
//
// The generator behind all five is the same: the shell mirrors the app's chrome, the mirror
// is maintained by hand, and nothing compares the two as SETS. So this spec does not list
// controls. It ENUMERATES every visible control in both chromes, keyed by accessible name,
// and demands the two sets — and every box in them — agree.
//
// "BOTH CHROMES" IS A LIST OF ROOTS, AND THAT LIST IS THE REAL COVERAGE — read it as one.
// This enumerates everything inside the roots passed to READ_CONTROLS, which is not the same
// as everything the visitor sees, and the difference is exactly how a sixth divergence hid:
// the EDIT/PREVIEW sub-bars were in neither list, so the shell drew ONE control where the app
// drew twelve and this spec stayed green through all of it. Reported on an iPad Air 4, both
// orientations; `studio-instant-shell` missed it too, because the band's BOX was right (45px
// in both) and that spec compares bands rather than their contents. The roots now include the
// editor pane and the preview bar. Before adding a control to a band that is NOT listed there,
// add the band — an enumeration over a hand-picked subtree is a hand-picked list in better
// clothes.
//
// That makes the guard generalize to the thing that will actually happen: someone adds an
// icon to the header, or moves one, or gates one on a new breakpoint. A control present in
// the app and absent from the shell fails here on the first run, without anyone remembering
// this file exists.
//
// It runs a MATRIX, because every divergence above lived at a width or a stop the old spec did
// not sample. The widths bracket the tier boundaries — 639 and 660 around Tailwind's `sm` (640),
// 1024 for `lg`, 1099 and 1100 around the app's own desktop line — plus one width inside each
// band. (They bracket rather than sit ON 640/700: a boundary bug shows as a disagreement on ONE
// side of the line, so the two neighbors catch it and the exact pixel need not be sampled.)

type Box = [number, number, number, number];
type Control = { name: string; box: Box };

// Sub-pixel rounding only. Every real divergence found was >= 6px.
//
// ONE tolerance now, and the deck pill no longer has its own. `PILL_TOL = 6` used to sit here
// "because the deck pill reserves a slot for a per-deck slide count the shell must not draw,
// so a few px there is structural" — and a second exemption widened the posture dial's LEFT to
// the same 6px as inherited from it. Both were conceding a real, visible defect: the shell's
// reserved slot was a width FITTED to the welcome deck's own "7 slides", so the pill and every
// control after it — the rule and all three dial buttons — sat 3px left of the app's at every
// width from 1280 up, and jumped sideways when React took over. The slot is now taken from one
// shared constant on both sides (`DECK_META_SLOT`), so the cause is gone and the concession
// with it. A guard widened to fit the defect it is watching for reports only that the defect
// has not grown.
const TOL = 2;
const ENGINE_HOLD_MS = 2500;

/** Widths chosen at tier boundaries — that is where hand-copied gating breaks. */
// Two cases carry `@smoke` so the SET comparison — the part that catches "someone added an
// icon" — runs on the per-PR job as well as the nightly. One phone, one desktop: between them
// they render every control the shell mirrors. The boundary widths stay nightly.
const CASES: {
	w: number;
	h: number;
	stop: 'read' | 'write' | 'craft';
	why: string;
	smoke?: boolean;
	/** Persisted global preference that removes a header control (`lattice-tour-enabled`). */
	toursOff?: boolean;
	/**
	 * Also run this case in the `minfont` project — a raised browser MINIMUM font size, the
	 * low-vision setting at Chrome's Settings → Appearance → Customize fonts.
	 *
	 * Text metrics are a structural blind spot for a width x stop matrix: every other case here
	 * runs at the default size, and #1496 was 39px of band disagreement visible only to readers
	 * who had raised it. The activity rail is the same shape of bug in a control set — its cells
	 * are `min-h-11` floors that GROW with the caption, so at 24px the rail's natural height
	 * (690px) exceeds the column (666px) and the two surfaces only agree if they shrink the same
	 * way. They do only because the shell's nav carries `min-h-0`: without it a flex column
	 * floors the item at its content height, and the cells stood 3px tall each, drifting to 20px
	 * by the account chip.
	 */
	minfont?: boolean;
}[] = [
	{ w: 320, h: 844, stop: 'write', why: 'narrow phone — the preview sub-bar drops its lens label here' },
	{ w: 390, h: 844, stop: 'write', smoke: true, why: 'phone, the reported surface' },
	{ w: 390, h: 844, stop: 'read', why: 'phone at Read — chromeless preview' },
	{ w: 639, h: 844, stop: 'write', why: 'just below Tailwind sm' },
	{ w: 660, h: 844, stop: 'write', why: 'inside sm..app-tablet, where the launcher drifted' },
	{ w: 820, h: 1180, stop: 'write', why: 'tablet' },
	{ w: 390, h: 844, stop: 'craft', why: 'phone at Craft — the tier with no rail and no docked panels' },
	{ w: 820, h: 1180, stop: 'read', why: 'tablet at Read' },
	{ w: 820, h: 1180, stop: 'craft', why: 'tablet at Craft' },
	{ w: 1024, h: 900, stop: 'write', why: 'Tailwind lg — Present/Share gain labels' },
	{ w: 1099, h: 900, stop: 'write', why: 'top of the app tablet tier' },
	{ w: 1100, h: 900, stop: 'write', why: 'bottom of the app desktop tier' },
	{ w: 1440, h: 900, stop: 'write', smoke: true, why: 'desktop' },
	{ w: 1440, h: 900, stop: 'read', why: 'desktop at Read — same header as Write and Craft' },
	{ w: 1440, h: 900, stop: 'craft', why: 'desktop at Craft — activity rail, plus the tail utilities the row keeps at xl' },
	// SHORT desktop, and the height is the point: at a raised minimum font size the rail's
	// natural height (690px) exceeds this column (666px), so both surfaces have to shrink their
	// cells the same way. A tall 1440x900 case cannot see it — nothing overflows there — which
	// is why the `minfont` tag rides THIS row and not the one above it.
	{ w: 1280, h: 720, stop: 'craft', minfont: true, why: 'short desktop at Craft — the activity rail outgrows its column' },
	// The one chrome gate that is NEITHER width nor stop: the tours button reads a persisted
	// global preference. A width x stop matrix is structurally blind to that axis, which is why
	// the shell drew a phantom control and slid the three after it 44px.
	{ w: 1440, h: 900, stop: 'craft', toursOff: true, why: 'desktop at Craft with guided tours turned OFF' },
];

/**
 * Every visible control in a chrome subtree, keyed by accessible name.
 *
 * Reads the `aria-label` ATTRIBUTE rather than the computed accessible name: the shell sits
 * under `aria-hidden` + `inert` (deliberately — see studio.astro), so its controls have no
 * computed name at all. The attribute is what both surfaces actually author, which makes it
 * the only key the two have in common.
 */
const READ_CONTROLS = (roots: string[]) =>
	`(() => {
		const out = [];
		for (const sel of ${JSON.stringify(roots)}) {
			for (const root of document.querySelectorAll(sel)) {
				// The element list is wider than "button" because an <a>, a <select> or a text-labeled
				// control would otherwise be invisible in BOTH sets, which reads as agreement. Same
				// reason the key falls back to text: aria-label is a convention the chrome happens to
				// follow, not a contract — the deck switcher, the most drift-prone control in the
				// header, carries none and was silently skipped by both sets.
				for (const el of root.querySelectorAll('button, a[href], input, select, [role="switch"], [role="radio"], [role="tab"], [role="link"], [role="button"]')) {
					const b = el.getBoundingClientRect();
					if (b.width < 1 || b.height < 1) continue;
					// Precedence matters: aria-label, then a stable hook, and only then text. The deck
					// switcher carries no label and its TEXT is per-deck content the shell must not draw
					// (the app says "...7 slides", the shell reserves a neutral slot), so keying it by
					// text would demand the shell draw deck content. The hook's VALUE is its identity;
					// the shell mirrors the value under data-ssr-demo so the tour toolkit that owns
					// data-demo still resolves to exactly one element.
					const name = el.getAttribute('aria-label') || el.getAttribute('data-demo') || el.getAttribute('data-ssr-demo') || (el.textContent || '').trim().slice(0, 40);
					if (!name) continue;
					out.push({ name, box: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] });
				}
			}
		}
		return out.sort((a, c) => a.name.localeCompare(c.name) || a.box[0] - c.box[0]);
	})()`;

function index(list: Control[]) {
	const m = new Map<string, Control[]>();
	for (const c of list) m.set(c.name, [...(m.get(c.name) ?? []), c]);
	return m;
}

for (const c of CASES) {
	// NOT `@crosswidth` — every case sets its own viewport, so the tag ran the matrix twice in
	// two projects for identical results. `@smoke` still puts a phone and a desktop case on the
	// per-PR job.
	test(`${c.smoke ? '@smoke ' : ''}${c.minfont ? '@minfont ' : ''}shell and app agree on every control — ${c.w}px @ ${c.stop} (${c.why})`, async ({ page }) => {
		await page.addInitScript(
			([stop, toursOff]) => {
				try {
					const k = 'lattice-studio-settings';
					localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), posture: stop }));
					if (toursOff) localStorage.setItem('lattice-tour-enabled', 'off');
				} catch {
					/* storage blocked — the app falls back to its default stop and the shell to the same */
				}
			},
			[c.stop, c.toursOff ? '1' : ''] as const,
		);
		await page.setViewportSize({ width: c.w, height: c.h });
		await page.route('**/lattice-playground.js', async (route) => {
			await new Promise((r) => setTimeout(r, ENGINE_HOLD_MS));
			await route.continue();
		});
		await page.goto('/studio/', { waitUntil: 'commit' });
		await page.locator('#studio-ssr-shell .ssr-topbar').waitFor({ state: 'attached' });
		// Webfonts swap in with `font-display: swap` and text metrics move the content-sized
		// controls ~20-39px while they do. Measuring inside that window is the difference
		// between a guard and a flake, so wait for BOTH surfaces to be on the final font.
		await page.evaluate(() => document.fonts.ready);

		// SCOPE: the topbar, the phone action bar, the desktop-Craft activity rail, and — since
		// the iPad report — the EDIT and PREVIEW sub-bars. The shell mirrors all five
		// control-for-control.
		//
		// It still does not draw per-deck CONTENT: a slide count, the name of a reader view. But
		// "the shell must not draw the count" was for years also read as "so its width is a
		// guess", and that reading is what this spec spent six px of tolerance hiding. The two
		// unknowable slots now reserve a fixed width from a shared constant (`DECK_META_SLOT`,
		// `SLIDE_COUNTER_SLOT`), so their BOXES are comparable here like any other control's,
		// and only the glyphs inside them differ. `studio-reserved-slots.spec.ts` owns that
		// contract directly.
		//
		// The RAIL joined this scope after shipping as an empty 52px <div> from the day the band
		// was added (2026-08-09): its geometry was right (`--sh-rail`, seeded desktop-Craft-only)
		// and its CONTENT was nothing, so a Craft reload showed a blank column beside a
		// fully-drawn top bar. Neither oracle could see it, for two different reasons — the band
		// spec measures BOXES and has nothing to say about what is inside one, and this spec had
		// scoped itself to the two chrome ROWS. Every control the rail draws is fixed chrome (the
		// panels all boot closed), so it belongs in a SET comparison like any other.
		const shell = (await page.evaluate(
			READ_CONTROLS(['#studio-ssr-shell .ssr-topbar', '#studio-ssr-shell .ssr-actionbar', '#studio-ssr-shell .ssr-activityrail', '#studio-ssr-shell [data-slot="edit-bar"]', '#studio-ssr-shell [data-slot="preview-bar"]']),
		)) as Control[];
		// A shell that already dismissed reports nothing and would pass every comparison
		// vacuously — the whole spec rests on catching it up.
		expect(shell.length, 'the shell was dismissed before it could be measured').toBeGreaterThan(0);

		await page.locator('[aria-label="Live deck preview"] iframe.live').waitFor({ state: 'visible', timeout: 45_000 });
		await expect(page.locator('#studio-ssr-shell')).toHaveCount(0);
		await page.evaluate(() => document.fonts.ready);

		const app = (await page.evaluate(
			READ_CONTROLS(['header', 'fieldset[aria-label="Deck actions"]', 'nav[aria-label="Studio panels"]', '[data-studio-root] [data-slot="edit-bar"]', '[data-studio-root] [data-slot="preview-bar"]']),
		)) as Control[];
		expect(app.length, 'no app chrome found — the selectors have drifted').toBeGreaterThan(0);

		const S = index(shell);
		const A = index(app);

		// 1. THE SETS. A control the app renders and the shell does not (or vice versa) is the
		//    "someone added an icon" case, and it is the one the hand-listed spec cannot see.
		const missing = [...A.keys()].filter((n) => !S.has(n));
		const extra = [...S.keys()].filter((n) => !A.has(n));
		expect(missing, `app renders these in its chrome, the shell does not: ${missing.join(' · ')}`).toEqual([]);
		expect(extra, `the shell renders these, the app does not: ${extra.join(' · ')}`).toEqual([]);

		// 2. THE BOXES. Same control, same place — otherwise it slides at hand-off.
		for (const [name, appOnes] of A) {
			const shellOnes = S.get(name) ?? [];
			expect(shellOnes.length, `control count differs for "${name}"`).toBe(appOnes.length);
			for (const [i, a] of appOnes.entries()) {
				const s = shellOnes[i];
				for (const [axis, k] of (['left', 'top', 'width', 'height'] as const).entries()) {
					expect(
						Math.abs(s.box[axis] - a.box[axis]),
						`${name} ${k} @${c.w}/${c.stop}: shell ${s.box[axis]} vs app ${a.box[axis]}`,
					).toBeLessThanOrEqual(TOL);
				}
			}
		}
	});
}
