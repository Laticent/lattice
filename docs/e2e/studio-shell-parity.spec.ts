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
const TOL = 2;
// The deck pill reserves a slot for a per-deck slide count the shell must not draw, so a few
// px there is structural. See studio-instant-shell.spec.ts for the full reasoning.
const PILL_TOL = 6;
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
}[] = [
	{ w: 320, h: 844, stop: 'write', why: 'narrow phone — the preview sub-bar shrinks here' },
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
	{ w: 1440, h: 900, stop: 'read', why: 'desktop at Read — slim header, plain title' },
	{ w: 1440, h: 900, stop: 'craft', why: 'desktop at Craft — activity rail + full header' },
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
	test(`${c.smoke ? '@smoke ' : ''}shell and app agree on every control — ${c.w}px @ ${c.stop} (${c.why})`, async ({ page }) => {
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

		// SCOPE: the topbar and the phone action bar are the two rows the shell claims to MIRROR
		// control-for-control. It deliberately does not mirror the editor toolbar, the slide
		// navigator or the status strip — those carry per-deck content (slide names, counts) the
		// shell must not draw, and it reserves them as neutral bars instead. Band-level agreement
		// for those regions is asserted by studio-instant-shell.spec.ts; asserting their CONTROLS
		// here would demand the shell paint deck content, which is the failure the one-skeleton
		// decision retired.
		const shell = (await page.evaluate(
			READ_CONTROLS(['#studio-ssr-shell .ssr-topbar', '#studio-ssr-shell .ssr-actionbar']),
		)) as Control[];
		// A shell that already dismissed reports nothing and would pass every comparison
		// vacuously — the whole spec rests on catching it up.
		expect(shell.length, 'the shell was dismissed before it could be measured').toBeGreaterThan(0);

		await page.locator('[aria-label="Live deck preview"] iframe.live').waitFor({ state: 'visible', timeout: 45_000 });
		await expect(page.locator('#studio-ssr-shell')).toHaveCount(0);
		await page.evaluate(() => document.fonts.ready);

		const app = (await page.evaluate(
			READ_CONTROLS(['header', 'fieldset[aria-label="Deck actions"]']),
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
				const tol = name.toLowerCase().includes('deck') ? PILL_TOL : TOL;
				for (const [axis, k] of (['left', 'top', 'width', 'height'] as const).entries()) {
					expect(
						Math.abs(s.box[axis] - a.box[axis]),
						`${name} ${k} @${c.w}/${c.stop}: shell ${s.box[axis]} vs app ${a.box[axis]}`,
					).toBeLessThanOrEqual(tol);
				}
			}
		}
	});
}
