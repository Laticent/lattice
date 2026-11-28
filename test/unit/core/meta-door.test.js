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
const { engineTokens } = require('../../../lib/engine/test-seams.js');
const door = { ...require('../../../lib/core/meta-door.mjs'), compileMetaSource: (s) => compileSource(s, SOURCE_CTX) };
const { readDirectiveComment, readDirectiveEntries } = require('../../../lib/core/comment-directive.mjs');
const { mulberry32 } = require('../../helpers/regex-differential');
const { createEngine } = require('../../../lib/engine');
const notes = require('../../../lib/authoring/notes-core.js');
const { migrateMetaSource } = require('../../../lib/authoring/meta-migrate.mjs');
const { META_MIGRATE_KIT } = require('../../../lib/core/meta-scan.mjs');

const lines = (s) => s.split('\n').length;

describe('readRecord: one record comment body', () => {
  test('the canonical and long forms read alike; names are kebab-case, keys camelCase', () => {
    const a = door.readRecord(' @meta{layout=cards, footer="Q3, review", focus-steps="row 1 | row 2"} ');
    const b = door.readRecord(' @meta{layout=cards, footer="Q3, review", focus-steps="row 1 | row 2"} ');
    assert.deepEqual(a, b);
    assert.equal(a.ok, true);
    assert.deepEqual(a.d, { class: 'cards', footer: 'Q3, review', focusSteps: 'row 1 | row 2' });
  });

  test('the typed class fields compose in order, plugin registers become their class words', () => {
    const r = door.readRecord(' @meta{modifiers=no-rule, layout=cards, variant=quiet, icon=bare etch, class=dark} ');
    assert.equal(r.d.class, 'cards quiet no-rule dark icon-bare icon-etch');
  });

  test('the class slot sits where the first class field is, so attributes keep the comments’ order', () => {
    assert.deepEqual(Object.keys(door.readRecord(' @meta{footer=x, layout=cards} ').d), ['footer', 'class']);
    assert.deepEqual(Object.keys(door.readRecord(' @meta{layout=cards, footer=x} ').d), ['class', 'footer']);
  });

  test('flags, carry and markers are bare words', () => {
    const r = door.readRecord(' @meta{build, carry, stress-slide, hide} ');
    assert.equal(r.carry, true);
    assert.deepEqual(r.d, { build: '', hide: '' });
    assert.deepEqual(r.markers, ['stress-slide']);
  });

  test('a retired note field (note, say, describe, reader) applies nothing and names the note that replaced it', () => {
    // A record holds settings only (engineering/decisions/2026-11-20-four-notes.md N4); a note is its own comment.
    const r = door.readRecord(' @meta{layout=list, note="Open cold.", say="Hello"}\nreader: |\n  For you.\n\n  Second.\ndescribe: A chart.\n');
    assert.equal(r.ok, true);
    assert.deepEqual(r.d, { class: 'list' });
    assert.equal(Object.hasOwn(r, 'notes'), false, 'a record carries no notes channel');
    assert.deepEqual(
      r.diagnostics.map((d) => [d.code, /`<!-- @(\w+)\{/.exec(d.message)?.[1]]),
      [['meta-note-field', 'note'], ['meta-note-field', 'say'], ['meta-note-field', 'handout'], ['meta-note-field', 'alt']],
    );
    assert.deepEqual({ ...door.RETIRED_NOTE_FIELDS }, { note: 'note', say: 'say', describe: 'alt', reader: 'handout' });
  });

  test('a retired note field holding `-->` is reported as retired, not as an unsafe value', () => {
    const r = door.readRecord(' @meta{footer=x, note="a --\\> b"} ');
    assert.deepEqual(r.d, { footer: 'x' });
    assert.deepEqual(r.diagnostics.map((d) => d.code), ['meta-note-field']);
  });

  test('deck-only keys, unknown keys and non-scalar values are dropped and reported', () => {
    const r = door.readRecord(' @meta{theme=dark, lang=fr, nope=1, footer=[a, b], footer=ok} ');
    assert.equal(r.ok, true);
    assert.deepEqual(r.d, { footer: 'ok' });
    assert.deepEqual(r.diagnostics.map((d) => d.code).sort(), ['meta-deck-only', 'meta-deck-only', 'meta-field-type', 'meta-unknown-key']);
  });

  test('a record that does not read is ok:false and applies nothing; a prose brace is reported', () => {
    assert.equal(door.readRecord(' @meta{footer="unterminated} ').ok, false);
    assert.equal(door.readRecord(' @meta{footer=x ').diagnostics[0].code, 'unterminated-record');
    assert.equal(door.readRecord(' @meta{footer="a\nb"} ').diagnostics[0].code, 'meta-newline-in-quote');
    const todo = door.readRecord(' @meta{TODO} ');
    assert.deepEqual(todo.d, {});
    assert.equal(todo.diagnostics[0].code, 'meta-unknown-key');
  });

  test('a bare opener (`<!--` then the record on the next line) is not a record', () => {
    assert.equal(door.readRecord('\n{layout=cards}\n'), null);
    assert.equal(door.isRecordOpener('\n{layout=cards}'), false);
  });

  test('control characters and bidi overrides never reach a value', () => {
    assert.equal(door.readRecord(' @meta{footer="a‮b\u0007c"} ').d.footer, 'abc');
  });
});

describe('the carrier escape (§10)', () => {
  test('`--\\>` is `-->`, `--!\\>` is `--!>`, each further backslash a literal one', () => {
    assert.equal(door.decodeCommentText('a --\\> b --!\\> c --\\\\> d'), 'a --> b --!> c --\\> d');
    // A note body uses the same escape, undone where a person reads it.
    assert.equal(notes.notesFromHtml('<section><!-- @note{x --\\> y} --></section>'), 'x --> y');
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
  test('a deck with no record, no internal spelling and no old setting comes back as the same string', () => {
    const s = '# A\n\n<!-- a plain comment -->\n\n- x\n';
    assert.equal(door.compileMetaSource(s).source, s);
  });

  test('the cut: an old setting comment and a bare record are blanked on the same lines, with one diagnostic', () => {
    const s = '# A\n\n<!-- _class: cards -->\n<!-- footer: Q3 -->\n<!-- {layout=kpi,\n  footer=x} -->\n<!-- _pane: bar -->\n<!-- stress-slide -->\n<!-- hide -->\n\n- x `<!-- _class: kept -->`\n\n```\n<!-- _class: code -->\n```\n<!-- a note -->\n';
    const r = door.compileMetaSource(s);
    assert.equal(lines(r.source), lines(s));
    const empty = door.writeInternal({ carry: false, d: {} }, 1);
    const empty2 = door.writeInternal({ carry: false, d: {} }, 2);
    assert.equal(r.source, `# A\n\n${empty}\n${empty}\n${empty2}\n${empty}\n${empty}\n${empty}\n\n- x \`<!-- _class: kept -->\`\n\n\`\`\`\n<!-- _class: code -->\n\`\`\`\n<!-- a note -->\n`);
    // `<!--->` and `<!-->` are whole comments to markdown-it: the old comment on the next line is still its own site, and
    // blanked. The failing arm: a scan that closed only from `at + 4` paired `<!--->` with the next `-->`, and the
    // engine applied the old `_track` it hid (found by the track lint's fuzz on this change).
    for (const empty of ['<!--->', '<!-->']) {
      const html = createEngine().render(`---\nmarp: true\n---\n\n<!-- @meta{layout=topic} -->\n\n## T\n\n${empty}\n<!-- _track: A | [B] -->\n`).html;
      assert.doesNotMatch(html, /data-track=/, empty);
    }
    // An unclosed `<!-- note` in a list item ends with the item, so the old comment on the next line is a block of its
    // own to the engine: the door blanks it from its `<!--`, though its line scan pairs the two (found by the same fuzz).
    const html2 = createEngine().render('---\nmarp: true\n---\n\n<!-- @meta{layout=topic} -->\n\n## T\n\n- <!-- note\n<!-- _track: A | [B] -->\n').html;
    assert.doesNotMatch(html2, /data-track=/);
    // After text on its line, the comment is left as written: the engine never applies it there, and an escaped
    // `\<!--` or a code span opened on an earlier line makes it visible text, which blanking would delete (the red team).
    assert.equal(door.compileMetaSource('Text <!-- _class: x --> more.\n').source, 'Text <!-- _class: x --> more.\n');
    // After container markers or another comment, it may open a block: blanked, a plain empty comment mid-line.
    assert.equal(door.compileMetaSource('<!-- a --><!-- _class: x -->\n').source, '<!-- a --><!-- -->\n');
    // Nothing of the old comment reaches the slide's HTML, and one nested in a list is not named as an inert RECORD.
    const r2 = createEngine().render('# A\n\n<!-- _class: cards -->\n\n- x\n  <!-- _footer: y -->\n');
    assert.doesNotMatch(r2.html, /<!--|data-footer/);
    assert.deepEqual((r2.diagnostics ?? []).map((d) => d.id), ['meta/legacy']);
    assert.deepEqual(r.diagnostics.map((d) => [d.code, d.line]), [['meta-legacy', 3]]);
    assert.match(r.diagnostics[0].message, /^the old comment form sets nothing \(6 found\)/);
    assert.match(r.diagnostics[0].message, /lattice migrate meta/);
  });

  test('records compile in place on the same lines; wrapped records keep their line count', () => {
    const s = '# A\n\n<!-- @meta{layout=cards,\n   footer="Q3"} -->\n\n- x\n\n<!-- @meta{class=dark} -->\n';
    const out = door.compileMetaSource(s).source;
    assert.equal(lines(out), lines(s));
    assert.match(out, /<!-- lat-meta: \{"carry":false,"d":\{"class":"cards","footer":"Q3"\}\}\n -->/);
    assert.match(out, /<!-- lat-meta: \{"carry":false,"d":\{"class":"dark"\}\} -->/);
  });

  test('`<` and `>` in a value never reach the comment raw', () => {
    const out = door.compileMetaSource('<!-- @meta{footer="a <b>bold</b>", header="x --\\> y"} -->\n').source;
    assert.equal(out.indexOf('-->'), out.length - 4);
    assert.equal(/<b>/.test(out), false);
    assert.deepEqual(readDirectiveEntries(out.trim(), { known: new Set(['footer']) }), [{ spot: true, key: 'footer', value: 'a <b>bold</b>' }]);
  });

  test('a record in a blockquote or an indented code block is not compiled', () => {
    const s = '> <!-- @meta{layout=cards} -->\n\n    <!-- @meta{layout=cards} -->\n';
    assert.equal(door.compileMetaSource(s).source, s);
  });

  test('a record the engine does not read as a top-level block applies nothing and is never a speaker note', () => {
    const engine = createEngine();
    for (const deck of ['# A\n\n- item\n  <!-- @meta{layout=cards} -->\n', '# A\n\n<div>\n<!-- @meta{layout=cards} -->\n</div>\n', '# A\n\n> <!-- @meta{layout=cards} -->\n']) {
      const out = engine.render(deck).html;
      assert.doesNotMatch(out, /data-class="cards"/, deck);
      assert.equal(notes.extractSlideNotes([out])[0], null, deck);
    }
  });

  test('a record that does not read becomes an EMPTY internal comment and a diagnostic, never a speaker note', () => {
    const { source, diagnostics } = door.compileMetaSource('# A\n\n<!-- @meta{footer="x} -->\n');
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
      const one = `<!-- @meta{${items.join(', ')}} -->`;
      const wrapped = `<!-- @meta{${items.map((it, k) => (k && rnd() < 0.6 ? `\n${' '.repeat(Math.floor(rnd() * 4))}${it}` : it)).join(', ')}} -->`;
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
      const deck = `# A\n\n<!-- @meta{${body}} -->\n\n# Next\n\n<!-- kept -->\n`;
      const why = `seed ${SEED + 1}, draw ${i}: ${JSON.stringify(body)}`;
      const r = door.compileMetaSource(deck);
      assert.equal(lines(r.source), lines(deck), why);
      assert.ok(r.source.endsWith('\n\n# Next\n\n<!-- kept -->\n'), why);
    }
  });
});

describe('the render: a record writes the same <section> as the migrated comments, and the comments alone set nothing', () => {
  const engine = createEngine();
  const html = (s) => engine.render(s).html;
  const migrate = (s) => migrateMetaSource(s, { kit: META_MIGRATE_KIT }).source;
  // Every comment of the old form, blanked as the door blanks it (lib/plugins/meta/meta.source.mjs, the cut).
  // The same deck with every comment taken out: what a slide whose old comments set nothing renders.
  const blank = (s) => s.replace(/<!--([\s\S]*?)-->/g, (_, b) => '\n'.repeat(b.split('\n').length - 1));
  const pair = (name, comments, record, deck = (x) => `# One\n\n${x}\n\n- a\n- b\n\n---\n\n# Two\n\nBody.\n`) => {
    test(name, () => {
      // The fix keeps the slide: `lattice migrate meta` over the old comments renders what the record renders.
      assert.equal(html(migrate(deck(comments))), html(deck(record)));
      // The cut: the old comments apply nothing, so the slide is the one a deck without them renders.
      assert.equal(html(deck(comments)), html(blank(deck(comments))));
      assert.notEqual(html(deck(comments)), html(deck(record)));
    });
  };
  pair('class and footer', '<!-- _class: cards -->\n<!-- _footer: Q3 -->', '<!-- @meta{layout=cards, footer=Q3} -->');
  pair('an empty header clears the deck header', '<!-- _header: \'\' -->', '<!-- @meta{header=""} -->', (x) => `---\nheader: Deck\n---\n\n# One\n\n${x}\n`);
  pair('a carried class runs to the next slides', '<!-- class: dark -->', '<!-- @meta{class=dark, carry} -->');
  pair('`_class: image` with a background image', '<!-- _class: image -->', '<!-- @meta{layout=image} -->', (x) => `# One\n\n${x}\n\n![bg](a.png)\n`);
  pair('adjacent records merge per key, last wins', '<!-- _class: cards -->\n<!-- _class: list -->', '<!-- @meta{layout=cards} -->\n<!-- @meta{layout=list} -->');
  pair('an inline-code literal deck', '<!-- _class: cards -->', '<!-- @meta{layout=cards} -->', (x) => `---\nclass: inline-code-literal\n---\n\n# One\n\n${x}\n\nSome \`{x}\` code.\n`);
  pair(
    'focus steps with a class set expand per step and keep the class',
    '<!-- _class: list-steps -->\n<!-- _focusSteps: item 1 | item 2 -->',
    '<!-- @meta{layout=list-steps, focus-steps="item 1 | item 2"} -->',
  );
  pair(
    'a pane slide written with a mixed record',
    '<!-- _class: columns -->\n\n### Left\n\nA.\n\n<!-- _pane: content -->\n<!-- _footer: F -->\n\n### Right\n\nB.',
    '<!-- @meta{layout=columns} -->\n\n### Left\n\nA.\n\n<!-- @meta{pane=content, footer=F} -->\n\n### Right\n\nB.',
  );
  pair('a hidden slide', '<!-- hide -->', '<!-- @meta{hide} -->');

  test('a record’s retired note fields reach no channel and set nothing; a named note beside it does', () => {
    const src = '# A\n\n<!-- @meta{layout=cards}\nnote: |\n  footer: not a directive\nreader: Old reader.\n-->\n\n<!-- @handout{For whoever opens it.} -->\n\n- x\n';
    const r = engine.render(src);
    assert.doesNotMatch(r.html, /data-footer/);
    const sec = r.html.match(/<section[\s\S]*?<\/section>/)[0];
    assert.equal(notes.handoutFromHtml(sec), 'For whoever opens it.');
    assert.equal(notes.notesFromHtml(sec), null);
    assert.deepEqual(r.diagnostics.filter((d) => /meta-note-field/.test(d.message)).map((d) => d.message.slice(0, 7)), ['line 3:', 'line 3:']);
  });

  test('a bad record reports through the render’s diagnostics and is never a note', () => {
    const r = engine.render('# A\n\n<!-- @meta{footer="x} -->\n');
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

describe('notes: the handout channel and the privacy strips', () => {
  test('the export notes carry `Handout:` after the speaker note', () => {
    assert.deepEqual(notes.withHandoutNotes(['Note.', null, null], ['Read.', 'Only.', null]), ['Note.\n\nHandout: Read.', 'Handout: Only.', null]);
  });

  test('--strip-notes removes @note and plain comments and keeps the record and @handout; --strip-say removes @say', () => {
    const s = '<!-- @meta{layout=cards, footer=F} -->\n<!-- @note{secret} -->\n<!-- my own todo -->\n<!-- @say{Hi} -->\n<!-- @handout{Public.} -->\n\n# A\n';
    const stripped = notes.stripChannelsFromSource(s, { notes: true, say: true });
    // The default cut leaves one empty line where the removed run sat between two kept lines (`SCRUB_BOUNDARIES`).
    assert.equal(stripped, '<!-- @meta{layout=cards, footer=F} -->\n\n<!-- @handout{Public.} -->\n\n# A\n');
    assert.equal(notes.stripChannelsFromSource(s, { notes: true, say: true, boundary: 'drop' }), '<!-- @meta{layout=cards, footer=F} -->\n<!-- @handout{Public.} -->\n\n# A\n');
    assert.equal(notes.stripChannelsFromSource(s, { notes: true }), '<!-- @meta{layout=cards, footer=F} -->\n\n<!-- @say{Hi} -->\n<!-- @handout{Public.} -->\n\n# A\n');
  });

  test('an unmigrated record’s retired note fields come off under --strip-notes, and `say` under --strip-say', () => {
    // The engine reads none of them, but the text still rides in the source an export carries (meta-door
    // `stripRetiredNoteFields`). The record keeps its settings and its line count.
    const s = '<!-- @meta{layout=cards, note="secret", say="Hi"}\nnote: |\n  More secret.\nreader: Old reader.\ndescribe: Old alt.\n-->\n';
    const stripped = notes.stripChannelsFromSource(s, { notes: true });
    assert.doesNotMatch(stripped, /secret|Hi|Old reader|Old alt/);
    assert.match(stripped, /layout=cards/);
    assert.equal(lines(stripped), lines(s));
    const saidOnly = notes.stripChannelsFromSource(s, { say: true });
    assert.doesNotMatch(saidOnly, /Hi/);
    assert.match(saidOnly, /note="secret"/);
    assert.match(saidOnly, /reader: Old reader\./);
    assert.throws(() => door.stripRetiredNoteFields(s, ['footer']), /not a retired note field/);
  });

  test('an authored record that the door did not compile is never a speaker note; a bare opener is a plain comment (§5.3)', () => {
    assert.equal(notes.isRecordComment(' {layout=cards} '), true);
    assert.equal(notes.isRecordComment(' @meta{layout=cards} '), true);
    assert.equal(notes.isRecordComment('\n{draft} remember the chart\n'), false);
    const out = createEngine().render('# A\n\n<!--\n{draft} remember the chart\n-->\n').html;
    // A plain comment is not a note (engineering/decisions/2026-11-20-four-notes.md N3): it reaches no channel, and
    // `--strip-notes` scrubs it from the source.
    assert.equal(notes.extractSlideNotes([out])[0], null);
    assert.equal(notes.isPrivateComment('\n{draft} remember the chart\n'), true);
  });
});

describe('the first adversarial pass on step 2 (inversion, 2026-11-10)', () => {
  const engine = createEngine();

  test('a field value that would end its comment is refused: `{hide="x --\\> <b>pwn</b>"}` puts no markup on the slide', () => {
    const r = engine.render('# A\n\n<!-- @meta{hide="x --\\> <b>pwn</b>"} -->\n');
    assert.doesNotMatch(r.html, /<b>pwn<\/b>/);
    assert.ok(r.diagnostics.some((d) => /meta-comment-unsafe/.test(d.message)));
    // A forged internal comment cannot carry one either.
    assert.deepEqual(door.readInternal('<!-- lat-meta: {"carry":false,"d":{"hide":"x --\\u003e y"}} -->').d, {});
  });

  test('a record the engine does not apply is reported at render time, by its source line', () => {
    const r = engine.render('---\ntheme: indaco\n---\n\n# A\n\n- item\n  <!-- @meta{layout=cards} -->\n');
    assert.ok(r.diagnostics.some((d) => d.id === 'meta/record' && /^line 8: /.test(d.message)), JSON.stringify(r.diagnostics));
  });

  test('every block the expansion writes carries its provenance (`latticeRecord`), so the cut can tell it from an authored comment', () => {
    const tokens = engineTokens(engine, '# A\n\n<!-- @meta{layout=cards, footer="r"} -->\n\n<!-- _footer: authored -->\n');
    // A directive block is consumed (emptied) by `lattice_directives`; the mark and the line survive.
    const marked = tokens.filter((t) => t.meta?.latticeRecord);
    assert.deepEqual(marked.map((t) => t.map?.[0]), [2, 2], 'the class and the footer, both on the record\'s line');
    // Since the cut the door drops the authored directive on line 4: no token of it reaches the rules at all.
    assert.ok(!tokens.some((t) => t.map?.[0] === 4 && t.type === 'html_block'), 'the authored directive on line 4 is gone');
  });

  test('the drawer reads a record’s class and edits it in the record (step 3)', async () => {
    const { readMetaField, writeMeta } = await import('../../../lib/core/meta-edit.mjs');
    const src = '<!-- @meta{layout=cards, footer=x} -->\n\n## A\n';
    const f = readMetaField(src, 'class');
    assert.deepEqual({ value: f.value, present: f.present, editable: f.editable, record: f.record }, { value: 'cards', present: true, editable: true, record: true });
    const out = writeMeta(src, { class: 'kpi', footer: 'y' });
    assert.equal(out, '<!-- @meta{layout=kpi, footer=y} -->\n\n## A\n');
    // What the drawer wrote is what the engine renders.
    assert.match(createEngine().render(out).html, /<section[^>]*class="[^"]*\bkpi\b/);
    // A record that does not read stays read-only.
    assert.equal(readMetaField('<!-- @meta{layout=cards, footer="x} -->\n\n## A\n', 'class').present, false);
  });

  test('the drawer’s answer is the engine’s: a later old comment sets nothing, and a record in a list sets nothing', async () => {
    const { readMetaField } = await import('../../../lib/core/meta-edit.mjs');
    const later = readMetaField('<!-- @meta{layout=cards} -->\n\n## A\n\n<!-- _class: kpi -->\n', 'class');
    // Since the cut the old comment is blanked at the door, so the record's class is the slide's (slice E).
    assert.equal(later.value, 'cards');
    const twice = readMetaField('<!-- @meta{layout=cards} -->\n\n## A\n\n<!-- @meta{layout=kpi} -->\n', 'class');
    // Set twice by two records: read-only, because clearing the winner would bring the first one's class back (#3136).
    assert.deepEqual({ value: twice.value, editable: twice.editable, reason: twice.reason }, { value: 'kpi', editable: false, reason: 'duplicate' });
    const nested = readMetaField('## A\n\n- point\n  <!-- @meta{layout=kpi} -->\n', 'class');
    assert.deepEqual({ value: nested.value, present: nested.present }, { value: '', present: false });
    const html = (src) => createEngine().render(src).html;
    assert.match(html('<!-- @meta{layout=cards} -->\n\n## A\n\n<!-- _class: kpi -->\n'), /<section[^>]*class="cards[ "]/);
    assert.match(html('<!-- @meta{layout=cards} -->\n\n## A\n\n<!-- @meta{layout=kpi} -->\n'), /<section[^>]*class="kpi[ "]/);
    assert.doesNotMatch(html('## A\n\n- point\n  <!-- @meta{layout=kpi} -->\n'), /<section[^>]*class="[^"]*\bkpi\b/);
  });

  test('a picture on a record slide exports to Marp as on a directive slide (records go back first)', () => {
    // The image plugin's Marp rewrite places a picture by the slide's `_class:`, so both producers turn records back
    // into comments before it runs (tools/export-marp.js, deck-export.js).
    const { withImageRecordsAsMarp } = require('../../../lib/export/marp-bundle.js');
    const body = '\n\n## Offsite\n\n`@image{sample:photo-wide.jpg, title="Q3 offsite"}`\n';
    const viaRecord = withImageRecordsAsMarp(door.recordsToComments(`<!-- @meta{layout=image} -->${body}`));
    const viaComment = withImageRecordsAsMarp('<!-- _class: image -->' + body);
    assert.equal(viaRecord, viaComment);
    assert.match(viaComment, /!\[bg/);
  });

  test('the interim Marp bridge writes records back as directive comments, quoting YAML-significant values', () => {
    // A retired note field is reported and dropped, never written to Marp as a speaker note (four notes N4); the four
    // notes reach Marp through `notesToMarp`.
    const out = door.recordsToComments('<!-- @meta{layout=cards, footer="Q3: review", header="", carry}\nnote: |\n  The --\\> arrow.\nreader: For you.\n-->\n\n<!-- @meta{bad -->\n\n```\n<!-- @meta{layout=x} -->\n```\n');
    assert.equal(out, '<!-- class: cards -->\n<!-- footer: "Q3: review" -->\n<!-- header: "" -->\n\n\n\n```\n<!-- @meta{layout=x} -->\n```\n');
  });
});

describe('the red team on step 2 (2026-11-10)', () => {
  const engine = createEngine();
  const rec = (src) => notes.slideNoteRecord(engine.render(src).html.match(/<section[\s\S]*?<\/section>/g) || [])[0];

  test('a @note is the speaker note whatever its words: never a pane marker, a channel or a directive', () => {
    for (const words of ['_pane: bar', 'reader: PRIVATE the CFO number', 'say: SECRET', 'describe: X', '_class: lead', 'stress-slide', '{layout=x}']) {
      const r = rec(`# A\n\n<!-- @meta{layout=list} -->\n<!-- @note{${words}} -->\n\n- a\n`);
      assert.equal(r.note, words, words);
      assert.equal(r.handout, null, words);
      assert.equal(r.say, null, words);
      assert.equal(r.description, null, words);
      // …and the same words in a plain comment reach no channel at all.
      const plain = rec(`# A\n\n<!-- ${words} -->\n\n- a\n`);
      assert.deepEqual([plain.note, plain.say, plain.description, plain.handout], [null, null, null, null], words);
    }
    const panes = engine.render('<!-- @meta{panes="60/40"} -->\n\n# T\n\n<!-- @meta{pane=list} -->\n<!-- @note{_pane: bar} -->\n- a\n\n<!-- @meta{pane=list} -->\n- b\n').html;
    assert.equal((panes.match(/<lat-pane class="list/g) || []).length, 2);
  });

  test('a privacy strip that removes every inline field leaves a record that still reads, block lines and all', () => {
    const src = '<!-- @meta{note="PRIVATE"}\nlayout: lead\nfooter: Q3 board\nreader: Gone too.\n-->\n\n# A\n';
    const stripped = notes.stripChannelsFromSource(src, { notes: true });
    assert.doesNotMatch(stripped, /Gone too/);
    assert.doesNotMatch(stripped, /PRIVATE/);
    assert.match(stripped, /^<!-- @meta\{\}\nlayout: lead/);
    const out = engine.render(stripped);
    assert.match(out.html, /class="lead[ "]/);
    assert.match(out.html, /data-footer="Q3 board"/);
    assert.equal(out.diagnostics, undefined);
  });

  test('the strip round-trips the escape and leaves a record quoted in inline code as written', () => {
    const s = notes.stripChannelsFromSource('<!-- @meta{footer=x, note="a --\\> b", say="s"} -->\n\nWrite `<!-- @meta{layout=cards, say="kept"} -->` to set both.\n', { say: true });
    assert.match(s, /`<!-- @meta\{layout=cards, say="kept"\} -->`/);
    assert.equal(s.slice(0, s.indexOf('\n')), '<!-- @meta{footer=x, note="a --\\> b"} -->', 'the kept field keeps its escape');
  });

  test('a fence the engine’s parser does not open (or closes early) hides no record after it', () => {
    for (const before of ['- Step one\n  ```\n  npm install\n', '    ```\n', '<div>\n```\n</div>\n', '```a`b\n']) {
      const out = engine.render(`# A\n\n${before}\n---\n\n<!-- @meta{layout=lead, footer="Q3"} -->\n\n# B\n`).html;
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

describe('meta-edit: what the engine reads decides a carrier (the checker on #3136)', () => {
  const { readMetaField, writeMeta, commentReadings } = require('../../../lib/core/meta-edit.mjs');

  test('a speaker note with a line that starts `focus:` does not lock the record field', () => {
    const slide = '<!-- @meta{focus=2} -->\n\n# T\n\n<!-- remember the\nfocus: margin story -->';
    const r = readMetaField(slide, 'focus');
    assert.equal(r.editable, true);
    assert.equal(r.value, '2');
    assert.match(writeMeta(slide, { focus: '3' }), /^<!-- @meta\{focus=3\} -->/);
    assert.match(writeMeta(slide, { focus: '3' }), /focus: margin story -->$/);
  });

  test('two records still lock the field, and report the one the engine applies; two old comments set nothing', () => {
    const r = readMetaField('<!-- @meta{layout=divider} -->\n<!-- @meta{layout=content} -->\n\n# A', 'class');
    assert.equal(r.editable, false);
    assert.equal(r.reason, 'duplicate');
    assert.equal(r.value, 'content');
    assert.equal(readMetaField('<!-- _class: divider -->\n<!-- _class: content -->\n\n# A', 'class').value, '');
  });

  test('commentReadings: indented and folded comments are not applied; any other comment is a comment', () => {
    assert.equal(commentReadings('# T\n\n    <!-- @meta{layout=kpi} -->\n').size, 0);
    assert.equal(commentReadings('<div>\n<!-- @meta{layout=kpi} -->\n</div>').get(2), undefined);
    assert.equal(commentReadings('<!-- @meta{layout=kpi} -->\n# T').get(1)?.kind, 'record');
    assert.equal(commentReadings('<!-- _class: kpi -->\n# T').get(1)?.kind, 'legacy');
    assert.equal(commentReadings('# T\n\n<!-- say this -->').get(3)?.kind, 'comment');
    assert.equal(commentReadings('# T\n\n<!-- @note{say this} -->').get(3)?.kind, 'comment');
  });
});

describe('commentSites: an opener inside code', () => {
  test('an unclosed `<!--` in a fence does not swallow the record after it (the checker on #3136)', () => {
    const engine = createEngine();
    const cls = (md) => String(engine.render(md).html).match(/data-class="([^"]*)"/)?.[1];
    assert.equal(cls('## T\n\n```\n<!-- x\n```\n\n<!-- @meta{layout=kpi} -->'), 'kpi');
    assert.equal(cls('## T\n\n~~~md\n<!-- _footer: f\n~~~\n\n<!-- @meta{layout=kpi} -->'), 'kpi');
    // A record written inside the fence is still code.
    assert.equal(cls('## T\n\n```\n<!-- @meta{layout=kpi} -->\n```'), undefined);
    // An opener inside an inline code span is text too.
    assert.equal(cls('## T\n\nUse `<!--` here.\n\n<!-- @meta{layout=kpi} -->'), 'kpi');
    assert.equal(cls('## T\n\nUse ``<!--`` here.\n\n<!-- @meta{layout=kpi} -->'), 'kpi');
    // A lone backtick opens no span its line does not close: a real record later on the line still counts.
    assert.equal(cls('## T\n\nA ` tick.\n\n<!-- @meta{layout=kpi} -->'), 'kpi');
  });
  test('the scan resumes at the end of the code, so the next real comment is its own site', () => {
    const src = '```\n<!-- x\n```\n\n<!-- @meta{a=1} -->';
    const fence = [0, src.indexOf('\n\n')];
    const sites = [...door.commentSites(src, [fence])];
    assert.deepEqual(sites.map((s) => [s.inCode, s.body.trim()]).at(-1), [false, '@meta{a=1}']);
  });
});

describe('the cut: what the door blanks, and what it leaves as text (the red team and checker on slice E)', () => {
  const render = (src) => createEngine().render(src);
  const { withoutLegacySettings } = require('../../../lib/core/without-legacy-settings.mjs');
  const out = (src) => render(src);
  const ids = (r) => (r.diagnostics || []).map((d) => d.id);

  test('`<!--->` closes at its own `-->`: the comment after it is a site of its own (the `at + 2` close search)', () => {
    // The close search starts two characters in, so `<!--->` is ONE site ending at its own `-->`; starting at
    // `at + 4` would skip that `-->` and swallow the next comment, the old setting with it.
    const sites = [...door.commentSites('<!--->\n<!-- _class: kpi -->', [])];
    assert.equal(sites.length, 2);
    assert.equal(sites[1].body.trim(), '_class: kpi');
  });

  test('an old setting on its own line is blanked: default layout, one meta/legacy, no trace in the HTML', () => {
    const r = out('<!-- _class: statement -->\n\n## T\n');
    assert.doesNotMatch(r.html, /statement|lat-meta|_class/);
    assert.deepEqual(ids(r), ['meta/legacy']);
  });

  test('indented code, a fence inside a list item and an escaped `\\<!--` keep their text', () => {
    const indented = out('## T\n\n    <!-- _class: statement -->\n');
    assert.match(indented.html, /&lt;!-- _class: statement --&gt;/);
    const listFence = out('## T\n\n- item\n\n  ```\n  <!-- _class: statement -->\n  ```\n');
    assert.match(listFence.html, /&lt;!-- _class: statement --&gt;/);
    const escaped = out('## T\n\nSee \\<!-- _class: statement --> here.\n');
    assert.match(escaped.html, /&lt;(?:<\/span>)?!-- _class: statement --&gt;/);
    for (const r of [indented, listFence, escaped]) assert.deepEqual(ids(r), []);
  });

  test('an old setting folded into an HTML block leaves no internal comment and no meta/record finding', () => {
    const r = out('<div>\n<!-- _class: statement -->\n</div>\n\n## T\n');
    assert.doesNotMatch(r.html, /lat-meta|statement/);
    assert.deepEqual(ids(r), ['meta/legacy']);
  });

  test('withoutLegacySettings (Export to Marp) strips exactly the sites the door blanks', () => {
    const cases = [
      ['<!-- _class: a -->\n# x', '\n# x'],
      ['    <!-- _class: a -->\n', '    <!-- _class: a -->\n'],
      ['```\n<!-- _class: a -->\n```', '```\n<!-- _class: a -->\n```'],
      ['- x\n\n  ```\n  <!-- _class: a -->\n  ```\n', '- x\n\n  ```\n  <!-- _class: a -->\n  ```\n'],
      ['See <!-- _class: a --> here', 'See <!-- _class: a --> here'],
      ['- item <!-- note\n<!-- _class: a -->', '- item <!-- note\n'],
      ['<!-- @meta{layout=a} -->', '<!-- @meta{layout=a} -->'],
      ['<!-- {layout=a} -->\n', '\n'],
    ];
    for (const [src, want] of cases) assert.equal(withoutLegacySettings(src), want, JSON.stringify(src));
  });
});
