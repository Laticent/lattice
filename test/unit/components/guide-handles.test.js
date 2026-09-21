/**
 * Census: a component that renders a NAMEABLE PART declares one, and every declaration
 * resolves against real rendered DOM.
 *
 * THE FAILURE THIS EXISTS TO PREVENT IS `slots`. Every manifest declares a `slots` map —
 * 220 selectors, one per content role — and nothing that renders has ever read it. A
 * quarter of those selectors stopped matching the DOM when their component grew a
 * transform, and not one test went red, because a declaration nobody resolves cannot
 * fail. `handles` is read by the Present Guide (docs/src/components/studio/
 * present-guide.ts), so a rotted selector here does not throw — it quietly un-points a
 * component, which is worse. Hence both arms below.
 *
 * ARM 1 — EVERY DECLARED ROW RESOLVES, on a surface the component OWNS: its manifest
 * `sample`, its `stressDoc.sample`, and its gallery deck, each at BOTH canvas
 * orientations. Owning the surface is the point. A row that only resolves on some deck in
 * `examples/` is a claim about that deck rather than about the component, and
 * `list-tabular` lost its row that way — it declared a table row and renders a list; a
 * corpus deck had simply put a markdown table on one of its slides.
 *
 * ARM 2 — THE ALL-OR-NOTHING HALF. #1945's own words are that a half-enriched catalog is
 * "worse than either end state": a consumer cannot tell "this component declares no
 * parts" from "nobody got to it yet". Rather than pin a hand-written list of all 71
 * components, this DERIVES the set that needs a declaration from the render — a part is
 * repeated, composite, and carries a name — so a component added next year is measured
 * by the same rule rather than by whether someone remembered it. A component the rule
 * catches either declares, or sits in SANCTIONED_NO_HANDLE with the reason.
 *
 * WHAT ARM 2 CANNOT SEE, stated so the coverage claim is not read wider than it is. It
 * walks the component's own sample surfaces at two orientations, so a part that appears
 * only under a MODIFIER none of them names is invisible to it. It also only recognizes two
 * shapes (a span-composite box and a multi-row table body); a third shape would need a
 * third arm.
 */

const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadAll } = require('../../../lib/components');
const engine = require('../../../lib/engine');

const ROOT = path.join(__dirname, '..', '..', '..');
const CATALOG = path.join(ROOT, 'docs/src/components/studio/guide-handles.generated.ts');

/** The generated catalog's rows, read out of the TypeScript module the Guide imports.
 *
 *  Parsed rather than required: the catalog is a `.ts` file because its only consumer is a
 *  TypeScript module, and emitting a second CJS copy just so this test could `require()` one
 *  would put two generated artifacts where one contract belongs. The generator writes the
 *  array with `JSON.stringify`, so the slice between the first `[` and the final `]` is JSON. */
function catalogRows() {
	const src = fs.readFileSync(CATALOG, 'utf8');
	// Anchored on the ASSIGNMENT, not on the name: the type annotation beside it carries its own
	// `[]`, and anchoring on the name found that one and parsed an empty array as the catalog.
	const at = src.indexOf('GUIDE_HANDLES');
	const open = src.indexOf('= [', at) + 2;
	const close = src.lastIndexOf(']');
	assert.ok(at !== -1 && open > 1 && close > open, `${path.relative(ROOT, CATALOG)} is not the shape this test parses`);
	return JSON.parse(src.slice(open, close + 1));
}

/** Block-level children that end a box's own leading text — `headerRange`'s own list, and the
 *  reason a span-composite part has no header to find. Kept in step with present-guide.ts by
 *  the assertion at the bottom of this file. */
const NESTED_BLOCK = new Set(['UL', 'OL', 'P', 'DL', 'BLOCKQUOTE', 'TABLE', 'DIV', 'FIGURE', 'PRE']);

/**
 * Components that render a nameable part and deliberately declare none.
 *
 * Each row carries a MEASUREMENT or a mechanism, never an opinion — the same bar the other
 * sanctioned lists in this repo carry. The gate fails on a stale row, so the list cannot rot
 * into decoration.
 */
const SANCTIONED_NO_HANDLE = {
	math: "the composite boxes are KaTeX's own typesetting internals (`.base`, `.vlist-r`, `.mord`) — third-party spans that carry no name a sentence could lead with, and that change shape with the formula",
	wifi: 'its credential rows are `.qr-row` + `.qr-mono`, and no cue ever names one: all 6 of its corpus cues are the slide heading and the call to action',
};

const manifests = loadAll();
const declaring = manifests.filter((m) => Array.isArray(m.handles));

/** The same deck asked for the portrait canvas.
 *
 *  AT BOTH ORIENTATIONS, because anatomy is orientation-dependent and this census was wrong
 *  about that once. `journey` renders `.journey-vstage` only on the portrait board
 *  (`journey.transform.js` reads the slide's `data-orientation`), so a landscape-only pass
 *  reported its declaration unverifiable and it was dropped — costing 9 corpus cues for a row
 *  that was correct. A component's parts are whatever it renders on a canvas it supports. */
function asPortrait(src) {
	if (!src.startsWith('---')) return `---\nsize: portrait\n---\n\n${src}`;
	const end = src.indexOf('\n---', 3);
	if (end === -1) return `---\nsize: portrait\n---\n\n${src}`;
	return `${src.slice(0, end)}\nsize: portrait${src.slice(end)}`;
}

/** Every surface the component itself ships — the two manifest samples plus its gallery deck —
 *  at both canvas orientations. */
function ownedSurfaces(m) {
	const out = [m.sample, m.stressDoc?.sample].filter(Boolean);
	for (const bucket of fs.readdirSync(path.join(ROOT, 'lib', 'components'), { withFileTypes: true })) {
		if (!bucket.isDirectory()) continue;
		const gallery = path.join(ROOT, 'lib', 'components', bucket.name, m.name, `${m.name}.gallery.md`);
		if (fs.existsSync(gallery)) out.push(fs.readFileSync(gallery, 'utf8'));
	}
	return [...out, ...out.map(asPortrait)];
}

/** Every `<section>` of this component across its own surfaces, as live DOM. */
function ownSections(m) {
	const out = [];
	for (const src of ownedSurfaces(m)) {
		let html;
		try {
			({ html } = engine.render(src));
		} catch {
			continue; // a surface that will not render is the gallery contract's problem, not this one
		}
		const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
		for (const sec of dom.window.document.querySelectorAll('section')) {
			if (sec.classList.contains(m.name)) out.push(sec);
		}
	}
	return out;
}

describe('guide handles — every declaration resolves against real rendered DOM', () => {
	test('the generated catalog carries exactly what the manifests declare', () => {
		const expected = [];
		for (const m of manifests) {
			for (const h of m.handles ?? []) expected.push(`${m.name}|section.${m.name} ${h.part}|${h.names}`);
		}
		const actual = catalogRows().map((r) => `${r.component}|${r.part}|${r.names}`);
		assert.deepEqual(
			actual.slice().sort(),
			expected.slice().sort(),
			'docs/src/components/studio/guide-handles.generated.ts is stale — run `npm run guide-handles:build`',
		);
	});

	for (const m of declaring) {
		test(`${m.name}: every declared part resolves on a surface it owns`, () => {
			const sections = ownSections(m);
			assert.ok(sections.length, `${m.name} renders no section of its own to check against`);
			for (const h of m.handles) {
				let hits = 0;
				for (const sec of sections) {
					for (const part of sec.querySelectorAll(h.part)) {
						const token = part.querySelector(h.names);
						if (token && (token.textContent ?? '').trim()) hits += 1;
					}
				}
				assert.ok(
					hits > 0,
					`${m.name}: \`handles\` declares { part: "${h.part}", names: "${h.names}" } and no surface ` +
						`this component ships renders it — not its sample, not its stress slide, not its gallery. ` +
						`The Guide resolves this against a live slide, so an unverifiable row is the \`slots\` ` +
						`failure with a new name. Drop the row, or ship a surface that exercises the variant.`,
				);
			}
		});
	}
});

describe('guide handles — a component that renders a nameable part declares one', () => {
	/** The two shapes the Guide's own heuristics cannot handle, found in this component's DOM. */
	function nameableParts(sec) {
		const found = [];
		for (const el of sec.querySelectorAll('*')) {
			const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
			if (!cls) continue;
			const kids = [...el.children];
			// A SPAN-COMPOSITE BOX: two or more element children, none of them a block, so
			// `headerRange` finds no cut and hands back the whole box.
			if (kids.length < 2 || kids.some((k) => NESTED_BLOCK.has(k.tagName))) continue;
			if (!(el.textContent ?? '').trim()) continue;
			const siblings = [...(el.parentElement?.children ?? [])].filter(
				(s) => typeof s.className === 'string' && s.className.trim().split(/\s+/)[0] === cls,
			);
			if (siblings.length < 2) continue; // not repeated: one box is not a part
			if (!kids.some((k) => typeof k.className === 'string' && k.className.trim() && (k.textContent ?? '').trim())) continue;
			found.push(`.${cls}`);
		}
		// A MULTI-ROW TABLE BODY: the projection reads a row as one sentence built from its cells,
		// and the first cell names it — the shape `tbody > tr` / `td:first-child` declares.
		for (const body of sec.querySelectorAll('tbody')) {
			const rows = [...body.children].filter((r) => r.tagName === 'TR');
			if (rows.length >= 2 && rows[0].children.length >= 2) found.push('tbody > tr');
		}
		return [...new Set(found)];
	}

	const needing = new Map();
	for (const m of manifests) {
		const parts = new Set();
		for (const sec of ownSections(m)) for (const p of nameableParts(sec)) parts.add(p);
		if (parts.size) needing.set(m.name, [...parts]);
	}

	test('every component rendering a nameable part either declares handles or is sanctioned', () => {
		const undeclared = [];
		for (const [name, parts] of needing) {
			const m = manifests.find((x) => x.name === name);
			if (Array.isArray(m.handles)) continue;
			if (SANCTIONED_NO_HANDLE[name]) continue;
			undeclared.push(`${name} (renders ${parts.join(', ')})`);
		}
		assert.deepEqual(
			undeclared,
			[],
			`these components render a repeated part with a name inside it and declare no \`handles\`, so ` +
				`the Present Guide draws on the whole part instead of the name — and a cue the projection ` +
				`composed across that part's children resolves to nothing at all. Add a \`handles\` block, or ` +
				`a SANCTIONED_NO_HANDLE row in this file saying what was measured:\n  ${undeclared.join('\n  ')}`,
		);
	});

	test('no SANCTIONED_NO_HANDLE row is stale', () => {
		const stale = Object.keys(SANCTIONED_NO_HANDLE).filter((n) => !needing.has(n));
		assert.deepEqual(
			stale,
			[],
			`SANCTIONED_NO_HANDLE exempts ${stale.join(', ')}, which render no nameable part any more (or no ` +
				`longer exist). An exemption for something that is not there is a gate certifying nothing — drop the row.`,
		);
	});

	test('every sanctioned row carries a reason, not a label', () => {
		for (const [name, why] of Object.entries(SANCTIONED_NO_HANDLE)) {
			assert.ok(why.length > 40, `SANCTIONED_NO_HANDLE.${name} needs the measurement or the mechanism, not a word`);
		}
	});
});

describe('guide handles — the census reads the same block list the Guide does', () => {
	test("NESTED_BLOCK here matches present-guide.ts's", () => {
		const src = fs.readFileSync(path.join(ROOT, 'docs/src/components/studio/present-guide.ts'), 'utf8');
		const m = /const NESTED_BLOCK = new Set\(\[([^\]]*)\]\)/.exec(src);
		assert.ok(m, 'present-guide.ts no longer declares NESTED_BLOCK the way this census finds it');
		const theirs = [...m[1].matchAll(/'([A-Z]+)'/g)].map((x) => x[1]).sort();
		assert.deepEqual(
			theirs,
			[...NESTED_BLOCK].sort(),
			'this census decides which parts NEED a handle by asking whether `headerRange` would find a ' +
				'block inside them, so a block list that has drifted from the Guide\'s makes it ask a ' +
				'different question than the one it reports on',
		);
	});
});
