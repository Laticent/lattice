import JSZip from 'jszip';
import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// A THIRD-PARTY PLUGIN CANNOT READ THE AUTHOR'S OPENROUTER KEY.
//
// A code package (a component whose `transform.js` someone else wrote) runs in the Studio in a
// worker inside `<iframe sandbox="allow-scripts">` with no `allow-same-origin` (runner.ts): an
// opaque origin, so no storage of the Studio's, no `parent`, no DOM. What it returns is sanitized
// by the door and again by the preview frame. `code-packages.spec.ts` proves it reaches no NETWORK;
// this proves it reaches no KEY, the one secret this origin holds
// (engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §8).
//
// The package, once approved, does two things:
//   1. PROBES from inside its realm: localStorage, sessionStorage, parent/top/opener storage,
//      document.cookie, IndexedDB, Cache Storage and its own origin, and reports each answer in
//      the markup it returns.
//   2. SMUGGLES: the markup it returns carries event-handler payloads that would read the key if
//      they ever ran in the preview frame.
// The CONTROL runs the same probe in the Studio page itself and reads the canary, so a probe that
// cannot see storage at all cannot make this pass.
//
// NOT SPENT: the seeded key is a canary string, not ours (HARD RULE #24), so a status call the
// Studio makes with it gets a 401 and costs nothing. NO page.route here, unlike the other key
// specs: on WebKit, intercepting requests stops the package's blob-URL worker from loading at all
// (the package then reports "failed to load"), which would hide the probe rather than test it.

const CANARY = 'sk-or-v1-plugin-isolation-canary-4d9e';

// Runs in the package's worker, and (as the control) in the Studio page. ES5 on purpose: it is
// spliced into a transform.js and into page.evaluate as text.
const PROBE = `function probe() {
  var K = 'lattice-db-or-key';
  var out = {};
  function t(name, f) { try { var v = f(); out[name] = v == null ? 'none' : String(v); } catch (e) { out[name] = 'refused'; } }
  t('local', function () { return localStorage.getItem(K); });
  t('session', function () { return sessionStorage.getItem(K); });
  t('parent', function () { return parent.localStorage.getItem(K); });
  t('top', function () { return top.localStorage.getItem(K); });
  t('opener', function () { return opener.localStorage.getItem(K); });
  t('cookie', function () { return document.cookie; });
  t('idb', function () { indexedDB.open('keyprobe'); return 'opened'; });
  t('caches', function () { return typeof caches.open === 'function' ? 'present' : 'none'; });
  t('origin', function () { return self.origin; });
  return out;
}`;

const leak = (tag: string) => `top.__pluginLeak=(top.__pluginLeak||[]).concat('${tag}:'+localStorage.getItem('lattice-db-or-key'))`;

// What the package returns beside its report: handlers that would read the key if they ever ran in
// the preview frame. Embedded with JSON.stringify so its quotes cannot break the transform's syntax.
const SMUGGLE = `<img src="x" onerror="${leak('img')}"><details open ontoggle="${leak('details')}"><summary>s</summary></details><svg><script>${leak('svg-script')}</script></svg>`;

const TRANSFORM = `${PROBE}
function keyprobe(slide) {
  var report = encodeURIComponent(JSON.stringify(probe()));
  var added = '<div class="keyprobe-report" data-probe="' + report + '">probed</div>' + ${JSON.stringify(SMUGGLE).replace(/<\//g, '<\\/')};
  return "\\n" + slide.html.replace(/<\\/section>\\s*$/, added + "</section>") + "\\n";
}
export { keyprobe as default };
`;

async function keyprobeZip(): Promise<Buffer> {
	const zip = new JSZip();
	zip.file('keyprobe/keyprobe.manifest.json', JSON.stringify({ name: 'keyprobe', type: 'component', format: 1, facts: 1 }));
	zip.file('keyprobe/keyprobe.styles.css', 'section.keyprobe .keyprobe-report { color: var(--accent); }\n');
	zip.file('keyprobe/keyprobe.gallery.md', '<!-- _class: keyprobe -->\n\n## Probe\n');
	zip.file('keyprobe/keyprobe.transform.js', TRANSFORM);
	return zip.generateAsync({ type: 'nodebuffer' });
}

async function openLibrary(page: Parameters<typeof gotoStudio>[0]) {
	const docked = page.getByRole('button', { name: 'Open Library' });
	await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
}

// All three engines, as code-packages.spec.ts: an opaque-origin worker in a sandboxed frame is
// where engines differ. `@gecko` runs on desktop Chromium and Gecko; `@webkit-tablet` on WebKit.
for (const tag of [' @gecko', ' @webkit-tablet']) {
	test(`a third-party code package cannot read the stored OpenRouter key${tag}`, async ({ page }) => {
		test.slow();
		await page.addInitScript((key) => {
			try {
				localStorage.setItem('lattice-db-or-key', key);
			} catch {
				/* storage unavailable — the control below fails loudly */
			}
		}, CANARY);
		await gotoStudio(page);

		// CONTROL: the probe, run in the Studio page, reads the canary.
		const control = (await page.evaluate(`(${PROBE})()`)) as Record<string, string>;
		expect(control.local, 'the probe must be able to see the key where the key lives').toBe(CANARY);

		await openLibrary(page);
		await page.locator('[data-testid="library-import-input"]').setInputFiles({ name: 'keyprobe.zip', mimeType: 'application/zip', buffer: await keyprobeZip() });
		await expect(page.locator('[data-sonner-toast]').first()).toContainText('1 component(s)');
		await page.keyboard.press('Escape');
		await setEditorContent(page, '<!-- _class: keyprobe -->\n\n## Probe\n');
		const notice = page.locator('[data-slot="code-packages"]');
		await expect(notice).toHaveAttribute('data-state', 'unapproved', { timeout: 30_000 });
		await notice.getByRole('button', { name: 'Approve the code of keyprobe' }).click();

		// The package ran (its report is on the slide), from an opaque origin, and saw no key.
		const report = livePreview(page).locator('.keyprobe-report');
		await expect(report).toHaveText('probed', { timeout: 30_000 });
		const probed = JSON.parse(decodeURIComponent(String(await report.getAttribute('data-probe')))) as Record<string, string>;
		test.info().annotations.push({ type: 'probe', description: JSON.stringify(probed) });
		expect(probed.origin, 'the package runs in an opaque origin').toBe('null');
		for (const k of ['local', 'session', 'parent', 'top', 'opener', 'cookie']) expect(probed[k], `${k} from inside the package`).toMatch(/^(refused|none)$/);
		expect(JSON.stringify(probed)).not.toContain(CANARY);

		// The smuggled handlers were stripped before the preview, so none ran.
		const frame = livePreview(page);
		await frame.locator('img').evaluateAll((imgs) => Promise.allSettled(imgs.map((i) => (i as HTMLImageElement).decode())));
		await frame.locator('body').evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
		expect(await page.evaluate(() => (window as unknown as { __pluginLeak?: string[] }).__pluginLeak ?? [])).toEqual([]);
		expect(await frame.locator('body').innerHTML()).not.toContain(CANARY);
	});
}
