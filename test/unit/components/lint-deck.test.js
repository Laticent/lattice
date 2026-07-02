/**
 * Unit: lib/authoring/lint.js — the deck authoring linter.
 *
 * Covers the three rules (unknown-class, card-style-inline-title,
 * statement-ol-bold), modifier recognition, and clean-deck behaviour.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { lintText, buildVocab, isKnownModifier } = require('../../../lib/authoring/lint');
const { discoverDecks } = require('../../../tools/lint-deck');
const fs = require('node:fs');

const FM = '---\nmarp: true\ntheme: indaco\n---\n\n';

describe('deck linter', () => {
  const vocab = buildVocab();

  test('flags inline "- **Title.** body" on a card-style slide (error)', () => {
    const src = `${FM}<!-- _class: cards-grid -->\n\n## H.\n\n- **First.** body on same line.\n`;
    const findings = lintText(src, { vocab });
    const f = findings.find((x) => x.rule === 'card-style-inline-title');
    assert.ok(f, JSON.stringify(findings));
    assert.equal(f.severity, 'error');
    assert.equal(f.classToken, 'cards-grid');
  });

  test('accepts the nested-list shape on a card-style slide', () => {
    const src = `${FM}<!-- _class: cards-grid -->\n\n## H.\n\n- First\n  - body text.\n`;
    assert.equal(lintText(src, { vocab }).length, 0);
  });

  test('flags **bold** inside an ordered-list statement (error)', () => {
    const src = `${FM}<!-- _class: principles -->\n\n## P.\n\n1. **Bold.** breaks the grid.\n`;
    const f = lintText(src, { vocab }).find((x) => x.rule === 'statement-ol-bold');
    assert.ok(f);
    assert.equal(f.severity, 'error');
  });

  test('flags a bodyless inline item on a split slide (error)', () => {
    const src = `${FM}<!-- _class: split-panel metric -->\n\n\`Unit\`\n\n## 114%\n\nContext.\n\n- Title sentence. Body crammed on the same line.\n`;
    const f = lintText(src, { vocab }).find((x) => x.rule === 'split-bodyless-item');
    assert.ok(f, JSON.stringify(lintText(src, { vocab })));
    assert.equal(f.severity, 'error');
    assert.equal(f.classToken, 'split-panel');
  });

  test('flags a bare title-only item on a split slide (error — also unlifted)', () => {
    const src = `${FM}<!-- _class: split-panel -->\n\n\`Eyebrow\`\n\n## Head.\n\nFraming.\n\n- A finding with no nested body\n`;
    const f = lintText(src, { vocab }).find((x) => x.rule === 'split-bodyless-item');
    assert.ok(f);
    assert.equal(f.severity, 'error');
  });

  test('accepts the nested shape on a split slide', () => {
    const src = `${FM}<!-- _class: split-panel pullquote -->\n\n> Quote.\n\n\`Speaker\`\n\n- First implication\n  - What it means.\n- Second implication\n  - A consequence.\n`;
    assert.equal(lintText(src, { vocab }).filter((x) => x.rule === 'split-bodyless-item').length, 0);
  });

  test('warns when an h2-anchored split slide has no `## ` headline', () => {
    const src = `${FM}<!-- _class: split-panel metric -->\n\n\`Unit\`\n\nContext only, no headline.\n\n- Title\n  - body.\n`;
    const f = lintText(src, { vocab }).find((x) => x.rule === 'split-missing-headline');
    assert.ok(f, JSON.stringify(lintText(src, { vocab })));
    assert.equal(f.severity, 'warning');
    assert.equal(f.classToken, 'split-panel');
  });

  test('does NOT warn split-panel pullquote for a missing `## ` (blockquote-anchored)', () => {
    const src = `${FM}<!-- _class: split-panel pullquote -->\n\n> Quote.\n\n\`Speaker\`\n\n- A\n  - b.\n`;
    const f = lintText(src, { vocab }).find((x) => x.rule === 'split-missing-headline');
    assert.ok(!f, 'split-panel pullquote should not require an h2');
  });

  test('warns when split-panel pullquote has no `> ` blockquote', () => {
    const src = `${FM}<!-- _class: split-panel pullquote -->\n\n\`Speaker\`\n\n- A\n  - b.\n`;
    const f = lintText(src, { vocab }).find((x) => x.rule === 'split-statement-missing-quote');
    assert.ok(f);
    assert.equal(f.severity, 'warning');
  });

  test('warns when split-compare does not have exactly two options', () => {
    const three = `${FM}<!-- _class: split-compare -->\n\n## H.\n\n- One\n  - a.\n- Two\n  - b.\n- Three\n  - c.\n`;
    const f = lintText(three, { vocab }).find((x) => x.rule === 'split-compare-option-count');
    assert.ok(f);
    assert.equal(f.severity, 'warning');
    assert.match(f.message, /found 3/);
  });

  test('accepts a well-formed split-compare two-up', () => {
    const two = `${FM}<!-- _class: split-compare -->\n\n## H.\n\n- One\n  - a.\n- Two\n  - b.\n`;
    assert.equal(lintText(two, { vocab }).filter((x) => x.rule.startsWith('split-')).length, 0);
  });

  test('warns on a kpi/stats item with no nested label (warning)', () => {
    const src = `${FM}<!-- _class: stats -->\n\n## Results.\n\n1. 73%\n2. 4.2×\n`;
    const f = lintText(src, { vocab }).find((x) => x.rule === 'number-slot-bodyless-item');
    assert.ok(f, JSON.stringify(lintText(src, { vocab })));
    assert.equal(f.severity, 'warning');
    assert.equal(f.classToken, 'stats');
  });

  test('accepts the nested number+label shape on kpi/stats', () => {
    const src = `${FM}<!-- _class: kpi -->\n\n## Q4.\n\n1. $2.4B\n   - Total revenue\n2. 42%\n   - Gross margin\n`;
    assert.equal(lintText(src, { vocab }).filter((x) => x.rule === 'number-slot-bodyless-item').length, 0);
  });

  test('flags an unknown class token (warning)', () => {
    const src = `${FM}<!-- _class: card-grid -->\n\n## Typo.\n`;
    const f = lintText(src, { vocab }).find((x) => x.rule === 'unknown-class');
    assert.ok(f);
    assert.equal(f.severity, 'warning');
    assert.equal(f.classToken, 'card-grid');
  });

  test('does not flag known components or modifiers', () => {
    const src = `${FM}<!-- _class: cards-grid dark compact -->\n\n## H.\n\n- A\n  - b\n`;
    assert.equal(lintText(src, { vocab }).length, 0);
  });

  test('does not flag decoration/position modifier fragments', () => {
    // 'tint-corner' + 'at-tl' are a multi-token universal; 'mark-orbit' a
    // decoration. None should read as an unknown class.
    const src = `${FM}<!-- _class: content tint-corner at-tl mark-orbit no-footer -->\n\n## H.\n`;
    assert.deepEqual(lintText(src, { vocab }).filter((f) => f.rule === 'unknown-class'), []);
  });

  test('front matter is not treated as a slide', () => {
    const src = `${FM}<!-- _class: content -->\n\n## H.\n`;
    assert.equal(lintText(src, { vocab }).length, 0);
  });

  test('isKnownModifier recognizes prefix families', () => {
    assert.ok(isKnownModifier('tint-spotlight', vocab));
    assert.ok(isKnownModifier('with-period', vocab));
    assert.ok(isKnownModifier('at-right', vocab));
    assert.ok(!isKnownModifier('totally-made-up', vocab));
  });

  test('reports findings by human 1-based slide number (front matter excluded)', () => {
    const src = `${FM}<!-- _class: content -->\n\n## ok.\n\n---\n\n<!-- _class: cards-grid -->\n\n- **X.** y.\n`;
    const f = lintText(src, { vocab }).find((x) => x.rule === 'card-style-inline-title');
    // content = slide 1, cards-grid = slide 2 — matching the preview's "Slide N".
    assert.equal(f.slide, 2);
  });

  test('warns on an unrecognized front-matter `finish:` (backdrop) register value (warning)', () => {
    const src = '---\nmarp: true\ntheme: indaco\nfinish: atriumm\n---\n\n## H.\n';
    const f = lintText(src, { vocab }).find((x) => x.rule === 'unknown-finish');
    assert.ok(f, JSON.stringify(lintText(src, { vocab })));
    assert.equal(f.severity, 'warning');
    assert.equal(f.classToken, 'atriumm');
    assert.match(f.fix, /none, atrium/);
  });

  test('a former finish (sketch/boardroom) is now an UNKNOWN finish — it moved to `mode:`', () => {
    for (const v of ['sketch', 'boardroom', 'sketch-clean']) {
      const src = `---\nmarp: true\ntheme: indaco\nfinish: ${v}\n---\n\n## H.\n`;
      assert.equal(lintText(src, { vocab }).filter((x) => x.rule === 'unknown-finish').length, 1, `finish: ${v} should now be flagged`);
    }
  });

  test('accepts the known finish register values (none + backdrops)', () => {
    for (const v of ['none', 'atrium', 'gallery', 'ATRIUM']) {
      const src = `---\nmarp: true\ntheme: indaco\nfinish: ${v}\n---\n\n## H.\n`;
      assert.equal(lintText(src, { vocab }).filter((x) => x.rule === 'unknown-finish').length, 0, v);
    }
  });

  test('warns on an unrecognized `mode:` value; accepts boardroom/sketch/sketch-clean', () => {
    const bad = lintText('---\ntheme: indaco\nmode: sketchh\n---\n\n## H.\n', { vocab }).find((x) => x.rule === 'unknown-mode');
    assert.ok(bad, 'unknown mode should warn');
    assert.equal(bad.classToken, 'sketchh');
    assert.match(bad.fix, /boardroom, sketch, sketch-clean/);
    for (const v of ['boardroom', 'sketch', 'sketch-clean', 'SKETCH']) {
      const src = `---\ntheme: indaco\nmode: ${v}\n---\n\n## H.\n`;
      assert.equal(lintText(src, { vocab }).filter((x) => x.rule === 'unknown-mode').length, 0, v);
    }
  });

  test('a body `finish:` code span is not mistaken for the front-matter key', () => {
    const src = `${FM}<!-- _class: content -->\n\n## H.\n\n\`finish: bogus\` is just prose.\n`;
    assert.equal(lintText(src, { vocab }).filter((x) => x.rule === 'unknown-finish').length, 0);
  });

  test('warns on an out-of-range backdrop.strength and an unknown backdrop axis; accepts valid ones', () => {
    const bad = lintText('---\ntheme: indaco\nfinish: atrium\nbackdrop:\n  strength: 5\n  wobble: on\n---\n\n## H.\n', { vocab });
    const range = bad.find((x) => x.rule === 'backdrop-strength-range');
    const axis = bad.find((x) => x.rule === 'unknown-backdrop-axis');
    assert.ok(range, 'strength: 5 should warn (out of 0–1)');
    assert.equal(range.classToken, '5');
    assert.ok(axis, 'wobble should warn as an unknown axis');
    assert.equal(axis.classToken, 'wobble');
    // a valid strength + a following flat key (dedent) → clean
    const ok = lintText('---\ntheme: indaco\nfinish: atrium\nbackdrop:\n  strength: 0.4\npaginate: true\n---\n\n## H.\n', { vocab });
    assert.equal(ok.filter((x) => /backdrop/.test(x.rule)).length, 0);
  });

  test('warns on a non-toggle backdrop.clearance; accepts on/off', () => {
    const bad = lintText('---\ntheme: indaco\nfinish: atrium\nbackdrop:\n  clearance: sorta\n---\n\n## H.\n', { vocab });
    const cl = bad.find((x) => x.rule === 'backdrop-clearance-value');
    assert.ok(cl, 'clearance: sorta should warn (not a toggle)');
    assert.equal(cl.classToken, 'sorta');
    const ok = lintText('---\ntheme: indaco\nfinish: atrium\nbackdrop:\n  clearance: on\n---\n\n## H.\n', { vocab });
    assert.equal(ok.filter((x) => /backdrop/.test(x.rule)).length, 0);
  });

  test('every committed deck is completely lint-clean (no errors, no warnings)', () => {
    // The deck tree is clean and the gate is --strict, so warnings count too.
    // Locks in the fixes for the baseline gallery (cards-stack inline-title),
    // gallery-jargon (image-full), and legal.gallery.md (obligation-matrix
    // pills/lanes now declared) and guards against any regression.
    const offenders = [];
    for (const deck of discoverDecks()) {
      const findings = lintText(fs.readFileSync(deck, 'utf8'), { vocab });
      if (findings.length) {
        offenders.push(`${deck}: ${findings.map((f) => `${f.severity}:${f.rule}[${f.classToken}]@${f.slide}`).join(', ')}`);
      }
    }
    assert.deepEqual(offenders, [], offenders.join('\n'));
  });
});
