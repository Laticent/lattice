/**
 * Unit: what a plugin may hand back besides its drawing (lib/packages/plugin-returns.mjs, code-shape.mjs; threat-model
 * note engineering/decisions/2026-10-16-npm-plugin-threat-model.md §6, owner decisions 10 to 12). The end-to-end arm,
 * a hostile plugin per value in one real render, is `DATA RETURN` in test/integration/export/npm-plugin-canary.test.js.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { checkReturnData, renderReturnMarkdown, returnAttr } = require('../../../lib/packages/plugin-returns.mjs');
const { RETURN_ENVELOPE, splitReturn, pluginReturnFields, returnsRefusal, returnsConsent, pluginConsentText, MAX_RETURN_TEXT, MAX_RETURN_MARKDOWN } = require('../../../lib/packages/code-shape.mjs');
const { replaceFences } = require('../../../lib/packages/code-door-fence.mjs');

const manifest = (fields) => ({ contributes: { fences: { g: {} }, returns: { fields } } });
const FIELDS = pluginReturnFields(manifest({ status: { type: 'word', values: ['ok', 'late'] }, note: { type: 'text', max: 20 }, summary: { type: 'markdown' }, n: { type: 'number', min: 0, max: 10 }, done: { type: 'flag' } }));
const check = (data) => checkReturnData(data, FIELDS);

describe('splitReturn: the one string a `{ html, data }` crosses the frame as', () => {
  test('a plain string is html with no data', () => {
    assert.deepEqual(splitReturn('<p>x</p>'), { html: '<p>x</p>', data: null });
  });
  test('the envelope reads back, and a missing html is empty', () => {
    assert.deepEqual(splitReturn(`${RETURN_ENVELOPE}{"html":"<p>x</p>","data":{"n":1}}`), { html: '<p>x</p>', data: { n: 1 } });
    assert.deepEqual(splitReturn(`${RETURN_ENVELOPE}{"data":{"n":1}}`), { html: '', data: { n: 1 } });
  });
  test('a malformed envelope is an error, never html', () => {
    for (const bad of [`${RETURN_ENVELOPE}{`, `${RETURN_ENVELOPE}[]`, `${RETURN_ENVELOPE}{"html":3}`, `${RETURN_ENVELOPE}{"data":[1]}`, `${RETURN_ENVELOPE}{"data":"x"}`, 7]) {
      assert.ok('error' in splitReturn(bad), String(bad));
    }
  });
});

describe('returnsRefusal: the declaration is held to its shape at the gate', () => {
  test('a well-formed declaration of every type passes, and none at all is fine', () => {
    assert.equal(returnsRefusal(manifest({ a: { type: 'word', values: ['x'] }, b: { type: 'number' }, c: { type: 'flag' }, d: { type: 'text' }, e: { type: 'markdown', max: 10 } })), null);
    assert.equal(returnsRefusal({ contributes: {} }), null);
  });
  test('refuses a URL or HTML type, a stray key, a bad name, an oversize cap and too many fields', () => {
    const bad = [
      { a: { type: 'url' } },
      { a: { type: 'html' } },
      { a: { type: 'flag', values: ['x'] } },
      { A: { type: 'flag' } },
      { 'a b': { type: 'flag' } },
      { a: { type: 'text', max: MAX_RETURN_TEXT + 1 } },
      { a: { type: 'markdown', max: MAX_RETURN_MARKDOWN + 1 } },
      { a: { type: 'text', max: 1.5 } },
      { a: { type: 'number', min: 3, max: 1 } },
      { a: { type: 'number', min: Number.NaN } },
      { a: { type: 'word', values: [] } },
      { a: { type: 'word', values: ['<b>'] } },
      Object.fromEntries(Array.from({ length: 17 }, (_, k) => [`f${k}`, { type: 'flag' }])),
    ];
    for (const fields of bad) assert.ok(returnsRefusal(manifest(fields)), JSON.stringify(fields).slice(0, 80));
    assert.match(returnsRefusal({ contributes: { returns: { fields: { a: { type: 'flag' } }, attrs: {} } } }), /takes `fields` only/);
  });
  test('every value lands under one host-owned prefix, and a field name cannot hold `--`, so two plugins never share an attribute', () => {
    // The engine reads `data-split-mods`, `data-build-at`, `data-focus-style` and the settle protocol's `data-<plugin>-state`:
    // under the prefix, a plugin named `split` or `build` reaches none of them.
    assert.equal(returnAttr('split', 'mods'), 'data-returned-split--mods');
    assert.notEqual(returnAttr('a', 'b-c'), returnAttr('a-b', 'c'));
    for (const bad of ['a--b', 'a-', 'b--']) assert.match(returnsRefusal(manifest({ [bad]: { type: 'flag' } })) ?? '', /single hyphens/, bad);
    assert.equal(returnsRefusal(manifest({ 'a-b': { type: 'flag' } })), null);
    // Nothing in the engine, the runtime or a theme reads the prefix: a later reader would hand plugins a sink.
    const { execSync } = require('node:child_process');
    // A reader is an attribute selector or a DOM read, in CSS or code; a comment or a test that names the prefix is not one.
    const hits = execSync("git grep -lE '\\[data-returned-|dataset\\.returned|(getAttribute|hasAttribute|closest|querySelector(All)?)\\([^)]*data-returned-' -- lib themes docs/src ':!*.test.*' || true", { cwd: require('node:path').join(__dirname, '../../..'), encoding: 'utf8' }).trim();
    assert.equal(hits, '', `something now reads the returned-values prefix: ${hits}`);
  });
});

describe('checkReturnData: every value held to its declared field', () => {
  test('clean values come back as the text the host writes, control and bidi removed', () => {
    assert.deepEqual(check({ status: 'late', note: 'a‮b\u0007c', n: 3, done: false, summary: '**b** *i*\n\n- x\n\n| h |\n|---|\n| c |' }).values, [
      ['status', 'late'],
      ['note', 'abc'],
      ['n', '3'],
      ['done', 'false'],
      ['summary', '**b** *i*\n\n- x\n\n| h |\n|---|\n| c |'],
    ]);
    assert.deepEqual(check(null), { values: [] });
  });
  test('any value that breaks its field is a violation, named', () => {
    const cases = [
      [{ other: 1 }, /did not declare/],
      [{ status: 'evil' }, /not one of the words/],
      [{ status: 1 }, /not one of the words/],
      [{ n: 11 }, /outside the range/],
      [{ n: Number.POSITIVE_INFINITY }, /not a finite number/],
      [{ n: '3' }, /not a finite number/],
      [{ done: 'yes' }, /not true or false/],
      [{ note: 'x'.repeat(21) }, /past the 20 it declared/],
      [{ note: '<script>' }, /markup/],
      [{ note: '</style>' }, /markup/],
      [{ note: '<!--' }, /markup/],
      [{ note: { a: 1 } }, /not text/],
      [{ summary: '[x](javascript:alert(1))' }, /a link/],
      [{ summary: '[x](https://e.example)' }, /a link/],
      [{ summary: '![x](//e)' }, /an image/],
      [{ summary: '```\nx\n```' }, /a fenced block/],
      [{ summary: 'a <b>b</b>' }, /markup/],
    ];
    for (const [data, why] of cases) assert.match(check(data).violation ?? '', why, JSON.stringify(data));
    assert.match(checkReturnData({ a: 1 }, []).violation, /declares no return fields/);
  });
  test('the raw length is held, a lone surrogate is refused, and the invisible characters are removed', () => {
    assert.match(check({ note: `${'\u0000'.repeat(1_000_000)}abc` }).violation, /before cleaning/);
    assert.match(check({ note: 'x\ud800y' }).violation, /lone UTF-16 surrogate/);
    assert.deepEqual(check({ note: 'a\u200bb\u2028c\u061cd\u200ee\ufeff\u0085f' }).values, [['note', 'abcdef']]);
    assert.deepEqual(check({ note: 'a < b' }).values, [['note', 'a < b']], 'a comparison is not markup');
    assert.deepEqual(check({ note: 'one\ntwo\tx' }).values, [['note', 'one two x']], 'a line break in plain text is a space');
    assert.deepEqual(check({ note: 'a\u00adb\udb40\udc41c' }).values, [['note', 'abc']], 'a soft hyphen and a tag character are removed');
  });
  test('an autolink is text, not a link: the checker and the renderer agree', () => {
    assert.deepEqual(check({ summary: 'see https://e.example' }).values, [['summary', 'see https://e.example']]);
    assert.doesNotMatch(renderReturnMarkdown('see https://e.example'), /<a /);
  });
});

describe('renderReturnMarkdown: shows exactly what the check let through', () => {
  test('emphasis, lists and tables render; HTML, links and images do not', () => {
    const out = renderReturnMarkdown('**b** *i*\n\n- x\n\n| h |\n|---|\n| c |');
    for (const tag of ['<strong>', '<em>', '<ul>', '<table>']) assert.ok(out.includes(tag), tag);
    assert.doesNotMatch(renderReturnMarkdown('<b onmouseover=x>b</b> [x](javascript:y) ![i](//e)'), /<b |<a |<img/);
  });
});

describe('the declaration is shown, and pinned into consent', () => {
  test('the prompt names every field, its bounds and the attribute it lands on', () => {
    const text = returnsConsent('gantt', FIELDS);
    for (const part of ['status (one of ok, late)', 'note (plain text, up to 20 characters)', 'summary (markdown with no HTML, links or images, up to 2000 characters)', 'n (a number from 0 up to 10)', 'done (true or false)', 'data-returned-gantt--<field>']) assert.ok(text.includes(part), part);
    assert.equal(returnsConsent('gantt', []), '');
  });
  test('no returns keeps the digest text a plugin had before; a changed declaration changes it', () => {
    assert.equal(pluginConsentText('code', 'g', [], []), pluginConsentText('code', 'g'));
    const one = pluginConsentText('code', 'g', [], FIELDS);
    assert.notEqual(one, pluginConsentText('code', 'g'));
    const wider = pluginReturnFields(manifest({ status: { type: 'word', values: ['ok', 'late', 'lost'] }, note: { type: 'text', max: 20 }, summary: { type: 'markdown' }, n: { type: 'number', min: 0, max: 10 }, done: { type: 'flag' } }));
    assert.notEqual(one, pluginConsentText('code', 'g', [], wider), 'a new word slipped past consent');
  });
});

describe('replaceFences writes the values on the slide’s own <section>', () => {
  test('escaped as attribute values, replacing a same-named attribute, with the rest of the deck intact', () => {
    const html = `<section id="1" ${returnAttr('g', 'n')}="old">A <pre>F</pre> B</section><section id="2">C</section>`;
    const start = html.indexOf('<pre>');
    const end = html.indexOf('</pre>') + 6;
    const claims = [{ i: 0, start, end }];
    const out = replaceFences(html, claims, ['<div>D</div>'], new Map([[0, [[returnAttr('g', 'n'), '3'], [returnAttr('g', 'note'), '"q" <x> & y']]]]));
    assert.equal(out, '<section id="1" data-returned-g--n="3" data-returned-g--note="&quot;q&quot; &lt;x&gt; &amp; y">A <div>D</div> B</section><section id="2">C</section>');
  });
  test('a name inside another attribute\'s quoted value is left alone: the tag keeps its quoting (the red team)', () => {
    const name = returnAttr('p', 'f');
    const html = `<section data-class="a ${name}=z" data-header=" onmouseover=alert(1) " class="a content">A <pre>F</pre></section>`;
    const start = html.indexOf('<pre>');
    const out = replaceFences(html, [{ i: 0, start, end: html.indexOf('</pre>') + 6 }], ['<div>D</div>'], new Map([[0, [[name, 'v']]]]));
    assert.equal(out, `<section data-class="a ${name}=z" data-header=" onmouseover=alert(1) " class="a content" ${name}="v">A <div>D</div></section>`);
    // Read the way a browser does: still four attributes, and no handler.
    const { JSDOM } = require('jsdom');
    const sec = new JSDOM(out).window.document.querySelector('section');
    assert.deepEqual([...sec.attributes].map((a) => a.name), ['data-class', 'data-header', 'class', name]);
  });
  test('a tag the walk cannot read gets nothing written', () => {
    const html = '<section data-x="unclosed>A <pre>F</pre></section>';
    const start = html.indexOf('<pre>');
    const out = replaceFences(html, [{ i: 0, start, end: html.indexOf('</pre>') + 6 }], ['<div>D</div>'], new Map([[0, [[returnAttr('p', 'f'), 'v']]]]));
    assert.doesNotMatch(out, /data-returned-/);
  });
});
