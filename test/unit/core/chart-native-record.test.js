// A NATIVE chart (`rows.native`: bullet, progress) reads a row's `{…}` record through the row schema in its transform AND its
// narrator (lib/core/chart-rows.js `takeRecord` / `recordFields`), so a field no old span spells is drawn and said: bullet's
// `band=` and `floor=`, progress's `note=`. The old form of those fields is a nested row, so the record is compared with that.
// Every arm carries its control: the field is not vacuously equal because both sides dropped it.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const MarkdownIt = require('markdown-it');

const ROOT = path.join(__dirname, '..', '..', '..');
const rows = require('../../../lib/core/chart-rows.js');
const engine = require('../../../lib/engine');
const { narrateChart } = require('../../../lib/core/chart-narration.js');
const lintCore = require('../../../lib/authoring/lint-core.js');
const { buildVocab } = require('../../../lib/authoring/lint');
const { loadAll } = require('../../../lib/components');

const vocab = buildVocab(loadAll(path.join(ROOT, 'lib', 'components')));
const slide = (cls, body) => `<!-- _class: ${cls} -->\n\n## KPIs\n\n${body}\n`;
const deck = (cls, body) => `---\nmarp: true\n---\n\n${slide(cls, body)}`;
const render = (src) => engine.render(src, {}).html;
// Ids differ per document position only; the markup is otherwise byte for byte.
const norm = (h) => h.replace(/\s+/g, ' ').replace(/ id="[^"]*"/g, '').replace(/(aria-labelledby|aria-describedby)="[^"]*"/g, '');

const CASES = {
  bullet: {
    old: '- Uptime `99.4%` `99.9%`\n  - Floor `99.0%`\n  - Band `99.5%`\n- Latency `180` `200`',
    rec: '- Uptime `{99.4%, target=99.9%, floor=99.0%, band=[99.5%]}`\n- Latency `{180, target=200}`',
    bare: '- Uptime `{99.4%, target=99.9%}`\n- Latency `{180, target=200}`',
  },
  progress: {
    old: '- Build `68%` `at-risk`\n  - Q4 slip, again\n- Docs `90%` `on-track`',
    rec: '- Build `{68%, at-risk, note="Q4 slip, again"}`\n- Docs `{90%, on-track}`',
    bare: '- Build `{68%, at-risk}`\n- Docs `{90%, on-track}`',
  },
};

describe('the native charts are the ones the manifests say', () => {
  test('bullet and progress, and only those, declare rows.native', () => {
    assert.deepEqual([...rows.NATIVE_CHARTS].sort(), ['bullet', 'progress']);
  });
});

describe('recordFields: what a record holds, as typed', () => {
  test('bullet keeps the author\'s spelling and a list field is an array', () => {
    assert.deepEqual(rows.recordFields('bullet', '{4.2M, target=5.0M, band=[3M, 4M], floor=1M}'),
      { value: '4.2M', target: '5.0M', band: ['3M', '4M'], floor: '1M' });
  });
  test('progress: a vocabulary word is the status, a quoted note keeps its comma', () => {
    assert.deepEqual(rows.recordFields('progress', '{68%, AT-RISK, note="a, b"}'), { value: '68%', status: 'AT-RISK', note: 'a, b' });
  });
  test('a span that is not a record that reads gives null', () => {
    assert.equal(rows.recordFields('bullet', '{nope}'), null);
    assert.equal(rows.recordFields('bar', '{4.2'), null);
  });
});

for (const [chart, c] of Object.entries(CASES)) {
  describe(`${chart}: the transform draws every field of a record`, () => {
    const was = render(deck(chart, c.old));
    test('a record draws what the old nested rows drew (HTML)', () => {
      assert.match(was, /chart-frame/);
      assert.equal(norm(render(deck(chart, c.rec))), norm(was));
    });
    test('control: dropping the field changes the picture', () => {
      assert.notEqual(norm(render(deck(chart, c.bare))), norm(was));
    });
    test('no claim stamp survives', () => {
      assert.doesNotMatch(render(deck(chart, c.rec)), /data-lat-record/);
    });
  });

  describe(`${chart}: the narrator says every field of a record`, () => {
    test('the voice equals the old form\'s', () => {
      const said = narrateChart(slide(chart, c.old));
      assert.ok(said && said.length > 40);
      assert.equal(narrateChart(slide(chart, c.rec)), said);
    });
    test('control: dropping the field changes the voice', () => {
      assert.notEqual(narrateChart(slide(chart, c.bare)), narrateChart(slide(chart, c.old)));
    });
  });
}

describe('the picture and the voice agree on a record they both read', () => {
  test('progress: the note is drawn and spoken', () => {
    assert.match(render(deck('progress', CASES.progress.rec)), /<div class="progress-note">Q4 slip, again<\/div>/);
    assert.match(narrateChart(slide('progress', CASES.progress.rec)), /Q4 slip, again\./);
  });
  test('bullet: the floor moves the scale in both', () => {
    assert.match(render(deck('bullet', CASES.bullet.rec)), /on a scale from 99%/);
    assert.match(narrateChart(slide('bullet', CASES.bullet.rec)), /on a scale starting at ninety-nine percent/);
  });
  test('a record and a nested keyword row: the keyword row wins, as it always overrode the row\'s own pills', () => {
    const mixed = '- Uptime `{99.4%, target=99.9%, floor=99.0%}`\n  - Floor `98.0%`\n- Latency `{180, target=200}`';
    assert.match(render(deck('bullet', mixed)), /on a scale from 98%/);
    assert.match(narrateChart(slide('bullet', mixed)), /starting at ninety-eight percent/);
  });
});

describe('shapes where the record is not the lead\'s trailing element read as the old spans do', () => {
  test('a progress row with a `>` quote under it (progress takes no quote) draws as the old spans draw it', () => {
    const old = '- EMEA `61%` `at-risk`\n  > note 0\n- APAC `18%` `at-risk`';
    const rec = '- EMEA `{61%, at-risk}`\n  > note 0\n- APAC `{18%, at-risk}`';
    assert.equal(norm(render(deck('progress', rec))), norm(render(deck('progress', old))));
  });
  test('a record on a continuation line reads as the old spans do', () => {
    const old = '- APAC\n  `9` `3.3`\n- AMER `3.4` `3.3`';
    const rec = '- APAC\n  `{9, target=3.3}`\n- AMER `{3.4, target=3.3}`';
    assert.equal(norm(render(deck('bullet', rec))), norm(render(deck('bullet', old))));
    assert.equal(narrateChart(slide('bullet', rec)), narrateChart(slide('bullet', old)));
  });
});

describe('lint: the fields are drawn now, so there is nothing to warn about', () => {
  const unread = (src) => lintCore.lintTextWith(src, vocab).filter((f) => f.rule === 'chart-row-record-unread');
  test('band, floor and note are silent; a record after another span still warns', () => {
    assert.deepEqual(unread(deck('bullet', CASES.bullet.rec)), []);
    assert.deepEqual(unread(deck('progress', CASES.progress.rec)), []);
    assert.equal(unread(deck('bullet', '- E `{NEW, tag}` `{2}`')).length, 1);
  });
});

describe('runtime: the browser draws a record\'s extra fields as the engine does', () => {
  const md = new MarkdownIt();
  async function boot(cls, body) {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body><section class="${cls}">${md.render(`## KPIs\n\n${body}`)}</section></body></html>`, {
      url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true,
    });
    dom.window.fetch = () => Promise.reject(new Error('no network in this test'));
    const el = dom.window.document.createElement('script');
    el.textContent = fs.readFileSync(path.join(ROOT, 'dist', 'lattice-runtime.js'), 'utf8');
    dom.window.document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 300));
    return dom.window.document.querySelector('section').innerHTML;
  }
  for (const [chart, c] of Object.entries(CASES)) {
    test(chart, async () => {
      const was = await boot(chart, c.old);
      assert.match(was, /chart-body|-figure|progress-bars/, `${chart}: the control is drawn`);
      const rec = await boot(chart, c.rec);
      assert.equal(rec, was);
      assert.doesNotMatch(rec, /data-lat-record/);
    });
  }
});

describe('lint and the chart agree on where a native record is read (inversion finding, 2026-10-23)', () => {
  const unread = (src) => lintCore.lintTextWith(src, vocab).filter((f) => f.rule === 'chart-row-record-unread');
  test('a progress note record with a `>` quote after it is not read, so lint warns (the quote is not a description on progress)', () => {
    const src = deck('progress', '- EMEA `{61%, at-risk, note="slip"}`\n  > note 0\n- APAC `{18%, at-risk}`');
    const [f, ...rest] = unread(src);
    assert.equal(rest.length, 0);
    assert.match(f.message, /followed by other content/);
    assert.match(render(src), /\{61%, at-risk, note=/, 'control: the chart really does show the braces');
  });
  test('a bullet band record with a second paragraph is warned; a `>` quote is lifted off the row, so it is read and silent', () => {
    assert.equal(unread(deck('bullet', '- U `{99%, band=[98%]}`\n\n  second paragraph\n- A `{1}`')).length, 1);
    const quoted = deck('bullet', '- U `{99%, target=99.9%, band=[98%]}`\n  > a description\n- A `{1, target=2}`');
    assert.deepEqual(unread(quoted), []);
    assert.match(render(quoted), /data-value="99%"/);
  });
  test('a nested list after the record is the usual shape and silent', () => {
    assert.deepEqual(unread(deck('progress', '- EMEA `{61%, at-risk, note="slip"}`\n  - nested\n- A `{1%}`')), []);
  });
});
