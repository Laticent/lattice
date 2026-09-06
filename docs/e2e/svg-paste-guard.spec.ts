import { expect, test } from '@playwright/test';
// The REAL config, imported from the single source of truth (HARD RULE #1) rather than retyped —
// a copy here would pass while the shipped guard drifted.
import { ADD_ATTR, ADD_TAGS, FORBID_ATTR, FORBID_TAGS } from '../../lib/core/sanitize-slide-html.mjs';

// WHAT A PASTED SVG SURVIVES — pinned in a REAL browser, because the Fabricate Motion faculty's
// whole paste experience is built on the answer (HARD RULE #23; the craft ADR §8.1).
//
// Two of the DESTROYED rows are not edge cases, they are DEFAULT EXPORTS:
//   • Illustrator's "Style Elements" option puts every fill and stroke in one <style> block and
//     references it by class. The classes survive; the rules do not.
//   • An icon sprite or a Figma component with repeated instances is <symbol> + <use>. The <defs>
//     and <symbol> survive; the <use> that draws them does not.
// Either one comes out well-formed, still full of addressable ids, and painting NOTHING. That is
// why the faculty diffs before against after at paste time and names what it lost, instead of
// sanitizing silently and handing back a blank stage.
//
// The SURVIVES rows are load-bearing in the other direction: `id` is the entire addressing
// contract (`svg-paint.ts` builds its part map from `querySelectorAll('[id]')`), and inline
// `style` carrying `var(--token)` is how a part stays palette-blind (HARD RULE #3).
//
// This runs in Chromium rather than jsdom on purpose. The same probe in Node + jsdom returns
// byte-identical output today, and that agreement is exactly the kind of thing that is true until
// it isn't — the shipped surface is a browser, so the pin is taken there.
test('the guard keeps what choreography addresses and deletes what silently blanks a drawing', async ({ page }) => {
	await page.goto('/studio/');
	await page.addScriptTag({ path: 'node_modules/dompurify/dist/purify.min.js' });

	const out = await page.evaluate(
		(cfg) => {
			const dp = (window as unknown as { DOMPurify: { sanitize(s: string, c?: unknown): string; version: string } }).DOMPurify;
			const cases: Record<string, string> = {
				// Survives — the addressing contract and the paint that rides with it.
				id: `<svg viewBox="0 0 10 10"><path id="n1" d="M0 0 H10"/></svg>`,
				group: `<svg viewBox="0 0 10 10"><g id="grp" transform="translate(2,2)"><path d="M0 0 H5"/></g></svg>`,
				defs: `<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs><rect fill="url(#g)" width="10" height="10"/></svg>`,
				pathLength: `<svg viewBox="0 0 10 10"><path id="p" pathLength="100" stroke-dasharray="100" d="M0 0 H10"/></svg>`,
				tokenStyle: `<svg viewBox="0 0 10 10"><path id="p" style="stroke:var(--accent)" d="M0 0 H10"/></svg>`,
				// Deleted — each one blanks a drawing that still looks structurally intact.
				styleBlock: `<svg viewBox="0 0 10 10"><style>.a{fill:red}</style><path class="a" d="M0 0 H10"/></svg>`,
				use: `<svg viewBox="0 0 10 10"><defs><path id="p" d="M0 0 H10"/></defs><use href="#p"/></svg>`,
				symbolUse: `<svg viewBox="0 0 10 10"><symbol id="s"><path d="M0 0 H10"/></symbol><use href="#s"/></svg>`,
				// Deleted — the ordinary XSS and the animation channel we do not use.
				script: `<svg viewBox="0 0 10 10"><script>alert(1)</script><path d="M0 0 H10"/></svg>`,
				onload: `<svg viewBox="0 0 10 10" onload="alert(1)"><path d="M0 0 H10"/></svg>`,
				smil: `<svg viewBox="0 0 10 10"><path d="M0 0 H10"><animate attributeName="opacity" to="0" dur="1s"/></path></svg>`,
			};
			const r: Record<string, string> = { __version: dp.version };
			for (const [k, v] of Object.entries(cases)) r[k] = dp.sanitize(v, cfg);
			return r;
		},
		{ FORBID_TAGS, FORBID_ATTR, ADD_TAGS, ADD_ATTR },
	);

	// Survives.
	expect(out.id, 'id is the addressing contract — svg-paint resolves parts by querySelectorAll("[id]")').toContain('id="n1"');
	expect(out.group).toContain('id="grp"');
	expect(out.group).toContain('transform="translate(2,2)"');
	expect(out.defs).toContain('<linearGradient');
	expect(out.defs).toContain('url(#g)');
	expect(out.pathLength).toContain('pathLength="100"');
	expect(out.pathLength).toContain('stroke-dasharray="100"');
	expect(out.tokenStyle, 'a part stays palette-blind through its inline style (HARD RULE #3)').toContain('var(--accent)');

	// Deleted, and each leaves the drawing looking fine while painting nothing.
	expect(out.styleBlock).not.toContain('<style');
	expect(out.styleBlock, 'the class survives with nothing defining it — that is the trap').toContain('class="a"');
	expect(out.use).not.toContain('<use');
	expect(out.use, 'the defs survive, so a node count still looks right').toContain('id="p"');
	expect(out.symbolUse).not.toContain('<use');
	expect(out.symbolUse).toContain('<symbol');

	// Ordinary hostility.
	expect(out.script).not.toContain('<script');
	expect(out.onload).not.toContain('onload');
	expect(out.smil).not.toContain('<animate');
});
