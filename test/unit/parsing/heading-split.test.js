/**
 * Unit: the `split: headings` slide divider (lib/integrations/markdown-it/plugins.js
 * `headingSplit` + lib/core/resolve-split.js).
 *
 * `split: headings` lets a deck divide on h1/h2 instead of `---`, the house
 * "sticky rule": the first `#` is the lead slide, each subsequent `##` starts a
 * slide. The divider is EYEBROW-AWARE — the first heading of a slide never
 * splits, so lead content above a title (an eyebrow tag, a kicker) stays with
 * that title — and HYBRID — an author-written `---` still splits.
 *
 * We assert section counts through lib/engine (the canonical render path — the
 * emulator CLI + the playground), and pin the backward-compat invariant: every
 * committed deck splits to the SAME slide count under `headings` as under the
 * default `rule` (the evidence that a future default flip is safe for today's
 * corpus).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const latticeEngine = require('../../../lib/engine');
const { resolveSplitMode, isKnownSplit, SPLIT_NAMES } = require('../../../lib/core/resolve-split');

const REPO = path.join(__dirname, '..', '..', '..');

// Rendered HTML through the emulator / playground engine path.
const engine = latticeEngine.createEngine();
const engineHtml = (md) => engine.render(md).html;
function engineSections(md) {
  return (engineHtml(md).match(/<section[\s>]/g) || []).length;
}

// Split rendered HTML into per-<section> chunks (slide-scoped substrings).
function splitSections(html) {
  return html.split(/(?=<section[\s>])/).filter((s) => /^<section[\s>]/.test(s))
    .map((s) => s.slice(0, s.indexOf('</section>') + 1 || undefined));
}

// Assert the engine splits a deck to the expected slide count, and return it.
function sections(md, expected, label) {
  const b = engineSections(md);
  if (expected != null) assert.equal(b, expected, `${label}: expected ${expected} slides, got ${b}`);
  return b;
}

const fm = (mode, body) => `---\nmarp: true\nsplit: ${mode}\n---\n\n${body}`;

describe('resolve-split', () => {
  test('default mode is headings (absent / empty / unknown)', () => {
    assert.equal(resolveSplitMode(''), 'headings');
    assert.equal(resolveSplitMode('---\nmarp: true\n---\n\n# A'), 'headings');
    assert.equal(resolveSplitMode('---\nsplit: nonsense\n---\n\n# A'), 'headings');
  });
  test('reads an explicit rule opt-out and is case/quote tolerant', () => {
    assert.equal(resolveSplitMode('---\nsplit: rule\n---\n'), 'rule');
    assert.equal(resolveSplitMode('---\nsplit: "Rule"\n---\n'), 'rule');
  });
  test('an explicit override wins over the front matter', () => {
    assert.equal(resolveSplitMode('---\nsplit: headings\n---\n', 'rule'), 'rule');
    assert.equal(resolveSplitMode('---\nsplit: rule\n---\n', 'bogus'), 'rule');
  });
  test('isKnownSplit + SPLIT_NAMES', () => {
    assert.deepEqual([...SPLIT_NAMES], ['rule', 'headings']);
    assert.ok(isKnownSplit('rule') && isKnownSplit('HEADINGS'));
    assert.ok(!isKnownSplit('heading') && !isKnownSplit(''));
  });
});

describe('headingSplit', () => {
  test('rule mode (opt-out): only `---` splits, headings do not', () => {
    sections(fm('rule', '# A\n\n## still A\n\nbody\n\n---\n\n## B\n'), 2, 'rule');
  });

  test('a deck with no split key behaves exactly like headings (the default)', () => {
    const body = '# A\n\n## B\n\n## C\n';
    assert.equal(
      sections(`---\nmarp: true\n---\n\n${body}`, null, 'no-key'),
      sections(fm('headings', body), null, 'headings'),
    );
  });

  test('headings mode: first # is the lead, each ## opens a slide', () => {
    sections(fm('headings', '# Lead\n\nkicker\n\n## One\n\nbody\n\n## Two\n\nbody\n\n## Three\n'),
      4, 'headings');
  });

  test('eyebrow-aware: lead content above a title stays on the title slide', () => {
    // The eyebrow + kicker precede each ## but must NOT orphan into their own
    // slide — only the SECOND-and-later heading of a slide injects a break.
    const body = '`Eyebrow`\n\n# Lead\n\ntagline\n\n`Tag`\n\n## One\n\nbody\n\n`Tag`\n\n## Two\n';
    sections(fm('headings', body), 3, 'eyebrow-aware');
  });

  test('hybrid: an explicit `---` still forces a break in headings mode', () => {
    // A `---` between two headingless blocks under one heading: headings alone
    // would keep them as ONE slide; the `---` splits them — proving hybrid.
    const body = '# A\n\nfirst part\n\n---\n\nsecond part\n';
    assert.equal(engineSections(fm('headings', body.replace('---\n\n', ''))), 1, 'no --- → 1 slide');
    sections(fm('headings', body), 2, 'hybrid');
  });

  test('fence-safe: headings inside a code fence do not split', () => {
    const body = '# A\n\n```md\n## not a slide\n# also not\n```\n\n## Real B\n';
    sections(fm('headings', body), 2, 'fence-safe');
  });

  test('h3+ never splits — only h1/h2 are slide headings', () => {
    sections(fm('headings', '# A\n\n### sub\n\nbody\n\n### another\n\n## B\n'), 2, 'h3');
  });

  test('a nested heading (in a blockquote) does not split', () => {
    sections(fm('headings', '# A\n\n> ## quoted\n\nbody\n\n## B\n'), 2, 'nested');
  });

  test('CRLF front matter splits identically (no leaked-front-matter divergence)', () => {
    // A Windows-authored deck: the engine front-matter stripper must be CRLF-
    // tolerant, or the `split: headings` line leaks into the body as a heading
    // and the two paths disagree on slide count.
    const crlf = '---\r\nmarp: true\r\nsplit: headings\r\n---\r\n\r\n# A\r\n\r\n## B\r\n';
    sections(crlf, 2, 'crlf');
  });

  test('pull-back: a slide\'s `_class` + eyebrow (above the ##) land on THAT slide', () => {
    // The lead-in is written above the heading (so the eyebrow renders above the
    // title); the break must go before it, not before the bare heading, or it
    // orphans onto the previous slide.
    const md = fm('headings',
      '# Lead\n\nintro\n\n<!-- _class: cards-grid -->\n\n`Kicker`\n\n## Two\n\nbody\n');
    for (const [label, render] of [['engine', engineHtml]]) {
      const secs = splitSections(render(md));
      assert.equal(secs.length, 2, `${label}: 2 slides`);
      assert.ok(!secs[0].includes('Kicker') && !/class="[^"]*cards-grid/.test(secs[0]),
        `${label}: lead-in must NOT orphan onto slide 1`);
      assert.ok(secs[1].includes('Kicker') && /class="[^"]*cards-grid/.test(secs[1]),
        `${label}: lead-in (eyebrow + _class) must land on slide 2`);
    }
  });

  test('pull-back only matches a TRUE eyebrow (code:only-child), not any code paragraph', () => {
    // The eyebrow the splitter pulls back must be the exact shape the CSS styles
    // (`p:has(> code:only-child)`). A paragraph with two code spans is NOT an
    // eyebrow, so it stays as trailing content of the previous slide.
    const secs = splitSections(engineHtml(fm('headings',
      '# A\n\nintro\n\n`one` `two`\n\n## B\n\nbody\n')));
    assert.equal(secs.length, 2, 'two slides');
    assert.ok(secs[0].includes('one') && secs[0].includes('two'),
      'a two-code paragraph is not an eyebrow — it stays on slide 1');
  });
});

describe('backward-compat invariance over the committed corpus', () => {
  // Every committed deck splits to the SAME count under headings as under rule
  // — proven once offline, pinned here so a future deck that would fragment
  // under a headings default is caught (it should declare `split: rule`).
  const decks = [
    ...globMd(path.join(REPO, 'examples')),
    ...globMd(path.join(REPO, 'examples', 'token-contrast')),
    path.join(REPO, 'test', 'integration', 'baseline-decks', 'gallery.md'),
  ].filter((f) => fs.existsSync(f))
    // Restrict to classic `---`-separated decks: a deck with no body separator
    // (e.g. examples/split-headings.md) collapses to one slide under `rule`, so
    // it can't be rule/headings-invariant by construction. The invariant proves
    // that a deck written the classic way is unchanged by the headings default.
    .filter((f) => hasBodySeparator(fs.readFileSync(f, 'utf8')));

  for (const file of decks) {
    const name = path.relative(REPO, file);
    test(`${name}: rule and headings yield identical slide counts`, () => {
      const src = fs.readFileSync(file, 'utf8');
      const ruled = engineSections(forceSplit(src, 'rule'));
      const headed = engineSections(forceSplit(src, 'headings'));
      assert.equal(headed, ruled,
        `${name} fragments under headings (${headed} vs ${ruled}) — it must set split: rule`);
    });
  }
});

// True if the deck body (front matter stripped) contains a top-level `---`
// thematic-break separator — i.e. it's a classic separator-split deck.
function hasBodySeparator(src) {
  const body = src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  return /^---[ \t]*$/m.test(body);
}

// List *.md directly under dir (non-recursive), absolute paths.
function globMd(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => (f.endsWith('.md') && !f.endsWith('.tmp.md'))).map((f) => path.join(dir, f));
}

// Force a deck's front matter to a given split mode (insert or replace the key).
function forceSplit(src, mode) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(src);
  if (!m) return `---\nmarp: true\nsplit: ${mode}\n---\n\n${src}`;
  const body = m[1].replace(/^\s*split:.*$/m, '').replace(/\n{2,}/g, '\n').trim();
  return `---\n${body}\nsplit: ${mode}\n---\n${src.slice(m[0].length)}`;
}
