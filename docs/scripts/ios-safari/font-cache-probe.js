/**
 * THE FONT CACHE PROBE (PROBE=font-cache): does real Safari read the Studio's warmed fonts from its cache?
 *
 * After the first slide, the Studio fetches every face the base sheet declares, about 2.7 MB, so that a later edit finds
 * them cached (docs/src/components/studio/studio-warm.ts; engineering/decisions/2026-09-26-studio-panel-lazy-loading.md
 * §Warming the fonts the first slide skipped). That only pays if the preview frame's own font request is answered from
 * the cache the page's fetch filled. Chromium, Firefox and Linux WebKit were checked; Safari was not, and if it misses,
 * every iPhone visit downloads those faces twice.
 *
 * Two arms, each on its own origin (font-cache-server.mjs serves the site on two ports), so each starts with a cold cache.
 * They run the same steps: wait until every face is cached, then add what the first slide's faces lack (an emoji, a code
 * block, `finish: sketch`), then count every font request the server sees after the edit. They differ only in the
 * server's header on the font files:
 *   warm     GitHub Pages' `max-age=600`: NO font request may reach the server after the edit;
 *   control  `no-store`: some MUST, or the probe cannot see a miss and proves nothing.
 *
 * The oracle is the SERVER's log (GET /__probe/fonts), not the page: a page cannot see a cache hit in every engine. It
 * counts every request after the edit, with no attempt to tell the frame's loads from the warm-up's fetches: the warm-up
 * has finished by then. (Telling them apart by `Sec-Fetch-Dest` was the first cut; in Mobile Safari 26.5 neither arm saw a
 * request marked `font`.) The destinations seen are reported in the step detail, for the record.
 *
 * Plain browser JS defining one global, for the reason the other probes are: WebDriver's execute-script sends source
 * text, not a module. Needs show-editor.js ahead of it (run.mjs and probe.selftest.mjs send it).
 */
const FONT_CACHE_DECK = ['---', 'finish: sketch', '---', '', '# Font cache 😀 probe', '', '```js', 'const warmed = true;', '```'].join('\n');
/** The faces the warm-up fetches: studio-warm.ts WARM_FONT_FILES (17 text, 3 icon, 11 emoji). */
const FONT_CACHE_WARM_COUNT = 31;

// biome-ignore lint/correctness/noUnusedVariables: run.mjs and probe.selftest.mjs call it by name.
async function latticeFontCacheProbe(arm) {
	const steps = [];
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
	// This page's part of the server's log: every request since this document's navigation began. The server outlives a run
	// (run.sh drives the iPad, then the iPhone, against one server), so a count over the whole log was already met by the run
	// before, and the second device edited before its own warm-up had run (found on the self-test's second page shape). Not
	// "since this probe started": under WebDriver the probe arrives after the load event, and the first slide's own faces may
	// already have been served. The server and the simulator share the host's clock; a second of slack covers rounding.
	const since = performance.timeOrigin - 1000;
	const log = async () => ((await (await fetch('/__probe/fonts', { cache: 'no-store' })).json()) || []).filter((e) => e.at >= since);
	const visible = (el) => !!el && !el.closest('[inert]') && el.getClientRects().length > 0;
	const button = (label) => [...document.querySelectorAll(`button[aria-label="${label}"]`)].find(visible);
	const frame = () => document.querySelector('[aria-label="Live deck preview"] iframe.live');
	const frameDoc = () => {
		try {
			return frame()?.contentDocument || null;
		} catch {
			return null;
		}
	};
	const narrow = innerWidth <= 699;
	try {
		await until(() => window.__latticeRenderMetrics, 150000, "the Studio's first render (its render metrics)");
		await until(() => frame()?.style.opacity === '1', 150000, 'the first slide revealed');
		// Every face fetched once, by the warm-up or the first slide's frame: the server has answered all 31 files, so whatever
		// the edit asks for has been asked for before.
		const served = async () => new Set((await log()).map((e) => e.path)).size;
		const t0 = Date.now();
		let n = 0;
		while ((n = await served()) < FONT_CACHE_WARM_COUNT) {
			if (Date.now() - t0 > 240000) throw new Error(`the server had served ${n} of ${FONT_CACHE_WARM_COUNT} faces after 240 s`);
			await sleep(1000);
		}
		// The last answer is in; give its body a moment to land in the cache.
		await sleep(2000);
		steps.push({ name: `all ${FONT_CACHE_WARM_COUNT} faces fetched before the edit`, pass: true, detail: `${n} distinct files served` });
		const before = (await log()).length;
		// Replace the deck the way a person pasting does, as panes-probe.js does.
		const el = await latticeShowDeckEditor();
		el.focus();
		if (el instanceof HTMLTextAreaElement) {
			el.select();
			if (!document.execCommand('insertText', false, FONT_CACHE_DECK)) {
				el.value = FONT_CACHE_DECK;
				el.dispatchEvent(new Event('input', { bubbles: true }));
			}
		} else {
			document.execCommand('selectAll');
			document.execCommand('insertText', false, FONT_CACHE_DECK);
		}
		if (narrow) (await until(() => button('Preview'), 15000, 'the Preview button')).click();
		await until(() => /Font cache/.test(frameDoc()?.querySelector('.lattice section h1')?.textContent || ''), 60000, 'the edited slide in the preview');
		// The frame's faces settled: its font gate says so, and the document's font set is idle.
		await until(() => frame()?.contentWindow?.__latticeFontsSettled === true && frameDoc()?.fonts?.status === 'loaded', 60000, "the frame's faces settled");
		await sleep(3000);
		const after = (await log()).slice(before);
		const files = after.map((e) => e.path.split('/').pop()).join(', ');
		const dests = [...new Set((await log()).map((e) => String(e.dest)))].join(' ');
		if (arm === 'control') steps.push({ name: 'control (no-store): the edit sent font requests to the server, so the probe can see a miss', pass: after.length > 0, detail: `${after.length}: ${files}; Sec-Fetch-Dest seen: ${dests}` });
		else steps.push({ name: 'warm (max-age=600): the same edit sent no font request to the server', pass: after.length === 0, detail: `${after.length}${files ? `: ${files}` : ''}; Sec-Fetch-Dest seen: ${dests}` });
	} catch (e) {
		steps.push({ name: 'the probe ran to the end', pass: false, detail: String(e?.message || e) });
	}
	const failed = steps.filter((s) => !s.pass);
	return { ok: failed.length === 0, error: failed.map((s) => s.name).join('; ') || undefined, ua: navigator.userAgent, width: innerWidth, steps };
}
