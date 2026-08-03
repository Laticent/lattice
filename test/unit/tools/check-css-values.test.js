const { test } = require('node:test');
const assert = require('node:assert/strict');

const { stripComments, declarations } = require('../../../tools/check-css-values.js');

// These two helpers decide what the CSS-validity oracle ever gets to SEE. If
// either quietly loses a rule, the gate reports clean on stylesheets it never
// actually looked at — the same silent-blindness failure the gate exists to
// catch, one level up. So they are pinned here rather than trusted.

test('stripComments does not treat /* inside a quoted value as a comment', () => {
  // The regression: a non-string-aware `replace(/\/\*[\s\S]*?\*\//g, …)` reads the
  // `/*` in the FIRST rule as a comment open and blanks everything up to the `*​/`
  // in the LAST, erasing the middle rule entirely — including a real invalid value.
  const css = ['a { content: "/*"; color: red; }', 'b { color: notacolor; }', 'c { content: "*/"; }'].join('\n');
  const out = stripComments(css);
  assert.match(out, /color:\s*notacolor/, 'the middle rule must survive — it carries the value the gate is hunting');
  assert.match(out, /color:\s*red/, 'the first rule must survive');
  const props = declarations(out).map((d) => `${d.prop}: ${d.value}`);
  assert.ok(props.includes('color: notacolor'), `invalid value must reach the oracle; got ${JSON.stringify(props)}`);
});

test('stripComments blanks real comments while preserving line numbers', () => {
  const css = 'a { color: red; }\n/* a comment\n   spanning lines */\nb { color: blue; }';
  const out = stripComments(css);
  assert.equal(out.split('\n').length, css.split('\n').length, 'line count must be preserved');
  assert.doesNotMatch(out, /a comment/, 'comment text must be gone');
  const b = declarations(out).find((d) => d.value === 'blue');
  assert.equal(b.line, 4, 'a declaration after a multi-line comment keeps its true line number');
});

test('stripComments handles an escaped quote and an unterminated comment', () => {
  assert.match(stripComments(String.raw`a { content: "he said \" /* "; color: red; }`), /color:\s*red/);
  // An unterminated comment runs to EOF, per CSS parsing — nothing after it survives.
  assert.doesNotMatch(stripComments('a { color: red; }\n/* never closed\nb { color: blue; }'), /blue/);
});

test('declarations does not split on a semicolon inside a string or parens', () => {
  const css = 'a { background: url("data:image/svg+xml;base64,AAA"); color: red; }';
  const got = declarations(css);
  assert.deepEqual(
    got.map((d) => d.prop),
    ['background', 'color'],
    'the `;` inside the data URI must not end the declaration',
  );
  assert.match(got[0].value, /base64,AAA/);
});

test('declarations skips at-rule preludes but keeps declarations inside them', () => {
  const got = declarations('@media print { a { color: red; } }');
  assert.deepEqual(got.map((d) => `${d.prop}: ${d.value}`), ['color: red']);
});

test('declarations records the line a multi-line value starts on', () => {
  const css = 'a {\n  color: red;\n  box-shadow:\n    0 1px 2px black,\n    0 2px 4px black;\n}';
  const shadow = declarations(css).find((d) => d.prop === 'box-shadow');
  assert.equal(shadow.line, 3, 'reported at the property, not at the last line of the value');
});

// ── Cases added after a checker mutation-tested the six above and found three
// of them vacuous: they passed with the at-rule guard removed, with paren
// tracking removed, and with string tracking in declarations() removed. Each
// case below is pinned to ONE mechanism, and each was confirmed to fail when
// that mechanism is disabled.

test('declarations emits nothing for statement at-rules', () => {
  // Behavioral, NOT a pin on the `t.startsWith('@')` guard — I tried to write it as
  // one and the mutation survived. Every realistic statement at-rule is already
  // rejected upstream: `@import`/`@charset`/`@layer` carry no top-level colon, and
  // `@namespace svg url(http://…)` has whitespace in the would-be property name, which
  // flush() rejects. The guard is defensive and I could not construct input that
  // reaches it. Kept because it costs nothing and documents intent; this case just
  // pins the outcome.
  const got = declarations(
    ['@import url("a.css");', '@charset "utf-8";', '@layer base;',
     '@namespace svg url(http://www.w3.org/2000/svg);', '.a { color: red; }'].join('\n'),
  );
  assert.deepEqual(got.map((d) => `${d.prop}: ${d.value}`), ['color: red']);
});

test('declarations does not split on a semicolon inside UNQUOTED parens', () => {
  // Isolates paren tracking: no quotes anywhere, so string tracking cannot cover for it.
  const got = declarations('a { background: url(data:image/svg+xml;utf8,<svg/>); color: red; }');
  assert.deepEqual(got.map((d) => d.prop), ['background', 'color']);
  assert.match(got[0].value, /utf8,<svg\/>/);
});

test('declarations does not split on a semicolon inside a string OUTSIDE parens', () => {
  // Isolates string tracking, for the same reason in reverse.
  const got = declarations('a { content: "a;b"; color: red; }');
  assert.deepEqual(got.map((d) => `${d.prop}: ${d.value}`), ['content: "a;b"', 'color: red']);
});

test('declarations survives an escaped backslash ending a string', () => {
  // The F2 regression: `content: "\\"` is one literal backslash and CLOSES the string.
  // Looking back at css[k-1] reads the closing quote as escaped, so the parser stays
  // inside the string and swallows the rest of the file — the gate then reports clean
  // on CSS it never saw. `text-wrap: normal` here is the #1309 bug this tool exists for.
  const css = ['.icon::before { content: "\\\\"; }', '.a { color: notacolor; }', '.b { text-wrap: normal; }'].join('\n');
  const got = declarations(stripComments(css)).map((d) => `${d.prop}: ${d.value}`);
  assert.ok(got.includes('color: notacolor'), `swallowed the file; saw ${JSON.stringify(got)}`);
  assert.ok(got.includes('text-wrap: normal'), 'the very bug this gate exists to catch must be visible');
});

test('declarations skips descriptor at-rule bodies but keeps conditional-group ones', () => {
  // @font-face/@property carry DESCRIPTORS, which CSS.supports always rejects — left
  // in, the gate fails on valid CSS. @media/@supports carry real properties.
  const css = [
    '@font-face { font-family: X; src: url(a.woff2) format("woff2"); font-display: swap; }',
    '@property --x { syntax: "<color>"; inherits: false; initial-value: red; }',
    '@media print { .b { color: red; } }',
    '@supports (display: grid) { .c { color: blue; } }',
    '.a { color: notacolor; }',
  ].join('\n');
  const got = declarations(css).map((d) => d.prop);
  assert.deepEqual(got.sort(), ['color', 'color', 'color'], `descriptors leaked: ${JSON.stringify(got)}`);
});
