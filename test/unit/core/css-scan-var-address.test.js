/**
 * The stylesheet gate refuses an address held where `image-set()` can read it
 * (engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.2, HARD RULE #22's stylesheet
 * channel). Every REFUSED case below fetched its address in Chromium on 2026-10-19 and passed
 * `gateCss` with zero findings before this change; the real-browser half of the proof is the
 * STYLESHEET arm of test/integration/export/npm-plugin-canary.test.js.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findCssExfil, findAddressStrings } = require('../../../lib/core/css-scan.js');
const { gateCss } = require('../../../lib/layout/gate.js');

const E = 'https://evil.example';
const rules = (css) => findCssExfil(css).map((f) => f.rule);

const REFUSED = {
  'custom property read by image-set (the followup’s example)': `section.p{--q:"${E}/y";background-image:image-set(var(--q) 1x)}`,
  'custom property on a parent, read by a child': `.p{--q:'${E}/y'}.p .c{background-image:image-set(var(--q) 1x)}`,
  'escaped custom-property name (\\2d-q is --q)': `.p{\\2d-q:"${E}/y";background-image:image-set(var(--q) 1x)}`,
  'escaped scheme inside the string': `.p{--q:"\\68ttps://evil.example/y"}`,
  'a whole image-set option list in the property': `.p{--q:"${E}/y" 1x;background-image:image-set(var(--q))}`,
  '@property initial-value': `@property --p{syntax:'*';inherits:true;initial-value:"${E}/y"}.p{background-image:image-set(var(--p) 1x)}`,
  'protocol-relative': `.p{--q:"//evil.example/y"}`,
  'backslash pair a URL parser reads as //': `.p{--q:"\\\\\\\\evil.example\\\\y"}`,
  'leading spaces before the scheme': `.p{--q:"  ${E}/y"}`,
  'string nested in a function inside the custom property': `.p{--q:image-set("${E}/y" 1x)}`,
  // The checker's, 2026-10-19, each fetched in Chromium: a URL parser deletes tab and newline anywhere.
  'a tab escaped into the scheme': `.p{--q:"ht\\9 tps://evil.example/y";background-image:image-set(var(--q) 1x)}`,
  'a newline escaped into the scheme': `.p{--q:"ht\\a tps://evil.example/y"}`,
  'a tab escaped between the two slashes': `.p{--q:"/\\9/evil.example/y"}`,
  // CSS turns CR, CRLF and FF into a newline before it tokenizes, so they end a string.
  'a bare CR ends the string before it': `.p{--a:"x\r;--q:"${E}/y";background-image:image-set(var(--q) 1x)}`,
  'a form feed ends the string before it': `.p{--a:"x\f;--q:"${E}/y"}`,
  'a backslash-CRLF continues the string before it': `.p{--a:"x\\\r\n";--q:"${E}/y"}`,
  // Not a custom property at all: the image-set scan used to be a lazy regex to the first `)`.
  'image-set target after an earlier url(data:) option': `.p{background-image:image-set(url(data:image/gif;base64,R0lGOD) type("image/gif") 1x, "${E}/y" 2x)}`,
  'image-set target after a type() in the same option': `.p{background-image:image-set("data:image/gif;base64,R0lGOD" type("image/gif") 1x, "${E}/y" 2x)}`,
};

const ALLOWED = {
  'a label with a slash': `.p{--sep:"/";content:var(--sep)}`,
  'a time with a colon': `.p{--t:"10:30"}`,
  'an address shown as text in content (never fetched)': `.p::after{content:"${E}/y"}`,
  'a data: image in a custom property': `.p{--i:url(data:image/gif;base64,R0lGOD)}`,
  'a fragment ref in a custom property': `.p{--f:"#clip"}`,
  'an address-shaped string in a SELECTOR, not a value': `.p[data-u="${E}"]{color:var(--text)}`,
  'image-set of data: with a type()': `.p{background-image:image-set("data:image/gif;base64,R0lGOD" type("image/gif") 1x)}`,
  'a quote inside a url(data:) run': `.p{background:url("data:image/svg+xml,<svg>\\"(\\")</svg>")}`,
};

for (const [name, css] of Object.entries(REFUSED)) {
  test(`refused: ${name}`, () => {
    const r = rules(css);
    assert.ok(r.includes('css-var-address') || r.includes('css-url-remote'), `no finding for ${css}: ${JSON.stringify(r)}`);
    assert.equal(gateCss(css, 'p').ok, false, 'gateCss accepted it');
  });
}

for (const [name, css] of Object.entries(ALLOWED)) {
  test(`allowed: ${name}`, () => {
    assert.deepEqual(rules(css), [], css);
  });
}

test('a url("…") in a custom property is reported once, by the url() rule', () => {
  assert.deepEqual(rules(`:root{--texture:url("${E}/paper.png")}`), ['css-url-remote']);
});

test('a finding points at the source line of the string, and names the property', () => {
  const [f] = findCssExfil(`.p {\n  color: red;\n  --q: "${E}/y";\n}`);
  assert.equal(f.rule, 'css-var-address');
  assert.equal(f.line, 3);
  assert.match(f.message, /--q/);
});

test('an image-set type() is a MIME type, not a target, and an unquoted url( … ) run is one token', () => {
  assert.deepEqual(findAddressStrings('a{b:image-set("x.png" type("image/png") 1x)}').map((a) => a.value), ['x.png']);
  assert.deepEqual(findAddressStrings(`a{--q:url(${E}/"y")}`), []);
});

test('the walk is linear on nested parentheses and strings (it was 29 s on 160 KB)', () => {
  const n = 80000;
  const t = Date.now();
  findCssExfil(`${'('.repeat(n)}${'"a"'.repeat(n)}`);
  findCssExfil(`a{b:${'image-set('.repeat(n / 10)}${'"a"'.repeat(n)}}`);
  assert.ok(Date.now() - t < 2000, `${Date.now() - t} ms`);
});

test('the stylesheet and markup channels agree on what an address is', async () => {
  // lib/core/door-attr.mjs keeps its own copy of the address test (it loads in the Studio on a
  // separate route budget). The two must refuse the same custom-property strings.
  const { cssRefTargets } = await import('../../../lib/core/door-attr.mjs');
  const vectors = ['ht\ttps://h', '/\n/h', `${E}/y`, '//h/y', '\\\\h\\y', '\\/h', '/\\h', ` ${E}`, 'javascript:x', 'blob:x', 'file:///x', 'wss://h', '/', '10:30', 'Q3', 'x.png', '#f'];
  for (const v of vectors) {
    const css = `--q:"${v.replace(/\\/g, '\\\\')}"`;
    const door = cssRefTargets(css).length > 0;
    const gate = rules(`.p{${css}}`).includes('css-var-address');
    assert.equal(gate, door, `${JSON.stringify(v)}: stylesheet gate ${gate}, markup door ${door}`);
  }
});

test('a package carrying it is REFUSED at the front door, not only reported (component and theme)', () => {
  // The finding alone is not enough: `firstRefusal` refuses only the rules it lists, and the
  // first cut of this fix reported the address while the package still installed and rendered.
  const { refusePackage } = require('../../../lib/packages/gate.js');
  const css = `section.p{--q:"${E}/y";background-image:image-set(var(--q) 1x)}`;
  const comp = { type: 'component', name: 'p', manifest: { name: 'p', type: 'component' }, roles: { 'styles.css': 'p.styles.css' }, files: { 'p.styles.css': css } };
  assert.match(refusePackage(comp, { forRender: true }) ?? '', /custom property/);
  const theme = { type: 'theme', name: 'q', manifest: { name: 'q', type: 'theme' }, roles: { css: 'q.css' }, files: { 'q.css': `/* @theme q */\n@import 'lattice';\n${css}` } };
  assert.match(refusePackage(theme) ?? '', /custom property/);
});
