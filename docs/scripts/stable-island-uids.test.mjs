// Unit tests for scripts/stable-island-uids.mjs. No build, no browser: plain HTML strings.
//
// The property that matters: the uid no longer carries anything from the checkout folder, so two
// builds of one commit write the same bytes. Astro's own uid differs per folder AND per length.

import { describe, expect, it } from 'vitest';
import { stableIslandUids } from './stable-island-uids.mjs';

// Astro escapes every attribute value, so props carry `&quot;`, never a raw quote or `>`.
const island = (uid, props = '{}') => `<astro-island uid="${uid}" component-url="/_astro/Nav.Ab12Cd34.js" props="${props}" ssr client="idle"></astro-island>`;
const props = (x) => `{&quot;x&quot;:[0,${x}]}`;

describe('stableIslandUids', () => {
	it('writes the same page whatever uid Astro chose', () => {
		// The pair measured on one commit built in two folders: "Z2eCCew" vs "Xswyx".
		const a = stableIslandUids(`<body>${island('Z2eCCew')}</body>`).html;
		const b = stableIslandUids(`<body>${island('Xswyx')}</body>`).html;
		expect(a).toBe(b);
		expect(a.length).toBe(b.length);
	});

	it('keeps different islands apart, and identical ones apart by position', () => {
		const { html, islands } = stableIslandUids(island('a', props(1)) + island('b', props(2)) + island('c', props(1)));
		const uids = [...html.matchAll(/uid="([^"]*)"/g)].map((m) => m[1]);
		expect(islands).toBe(3);
		expect(new Set(uids).size).toBe(3);
	});

	it('is idempotent', () => {
		const once = stableIslandUids(island('Z2eCCew')).html;
		expect(stableIslandUids(once).html).toBe(once);
	});

	it('leaves everything but the uid alone, including the React prefix', () => {
		const tag = '<astro-island uid="Z2eCCew" prefix="r1" component-url="/_astro/Nav.Ab12Cd34.js" props="{}" ssr client="idle">';
		const out = stableIslandUids(tag).html;
		expect(out.replace(/uid="[^"]*"/, 'uid=""')).toBe(tag.replace(/uid="[^"]*"/, 'uid=""'));
		expect(out).toMatch(/uid="[\w-]{8}"/);
	});

	it('rewrites only the uid attribute, wherever it sits, and never a look-alike', () => {
		const tag = '<astro-island data-uid="keep" component-url="/_astro/Nav.Ab12Cd34.js" props="{&quot;uid&quot;:[0,&quot;keep&quot;]}" uid="Xswyx" client="idle">';
		const out = stableIslandUids(tag).html;
		expect(out).toContain('data-uid="keep"');
		expect(out).toContain('{&quot;uid&quot;:[0,&quot;keep&quot;]}');
		expect(out).not.toContain('uid="Xswyx"');
		expect(out).toMatch(/ uid="[\w-]{8}" client="idle">$/);
	});

	it('leaves a page with no islands untouched', () => {
		const page = '<html><body><p>uid="x"</p></body></html>';
		expect(stableIslandUids(page)).toEqual({ html: page, islands: 0 });
	});
});
