// The security spine's policy table (lib/core/content-policy.js; 2026-11-03-security-findings-spine.md S0).
// Pins that every consumer reads the ONE table rather than a copy, that the table is a leaf every loader
// can take, and the predicates' own behavior.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const policy = require('../../../lib/core/content-policy.js');
const remoteRef = require('../../../lib/core/remote-ref.js');
const { inlinePolicyImport } = require('../../../lib/core/policy-page-script.js');

test('the table requires nothing, so the dev server, the code door and the capture page can inline it', () => {
	const src = fs.readFileSync(path.join(ROOT, 'lib/core/content-policy.js'), 'utf8');
	assert.doesNotMatch(src, /\brequire\s*\(/);
	assert.match(src, /^\s*module\.exports\s*=/m);
	assert.doesNotMatch(src, /^\s*(?:export|import)\s/m);
});

test('the scanner reads the table, not a copy (same Set objects)', () => {
	assert.equal(remoteRef.FETCH_ATTRS, policy.FETCH_ATTRS);
});

test('the slide sanitizer re-exports the table, not a copy (same objects)', async () => {
	const slide = await import('../../../lib/core/sanitize-slide-html.mjs');
	assert.equal(slide.FORBID_TAGS, policy.FORBID_TAGS);
	assert.equal(slide.FORBID_ATTR, policy.FORBID_ATTR);
	assert.equal(slide.STYLE_SCRIPT_RE, policy.STYLE_SCRIPT_RE);
});

test('the attribute sets keep the relations the scanner relies on', () => {
	// Render-time fetch is FETCH_ATTRS less the click-only ones (`action`, `ping`, `longdesc`).
	for (const a of policy.RENDER_FETCH_ATTRS) assert.ok(policy.FETCH_ATTRS.has(a), a);
	for (const a of ['action', 'ping', 'longdesc', 'formaction']) assert.ok(!policy.RENDER_FETCH_ATTRS.has(a), a);
	for (const a of ['ping', 'action', 'formaction', 'attributionsrc']) assert.ok(policy.CLICK_FETCH_ATTRS.has(a), a);
	for (const t of ['use', 'feimage', 'link', 'script']) assert.ok(policy.HREF_FETCH_TAGS.has(t), t);
	assert.ok(!policy.HREF_FETCH_TAGS.has('a'));
});

test('isEventHandlerAttr: any name that starts with on (DOMPurify strips all of them, `once` included), any case', () => {
	for (const n of ['onclick', 'onError', 'ONLOAD', 'on']) assert.ok(policy.isEventHandlerAttr(n), n);
	for (const n of ['once', 'src', 'data-on', 'xlink:href']) assert.equal(policy.isEventHandlerAttr(n), n === 'once', n);
});

test('STYLE_SCRIPT_RE: the legacy script-in-style vectors, never a url()', () => {
	for (const v of ['width: expression(alert(1))', 'background: url(javascript:x)', '-moz-binding: url(x)', 'behavior: url(x.htc)', 'x: VBScript:y']) assert.match(v, policy.STYLE_SCRIPT_RE, v);
	for (const v of ['background: url(https://x.example/a.png)', 'color: red', 'content: "behaviour"']) assert.doesNotMatch(v, policy.STYLE_SCRIPT_RE, v);
});

test('styleEndAt / endsStyleEarly: any `</style` prefix, any case, wherever it sits', () => {
	for (const v of ['a</style>b', '/* x </STYLE> */', 'content:"</Style"', '</styles>', '</style']) assert.ok(policy.endsStyleEarly(v), v);
	for (const v of ['', 'a</svg>', '< /style>', '<\\/style>', '</styl', null, undefined]) assert.equal(policy.endsStyleEarly(v), false, String(v));
	assert.ok(policy.styleEndAt('x</style', 1));
	assert.equal(policy.styleEndAt('x</svg', 1), false);
});

test('inlinePolicyImport gives a page script the same lists, and refuses a source without the import', () => {
	const src = fs.readFileSync(path.join(ROOT, 'lib/core/sanitize-slide-html.mjs'), 'utf8');
	const page = inlinePolicyImport(src, 'sanitize-slide-html.mjs').replace(/^export /gm, '');
	assert.doesNotMatch(page, /^\s*(?:import|export)\b/m);
	// eslint-disable-next-line no-new-func
	const got = new Function(`${page}\nreturn { FORBID_TAGS, FORBID_ATTR, STYLE_SCRIPT_RE: String(STYLE_SCRIPT_RE) };`)();
	assert.deepEqual(got, { FORBID_TAGS: policy.FORBID_TAGS, FORBID_ATTR: policy.FORBID_ATTR, STYLE_SCRIPT_RE: String(policy.STYLE_SCRIPT_RE) });
	assert.throws(() => inlinePolicyImport('export const x = 1;', 'other.mjs'), /no longer imports content-policy\.js/);
});
