// Hand-written guidance never teaches a front-matter key the engine has retired.
//
// `lib/core/deck-settings.js` marks a retired key with `kind: 'retired'`, and `lint:deck` reports it in a deck. Nothing
// reported it in the prose that teaches authors and agents how to write a deck: `paginate: true` stayed the "canonical
// boardroom block" in `design/skills/deck.md` and `import.md`, and in the docs site's deck-settings guide, after the
// key was renamed to `pagination:`. The skills ship in the npm package (`dist/agent-kit/skills/`), so every agent that
// copied the block wrote a deck the linter rejects.
//
// This test reads every Markdown file under `design/skill.md`, `design/skills/` and `docs/src/content/`, and reports
// each retired key it finds, as `path:line`, in two shapes:
//   - a FRONT-MATTER line: a `key:` line inside a `---` block that opens the file, opens a fenced code block, or opens
//     a template string (`= \`---`);
//   - an INLINE mention: `` `key:`… `` in backticks.
// The retired set comes from `DECK_SETTINGS`, so a later rename that retires a key is caught with no edit here.
//
// SANCTIONED lists the files that name a retired key on purpose: to say what replaced it, or because the word is also
// a different field (a component manifest's `form:`). Each entry pins the exact count per key, with its reason, so a
// NEW mention in a sanctioned file still fails, and so does a stale entry. A new entry goes in with its reason, never
// as a silent edit.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { DECK_SETTINGS } = require('../../../lib/core/deck-settings.js');

const ROOT = path.resolve(__dirname, '../../..');
const TREES = ['design/skill.md', 'design/skills', 'docs/src/content'];

/** path → { why, keys: { key: count } } */
const SANCTIONED = {
  'design/skills/accessibility-review.md': {
    why: 'names the old note keys to say `@say` / `@alt` / `@handout` replaced them',
    keys: { say: 2 },
  },
  'design/skills/speaker-notes.md': {
    why: 'names the old note forms to say they reach nothing and how to migrate',
    keys: { say: 2 },
  },
  'design/skills/component.md': {
    why: "`form:` here is a component manifest's Frame field, not the retired deck key",
    keys: { form: 2 },
  },
  'design/skills/chart-component.md': {
    why: "`form: canvas` is a chart manifest's Frame field, not the retired deck key",
    keys: { form: 1 },
  },
  'docs/src/content/docs/guides/cli.md': {
    why: 'names the old note comments that `lattice migrate notes` rewrites',
    keys: { say: 1 },
  },
  'docs/src/content/docs/reference/cli.md': {
    why: 'the `lattice migrate notes` reference shows the forms it rewrites, and `--back` writes',
    keys: { say: 2 },
  },
  'docs/src/content/docs/spec/diagnostics.md': {
    why: 'the diagnostics table names the retired key each retirement rule reports',
    keys: {
      paginate: 3,
      fonts: 1,
      guards: 1,
      'chart-finish': 1,
      'spectrum-edge': 1,
      'spectrum-card': 1,
      'spectrum-card-edge': 1,
      'spectrum-trim': 1,
      'logo-style': 1,
      'logo-on': 1,
      'logo-x': 1,
      'logo-y': 1,
      'logo-scale': 1,
      form: 1,
      autosplit: 1,
      'overflow-marker': 1,
      say: 3,
      captions: 1,
    },
  },
  'docs/src/content/docs/spec/lfm.md': {
    why: 'generated from ratified spec/LFM-1.0.md, whose Appendix A deck is read in every environment, Marp included; a change goes through the spec process (§7)',
    keys: { paginate: 1 },
  },
};

const RETIRED = DECK_SETTINGS.filter((r) => r.kind === 'retired').map((r) => r.key);
const ALT = RETIRED.map((k) => k.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('|');
const FM_LINE = new RegExp(`^[ \\t]*(${ALT})[ \\t]*:`);
const INLINE = new RegExp(`\`(${ALT})[ \\t]*:`, 'g');
const FENCE = /^[ \t]*(`{3,}|~{3,})/;

/**
 * Every retired key in one file, as `{ line, key, shape }`.
 * @param {string} text
 * @returns {{ line: number, key: string, shape: 'front-matter' | 'inline' }[]}
 */
function retiredKeys(text) {
  const out = [];
  const lines = text.split('\n');
  let inFence = false;
  let inFm = false;
  // True at the top of the file and right after a fence opens: the only places a `---` line opens front matter.
  let atStart = true;
  lines.forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    const t = line.trim();
    if (inFm) {
      if (t === '---') inFm = false;
      else {
        const m = FM_LINE.exec(line);
        if (m) out.push({ line: i + 1, key: m[1], shape: 'front-matter' });
      }
      return;
    }
    for (const m of line.matchAll(INLINE)) out.push({ line: i + 1, key: m[1], shape: 'inline' });
    if (t === '') return;
    if (t === '---' && atStart) inFm = true;
    else if (/=\s*`---$/.test(t)) inFm = true;
    if (FENCE.test(line)) {
      inFence = !inFence;
      atStart = inFence;
    } else atStart = false;
  });
  return out;
}

function guidanceFiles() {
  return execFileSync('git', ['ls-files', '-z', '--', ...TREES], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((f) => /\.mdx?$/.test(f));
}

test('the retired set is read from DECK_SETTINGS and includes paginate', () => {
  assert.ok(RETIRED.includes('paginate'), 'paginate is a retired row in lib/core/deck-settings.js');
});

test('the scanner finds a retired key in front matter, a fenced block, a template string and inline', () => {
  const deck = '---\ntheme: indaco\npaginate: true\n---\n\n## Slide\n\n---\n\nsay: not front matter\n';
  assert.deepEqual(retiredKeys(deck), [{ line: 3, key: 'paginate', shape: 'front-matter' }]);
  const fenced = 'Start with:\n\n```yaml\n---\nsize: 4k\nfonts: used\n---\n```\n';
  assert.deepEqual(retiredKeys(fenced), [{ line: 6, key: 'fonts', shape: 'front-matter' }]);
  const tpl = 'export const X = `---\nguards: on\n---\n\n## A\n`;\n';
  assert.deepEqual(retiredKeys(tpl), [{ line: 2, key: 'guards', shape: 'front-matter' }]);
  assert.deepEqual(retiredKeys('Set `autosplit: off` to stop splitting.\n'), [{ line: 1, key: 'autosplit', shape: 'inline' }]);
  // A horizontal rule or a slide break is not front matter, and `pagination:` is not `paginate:`.
  assert.deepEqual(retiredKeys('Intro.\n\n---\n\npaginate: true\n'), []);
  assert.deepEqual(retiredKeys('---\npagination: true\n---\n'), []);
});

test('no skill or docs page teaches a retired front-matter key outside the sanctioned mentions', () => {
  const found = [];
  const counts = {};
  for (const f of guidanceFiles()) {
    const hits = retiredKeys(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    for (const h of hits) {
      const allowed = SANCTIONED[f]?.keys[h.key];
      if (allowed === undefined) found.push(`${f}:${h.line}: \`${h.key}:\` (${h.shape}) is retired`);
      counts[`${f}\0${h.key}`] = (counts[`${f}\0${h.key}`] || 0) + 1;
    }
  }
  assert.deepEqual(
    found,
    [],
    `Retired front-matter keys taught in guidance. Replace each with the key that replaced it (lint:deck names it), or, if the file names it on purpose, add it to SANCTIONED with its reason:\n${found.join('\n')}`,
  );
  const drift = [];
  for (const [f, { keys }] of Object.entries(SANCTIONED)) {
    for (const [key, want] of Object.entries(keys)) {
      const got = counts[`${f}\0${key}`] || 0;
      if (got !== want) drift.push(`${f}: \`${key}:\` sanctioned ${want}, found ${got}`);
    }
  }
  assert.deepEqual(drift, [], `SANCTIONED counts drifted. A new mention needs its reason; a stale one is removed:\n${drift.join('\n')}`);
});
