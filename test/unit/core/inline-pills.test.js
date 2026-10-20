/**
 * The `{LABEL}` inline-pill grammar.
 *
 * The arms that matter most here are the NEGATIVE ones. This grammar is universal —
 * it sees every single-backtick span in every deck — so its value is decided by what
 * it REFUSES, not by what it renders. The ADR's original bracket map was measured
 * capturing 147 spans in this repo that their authors meant literally; the guard arms
 * below are that measurement turned into tests.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const pills = require('../../../lib/plugins/pills/pills.inline.js');

describe('inline-pills — what it renders', () => {
  test('a bare label is a capsule pill', () => {
    assert.equal(pills.pillHtml('{LIVE}'), '<span class="lat-pill" data-shape="pill">LIVE</span>');
  });

  test('every shape name in SHAPES is selectable, and none is unreachable', () => {
    for (const shape of pills.SHAPES) {
      const html = pills.pillHtml(`{X, ${shape}}`);
      assert.ok(html, `${shape} did not parse`);
      assert.match(html, new RegExp(`data-shape="${shape}"`));
    }
    assert.equal(pills.SHAPES.length, 8);
  });

  test('all twelve color slots resolve, and c13 does not', () => {
    for (let i = 1; i <= 12; i++) {
      assert.match(pills.pillHtml(`{X, c${i}}`), new RegExp(`data-c="c${i}"`), `c${i}`);
    }
    assert.equal(pills.pillHtml('{X, c13}'), null);
    assert.equal(pills.pillHtml('{X, c0}'), null);
  });

  test('word order is free — the axes are sorted, not positional', () => {
    assert.equal(pills.pillHtml('{X, tag, c4, lg}'), pills.pillHtml('{X, lg, c4, tag}'));
    assert.equal(pills.pillHtml('{X, c4, tag}'), pills.pillHtml('{X, tag, c4}'));
  });

  test('a word can be written by name', () => {
    assert.equal(pills.pillHtml('{X, shape=tag, color=c4}'), pills.pillHtml('{X, tag, c4}'));
  });

  test('a quoted label can hold a comma', () => {
    assert.equal(pills.pillHtml('{"Cost, excl. tax", c2}'), '<span class="lat-pill" data-shape="pill" data-c="c2">Cost, excl. tax</span>');
  });

  test('the old colon spelling is no longer a pill (Segno phase 2 is a clean break)', () => {
    for (const old of ['{BETA}:tag', '{BETA}:tag:c4', '{1}:circle:c5:lg']) assert.equal(pills.pillHtml(old), null, old);
  });

  test('a label is escaped, so it can never become markup', () => {
    // This one DOES parse — it holds no separator, so it is a legal label. That is the
    // point: containment here is escaping, not refusal, because a grammar that only refused
    // what looked dangerous would be guessing. The `<` and `>` come back as entities and no
    // element is created on either path. (An `=` would make it a name=value item, so the
    // classic `<img src=x>` is not a label at all — quoted, it is, and is escaped the same.)
    const hostile = pills.pillHtml('{<img src/onerror(1)>}');
    assert.match(pills.pillHtml('{"<img src=x onerror=alert(1)>"}'), /&lt;img src=x/);
    assert.match(hostile, /&lt;img/);
    assert.doesNotMatch(hostile, /<img/);
    assert.match(pills.pillHtml('{A&B}'), /&amp;/);
    assert.match(pills.pillHtml('{<b>}'), /&lt;b&gt;/);
    assert.doesNotMatch(pills.pillHtml('{<b>}'), /<b>/);
  });
});

describe('inline-pills — what it refuses (the whole point)', () => {
  const LITERAL = [
    // our own vocabulary, quoted in decks that TEACH it
    '[x]', '[-]', '[ ]', '[/]', '[?]', '[!]',
    // ordinary code prose — the 29 non-marker collisions the bracket map would have taken
    '[data-mark]', '[data-anima-role]', '(0,2,2)', '(cont.)',
    '(slides, registry, lensId)', '{ ok, scene }', '{ canonical: true }',
    '{ act, instant: true, settle: 500 }', '{ start, end }',
    // plain code
    'getUserId()', ':root', '@media', '--accent', '#header', '!important',
    // malformed or over-specified
    '{}', '{X}abc', '{X, c9, c4}', '{X, tag, chip}', '{X, sm, lg}', '{X}:nope',
    '{unclosed', 'no braces at all',
  ];
  for (const text of LITERAL) {
    test(`leaves \`${text}\` literal`, () => {
      assert.equal(pills.pillHtml(text), null);
      assert.equal(pills.pillElement(new JSDOM().window.document, text), null);
    });
  }

  test('{X} alone is too short to be a label, but {XY} is not', () => {
    // `{X}` is 3 chars and passes the length floor; the floor exists to reject `{}`.
    assert.ok(pills.pillHtml('{A}'));
    assert.equal(pills.pillHtml('{}'), null);
  });

  test('padded braces are code; an unquoted comma starts a second word', () => {
    assert.equal(pills.pillHtml('{ ok}'), null);
    assert.equal(pills.pillHtml('{a, b}'), null, '"b" is not a pill word');
    assert.ok(pills.pillHtml('{STEP 2}'), 'a space INSIDE is fine — two words');
  });
});

describe('inline-pills — the state markers are reserved', () => {
  // The footgun this closes: an author who has learned `- [x]` reaches for `{x}` and,
  // before this, got a capsule pill containing the letter "x" — a plausible-looking
  // wrong artifact rather than an obvious no-op. And the four markers behaved THREE
  // ways, since `{ }` fell to literal on the space while the other three became pills.
  for (const m of ['x', '-', '/', ' ']) {
    test(`{${m}} is literal, not a pill labeled "${m}"`, () => {
      assert.equal(pills.pillHtml(`{${m}}`), null);
      assert.equal(pills.pillHtml(`{${m}, c4}`), null, 'a word must not smuggle it past');
      assert.equal(pills.pillHtml(`{${m}, tag, lg}`), null);
    });
  }

  test('the reserved set is exactly the bare vocabulary, and nothing near it', () => {
    assert.deepEqual([...pills.RESERVED_MARKERS].sort(), [' ', '-', '/', 'x']);
    // Capital X is NOT a bare marker (`stateClassesFor` is lowercase-only), so it stays
    // an ordinary label — reserving it would refuse a legitimate one-letter pill.
    assert.ok(pills.pillHtml('{X}'));
    assert.ok(pills.pillHtml('{3}'));
    assert.ok(pills.pillHtml('{OK}'));
  });
});

describe('inline-pills — the parser stays allocation-free on the literal path', () => {
  test('a non-brace span is rejected before anything is allocated', () => {
    // Not a timing assertion — those are flaky in CI. This pins the SHAPE the speed
    // depends on: the reject is a single charCodeAt, so no slice, trim or split runs
    // for the 99.75% of spans that are ordinary code. Measured separately at ~78ns/span
    // cold over the repo's real distribution; see the kernel docblock for the method.
    const src = require('node:fs').readFileSync(require.resolve('../../../lib/plugins/pills/pills.inline.js'), 'utf8');
    // The decision lives in `accepted`, which `read` and `accepts` both call.
    const body = /function accepted\(text, off\) \{([\s\S]*?)\n\}/.exec(src)[1];
    const rejectLine = body.split('\n').find((l) => l.includes('charCodeAt'));
    assert.ok(rejectLine, 'the O(1) first-char reject is gone');
    assert.match(rejectLine, /return null/, 'the reject must return, not fall through');
    // and it must come before Segno is asked anything
    assert.ok(
      body.indexOf('charCodeAt') < body.indexOf('isDirective('),
      'the first-char reject must precede the directive check and the read',
    );
    assert.doesNotMatch(body, /\/[^/\s]+\/[gimsuy]*\.(test|exec)|\.match\(/, 'the pill decision must stay regex-free');
  });
});

describe('inline-pills — the two render paths agree', () => {
  test('pillElement and pillHtml carry identical attributes and text', () => {
    const doc = new JSDOM().window.document;
    for (const src of ['{LIVE}', '{BETA, tag, c4}', '{3, circle, c12, lg}', '{!, diamond}', '{A&B}']) {
      const el = pills.pillElement(doc, src);
      const html = pills.pillHtml(src);
      assert.ok(el && html, src);
      assert.equal(el.className, 'lat-pill');
      for (const attr of ['data-shape', 'data-c', 'data-size']) {
        const inHtml = new RegExp(`${attr}="([^"]*)"`).exec(html);
        assert.equal(el.getAttribute(attr), inHtml ? inHtml[1] : null, `${src} ${attr}`);
      }
      // The element carries TEXT, never markup — that is what keeps the runtime path
      // out of HARD RULE #22's post-sanitize injection surface.
      assert.equal(el.textContent, /\{([^,}]*)/.exec(src)[1]); // the label: the record's first item
      assert.equal(el.children.length, 0);
    }
  });
});

describe('a pill that holds content a component composed', () => {
  test('contentHtml replaces the label text; shape, color and size stay', () => {
    assert.equal(
      pills.pillHtml('{Residency, tag, c4, lg}', undefined, '<b>x</b> Residency'),
      '<span class="lat-pill" data-shape="tag" data-c="c4" data-size="lg"><b>x</b> Residency</span>',
    );
  });

  test('without content the label is escaped text, as before', () => {
    assert.equal(pills.pillHtml('{A&B}'), '<span class="lat-pill" data-shape="pill">A&amp;B</span>');
  });

  test('content never rescues a span that is not a pill', () => {
    assert.equal(pills.pillHtml('{X, c13}', undefined, '<b>x</b>'), null);
    assert.equal(pills.pillHtml('plain', undefined, '<b>x</b>'), null);
  });

  test('the DOM path takes Nodes and draws no label beside them', () => {
    const doc = new JSDOM().window.document;
    const mark = doc.createElement('i');
    const el = pills.pillElement(doc, '{Residency, c2}', undefined, [mark, doc.createTextNode('Residency')]);
    assert.equal(el.firstChild, mark);
    assert.equal(el.textContent, 'Residency', 'one copy of the label, not two');
    assert.equal(el.getAttribute('data-c'), 'c2');
  });

  test('a non-array content is ignored: the label still draws, and no accessible-name role is set', () => {
    const doc = new JSDOM().window.document;
    const el = pills.pillElement(doc, '{Residency}', undefined, doc.createElement('i'));
    assert.equal(el.textContent, 'Residency');
    assert.equal(el.getAttribute('role'), null);
  });
});

describe('the gap after a drawn mark inside a pill', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const read = (rel) => fs.readFileSync(path.join(__dirname, '../../..', rel), 'utf8');

  test('the pill sets the disc\'s gap through its custom property, and adds no margin of its own', () => {
    const css = read('lib/plugins/pills/pills.styles.css');
    assert.match(css, /\.lat-pill > \.lat-state \{ --lat-state-gap:0 0\.4em; \}/);
    assert.match(read('lib/base/base.modifiers.css'), /margin-inline:var\(--lat-state-gap, 0\.22em\);/, 'the disc reads it');
    const margins = css.split('\n').filter((l) => /^\s*margin[\w-]*\s*:/.test(l));
    assert.deepEqual(margins.map((l) => l.trim()), ['margin-inline:0.22em;'], 'the pill\'s one sanctioned margin, and no more');
  });

  test('--lat-state-gap is assigned exactly once in engine CSS, to the pill\'s `0 0.4em`', () => {
    // The disc's sanctioned margin reads this property, so every assignment is a margin the
    // margin gate cannot see. One is sanctioned; a second must come with an owner decision.
    const hits = [];
    (function walk(d) {
      for (const e of fs.readdirSync(path.join(__dirname, '../../..', d), { withFileTypes: true })) {
        const rel = `${d}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (e.name.endsWith('.css')) {
          for (const m of read(rel).matchAll(/--lat-state-gap\s*:\s*([^;}]+)/g)) hits.push(`${rel}: ${m[1].trim()}`);
        }
      }
    })('lib');
    assert.deepEqual(hits, ['lib/plugins/pills/pills.styles.css: 0 0.4em']);
  });

  test('the pill source never names a check', () => {
    // The Unix test of the checks note §4: the pill knows nothing about checks, so content arrives
    // from the component and the pill never looks inside it. Scoped to the renderer, because the
    // reader above it legitimately discusses the reserved `{x}` marker spellings.
    const src = read('lib/plugins/pills/pills.inline.js');
    assert.doesNotMatch(src.slice(src.indexOf('function pillHtml')), /\bcheck|\bstatus\b/i, 'the renderer mentions neither');
  });
});
