/**
 * The pure half of lib/cli/fit-grace.js: how a claim is added to a slide, how the deck is cut into slides, and what the
 * author is told. The rendering half is test/integration/export/fit-grace.test.js.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const g = require('../../../lib/cli/fit-grace.js');

describe('fit-grace: adding a claim to a slide', () => {
  // Since the meta sweep (#3497) decks name a slide's layout in a `@meta` record; the engine still reads the old
  // `_class:` comment. Grace reads both through the shared reader and writes the claim as a record.
  test('a record at the slide\'s end carries its whole class plus the claim, from a record or a comment', () => {
    assert.equal(g.withClaim('<!-- @meta{layout=gantt} -->\n\n## T', 'claim-hero'),
      '<!-- @meta{layout=gantt} -->\n\n## T\n\n<!-- @meta{layout=gantt, class=claim-hero} -->\n');
    assert.equal(g.withClaim('<!-- _class: split-panel cat-8 -->\n\n## T', 'claim-quiet'),
      '<!-- _class: split-panel cat-8 -->\n\n## T\n\n<!-- @meta{layout=split-panel, class="cat-8 claim-quiet"} -->\n');
  });
  test('the record it adds is the class the slide renders with (the last class directive wins)', () => {
    const out = g.withClaim('<!-- @meta{layout=kpi, footer=F} -->\n\n## T', 'claim-hero');
    assert.equal(g.classInForce(out), 'kpi claim-hero');
  });
  test('a running class, even one written on this slide, is not the slide\'s own spot class', () => {
    assert.equal(g.hasSpotClass('<!-- @meta{layout=gantt} -->\n\n## T'), true);
    assert.equal(g.hasSpotClass('<!-- _class: gantt -->\n\n## T'), true);
    assert.equal(g.hasSpotClass('<!-- @meta{class=gantt, carry} -->\n\n## T'), false);
    assert.equal(g.hasSpotClass('<!-- class: gantt -->\n\n## T'), false);
    assert.equal(g.hasSpotClass('## T'), false);
  });
  test('reads the slide\'s own classes in either spelling', () => {
    assert.deepEqual(g.slideClasses('<!-- @meta{layout=bar, class=claim-quiet} -->'), ['bar', 'claim-quiet']);
    assert.deepEqual(g.slideClasses('<!-- _class: bar  claim-quiet -->'), ['bar', 'claim-quiet']);
    assert.deepEqual(g.slideClasses('## no directive'), []);
  });
});

describe('fit-grace: the check deck', () => {
  test('`fit: report` replaces any fit line, so page N is slide N (`guards:` is retired and read by nothing)', () => {
    const fm = g.reportFrontMatter('theme: indaco\nfit: trim\nfitness: x');
    assert.equal(fm, '---\ntheme: indaco\nfitness: x\nfit: report\n---\n\n');
  });
  test('the deck is cut where the renderer cuts it (a `---` in a code fence is not a slide break)', () => {
    const { yaml, slides } = g.deckParts('---\ntheme: x\n---\n\n# A\n\n---\n\n```yaml\n---\n```\n\n---\n\n# C\n');
    assert.equal(yaml, 'theme: x');
    assert.equal(slides.length, 3);
  });
});

describe('fit-grace: what the author reads', () => {
  test('per slide, and only what was checked', () => {
    const lines = g.describe({ clipped: [3, 5], footerOnly: [], deck: null, perSlide: [
      { slide: 3, claim: 'claim-hero', had: null },
      { slide: 5, claim: null, had: 'claim-quiet' },
    ] });
    assert.match(lines[0], /slide 3 fits with `claim-hero`/);
    assert.match(lines[1], /slide 5 still clips with `claim-quiet` under every claim/);
  });
  test('a deck-wide claim comes with the slide-by-slide alternative', () => {
    const lines = g.describe({ clipped: [1, 2, 3], footerOnly: [9], deck: 'quiet', perSlide: [1, 2, 3].map((slide) => ({ slide, claim: 'claim-quiet', had: null })) });
    assert.match(lines[0], /`claim: quiet` in the front matter fits all 3/);
    assert.ok(lines.some((l) => /Or, slide by slide/.test(l)));
    assert.match(lines[lines.length - 1], /Not counted: page 9, where only the running footer is cut/);
  });
  test('says why it could not check a deck whose pages are not its slides', () => {
    assert.match(g.describe({ skipped: 'a `split:` rule divides it' })[0], /not checked; a `split:` rule divides it/);
  });
  test('says nothing when nothing clips', () => {
    assert.deepEqual(g.describe({ clipped: [], footerOnly: [], perSlide: [], deck: null }), []);
  });
});

// Review of #3362, finding 3: a slide that takes its layout from a running class must keep it when a claim is added,
// and a trial slide rendered on its own must keep what it inherits. Rebuilt by the Studio's `synthesizePrelude`, which
// reads a `carry` record and a bare `class:` comment alike.
describe('fit-grace: a slide that inherits its class', () => {
  for (const [name, first] of [['a carry record', '<!-- @meta{class=gantt, carry} -->'], ['a bare class comment', '<!-- class: gantt -->']]) {
    const slides = [`${first}\n\n## A`, '## B', '<!-- @meta{layout=list} -->\n\n## C'];
    test(`${name}: a slide alone renders with the running class`, () => {
      assert.equal(g.classInForce(g.standalone(slides, 1)), 'gantt');
      assert.equal(g.classInForce(g.standalone(slides, 2)), 'list');
    });
    test(`${name}: a claim on it repeats the running class, so the layout survives`, () => {
      assert.equal(g.classInForce(g.withClaim(g.standalone(slides, 1), 'claim-hero')), 'gantt claim-hero');
    });
  }
  test('the author is told the record to write, layout included', () => {
    const lines = g.describe({ clipped: [2], footerOnly: [], deck: null, perSlide: [{ slide: 2, claim: 'claim-hero', had: null, write: '<!-- @meta{layout=gantt, class=claim-hero} -->' }] });
    assert.match(lines[0], /fits with `<!-- @meta\{layout=gantt, class=claim-hero\} -->`/);
  });
});

// The inversion pass on #3362: grace must check the render the export made, not a different one.
describe('fit-grace: the trial renders the way the export did', () => {
  test('every option that changes layout is forwarded, in both spellings, paths made absolute', () => {
    const args = g.layoutArgs(['deck.md', 'out.pdf', '--size', '9:16', '--disable-plugin=chart', '--disable-plugin', 'map',
      '--default-plugins', 'none', '-c', 'x.css', '--packages=pk', '--no-split', '--notes', '--strip-notes', '-q'], '/w');
    assert.deepEqual(args, ['--size', '9:16', '--disable-plugin', 'chart', '--disable-plugin', 'map', '--default-plugins', 'none',
      '--css', '/w/x.css', '--packages', '/w/pk', '--no-split']);
  });
  test('--allow-remote is forwarded: a remote image that loads can change what fits (checker on #3362)', () => {
    assert.deepEqual(g.layoutArgs(['deck.md', '--allow-remote', '-q']), ['--allow-remote']);
  });
  test('a trial file left by a process that is gone is swept; one owned by a live process is kept', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-grace-stale-'));
    const dead = 2 ** 22 + 7; // above Linux's default pid_max, so no process has it
    const kept = [`.fit-grace-${process.ppid}-deck.md`, 'deck.md', '.fit-grace-notes.md'];
    for (const f of [`.fit-grace-${dead}-deck.md`, `.fit-grace-${dead}-s2-claim-hero.fit.json`, `.fit-grace-${dead}-deck.html`, ...kept]) {
      fs.writeFileSync(path.join(dir, f), '');
    }
    g.sweepStale(dir);
    const left = fs.readdirSync(dir).sort();
    fs.rmSync(dir, { recursive: true, force: true });
    assert.deepEqual(left, [...kept].sort());
  });
  test('CI=false and CI=0 are not CI; any other non-empty CI is (owner\'s D3)', () => {
    for (const v of [undefined, '', 'false', 'FALSE', '0', ' false ']) assert.equal(g.inCI({ CI: v }), false, `CI=${v}`);
    for (const v of ['true', '1', 'yes', 'github']) assert.equal(g.inCI({ CI: v }), true, `CI=${v}`);
  });
  test('the export\'s own verdict is used as given: nothing clipped there, nothing rendered here', () => {
    const p = g.plan('---\ntheme: indaco\n---\n\n# One\n', { dir: '/nonexistent-fit-grace-dir', exportVerdict: { pages: 1, overflow: [], clipped: [], footerOnly: [] } });
    assert.deepEqual(p.clipped, []);
    assert.deepEqual(p.perSlide, []);
  });
});

// The red team on #3362: grace read directives inside code, lost a BOM deck's front matter, named the wrong slide when
// hidden slides shifted the pages, and advised a claim on a slide the author marked `claim-framed`.
describe('fit-grace: reads the deck the way the engine does', () => {
  test('a directive shown inside a code fence is not one', () => {
    const tutorial = '## How to\n\n```markdown\n<!-- @meta{class=quote, carry} -->\n<!-- class: quote -->\n```';
    assert.equal(g.classInForce(g.standalone([tutorial, '## Next'], 1)), '');
    assert.deepEqual(g.slideClasses('```md\n<!-- @meta{layout=quote} -->\n```\n\n## T'), []);
  });
  test('a byte-order mark does not hide the front matter', () => {
    assert.equal(g.deckParts('﻿---\nsize: 9:16\n---\n\n# A\n').yaml, 'size: 9:16');
  });
  test('pages map onto the SHOWN slides, and a claim-framed slide gets no claim', () => {
    // Slide 1 is hidden, so the export's page 1 is slide 2. Slide 2 is claim-framed, so nothing is rendered.
    const deck = '---\ntheme: indaco\n---\n\n<!-- hide -->\n\n# Hidden\n\n---\n\n<!-- _class: list claim-framed -->\n\n## Framed\n';
    const p = g.plan(deck, { dir: '/nonexistent-fit-grace-dir', exportVerdict: { pages: 1, overflow: [1], clipped: [], footerOnly: [] } });
    assert.deepEqual(p.clipped, [2]);
    assert.equal(p.perSlide[0].framed, true);
    assert.match(g.describe(p)[0], /slide 2 clips; it is marked `claim-framed`/);
  });
});
