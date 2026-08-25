import { CHROME, expect, gotoStudio, openInspector, test } from './studio-fixture';

// ── #1458 channel 1: an IMPORTED theme's CSS reaches the preview's `<style>` ───────────
//
// The path, end to end: Library → `unpackBundle` (asset-bundle.ts) takes theme CSS
// VERBATIM out of a zip → `saveStudioTheme` → StudioShell's `extraTheme` → DeckPreview →
// `single-slide-render.ts` `themeStyleContent()` → the preview document's `<style>`.
//
// That is the one path in HARD RULE #22's threat model with an ATTACKER-SUPPLIED FILE
// rather than something the author typed. The frame is same-origin and un-sandboxed by
// design, and a `<style>`'s content is HTML RAWTEXT — it ends at the first `</style`, and
// knows nothing about CSS comments or strings. So a `</style>` carried in imported theme
// CSS ends the element and everything after it is parsed as MARKUP in the live frame,
// however well the HTML beside it was sanitized.
//
// The guard is `sanitizeStyleText` at the sink (`single-slide-render.ts`), landed in #1718.
// This spec exists because that is a claim about a running surface, and #1458's acceptance
// is behavioral: import a hostile theme through the REAL Library UI and confirm the payload
// is inert in the REAL preview frame. A unit test of the sanitizer cannot see the wiring
// between the two, which is exactly where the defect was.

const ATTACKER = 'attacker.invalid';
const THEME_NAME = 'hostile';

/** A `.lattice-theme.zip` whose CSS carries the element terminator, built with the same
 *  JSZip + manifest shape `packTheme` writes — so this is the real ingest, not a stub. */
async function hostileThemeZip(): Promise<Buffer> {
	const { default: JSZip } = await import('jszip');
	const zip = new JSZip();
	// The payload sits in the comment header a real serialized theme carries, because that
	// is where a label/description rides — the narrower of #1458's two channels, in the
	// wider one's file.
	const css = [
		`/* Palette: Hostile </style><link rel="stylesheet" href="https://${ATTACKER}/x.css">`,
		`   <img src="https://${ATTACKER}/beacon.png"> */`,
		`:root[data-palette="${THEME_NAME}"]{--bg:#101014;--fg:#f4f4f5;--accent:#c2410c;}`,
		`:root[data-palette="${THEME_NAME}"] section::after{content:"</style><img src='https://${ATTACKER}/content.png'>"}`,
	].join('\n');
	zip.file(`${THEME_NAME}.css`, css);
	zip.file(
		'manifest.json',
		JSON.stringify({
			format: 'lattice-asset/1',
			kind: 'theme',
			items: [
				{
					kind: 'theme',
					name: THEME_NAME,
					label: 'Hostile',
					essentials: { bg: '#101014', fg: '#f4f4f5', accent: '#c2410c' },
					css: `${THEME_NAME}.css`,
				},
			],
		}),
	);
	return zip.generateAsync({ type: 'nodebuffer' });
}

test('an imported theme cannot break out of the preview `<style>` (#1458, #1718)', async ({ page }) => {
	const hits: string[] = [];
	await page.context().route(`**://${ATTACKER}/**`, (route) => {
		hits.push(route.request().url());
		return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
	});

	await gotoStudio(page);

	// Import through the REAL Library door — the attacker-supplied file, ingested by the
	// code path a visitor actually uses.
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.locator('input[type="file"]').first().setInputFiles({
		name: `${THEME_NAME}.lattice-theme.zip`,
		mimeType: 'application/zip',
		buffer: await hostileThemeZip(),
	});

	// It really landed in the Library — the ingest half of the path.
	await expect(page.getByRole('button', { name: 'Select Hostile' })).toBeVisible({ timeout: 20_000 });
	await page.keyboard.press('Escape');

	// Now PIN it to the deck, which is what resolves `activeTheme` and passes the imported
	// CSS down as `extraTheme` to the preview. (A saved theme is not activated by a `theme:`
	// front-matter key — it is chosen in the Inspector's deck Theme picker.)
	await openInspector(page);
	const themePicker = page.getByRole('combobox', { name: 'Choose deck theme' });
	await themePicker.click();
	await page.getByRole('option', { name: 'Hostile' }).click();
	// The pick TOOK — separated from the assertions below so a flaky menu interaction reads as
	// itself rather than as "the guard failed".
	await expect(themePicker).toContainText('Hostile', { timeout: 20_000 });

	// Survey EVERY frame and EVERY `<style>` in it, rather than one iframe selector and one
	// element id. Which frame hosts the preview and which element the theme lands in are both
	// the builder's business and both have moved before; a selector that silently stops
	// matching would turn this whole spec green while testing nothing. Scanning is also how
	// the un-reloaded restyle path was caught masquerading as the srcdoc path.
	//
	// The marker is a token from the RULE BODY, not the label in the comment header: the
	// composed sheet is minified on the way in, so the header is gone by the time it lands.
	// (Keying on the label is how the first cut of this spec failed while the guard worked.)
	const MARKER = 'c2410c'; // the imported theme's accent, unique to this zip
	const survey = async () => {
		const styles: string[] = [];
		let stray = 0;
		for (const f of page.frames()) {
			try {
				const r = await f.evaluate((attacker) => ({
					styles: Array.from(document.querySelectorAll('style')).map((s) => s.textContent || ''),
					stray: document.querySelectorAll(`link[href*="${attacker}"], img[src*="${attacker}"], script[src*="${attacker}"]`).length,
				}), ATTACKER);
				styles.push(...r.styles);
				stray += r.stray;
			} catch {
				/* a frame that navigated mid-survey simply contributes nothing */
			}
		}
		return { styles, stray };
	};
	const themeIsLive = async () => (await survey()).styles.filter((t) => t.includes(MARKER)).length;

	// WHAT THIS ARM COVERS, stated because it is narrower than it looks. Pinning a theme on an
	// already-open preview takes the RESTYLE fast path, which swaps the resident sheet with
	// `.textContent =` — a DOM write that cannot be broken out of whatever the string holds.
	// So this asserts that the guard RAN on the imported CSS (the escaped form is present
	// below), not that a breakout was survived.
	//
	// The srcdoc BUILD path — the one that parses the stylesheet as HTML, and the only one
	// where a breakout is possible — was measured by hand rather than pinned here: with a
	// hostile theme active at frame build, `style#lattice-theme` carries the escaped
	// terminator and no live one; with the guard removed from single-slide-render.ts, the
	// escape is gone and a live `</style>` appears. Driving that state from a cold reload
	// proved unreliable in this harness (the pinned theme is not re-applied deterministically),
	// and a flaky nightly spec costs more than it pays (#1526). See
	// engineering/decisions/2026-08-18-post-sanitize-injection-queue.md.
	await expect.poll(themeIsLive, { timeout: 60_000 }).toBeGreaterThan(0);

	const { styles: all, stray } = await survey();
	const carrying = all.filter((t) => t.includes(MARKER));

	// 1. The imported CSS really arrived, and the terminator in it is neutralized. Asserting
	//    the ESCAPED form is PRESENT is what makes this non-vacuous: it can only be there if
	//    the payload traveled the whole path AND the guard ran on it. Measured: removing the
	//    call in single-slide-render.ts turns exactly this arm red.
	expect(carrying.length, 'the imported CSS never reached a <style> — the arms below would prove nothing').toBeGreaterThan(0);
	expect(carrying.some((t) => t.includes('<\\/style')), 'no escaped terminator anywhere — the payload did not survive to the sink').toBe(true);
	for (const t of all) expect(t, 'a live </style> reached a preview <style> element').not.toMatch(/<\/style/i);

	// 2. Nothing broke out into MARKUP — the harm itself, asserted on the real DOM rather
	//    than on the strings above.
	expect(stray, 'the payload became live markup in the preview document').toBe(0);

	// 3. And nothing left the machine.
	expect(hits, 'the imported theme reached the network — the payload escaped the <style>').toEqual([]);
});

// ── The safety GATE on the same door ──────────────────────────────────────────────────
//
// The spec above proves a hostile theme cannot break out of the preview `<style>` once
// it is stored. This one proves the more basic thing: CSS that reaches OFF THE DEVICE
// should not be stored at all.
//
// `lib/theme/gate.js` already ran live in Fabricate, but only to pause the CSS out of
// the preview and tell the author why — `canSave` never consulted it. So the blocking
// rung guarded a preview and not the library, and the `.zip` path — the one place in
// HARD RULE #22's threat model where the author and the victim are different people —
// reached storage with no CSS gate at all. The refusal now lives in `saveStudioTheme`,
// which is where the import, the workspace restore and Fabricate's own Save all meet.
//
// Driven through the REAL Library door for the same reason as the spec above: a unit
// test of the gate cannot see whether anything calls it, and "nothing calls it" is
// exactly the defect.

const BEACON = 'beacon.invalid';

/** A bundle whose theme CSS carries a remote `url()` — the exfil rung, not a malformed file. */
async function beaconThemeZip(): Promise<Buffer> {
	const { default: JSZip } = await import('jszip');
	const zip = new JSZip();
	const css = [
		'/* @theme beaconing */',
		"@import 'lattice';",
		`:root[data-palette="beaconing"]{--bg:#101014;--fg:#f4f4f5;--accent:#2f6feb;--leak:url(https://${BEACON}/?deck)}`,
	].join('\n');
	zip.file('beaconing.css', css);
	zip.file(
		'manifest.json',
		JSON.stringify({
			format: 'lattice-asset/1',
			kind: 'theme',
			items: [{ kind: 'theme', name: 'beaconing', label: 'Beaconing', essentials: { bg: '#101014', fg: '#f4f4f5', accent: '#2f6feb' }, css: 'beaconing.css' }],
		}),
	);
	return zip.generateAsync({ type: 'nodebuffer' });
}

test('an imported theme whose CSS reaches off the device is refused, with its reason', async ({ page }) => {
	const hits: string[] = [];
	await page.context().route(`**://${BEACON}/**`, (route) => {
		hits.push(route.request().url());
		return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
	});

	await gotoStudio(page);
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.locator('input[type="file"]').first().setInputFiles({
		name: 'beaconing.lattice-theme.zip',
		mimeType: 'application/zip',
		buffer: await beaconThemeZip(),
	});

	// Refused, and the author is told WHY rather than left with a silent no-op — the
	// gate's message names the construct, not just "invalid".
	await expect(page.getByText(/Import failed/)).toBeVisible({ timeout: 20_000 });
	await expect(page.getByText(/fetches a remote resource/)).toBeVisible();

	// And it did not land on the shelf.
	await expect(page.getByRole('button', { name: 'Select Beaconing' })).toHaveCount(0);
	expect(hits).toEqual([]);
});
