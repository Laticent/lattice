/**
 * The notes migration (lib/authoring/notes-migrate.mjs, the CLI lib/cli/migrate-notes.mjs): every note a deck wrote the old
 * way becomes one of the four notes, so the deck shows, speaks and exports what it did before
 * (engineering/decisions/2026-11-20-four-notes.md). Each old form gets its own case, and every case also proves the
 * rewritten deck reads the note the old engine read.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const notes = require('../../../lib/authoring/notes-core.js');
const { createEngine } = require('../../../lib/engine');

let migrateNotesSource;
let migrateNotesText;
let main;
test.before(async () => {
  ({ migrateNotesSource } = await import('../../../lib/authoring/notes-migrate.mjs'));
  ({ migrateNotesText, main } = await import('../../../lib/cli/migrate-notes.mjs'));
});

const engine = createEngine();
/** The four notes the engine reads off each rendered slide. */
const read = (src) => notes.slideNoteRecord(engine.render(src).html.match(/<section[\s\S]*?<\/section>/g) || []);

describe('each old comment form becomes its note', () => {
  const cases = [
    ['a plain comment (it WAS the speaker note)', '<!-- Open on the drop. -->', '<!-- @note{Open on the drop.} -->'],
    ['say:', '<!-- say: The pipeline holds. -->', '<!-- @say{The pipeline holds.} -->'],
    // Retired on 2026-09-28, after which the engine read it as a plain comment: the speaker note. It stays private.
    ['caption: (retired 2026-09-28)', '<!-- caption: The old line. -->', '<!-- @note{caption: The old line.} -->'],
    ['describe:', '<!-- describe: Funnel chart. -->', '<!-- @alt{Funnel chart.} -->'],
    ['Describe: (read in any case)', '<!-- Describe: Funnel chart. -->', '<!-- @alt{Funnel chart.} -->'],
    ['reader:', '<!-- reader: Measured over 30 days. -->', '<!-- @handout{Measured over 30 days.} -->'],
    ['the Studio’s note:', '<!-- note: Pause. -->', '<!-- @note{Pause.} -->'],
    // `say:` was lowercase only, so a capitalized one was a plain speaker note, and stays one, key and all.
    ['a capitalized Say: (a speaker note)', '<!-- Say: thank the ops team -->', '<!-- @note{Say: thank the ops team} -->'],
    ['a multi-line comment', '<!--\nsay: Line one\nline two.\n-->', '<!-- @say{Line one\nline two.} -->'],
  ];
  for (const [what, before, after] of cases) {
    test(what, () => {
      const r = migrateNotesSource(`# A\n\n${before}\n\nBody.\n`);
      assert.equal(r.source, `# A\n\n${after}\n\nBody.\n`);
      assert.equal(r.converted, 1);
    });
  }

  test('the rewritten deck reads the note the old engine read, on every channel', () => {
    const r = migrateNotesSource('# A\n\n<!-- Pause. -->\n<!-- say: Spoken. -->\n<!-- describe: A chart. -->\n<!-- reader: Later. -->\n');
    assert.deepEqual(read(r.source)[0], { note: 'Pause.', description: 'A chart.', say: 'Spoken.', handout: 'Later.' });
  });

  test('braces and an escaped arrow in the old text survive as written', () => {
    const r = migrateNotesSource('# A\n\n<!-- a {brace} and } a stray, then --\\> -->\n');
    assert.equal(read(r.source)[0].note, 'a {brace} and } a stray, then -->');
  });
});

describe('a record’s retired note fields move to their own comments', () => {
  test('inline fields and `key: |` blocks, in order, the record keeping its other fields', () => {
    const src = '<!-- {layout=cards, note="Open cold.", say="Hi"}\nreader: |\n  For you.\n\n  Second.\ndescribe: A chart.\nfooter: Q3\n-->\n\n# A\n';
    const r = migrateNotesSource(src);
    assert.equal(
      r.source,
      '<!-- {layout=cards}\nfooter: Q3\n-->\n<!-- @note{Open cold.} -->\n<!-- @say{Hi} -->\n<!-- @handout{For you.\n\nSecond.} -->\n<!-- @alt{A chart.} -->\n\n# A\n',
    );
    assert.equal(r.converted, 4);
    const [slide] = read(r.source);
    assert.deepEqual(slide, { note: 'Open cold.', description: 'A chart.', say: 'Hi', handout: 'For you.\n\nSecond.' });
    assert.match(engine.render(r.source).html, /data-footer="Q3"/, 'the record still sets its footer');
  });

  test('a record that held only notes is replaced by them', () => {
    assert.equal(migrateNotesSource('<!-- {note="only"} -->\n\n# A\n').source, '<!-- @note{only} -->\n\n# A\n');
  });

  test('a record with no note field is left byte for byte', () => {
    const src = '<!-- {layout=cards, footer="Q3, review"}\nheader: x\n-->\n\n# A\n';
    assert.equal(migrateNotesSource(src).source, src);
  });
});

describe('the front-matter say: map moves onto its slides', () => {
  const deck = (fm, ...slides) => `---\n${fm}\n---\n\n${slides.join('\n\n---\n\n')}\n`;

  test('each entry lands at the end of its slide, decoded as the old reader decoded it, and the map is gone', () => {
    const r = migrateNotesSource(deck('theme: indaco\nsay:\n  1: "she said \\"go\\"."\n  3: Three.\nlang: en', '# One\n\nBody.', '# Two', '# Three\n\n- a'));
    assert.equal(r.source, deck('theme: indaco\nlang: en', '# One\n\nBody.\n\n<!-- @say{she said "go".} -->', '# Two', '# Three\n\n- a\n\n<!-- @say{Three.} -->'));
    assert.equal(r.moved, 2);
    assert.deepEqual(read(r.source).map((s) => s.say), ['she said "go".', null, 'Three.']);
  });

  test('a slide that speaks its own line keeps it (it won over the map), and an entry past the end is reported', () => {
    const r = migrateNotesSource(deck('say:\n  1: Map line.\n  2: Two.\n  9: Nowhere.', '# One\n\n<!-- say: Own line. -->', '# Two'));
    assert.deepEqual(read(r.source).map((s) => s.say), ['Own line.', 'Two.']);
    assert.deepEqual(r.kept, [{ slide: 1, why: 'the slide speaks its own line, which won over the map' }, { slide: 9, why: 'the deck has 2 slides' }]);
    assert.doesNotMatch(r.source, /Map line|Nowhere/);
  });

  test('a captions: map stays where it is: the engine has ignored it since 2026-09-28, so moving it would start speaking it', () => {
    const src = deck('captions:\n  1: Silent today.', '# One');
    assert.equal(migrateNotesSource(src).source, src);
  });

  test('a say: key nested under another block is not the map', () => {
    const src = deck('speaker:\n  say:\n    1: a stage direction', '# One');
    assert.equal(migrateNotesSource(src).source, src);
  });
});

describe('one say line per slide, as the engine spoke it', () => {
  test('a slide that held several old say lines keeps only the last, and the run reports it', () => {
    const src = '# A\n\n<!-- say: first -->\n<!-- say: second -->\n<!-- {layout=cards, say="last"} -->\n\n---\n\n# B\n\n<!-- say: only -->\n';
    const r = migrateNotesSource(src);
    assert.deepEqual(read(r.source).map((s) => s.say), ['last', 'only']);
    assert.deepEqual(r.kept, [{ slide: 1, why: '3 say lines; the engine spoke only the last, so the others were removed' }]);
    assert.equal(migrateNotesSource(r.source).source, r.source);
  });

  test('a slide\'s own @say lines, written in the new form, are not thinned', () => {
    const src = '# A\n\n<!-- @say{one} -->\n<!-- @say{two} -->\n';
    assert.equal(migrateNotesSource(src).source, src);
  });
});

describe('a converted comment that reads like the author\'s own is named for review', () => {
  test('a TODO and a commented-out draft are listed; a presenter note is not', () => {
    const r = migrateNotesSource('# A\n\n<!-- TODO: ask legal -->\n<!-- Open cold. -->\n<!--\n## Draft slide\n- old point\n-->\n');
    assert.deepEqual(r.review, ['TODO: ask legal', '## Draft slide']);
    assert.equal(r.converted, 3, 'each is still converted: it was a speaker note on main');
  });
});

describe('the red team on the four notes', () => {
  test('an @word{…} that is no note name was a speaker note: it becomes @note, named for review', () => {
    const r = migrateNotesSource('# A\n\n<!-- @john{please check churn} -->\n<!-- plain one -->\n');
    assert.match(r.source, /<!-- @note\{@john\{please check churn\}\} -->/);
    assert.ok(r.review.includes('@john{please check churn}'));
  });
  test('a public note already in a migrated deck stays as written and is named: it was a speaker note before', () => {
    const r = migrateNotesSource('# B\n\n<!-- @say{already new} -->\n<!-- say: old say -->\n');
    assert.match(r.source, /<!-- @say\{already new\} -->/);
    assert.ok(r.review.some((x) => x.startsWith('already @say')), r.review.join(' | '));
    assert.equal(migrateNotesSource(r.source).source, r.source, 'a second run changes nothing');
  });
  test('a comment inside the front matter is part of a YAML value and is left alone', () => {
    const src = '---\ntitle: "Q3 <!-- draft --> review"\n---\n\n# A\n';
    assert.equal(migrateNotesSource(src).source, src);
  });
  test('prose shaped like a pane marker was a speaker note: it becomes @note; a real marker stays', () => {
    const r = migrateNotesSource('# A\n\n<!-- pane: Pane two needs a better chart -->\n<!-- _pane: bar -->\n');
    assert.match(r.source, /<!-- @note\{pane: Pane two needs a better chart\} -->/);
    assert.match(r.source, /<!-- _pane: bar -->/);
  });
});

describe('what the migration never touches', () => {
  test('directives, pane markers, records, pragmas, markers, an @name note and code are left as written', () => {
    const src = [
      '# A', '', '```markdown', '<!-- say: a sample -->', '<!-- a plain sample -->', '```', '',
      'Write `<!-- describe: x -->` inline.', '',
      '<!-- _class: lead -->', '<!-- _pane: bar -->', '<!-- panes: 60/40 -->', '<!-- {layout=kpi} -->',
      '<!-- markdownlint-disable -->', '<!-- stress-slide -->', '<!-- @note{already} -->', '<!-- @Say{a near miss lint names} -->', '',
    ].join('\n');
    const r = migrateNotesSource(src);
    assert.equal(r.source, src);
    assert.equal(r.converted, 0);
  });

  test('it is idempotent: a migrated deck migrates to itself', () => {
    const once = migrateNotesSource('---\nsay:\n  1: Map.\n---\n\n# A\n\n<!-- Pause. -->\n<!-- {layout=cards, describe="Chart."} -->\n<!-- reader: Later. -->\n').source;
    const twice = migrateNotesSource(once);
    assert.equal(twice.source, once);
    assert.deepEqual([twice.converted, twice.moved], [0, 0]);
  });
});

describe('the file round trip (migrateNotesText) and the CLI', () => {
  test('CRLF line endings and a byte-order mark are kept', () => {
    const r = migrateNotesText('﻿# A\r\n\r\n<!-- say: Hi\r\nthere -->\r\n');
    assert.equal(r.text, '﻿# A\r\n\r\n<!-- @say{Hi\r\nthere} -->\r\n');
    assert.equal(migrateNotesText(r.text).text, r.text, 'and the result migrates to itself');
  });

  test('a deck with nothing to migrate comes back as the same string', () => {
    const text = '﻿# A\r\n\r\n<!-- @note{x} -->\r\n';
    assert.equal(migrateNotesText(text).text, text);
  });

  test('`lattice migrate notes --check` writes nothing and exits 1 on a change; without it the file is rewritten', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-migrate-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'deck.md');
    fs.writeFileSync(file, '# A\n\n<!-- Pause. -->\n');
    const out = [];
    const write = process.stdout.write;
    process.stdout.write = (s) => out.push(String(s));
    try {
      assert.equal(main(['notes', file, '--check']), 1);
      assert.equal(fs.readFileSync(file, 'utf8'), '# A\n\n<!-- Pause. -->\n');
      assert.equal(main(['notes', file]), 0);
      assert.equal(main(['notes', file, '--check']), 0, 'a migrated deck has nothing left to change');
    } finally {
      process.stdout.write = write;
    }
    assert.equal(fs.readFileSync(file, 'utf8'), '# A\n\n<!-- @note{Pause.} -->\n');
    assert.match(out.join(''), /would rewrite .*deck\.md: 1 note rewritten/);
  });
});
