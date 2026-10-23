/**
 * Unit: the `venue-prose` rule in lib/authoring/lint-core.js, and the slot reader behind it
 * (lib/authoring/venue-prose.js).
 *
 * A component that is ONE block of prose (a big-number's caption, a redline's clause, an image's
 * paragraph) has no element count, so its manifest states the words its primary slot holds at each
 * venue (`venueCapacity.prose`). What is pinned:
 *   · the rule reads the manifest's numbers through the generated table, at the slide's venue;
 *   · it is silent at laptop size under budget, and under a venue's budget;
 *   · a `venue:` makes it a warning, a bare `scale-*` an info;
 *   · a register measured on its own (`image split`, `redline three-col`) is judged by its row,
 *     and a register with no room (a 0) says so rather than quoting a count;
 *   · the fix names a smaller venue that holds the slide.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../../lib/authoring/lint-core');
const { proseWords } = require('../../../lib/authoring/venue-prose');

const vocab = { names: new Set(['big-number', 'image', 'redline']), modifiers: new Set(['scale-xl', 'split', 'three-col']), capacity: {} };
const lint = (src) => core.lintTextWith(src, vocab).filter((f) => f.rule === 'venue-prose');
const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
const bigNumber = (n, venue) => `---\n${venue ? `venue: ${venue}\n` : ''}---\n\n<!-- _class: big-number -->\n\n- 1\n  - ${words(n)}\n`;

describe('venue-prose', () => {
  test('a big-number caption over the hall budget (12) is a warning at venue: hall', () => {
    const f = lint(bigNumber(20, 'hall'));
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'warning');
    assert.match(f[0].message, /hall/);
    assert.match(f[0].message, /holds about 12 words/);
    assert.match(f[0].message, /20/);
  });

  test('the same caption at the budget is silent', () => {
    assert.deepEqual(lint(bigNumber(12, 'hall')), []);
  });

  test('a longer caption passes at a smaller venue and the fix names the one that holds it', () => {
    assert.deepEqual(lint(bigNumber(20, 'huddle')), [], 'huddle holds 24');
    const f = lint(bigNumber(20, 'hall'));
    assert.match(f[0].fix, /venue: huddle/);
  });

  test('silent at the designed size', () => {
    assert.deepEqual(lint(bigNumber(30, null)), []);
  });

  test('a bare scale-* class is an info', () => {
    const src = `<!-- _class: big-number scale-xl -->\n\n- 1\n  - ${words(30)}\n`;
    const f = lint(src);
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'info');
  });

  test('speaker notes and fenced code are not an image slide\'s body', () => {
    const notes = Array(40).fill('word').join(' ');
    assert.equal(proseWords('image', `# Title\n\n![a](a.png)\n\n<!--\n${notes}\n-->\n`), null);
    assert.equal(proseWords('image', `# Title\n\n![a](a.png)\n\n\`\`\`\n${notes}\n\`\`\`\n`), null);
    assert.equal(proseWords('image', `# Title\n\n<!-- x -->\nthree real words\n`), 3);
  });

  test('a register measured on its own is judged by its row, and a 0 says there is no room', () => {
    const redline = (tok, n) => `---\nvenue: conference\n---\n\n<!-- _class: redline ${tok} -->\n\n## H.\n\n> ${words(n)}\n`;
    assert.deepEqual(lint(redline('', 60)), [], 'bare holds 72 at conference');
    const split = lint(redline('split', 40));
    assert.equal(split.length, 1, 'split holds 30 at conference');
    const none = lint(redline('three-col', 5));
    assert.equal(none.length, 1);
    assert.match(none[0].message, /holds none/);
  });

  test('a portrait deck is judged by the row measured on that canvas, not the wide one', () => {
    // Hall holds 12 words on a wide canvas and 3 on a tall one (tools/calibrate-venue-prose.js).
    const tall = (n) => `---\nsize: portrait\nvenue: hall\n---\n\n<!-- _class: big-number -->\n\n- 1\n  - ${words(n)}\n`;
    assert.deepEqual(lint(bigNumber(8, 'hall')), [], 'wide holds 12');
    const f = lint(tall(8));
    assert.equal(f.length, 1);
    assert.match(f[0].message, /on a tall canvas holds about 3 words/);
    assert.deepEqual(lint(tall(3)), []);
  });

  test('a register is judged by its own row on a portrait canvas too', () => {
    const redline = (tok, n) => `---\nsize: portrait\nvenue: conference\n---\n\n<!-- _class: redline ${tok} -->\n\n## H.\n\n> ${words(n)}\n`;
    assert.deepEqual(lint(redline('', 11)), [], 'bare holds 11 at conference on a tall canvas');
    assert.equal(lint(redline('', 12)).length, 1);
    assert.equal(lint(redline('three-col', 5)).length, 1, 'three-col has 4 at conference on a tall canvas');
  });

  test('a component without a prose row is not judged', () => {
    assert.deepEqual(lint(`---\nvenue: hall\n---\n\n<!-- _class: list -->\n\n## H.\n\n- ${words(80)}\n`), []);
  });
});

describe('proseWords — the slot readers', () => {
  test('big-number reads the nested caption line', () => {
    assert.equal(proseWords('big-number', '<!-- _class: big-number -->\n\n- 42\n  - one two three four\n'), 4);
  });
  test('redline counts the clause with its tracked changes as written text', () => {
    assert.equal(proseWords('redline', '## H\n\n> a <del>b</del> <ins>c d</ins> e\n'), 5);
  });
  test('image reads the first plain paragraph below the heading, not the image or a directive', () => {
    assert.equal(proseWords('image', '<!-- _class: image -->\n\n## Title\n\nOne two three.\n\n![bg](x.png)\n'), 3);
  });
  test('citation-card ignores a directive comment that spans lines', () => {
    assert.equal(proseWords('citation-card', '## T\n\n<!-- a\nmulti-line -->\n`Cal. Code`\n\n> one two\n\n- three four'), 4);
  });
  test('a slot that is absent reads as null, so the rule says nothing', () => {
    assert.equal(proseWords('big-number', '- 42\n'), null);
    assert.equal(proseWords('list', '## H\n\nbody\n'), null);
  });
});
