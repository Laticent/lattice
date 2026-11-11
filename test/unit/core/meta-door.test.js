/**
 * The slide-metadata door (lib/core/meta-door.mjs, engineering/decisions/2026-10-17-meta-record.md §5.1, step 2):
 * reading one record, compiling a deck in place, the forgery guard, the carrier escape, the wrapped-record join under
 * a seeded fuzz (seed printed in every failure, HARD RULE #32), and the render: a record writes the same `<section>`
 * as the directive comments it replaces.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { SOURCE_CTX } = require('../../../lib/engine/source-hooks.js');
const { compileSource } = require('../../../lib/plugins/meta/meta.source.mjs');
const door = { ...require('../../../lib/core/meta-door.mjs'), compileMetaSource: (s) => compileSource(s, SOURCE_CTX) };
const { readDirectiveComment, readDirectiveEntries } = require('../../../lib/core/comment-directive.mjs');
const { mulberry32 } = require('../../helpers/regex-differential');
const { createEngine } = require('../../../lib/engine');
const notes = require('../../../lib/authoring/notes-core.js');

const lines = (s) => s.split('\n').length;

describe('readRecord: one record comment body', () => {
  test('the canonical and long forms read alike; names are kebab-case, keys camelCase', () => {
    const a = door.readRecord(' {layout=cards, footer="Q3, review", focus-steps="row 1 | row 2"} ');
    const b = door.readRecord(' @meta{layout=cards, footer="Q3, review", focus-steps="row 1 | row 2"} ');
    assert.deepEqual(a, b);
    assert.equal(a.ok, true);
    assert.deepEqual(a.d, { class: 'cards', footer: 'Q3, review', focusSteps: 'row 1 | row 2' });
  });

  test('the typed class fields compose in order, plugin registers become their class words', () => {
    const r = door.readRecord(' {modifiers=no-rule, layout=cards, variant=quiet, icon=bare etch, class=dark} ');
    assert.equal(r.d.class, 'cards quiet no-rule dark icon-bare icon-etch');
  });

  test('the class slot sits where the first class field is, so attributes keep the comments’ order', () => {
    assert.deepEqual(Object.keys(door.readRecord(' {footer=x, layout=cards} ').d), ['footer', 'class']);
    assert.deepEqual(Object.keys(door.readRecord(' {layout=cards, footer=x} ').d), ['class', 'footer']);
  });

  test('flags, carry and markers are bare words', () => {
    const r = door.readRecord(' {build, carry, stress-slide, hide} ');
    assert.equal(r.carry, true);
    assert.deepEqual(r.d, { build: '', hide: '' });
    assert.deepEqual(r.markers, ['stress-slide']);
  });

  test('note, reader, say and describe go to the notes channel, never to `d`', () => {
    const r = door.readRecord(' {layout=list, note="Open cold.", say="Hello"}\nreader: |\n  For you.\n\n  Second.\ndescribe: A chart.\n');
    assert.deepEqual(r.d, { class: 'list' });
    assert.deepEqual(r.notes, { note: ['Open cold.'], say: ['Hello'], reader: ['For you.\n\nSecond.'], describe: ['A chart.'] });
  });

  test('deck-only keys, unknown keys and non-scalar values are dropped and reported', () => {
    const r = door.readRecord(' {theme=dark, lang=fr, nope=1, footer=[a, b], footer=ok} ');
    assert.equal(r.ok, true);
    assert.deepEqual(r.d, { footer: 'ok' });
    assert.deepEqual(r.diagnostics.map((d) => d.code).sort(), ['meta-deck-only', 'meta-deck-only', 'meta-field-type', 'meta-unknown-key']);
  });

  test('a record that does not read is ok:false and applies nothing; a prose brace is reported', () => {
    assert.equal(door.readRecord(' {footer="unterminated} ').ok, false);
    assert.equal(door.readRecord(' {footer=x ').diagnostics[0].code, 'unterminated-record');
    assert.equal(door.readRecord(' {footer="a\nb"} ').diagnostics[0].code, 'meta-newline-in-quote');
    const todo = door.readRecord(' {TODO} ');
    assert.deepEqual(todo.d, {});
    assert.equal(todo.diagnostics[0].code, 'meta-unknown-key');
  });

  test('a bare opener (`<!--` then the record on the next line) is not a record', () => {
    assert.equal(door.readRecord('\n{layout=cards}\n'), null);
    assert.equal(door.isRecordOpener('\n{layout=cards}'), false);
  });

  test('control characters and bidi overrides never reach a value', () => {
    assert.equal(door.readRecord(' {footer="a‮b\u0007c"} ').d.footer, 'abc');
  });
});

describe('the carrier escape (§10)', () => {
  test('`--\\>` is `-->`, `--!\\>` is `--!>`, each further backslash a literal one', () => {
    assert.equal(door.decodeCommentText('a --\\> b --!\\> c --\\\\> d'), 'a --> b --!> c --\\> d');
    assert.deepEqual(door.readRecord(' {note="x --\\> y"} ').notes.note, ['x --> y']);
  });

  test('encode and decode are inverse, and an encoded text never ends a comment (seed 2772)', () => {
    const rnd = mulberry32(2772);
    const alphabet = ['-', '-', '>', '!', '\\', 'a', ' ', '<'];
    for (let i = 0; i < 4000; i++) {
      let s = '';
      for (let k = Math.floor(rnd() * 14); k > 0; k--) s += alphabet[Math.floor(rnd() * alphabet.length)];
      const enc = door.encodeCommentText(s);
      assert.equal(door.decodeCommentText(enc), s, `seed 2772, draw ${i}: ${JSON.stringify(s)}`);
      assert.equal(/--!?>/.test(enc), false, `seed 2772, draw ${i}: ${JSON.stringify(enc)}`);
    }
  });
});

describe('compileMetaSource: the door', () => {
  test('a deck with no record and no internal spelling comes back as the same string', () => {
    const s = '# A\n\n<!-- _class: cards -->\n\n- x\n';
    assert.equal(door.compileMetaSource(s).source, s);
  });

  test('records compile in place on the same lines; wrapped records keep their line count', () => {
    const s = '# A\n\n<!-- {layout=cards,\n   footer="Q3"} -->\n\n- x\n\n<!-- @meta{class=dark} -->\n';
    const out = door.compileMetaSource(s).source;
    assert.equal(lines(out), lines(s));
    assert.match(out, /<!-- lat-meta: \{"carry":false,"d":\{"class":"cards","footer":"Q3"\}\}\n -->/);
    assert.match(out, /<!-- lat-meta: \{"carry":false,"d":\{"class":"dark"\}\} -->/);
  });

  test('`<` and `>` in a value never reach the comment raw', () => {
    const out = door.compileMetaSource('<!-- {footer="a <b>bold</b>", note="x --\\> y"} -->\n').source;
    assert.equal(out.indexOf('-->'), out.length - 4);
    assert.equal(/<b>/.test(out), false);
    assert.deepEqual(readDirectiveEntries(out.trim(), { known: new Set(['footer']) }), [{ spot: true, key: 'footer', value: 'a <b>bold</b>' }]);
  });

  test('a record in a blockquote or an indented code block is not compiled', () => {
    const s = '> <!-- {layout=cards} -->\n\n    <!-- {layout=cards} -->\n';
    assert.equal(door.compileMetaSource(s).source, s);
  });

  test('a record the engine does not read as a top-level block applies nothing and is never a speaker note', () => {
    const engine = createEngine();
    for (const deck of ['# A\n\n- item\n  <!-- {layout=cards} -->\n', '# A\n\n<div>\n<!-- {layout=cards} -->\n</div>\n', '# A\n\n> <!-- {layout=cards} -->\n']) {
      const out = engine.render(deck).html;
      assert.doesNotMatch(out, /data-class="cards"/, deck);
      assert.equal(notes.extractSlideNotes([out])[0], null, deck);
    }
  });

  test('a record that does not read becomes an EMPTY internal comment and a diagnostic, never a speaker note', () => {
    const { source, diagnostics } = door.compileMetaSource('# A\n\n<!-- {footer="x} -->\n');
    assert.match(source, /<!-- lat-meta: \{"carry":false,"d":\{\}\} -->/);
    assert.deepEqual(diagnostics.map((d) => [d.code, d.line]), [['unterminated-record', 3]]);
  });

  test('the forgery guard blanks internal spellings in any case, and leaves fences and code spans alone', () => {
    const s = [
      '<!-- lat-meta: {"d":{"class":"x"}} -->',
      '<!--\n LAT-Pane: {"cls":"bar"} -->',
      'text <!-- lat-panes: 50/50 --> text',
      '`<!-- lat-meta: shown as code -->`',
      '```',
      '<!-- lat-meta: in a fence -->',
      '```',
      '',
    ].join('\n');
    const { source, diagnostics } = door.compileMetaSource(s);
    assert.equal(lines(source), lines(s));
    assert.equal((source.match(/lat-(?:meta|pane)/gi) || []).length, 2);
    assert.match(source, /`<!-- lat-meta: shown as code -->`/);
    assert.match(source, /```\n<!-- lat-meta: in a fence -->\n```/);
    assert.equal(diagnostics.filter((d) => d.code === 'meta-forged').length, 3);
  });

  test('the shared grammar reads the internal comment: one key for a one-key reader, every key for entries', () => {
    const c = door.writeInternal({ carry: true, d: { class: 'cards', footer: 'Q3' } });
    assert.deepEqual(readDirectiveComment(c, { known: new Set(['class']) }), { spot: false, key: 'class', value: 'cards' });
    assert.equal(readDirectiveEntries(c, { known: new Set(['class', 'footer']) }).length, 2);
  });

  test('the internal reader validates by type whatever wrote it: deck-only keys and non-strings are refused', () => {
    const forged = '<!-- lat-meta: {"carry":false,"d":{"theme":"x","class":["a"],"footer":"ok","size":"4:3"}} -->';
    assert.deepEqual(door.readInternal(forged).d, { footer: 'ok' });
  });
});

describe('the wrapped-record join, fuzzed (seed 3121)', () => {
  const SEED = 3121;
  const words = ['cards', 'quiet', 'Q3', 'a, b', 'x=y', '{brace}', 'say "hi"', '@meta{x}', 'a --\\> b', '`tick`', ''];
  const keys = ['footer', 'header', 'class', 'focus', 'track'];
  const quote = (v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

  test('a record wrapped at item boundaries reads exactly as its one-line form, on the same lines', () => {
    const rnd = mulberry32(SEED);
    for (let i = 0; i < 800; i++) {
      const n = 1 + Math.floor(rnd() * 4);
      const items = [];
      const used = new Set();
      for (let k = 0; k < n; k++) {
        const key = keys[Math.floor(rnd() * keys.length)];
        if (used.has(key)) continue;
        used.add(key);
        items.push(`${key}=${quote(words[Math.floor(rnd() * words.length)])}`);
      }
      const one = `<!-- {${items.join(', ')}} -->`;
      const wrapped = `<!-- {${items.map((it, k) => (k && rnd() < 0.6 ? `\n${' '.repeat(Math.floor(rnd() * 4))}${it}` : it)).join(', ')}} -->`;
      const deck = `# A\n\n${wrapped}\n\nafter\n`;
      const a = door.compileMetaSource(`# A\n\n${one}\n\nafter\n`);
      const b = door.compileMetaSource(deck);
      const why = `seed ${SEED}, draw ${i}: ${JSON.stringify(wrapped)}`;
      assert.equal(lines(b.source), lines(deck), why);
      assert.deepEqual(door.readInternal(b.source.split('\n').slice(2, -3).join('\n')), door.readInternal(a.source.split('\n')[2]), why);
      assert.ok(b.source.endsWith('\n\nafter\n'), why);
    }
  });

  test('an odd quote or brace never reaches past the comment, never throws, never moves a line', () => {
    const rnd = mulberry32(SEED + 1);
    const noise = ['"', '{', '}', '[', ']', '\\', '\n', ',', '=', ' '];
    for (let i = 0; i < 1500; i++) {
      let body = 'footer="Q3", class=cards';
      for (let k = 1 + Math.floor(rnd() * 3); k > 0; k--) {
        const at = Math.floor(rnd() * (body.length + 1));
        body = body.slice(0, at) + noise[Math.floor(rnd() * noise.length)] + body.slice(at);
      }
      const deck = `# A\n\n<!-- {${body}} -->\n\n# Next\n\n<!-- _footer: kept -->\n`;
      const why = `seed ${SEED + 1}, draw ${i}: ${JSON.stringify(body)}`;
      const r = door.compileMetaSource(deck);
      assert.equal(lines(r.source), lines(deck), why);
      assert.ok(r.source.endsWith('\n\n# Next\n\n<!-- _footer: kept -->\n'), why);
    }
  });
});

describe('the render: a record writes the same <section> as the comments it replaces', () => {
  const engine = createEngine();
  const html = (s) => engine.render(s).html;
  const pair = (name, comments, record, deck = (x) => `# One\n\n${x}\n\n- a\n- b\n\n---\n\n# Two\n\nBody.\n`) => {
    test(name, () => assert.equal(html(deck(record)), html(deck(comments))));
  };
  pair('class and footer', '<!-- _class: cards -->\n<!-- _footer: Q3 -->', '<!-- {layout=cards, footer=Q3} -->');
  pair('an empty header clears the deck header', '<!-- _header: \'\' -->', '<!-- {header=""} -->', (x) => `---\nheader: Deck\n---\n\n# One\n\n${x}\n`);
  pair('a carried class runs to the next slides', '<!-- class: dark -->', '<!-- {class=dark, carry} -->');
  pair('`_class: image` with a background image', '<!-- _class: image -->', '<!-- {layout=image} -->', (x) => `# One\n\n${x}\n\n![bg](a.png)\n`);
  pair('adjacent records merge per key, last wins', '<!-- _class: cards -->\n<!-- _class: list -->', '<!-- {layout=cards} -->\n<!-- {layout=list} -->');
  pair('an inline-code literal deck', '<!-- _class: cards -->', '<!-- {layout=cards} -->', (x) => `---\nclass: inline-code-literal\n---\n\n# One\n\n${x}\n\nSome \`{x}\` code.\n`);
  pair(
    'focus steps with a class set expand per step and keep the class',
    '<!-- _class: list-steps -->\n<!-- _focusSteps: item 1 | item 2 -->',
    '<!-- {layout=list-steps, focus-steps="item 1 | item 2"} -->',
  );
  pair(
    'a pane slide written with a mixed record',
    '<!-- _class: columns -->\n\n### Left\n\nA.\n\n<!-- _pane: content -->\n<!-- _footer: F -->\n\n### Right\n\nB.',
    '<!-- {layout=columns} -->\n\n### Left\n\nA.\n\n<!-- {pane=content, footer=F} -->\n\n### Right\n\nB.',
  );
  pair('a hidden slide', '<!-- hide -->', '<!-- {hide} -->');

  test('a record’s note is the speaker note whatever its words; its reader note is its own channel', () => {
    const out = html('# A\n\n<!-- {layout=cards}\nnote: |\n  footer: not a directive\nreader: For whoever opens it.\n-->\n\n- x\n');
    assert.doesNotMatch(out, /data-footer/);
    const sec = out.match(/<section[\s\S]*?<\/section>/)[0];
    assert.equal(notes.readerFromHtml(sec), 'For whoever opens it.');
  });

  test('a bad record reports through the render’s diagnostics and is never a note', () => {
    const r = engine.render('# A\n\n<!-- {footer="x} -->\n');
    assert.ok(r.diagnostics.some((d) => d.id === 'meta/record' && /line 3/.test(d.message)));
    assert.equal(notes.extractSlideNotes([r.html])[0], null);
  });
});

describe('the rule order: the expansion runs before every rule that reads a directive', () => {
  test('lattice_meta_expand sits right after the block parse', () => {
    const md = createEngine()._md ? createEngine()._md() : null;
    const names = (md || require('markdown-it')()).core.ruler.__rules__.map((r) => r.name);
    if (!md) {
      // The engine's parser is private; build one through the slide pipeline the engine installs.
      const MarkdownIt = require('markdown-it');
      const m = new MarkdownIt({ html: true });
      require('../../../lib/engine/slides.js').installSlidePipeline(m);
      const order = m.core.ruler.__rules__.map((r) => r.name);
      assert.equal(order[order.indexOf('block') + 1], 'lattice_meta_expand');
      assert.ok(order.indexOf('lattice_meta_expand') < order.indexOf('lattice_slide'));
      assert.ok(order.indexOf('lattice_meta_expand') < order.indexOf('lattice_directives'));
      return;
    }
    assert.equal(names[names.indexOf('block') + 1], 'lattice_meta_expand');
  });
});

describe('notes: the reader channel and the privacy strips', () => {
  test('the export notes carry `Reader:` after the speaker note', () => {
    assert.deepEqual(notes.withReaderNotes(['Note.', null, null], ['Read.', 'Only.', null]), ['Note.\n\nReader: Read.', 'Reader: Only.', null]);
  });

  test('--strip-notes removes a record’s note field and keeps its reader; --strip-say removes say', () => {
    const s = '<!-- {layout=cards, note="secret", say="Hi"}\nnote: |\n  More secret.\nreader: Public.\n-->\n';
    const stripped = notes.stripChannelsFromSource(s, { noteBodies: ['secret'], say: true });
    assert.doesNotMatch(stripped, /secret|Hi/);
    assert.match(stripped, /reader: Public\./);
    assert.match(stripped, /layout=cards/);
    assert.equal(lines(stripped), lines(s));
  });

  test('an authored record that the door did not compile is never a speaker note; a bare opener stays one (§5.3)', () => {
    assert.equal(notes.isRecordComment(' {layout=cards} '), true);
    assert.equal(notes.isRecordComment(' @meta{layout=cards} '), true);
    assert.equal(notes.isRecordComment('\n{draft} remember the chart\n'), false);
    const out = createEngine().render('# A\n\n<!--\n{draft} remember the chart\n-->\n').html;
    assert.equal(notes.extractSlideNotes([out])[0], '{draft} remember the chart');
  });
});

describe('the first adversarial pass on step 2 (inversion, 2026-11-10)', () => {
  const engine = createEngine();

  test('a field value that would end its comment is refused: `{hide="x --\\> <b>pwn</b>"}` puts no markup on the slide', () => {
    const r = engine.render('# A\n\n<!-- {hide="x --\\> <b>pwn</b>"} -->\n');
    assert.doesNotMatch(r.html, /<b>pwn<\/b>/);
    assert.ok(r.diagnostics.some((d) => /meta-comment-unsafe/.test(d.message)));
    // A forged internal comment cannot carry one either.
    assert.deepEqual(door.readInternal('<!-- lat-meta: {"carry":false,"d":{"hide":"x --\\u003e y"}} -->').d, {});
  });

  test('a record the engine does not apply is reported at render time, by its source line', () => {
    const r = engine.render('---\ntheme: indaco\n---\n\n# A\n\n- item\n  <!-- {layout=cards} -->\n');
    assert.ok(r.diagnostics.some((d) => d.id === 'meta/record' && /^line 8: /.test(d.message)), JSON.stringify(r.diagnostics));
  });

  test('every block the expansion writes carries its provenance (`latticeRecord`), so the cut can tell it from an authored comment', () => {
    const tokens = engine._tokens('# A\n\n<!-- {layout=cards, note="n"} -->\n\n<!-- _footer: authored -->\n');
    // A directive block is consumed (emptied) by `lattice_directives`; the mark and the line survive.
    const marked = tokens.filter((t) => t.meta?.latticeRecord);
    assert.deepEqual(marked.map((t) => t.map?.[0]), [2, 2], 'the class and the note, both on the record\'s line');
    assert.ok(marked.some((t) => t.content.trim() === '<!-- lat-note: n -->'), 'the note stays, in the engine\'s note form');
    assert.ok(tokens.some((t) => t.map?.[0] === 4 && !t.meta?.latticeRecord), 'the authored directive on line 4 carries no mark');
  });

  test('the drawer reads a record’s class and edits it in the record (step 3)', async () => {
    const { readMetaField, writeMeta } = await import('../../../lib/core/meta-edit.mjs');
    const src = '<!-- {layout=cards, footer=x} -->\n\n## A\n';
    const f = readMetaField(src, 'class');
    assert.deepEqual({ value: f.value, present: f.present, editable: f.editable, record: f.record }, { value: 'cards', present: true, editable: true, record: true });
    const out = writeMeta(src, { class: 'kpi', footer: 'y' });
    assert.equal(out, '<!-- {layout=kpi, footer=y} -->\n\n## A\n');
    // What the drawer wrote is what the engine renders.
    assert.match(createEngine().render(out).html, /<section[^>]*class="[^"]*\bkpi\b/);
    // A record that does not read stays read-only.
    assert.equal(readMetaField('<!-- {layout=cards, footer="x} -->\n\n## A\n', 'class').present, false);
  });

  test('the drawer’s answer is the engine’s: a later directive beats a record, and a record in a list sets nothing', async () => {
    const { readMetaField } = await import('../../../lib/core/meta-edit.mjs');
    const later = readMetaField('<!-- {layout=cards} -->\n\n## A\n\n<!-- _class: kpi -->\n', 'class');
    assert.deepEqual({ value: later.value, editable: later.editable }, { value: 'kpi', editable: true });
    const nested = readMetaField('## A\n\n- point\n  <!-- {layout=kpi} -->\n', 'class');
    assert.deepEqual({ value: nested.value, present: nested.present }, { value: '', present: false });
    const html = (src) => createEngine().render(src).html;
    assert.match(html('<!-- {layout=cards} -->\n\n## A\n\n<!-- _class: kpi -->\n'), /<section[^>]*class="[^"]*\bkpi\b/);
    assert.doesNotMatch(html('## A\n\n- point\n  <!-- {layout=kpi} -->\n'), /<section[^>]*class="[^"]*\bkpi\b/);
  });

  test('a picture on a record slide exports to Marp as on a directive slide (records go back first)', () => {
    // The image plugin's Marp rewrite places a picture by the slide's `_class:`, so both producers turn records back
    // into comments before it runs (tools/export-marp.js, deck-export.js).
    const { withImageRecordsAsMarp } = require('../../../lib/export/marp-bundle.js');
    const body = '\n\n## Offsite\n\n`@image{sample:photo-wide.jpg, title="Q3 offsite"}`\n';
    const viaRecord = withImageRecordsAsMarp(door.recordsToComments(`<!-- {layout=image} -->${body}`));
    const viaComment = withImageRecordsAsMarp('<!-- _class: image -->' + body);
    assert.equal(viaRecord, viaComment);
    assert.match(viaComment, /!\[bg/);
  });

  test('the interim Marp bridge writes records back as directive comments, quoting YAML-significant values', () => {
    const out = door.recordsToComments('<!-- {layout=cards, footer="Q3: review", header="", carry}\nnote: |\n  The --\\> arrow.\nreader: For you.\n-->\n\n<!-- {bad -->\n\n```\n<!-- {layout=x} -->\n```\n');
    assert.equal(
      out,
      '<!-- class: cards -->\n<!-- footer: "Q3: review" -->\n<!-- header: "" -->\n<!-- The -- > arrow. -->\n<!-- Reader: For you. -->\n\n\n\n```\n<!-- {layout=x} -->\n```\n',
    );
  });
});

describe('the red team on step 2 (2026-11-10)', () => {
  const engine = createEngine();
  const rec = (src) => notes.slideNoteRecord(engine.render(src).html.match(/<section[\s\S]*?<\/section>/g) || [])[0];

  test('a record note is the speaker note whatever its words: never a pane marker, a channel or a directive', () => {
    for (const words of ['_pane: bar', 'reader: PRIVATE the CFO number', 'say: SECRET', 'describe: X', '_class: lead', 'stress-slide', '{layout=x}']) {
      const r = rec(`# A\n\n<!-- {layout=list, note="${words}"} -->\n\n- a\n`);
      assert.equal(r.note, words, words);
      assert.equal(r.reader, null, words);
      assert.equal(r.say, null, words);
      assert.equal(r.description, null, words);
    }
    const panes = engine.render('<!-- panes: 60/40 -->\n\n# T\n\n<!-- {pane=list, note="_pane: bar"} -->\n- a\n\n<!-- _pane: list -->\n- b\n').html;
    assert.equal((panes.match(/<lat-pane class="list/g) || []).length, 2);
  });

  test('a privacy strip that removes every inline field leaves a record that still reads, block lines and all', () => {
    const src = '<!-- {note="PRIVATE"}\nlayout: lead\nfooter: Q3 board\nreader: Kept.\n-->\n\n# A\n';
    const stripped = notes.stripChannelsFromSource(src, { noteBodies: ['x'] });
    assert.doesNotMatch(stripped, /PRIVATE/);
    assert.match(stripped, /^<!-- \{\}\nlayout: lead/);
    const out = engine.render(stripped);
    assert.match(out.html, /class="lead[ "]/);
    assert.match(out.html, /data-footer="Q3 board"/);
    assert.equal(out.diagnostics, undefined);
  });

  test('the strip round-trips the escape and leaves a record quoted in inline code as written', () => {
    const s = notes.stripChannelsFromSource('<!-- {footer=x, note="a --\\> b", say="s"} -->\n\nWrite `<!-- {layout=cards, say="kept"} -->` to set both.\n', { say: true });
    assert.match(s, /`<!-- \{layout=cards, say="kept"\} -->`/);
    assert.equal(door.readRecord(s.slice(4, s.indexOf('-->'))).notes.note[0], 'a --> b');
  });

  test('a fence the engine’s parser does not open (or closes early) hides no record after it', () => {
    for (const before of ['- Step one\n  ```\n  npm install\n', '    ```\n', '<div>\n```\n</div>\n', '```a`b\n']) {
      const out = engine.render(`# A\n\n${before}\n---\n\n<!-- {layout=lead, footer="Q3"} -->\n\n# B\n`).html;
      assert.match(out, /data-footer="Q3"/, JSON.stringify(before));
    }
    // And a forged internal comment after such a line is still blanked.
    const forged = engine.render('# A\n\n- item\n  ```\n<!-- lat-meta: {"carry":false,"d":{"footer":"FORGED"}} -->\n');
    assert.doesNotMatch(forged.html, /FORGED/);
  });

  test('the comment walk stays linear on one long line of comments (work counted, not timed)', () => {
    const work = (n) => {
      const w = { steps: 0 };
      const src = '<!--lat-meta--> '.repeat(n);
      for (const _ of door.commentSites(src, [], w)) void _;
      return { steps: w.steps, size: src.length };
    };
    for (const n of [1000, 4000, 16000]) {
      const { steps, size } = work(n);
      assert.ok(steps <= 2 * size, `n=${n}: ${steps} steps for ${size} characters`);
    }
  });
});
