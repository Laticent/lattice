/**
 * Every component's skeleton and every variant sample lints with zero errors and zero warnings.
 *
 * The skeleton is the one shape the docs, `components.json`, the agent pack's start.md and the
 * kit's starter deck all copy. `list-steps` taught `1. Title — body` there until 2026-11-17, and
 * every copy rendered each step as one bold title with no body
 * (engineering/decisions/2026-11-17-agent-pack.md). Its lint rule (`list-steps-inline-body`)
 * now catches that shape; this test runs every teaching shape through the linter, so a
 * skeleton that breaks a rule cannot ship.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { loadAll } = require(path.join(ROOT, 'lib', 'components'));

test('every component skeleton and variant sample lints with no errors or warnings', () => {
  const shapes = [];
  for (const m of loadAll()) {
    if (m.skeleton) shapes.push({ where: `${m.name} skeleton`, text: m.skeleton });
    for (const [v, spec] of Object.entries(m.variants && !Array.isArray(m.variants) ? m.variants : {})) {
      if (spec?.sample) shapes.push({ where: `${m.name} ${v} sample`, text: spec.sample });
    }
  }
  assert.ok(shapes.length >= 80, `found ${shapes.length} skeletons and samples`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skeletons-'));
  try {
    const deck = path.join(dir, 'skeletons.md');
    fs.writeFileSync(deck, `---\ntheme: indaco\n---\n\n${shapes.map((s) => s.text.trim()).join('\n\n---\n\n')}\n`);
    let out;
    try {
      out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'lint-deck.js'), '--json', deck], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch (e) {
      out = e.stdout;
    }
    const { findings } = JSON.parse(out);
    const bad = findings
      .filter((f) => f.severity === 'error' || f.severity === 'warning')
      .map((f) => `${shapes[f.slide - 1]?.where ?? `slide ${f.slide}`}: ${f.severity} ${f.rule}`);
    assert.deepEqual(bad, [], 'a skeleton or variant sample teaches a shape the linter rejects');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * The universal references (lib/base/base.docs.md, base.registers.docs.md) teach the parts every
 * slide shares, and the agent pack ships both. Their Key Insight example wrote cards as
 * `- **Signal Intake.** Body text.`, a lint ERROR on cards-grid, until 2026-11-17. Each example is
 * linted on its own, for errors only: many are annotated (two `_class` lines shown as
 * alternatives, `<!-- … -->` notes, arrows), and those annotations raise warnings by design.
 */
test('every example in the universal references lints with no errors', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'base-examples-'));
  try {
    const decks = [];
    for (const f of ['base.docs.md', 'base.registers.docs.md']) {
      const text = fs.readFileSync(path.join(ROOT, 'lib', 'base', f), 'utf8');
      for (const m of text.matchAll(/```markdown\n([\s\S]*?)\n```/g)) {
        if (!/_class:/.test(m[1])) continue;
        const line = text.slice(0, m.index).split('\n').length;
        const deck = path.join(dir, `${f}-L${line}.md`);
        fs.writeFileSync(deck, `${/^---\n/.test(m[1]) ? '' : '---\ntheme: indaco\n---\n\n'}${m[1]}\n`);
        decks.push(deck);
      }
    }
    assert.ok(decks.length >= 20, `found ${decks.length} examples`);
    let out;
    try {
      out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'lint-deck.js'), '--json', ...decks], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch (e) {
      out = e.stdout;
    }
    const { findings } = JSON.parse(out);
    // A one-line example (`<!-- _class: title silent -->`) shows a modifier, not a slide, so it
    // has no heading or list: #3321's `slot-contract` reports each absent required slot ("This
    // slide has none"). Absence is the point of a fragment; a slot written in the WRONG shape is
    // still an error here.
    const absent = (f) => f.rule === 'slot-contract' && /has none/.test(f.message || '');
    const bad = findings
      .filter((f) => f.severity === 'error' && !absent(f))
      .map((f) => `${path.basename(f.file || '')} slide ${f.slide}: ${f.rule}`);
    assert.deepEqual(bad, [], 'an example in the universal references teaches a shape the linter rejects');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
