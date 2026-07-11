/**
 * Unit: lib/authoring/lint.js — the deck authoring linter.
 *
 * Covers the three rules (unknown-class, card-style-inline-title,
 * statement-ol-bold), modifier recognition, and clean-deck behaviour.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { lintText, buildVocab, isKnownModifier } = require('../../../lib/authoring/lint');
const { discoverDecks, narrationText, main } = require('../../../tools/lint-deck');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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

  test('warns on an unrecognized `color-mode:` value; accepts light/dark/system/inherited', () => {
    const bad = lintText('---\ntheme: indaco\ncolor-mode: darrk\n---\n\n## H.\n', { vocab }).find((x) => x.rule === 'unknown-color-mode');
    assert.ok(bad, 'unknown color-mode should warn');
    assert.equal(bad.severity, 'warning');
    assert.equal(bad.classToken, 'darrk');
    assert.match(bad.fix, /light, dark, system, inherited/);
    for (const v of ['light', 'dark', 'system', 'inherited', 'SYSTEM']) {
      const src = `---\ntheme: indaco\ncolor-mode: ${v}\n---\n\n## H.\n`;
      assert.equal(lintText(src, { vocab }).filter((x) => x.rule === 'unknown-color-mode').length, 0, v);
    }
  });

  test('nudges a deck-wide `class: dark`/`light` toward `color-mode:` (info); flags it as redundant when the key is also present', () => {
    const nudge = lintText('---\ntheme: indaco\nclass: dark\n---\n\n## H.\n', { vocab }).find((x) => x.rule === 'deprecated-class-color-mode');
    assert.ok(nudge, 'the legacy color alias should nudge');
    assert.equal(nudge.severity, 'info');
    assert.match(nudge.fix, /color-mode: dark/);
    // Half-migrated (both present): still flagged, now as a redundant leftover to remove.
    const halfMigrated = lintText('---\ntheme: indaco\nclass: dark\ncolor-mode: light\n---\n\n## H.\n', { vocab }).find((x) => x.rule === 'deprecated-class-color-mode');
    assert.ok(halfMigrated, 'a leftover class: alias beside the key should still be flagged');
    assert.match(halfMigrated.message, /superseded|redundant/);
    // A non-color class token is never nudged.
    assert.equal(lintText('---\ntheme: indaco\nclass: numbered\n---\n\n## H.\n', { vocab }).filter((x) => x.rule === 'deprecated-class-color-mode').length, 0);
  });

  test('warns on an unrecognized `stamp:` (state-marker shape) value; accepts the shapes', () => {
    const bad = lintText('---\ntheme: indaco\nstamp: sael\n---\n\n## H.\n', { vocab }).find((x) => x.rule === 'unknown-stamp');
    assert.ok(bad, 'unknown stamp should warn');
    assert.equal(bad.severity, 'warning');
    assert.equal(bad.classToken, 'sael');
    assert.match(bad.fix, /tab, notch, bracket, seal, pill/);
    for (const v of ['tab', 'seal', 'ribbon', 'PILL']) {
      const src = `---\ntheme: indaco\nstamp: ${v}\n---\n\n## H.\n`;
      assert.equal(lintText(src, { vocab }).filter((x) => x.rule === 'unknown-stamp').length, 0, v);
    }
  });

  test('warns on an unrecognized `tone:` (tone-marker shape) value; accepts rail/edge/glow', () => {
    const bad = lintText('---\ntheme: indaco\ntone: raill\n---\n\n## H.\n', { vocab }).find((x) => x.rule === 'unknown-tone');
    assert.ok(bad, 'unknown tone should warn');
    assert.equal(bad.classToken, 'raill');
    assert.match(bad.fix, /rail, edge, glow/);
    for (const v of ['rail', 'edge', 'glow', 'GLOW']) {
      const src = `---\ntheme: indaco\ntone: ${v}\n---\n\n## H.\n`;
      assert.equal(lintText(src, { vocab }).filter((x) => x.rule === 'unknown-tone').length, 0, v);
    }
  });

  test('warns on an unrecognized `spectrum:` (white-label brand bar) value; accepts on/off/solid', () => {
    const bad = lintText('---\ntheme: indaco\nspectrum: rainbowww\n---\n\n## H.\n', { vocab }).find((x) => x.rule === 'unknown-spectrum');
    assert.ok(bad, 'unknown spectrum should warn');
    assert.equal(bad.classToken, 'rainbowww');
    assert.match(bad.fix, /on, off, solid/);
    for (const v of ['on', 'off', 'solid', 'OFF']) {
      const src = `---\ntheme: indaco\nspectrum: ${v}\n---\n\n## H.\n`;
      assert.equal(lintText(src, { vocab }).filter((x) => x.rule === 'unknown-spectrum').length, 0, v);
    }
  });

  test('a body `finish:` code span is not mistaken for the front-matter key', () => {
    const src = `${FM}<!-- _class: content -->\n\n## H.\n\n\`finish: bogus\` is just prose.\n`;
    assert.equal(lintText(src, { vocab }).filter((x) => x.rule === 'unknown-finish').length, 0);
  });

  test('warns that a top-level `backdrop:` block is retired (migrate to finish-override:)', () => {
    // Retired: backdrop is a baked finish layer now; a top-level `backdrop:` map silently
    // no-ops, so it earns one migration warning (not per-axis validation).
    const bad = lintText('---\ntheme: indaco\nfinish: atrium\nbackdrop:\n  strength: 0.4\n  clearance: on\n---\n\n## H.\n', { vocab });
    const retired = bad.filter((x) => x.rule === 'retired-backdrop-key');
    assert.equal(retired.length, 1, 'exactly one migration warning for the block');
    assert.equal(retired[0].classToken, 'backdrop');
    // a `backdrop:` NESTED under finish-override: is the supported form → no warning
    const ok = lintText('---\ntheme: indaco\nfinish: atrium\nfinish-override:\n  backdrop:\n    strength: 0.4\n---\n\n## H.\n', { vocab });
    assert.equal(ok.filter((x) => /backdrop/.test(x.rule)).length, 0);
  });

  test('warns that a deck-wide `form: minimal` is retired (migrate to the rail control)', () => {
    // Retired 2026-07-03: `form: minimal` only added `no-progress`; that look is now the
    // `no-progress` chrome control. A lingering key silently resolves to standard, so it
    // earns one migration warning.
    const bad = lintText('---\ntheme: indaco\nform: minimal\n---\n\n## H.\n', { vocab });
    const retired = bad.filter((x) => x.rule === 'retired-form-minimal');
    assert.equal(retired.length, 1, 'exactly one migration warning for the retired toggle');
    assert.equal(retired[0].classToken, 'form');
    // `form: standard` / `form: off` are live values → no warning.
    for (const v of ['standard', 'off']) {
      const ok = lintText(`---\ntheme: indaco\nform: ${v}\n---\n\n## H.\n`, { vocab });
      assert.equal(ok.filter((x) => x.rule === 'retired-form-minimal').length, 0, `form: ${v} is live`);
    }
  });


  test('stress-slide marker suppresses capacity-crowd but never capacity-overflow', () => {
    // A slide in the crowd band (soft < n <= hard) with the marker: no warning.
    const crowd = (marker) => `---\nmarp: true\ntheme: indaco\n---\n\n<!-- _class: q-and-a -->\n${marker}\n\n## H.\n\n${Array.from({ length: 6 }, (_, i) => `- Q${i}?\n  - A${i}.`).join('\n')}\n`;
    assert.equal(lintText(crowd('<!-- stress-slide -->'), { vocab }).filter((x) => x.rule === 'capacity-crowd').length, 0, 'marker holds the crowd warning');
    assert.equal(lintText(crowd(''), { vocab }).filter((x) => x.rule === 'capacity-crowd').length, 1, 'no marker, crowd warns as before');
    // Past hard, the marker does NOT save it — overflow still fires.
    const over = `---\nmarp: true\ntheme: indaco\n---\n\n<!-- _class: q-and-a -->\n<!-- stress-slide -->\n\n## H.\n\n${Array.from({ length: 8 }, (_, i) => `- Q${i}?\n  - A${i}.`).join('\n')}\n`;
    assert.equal(lintText(over, { vocab }).filter((x) => x.rule === 'capacity-overflow').length, 1, 'overflow ignores the marker');
  });

  test('narrationText strips front matter, fenced + inline code, keeps prose', () => {
    const src = '---\ntheme: indaco\n---\n\n# Head\n\nWe track XYZ.\n\n```\nconst API = "HTTP";\n```\n\nUse `JSON` inline.\n';
    const out = narrationText(src);
    assert.match(out, /We track XYZ\./);
    assert.doesNotMatch(out, /theme: indaco/); // front matter gone
    assert.doesNotMatch(out, /HTTP|const API/); // fenced code gone
    assert.doesNotMatch(out, /JSON/); // inline code gone
  });

  test('the discovery pass emits a non-blocking narration-acronyms suggestion (§16)', async () => {
    // A deck with an UNREGISTERED, lexicon-unknown all-caps token (XYZ) → advisory hint;
    // a registered term (ROI here) and a lexicon term (GTM) are NOT flagged.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-disc-'));
    const file = path.join(dir, 'deck.md');
    fs.writeFileSync(file, '---\ntheme: indaco\nacronyms:\n  ROI: return on investment\n---\n\n# Plan\n\nWe track ROI, GTM, and XYZ.\n');
    const chunks = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = (s) => { chunks.push(String(s)); return true; };
    let code;
    try {
      code = await main(['--json', file]);
    } finally {
      process.stdout.write = orig;
      fs.rmSync(dir, { recursive: true, force: true });
    }
    assert.equal(code, 0, 'advisory suggestions never fail the exit code');
    const out = JSON.parse(chunks.join(''));
    const hint = out.reviewFindings.find((s) => s.rule === 'narration-acronyms');
    assert.ok(hint, `expected a narration-acronyms suggestion, got ${JSON.stringify(out.reviewFindings)}`);
    assert.match(hint.message, /XYZ/);
    assert.doesNotMatch(hint.message, /\bROI\b|\bGTM\b/); // registered + lexicon-known are not flagged
    assert.match(hint.fix, /acronyms:/);
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
