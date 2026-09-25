import fs from 'node:fs';
import JSZip from 'jszip';
import { expect, gotoStudio, test } from './studio-fixture';

// A STRANGER'S PACKAGE NEVER REACHES THE NETWORK FROM THE STUDIO ORIGIN (HARD RULE #22 + #23;
// followups.d/2336-p3-packages-trio-followups.md items 2 and 3).
//
// Two packages go through the real Library import, the door a person uses:
//   - a component whose sample slide (`gallery.md`) carries a remote <img>, a markdown image and
//     a url() — refused on import, so Insert can never put it in a deck. The gate RENDERS the
//     slide to decide, so this also proves that check fetches nothing itself;
//   - a motion scene whose art carries <image href>, <feImage href> and a remote fill url() —
//     imported, and drawn by the Library's motion card with the remote references stripped.
// The oracle is the browser's own network log: every request to the beacon host is recorded,
// and there must be none. The motion card must still draw the art, so the strip is not a
// blanking.

const BEACON = 'beacon.lattice-e2e.invalid';

async function openLibrary(page: Parameters<typeof gotoStudio>[0]) {
	const docked = page.getByRole('button', { name: 'Open Library' });
	await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
}

test('a remote reference in a gallery or in motion art never leaves the Studio', async ({ page }) => {
	test.slow();
	const hits: string[] = [];
	await page.route(`**://${BEACON}/**`, (route) => {
		hits.push(route.request().url());
		return route.fulfill({ status: 204, body: '' });
	});

	const zip = new JSZip();
	zip.file('probe-beacon/probe-beacon.manifest.json', JSON.stringify({ name: 'probe-beacon', type: 'component', format: 1 }));
	zip.file('probe-beacon/probe-beacon.styles.css', 'section.probe-beacon { display: grid; }');
	zip.file(
		'probe-beacon/probe-beacon.gallery.md',
		`<!-- _class: probe-beacon -->\n\n## Hi\n\n<img src="https://${BEACON}/img.png">\n\n![x](https://${BEACON}/md.png)\n\n<div style="background:url(https://${BEACON}/css.png)"></div>\n`,
	);
	const spec = { source: 'svg', duration: 4000, hero: 1, asset: 'route.svg', elements: [{ id: 'p', pathRef: 'p1', motion: [{ verb: 'draw', span: 1 }] }] };
	const art =
		`<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg"><defs><filter id="f"><feImage href="https://${BEACON}/fe.png"/></filter></defs>` +
		`<image href="https://${BEACON}/image.png" width="10" height="10"/>` +
		`<rect x="4" y="4" width="20" height="20" style="fill:url(https://${BEACON}/fill.svg#p)"/>` +
		'<path id="p1" d="M5 50 H95" stroke="currentColor" stroke-width="4"/></svg>';
	zip.file('probe-route/probe-route.manifest.json', JSON.stringify({ name: 'probe-route', type: 'motion', format: 1, label: 'Probe route' }));
	zip.file('probe-route/probe-route.scene.json', JSON.stringify(spec));
	zip.file('probe-route/probe-route.art.svg', art);

	await gotoStudio(page);
	// CONTROL: the log does see a fetch to the beacon host from this page. Without it, an empty
	// log could mean the route never matched rather than that nothing asked.
	await page.evaluate((host) => {
		new Image().src = `https://${host}/control.png`;
	}, BEACON);
	await expect.poll(() => hits.length).toBe(1);
	const control = hits.splice(0);
	await openLibrary(page);
	await page.locator('input[type="file"][accept=".zip"]').setInputFiles({ name: 'probes.zip', mimeType: 'application/zip', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
	const toast = page.locator('[data-sonner-toast]').first();
	await expect(toast).toContainText('probe-beacon');
	await expect(toast).toContainText('sample slide loads');

	// The motion card drew the art: the path is there, the fetching attributes are not.
	const card = page.locator('[aria-hidden] > svg').filter({ has: page.locator('path#p1') });
	await expect(card).toHaveCount(1);
	const drawn = await card.evaluate((el) => el.outerHTML);
	expect(drawn).not.toContain(BEACON);
	// No settle wait: the strip runs before the card mounts, so the card has nothing left to
	// fetch late, and the gallery gate parses into an inert document that loads nothing. The
	// toast above only shows once the import, gate included, has finished.
	expect(hits).toEqual([]);

	const evidence = process.env.LATTICE_EVIDENCE_DIR;
	if (evidence) {
		fs.writeFileSync(`${evidence}/remote-refs.network.json`, JSON.stringify({ beacon: BEACON, control, requests: hits, toast: await toast.innerText(), motionCard: drawn }, null, 2));
		await page.screenshot({ path: `${evidence}/remote-refs.library.png` });
	}
});
