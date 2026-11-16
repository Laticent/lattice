/**
 * TEMPORARY (PR 3241, reverted after its dispatch): a real Studio Share > Images export in Mobile Safari, of a deck whose
 * first slide is the image layout's lifted card (`--img-lift: 0.6cqi 0.8cqi 0 -0.1cqi`, the negative-spread shadow the
 * WebKit camera fix is for). It drives the Share dialog's own buttons, lets the export run (the slide camera, `settle`,
 * the zip), and takes the file where a person's Save tap would: the Studio raises a `lattice:notify-action` toast whose
 * onClick shares the file, and the probe runs that onClick with `navigator.share` replaced by one that keeps the files
 * (the share sheet itself cannot be driven through WebDriver). It returns the zip as base64; run.mjs measures the slide.
 *
 * A reload during the export would end this script: run.mjs reads `window.__exportMarker` and `performance.timeOrigin`
 * afterwards, in a separate call, and compares them with what this returns.
 */
// No front matter: pasted through execCommand in WebKit, its opening `---` did not land at the very start of the document,
// so the parser read it as a slide break (a local Playwright WebKit run). The oracle reads the background from the slide.
const EXPORT_SHADOW_DECK = [
	'<!-- _class: image -->',
	'',
	'## A lifted card',
	'',
	"The card casts the layout's offset shadow.",
	'',
	'![A lake at dawn](sample:photo-wide.jpg)',
	'',
	'---',
	'',
	'<!-- _class: cards-grid -->',
	'',
	'## Cards that lift',
	'',
	'- One',
	'  - The first card.',
	'- Two',
	'  - The second card.',
	'- Three',
	'  - The third card.',
	'- Four',
	'  - The fourth card.',
	'',
	'---',
	'',
	'<!-- _class: image -->',
	'',
	'## A square photo',
	'',
	'![A square photo](sample:photo-square.jpg)',
	'',
].join('\n');

// biome-ignore lint/correctness/noUnusedVariables: run.mjs calls it by name.
function exportShadowHelpers() {
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const until = async (fn, ms, what) => {
		const t0 = Date.now();
		for (;;) {
			const v = fn();
			if (v) return v;
			if (Date.now() - t0 > ms) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
			await sleep(100);
		}
	};
	const visible = (el) => !!el && !el.closest('[inert]') && el.getClientRects().length > 0;
	const named = (re) => [...document.querySelectorAll('button,[role="menuitem"]')].filter(visible).find((b) => re.test((b.getAttribute('aria-label') || '').trim()) || re.test(b.textContent.trim()));
	const frame = () => document.querySelector('[aria-label="Live deck preview"] iframe.live');
	const frameDoc = () => {
		try {
			return frame()?.contentDocument || null;
		} catch {
			return null;
		}
	};
	return { until, named, frameDoc };
}

/** Step 1, on a fresh Studio page: the deck in, the page marked, the share sheet replaced. run.mjs reads memory after it. */
// biome-ignore lint/correctness/noUnusedVariables: run.mjs calls it by name.
async function latticeExportShadowPrepare() {
	const { until, named, frameDoc } = exportShadowHelpers();
	try {
		await until(() => window.__latticeRenderMetrics, 150000, "the Studio's first render");
		window.__exportMarker = `m${Math.random().toString(36).slice(2)}`;
		const el = await latticeShowDeckEditor();
		el.focus();
		if (el instanceof HTMLTextAreaElement) {
			el.select();
			if (!document.execCommand('insertText', false, EXPORT_SHADOW_DECK)) {
				el.value = EXPORT_SHADOW_DECK;
				el.dispatchEvent(new Event('input', { bubbles: true }));
			}
		} else {
			document.execCommand('selectAll');
			document.execCommand('insertText', false, EXPORT_SHADOW_DECK);
		}
		if (innerWidth <= 699) (await until(() => named(/^Preview$/), 15000, 'the Preview button')).click();
		// The frame renders the slide under the caret, the deck's last one after the paste: any of its headings means the deck is in.
		await until(() => /A lifted card|Cards that lift|A square photo/.test(frameDoc()?.body?.textContent || ''), 90000, 'the deck in the preview');
		window.__exportShare = { opts: null, files: null };
		window.addEventListener('lattice:notify-action', (e) => {
			window.__exportShare.opts = e.detail?.opts || null;
		});
		Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
		Object.defineProperty(navigator, 'share', {
			value: async (d) => {
				window.__exportShare.files = d.files;
			},
			configurable: true,
		});
		return { ok: true, marker: window.__exportMarker, timeOrigin: performance.timeOrigin, width: innerWidth };
	} catch (e) {
		return { ok: false, error: String(e?.message || e), marker: window.__exportMarker || null, timeOrigin: performance.timeOrigin, width: innerWidth };
	}
}

/** Step 2, on the same page: Share > Images (.zip) > Download images, then the Save toast's own onClick. Returns the zip. */
// biome-ignore lint/correctness/noUnusedVariables: run.mjs calls it by name.
async function latticeExportShadowRun() {
	const { until, named } = exportShadowHelpers();
	const share = window.__exportShare;
	try {
		if (!share) throw new Error('the prepare step did not run on this page');
		const t0 = performance.now();
		(await until(() => named(/^Share$/), 30000, 'the Share button')).click();
		(await until(() => named(/^Images \(\.zip\)/), 15000, 'the Images (.zip) row')).click();
		(await until(() => named(/^Download images/), 15000, 'the Download images button')).click();
		await until(() => share.opts, 240000, 'the Save toast');
		const exportMs = Math.round(performance.now() - t0);
		share.opts.onClick();
		await until(() => share.files, 15000, 'the shared file');
		const f = share.files[0];
		const bytes = new Uint8Array(await f.arrayBuffer());
		let bin = '';
		for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
		return { ok: true, name: f.name, size: f.size, b64: btoa(bin), exportMs, marker: window.__exportMarker, timeOrigin: performance.timeOrigin, width: innerWidth };
	} catch (e) {
		return { ok: false, error: String(e?.message || e), marker: window.__exportMarker || null, timeOrigin: performance.timeOrigin, width: innerWidth };
	}
}
