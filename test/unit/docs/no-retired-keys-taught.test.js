// Agent-facing guidance never teaches a front-matter key the engine has retired.
//
// `lib/core/deck-settings.js` marks a retired key with `kind: 'retired'`, and `lint:deck` reports it in a deck. Nothing
// reported it in the text that teaches authors and agents how to write one: `paginate: true` stayed the "canonical
// boardroom block" in `design/skills/deck.md` and `import.md` and in the docs site's deck-settings guide after the key
// became `pagination:`, and the skills ship in the npm package (`dist/agent-kit/skills/`). An agent that copied the
// block wrote a deck the linter rejects.
//
// This test reads the sources of everything an agent reads (SOURCES below) and reports each retired key, as
// `path:line`, in three shapes:
//   - FRONT MATTER: a `key:` line inside a `---` block that opens the file, opens a fenced code block, or opens a
//     template string (`= \`---`); any line of a ```yaml fence; a column-0 key line in an unlabeled, ```md or
//     ```markdown fence. A block is something to copy, so no wording excuses one.
//   - INLINE, in Markdown: `` `key:` `` in backticks.
//   - BARE, in plain text (a Studio tool's `chat` description, the llms.txt source): `key:` as a word.
// The retired set is read from `DECK_SETTINGS`, so the next rename that retires a key turns its own leftover guidance
// red here with no edit to this file. Slide comments the @meta cut (#3563) retired are asked of
// lint-core itself (`legacy-directive-comment`), so every spelling it reports is guarded: on its own line a comment
// counts as a settings line wherever it sits, and in a code span (`` `<!-- _class: x -->` ``, `` `_footer:` ``) it
// needs a cue like any key.
//
// Guidance may NAME a retired key to say what replaced it. An inline or bare mention passes when its paragraph (a run
// of non-blank lines; each list item and table row is its own; a sentence in plain text) says so in words
// RETIREMENT_CUE matches: "renamed", "retired", "the old key", "no longer", "was `…`", "→", and "becomes" / "is now" /
// "instead of" only between two code spans (`` `a:` becomes `b:` ``). A mention no cue can
// excuse goes in SANCTIONED, with its reason and an exact count per key, so a new mention in that file still fails,
// and so does a stale entry. A new entry goes in with its reason, never as a silent edit.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { DECK_SETTINGS } = require('../../../lib/core/deck-settings.js');

const ROOT = path.resolve(__dirname, '../../..');

/** What an agent reads, by the shape of its text: pathspecs for `git ls-files`, then a filter on the path. */
const SOURCES = [
  { kind: 'markdown', specs: ['design'], keep: /\.md$/ },
  { kind: 'markdown', specs: ['docs/src/content'], keep: /\.mdx?$/ },
  { kind: 'markdown', specs: ['lib/base', 'lib/components', 'lib/plugins/chart-family/kinds'], keep: /\.docs\.md$/ },
  { kind: 'markdown', specs: ['.claude/skills'], keep: /^\.claude\/skills\/lattice-[^/]+\/SKILL\.md$/ },
  { kind: 'chat', specs: ['lib/use-cases'], keep: /\.use-case\.json$/ },
  { kind: 'text', specs: ['docs/src/lib/discovery.mjs'], keep: /discovery\.mjs$/ },
];

/** path → { why, keys: { key: count } }: the mentions no cue can excuse. */
const SANCTIONED = {
  'design/skills/component.md': {
    why: "`form:` here is a component manifest's Frame field, not the retired deck key",
    keys: { form: 2 },
  },
  'design/skills/chart-component.md': {
    why: "`form: canvas` is a chart manifest's Frame field, not the retired deck key",
    keys: { form: 1 },
  },
  'design/forms.md': {
    why: "`form:` is mostly a component manifest's Frame field, the subject of the doc; two mentions (:5, :780) say the deck key is gone",
    keys: { form: 6 },
  },
  'design/concepts.md': {
    why: "`form:` here is a component manifest's Frame field, not the retired deck key",
    keys: { form: 1 },
  },
  'docs/src/content/docs/spec/lfm.md': {
    why: "TEMPORARY, the whole entry: generated from spec/LFM-1.0.md, which #3554 (the spec desk) regenerates with @meta examples and no `paginate:` or `_class` taught as current (checked against #3554's head). Whichever of #3554 and #3606 lands second deletes this entry; the stale-entry check forces it",
    keys: { paginate: 2, _class: 5 },
  },
  'lib/base/base.registers.docs.md': {
    why: 'the raw-Marp section: Marpit itself reads `_class:`, and a deck exported to Marp must list the register token in it',
    keys: { _class: 4 },
  },
  'design/design-system.md': {
    why: "`form:` here is a component manifest's Frame field, not the retired deck key; `_class` is the Marp kit's own comment form, where the VS Code completion works",
    keys: { form: 1, _class: 1 },
  },
  'design/skills/import.md': {
    why: 'a check-list item that says no Marp directive comment (`<!-- _class: … -->`) is left in an imported deck, and the "Marp leftovers" list of input to migrate (`<!-- _paginate: false -->`)',
    keys: { _class: 1, _paginate: 1 },
  },
  'docs/src/content/docs/reference/cli.md': {
    why: "the `lattice migrate notes` table lists the old forms it rewrites; the row's left column is the input",
    keys: { say: 1 },
  },
  'docs/src/content/docs/spec/diagnostics.md': {
    why: "the diagnostics table names what each rule reports: `stray-overflow-marker`'s retired key, and `say:` as an unknown `terms:` field. TEMPORARY for the comment forms, each dropped by the stale-entry check as its fix lands: `_track`, `_build`, `_focus`, `_debug` are the `track-directive` (:160), `one-stepping-directive` (:166), `code-line-range` (:183) and `unknown-debug-facet` (:272) rows, which #3554 (the spec desk) rewrites; `_class` is the `meta-class-overridden` row (:440), which #3607 rewrites with the rule in lint-core.js",
    keys: { 'overflow-marker': 1, say: 1, _class: 1, _track: 1, _build: 1, _focus: 1, _debug: 1 },
  },
  'docs/src/content/catalog/libraries/lente.md': {
    why: "the standalone `lente` package reads a `<!-- _lens: … -->` comment itself; the same line gives Lattice's record, `@meta{lens=…}`",
    keys: { _lens: 1 },
  },
};

// Phrases that mark a mention as history rather than instruction. Deliberately narrow: a common word such as "was",
// "before" or "old" on its own appears in plenty of current instructions, and a cue that broad excused
// `` `guards: loose` is the default `` (lib/base/base.docs.md) because "before #2308" sat in the same paragraph.
const RETIREMENT_CUE =
  /\b(?:retired|retirement|renamed|was called|replaced|no longer|legacy|migrat\w*|rewrites?|deprecated|(?:the|an?) old(?:er)? (?:name|names|key|keys|form|forms|spelling|one|note|syntax|classes)|old names|LFM 1\.x|reaches nothing)\b|`[^`]+`[^.]*\b(?:is|are) not read\b|\b(?:the|an?) old `[^`]+` (?:key|keys|class|classes|name|form|spelling|comment|comments)\b|\b(?:was|formerly) `|→|`[^`]+`[ \t]*(?:becomes|is now|instead of)[ \t]+`/i;
// The spec's own words for a form a renderer ignores (LFM §2.3, "**Not read:** … MUST NOT apply"). Case-sensitive, so
// ordinary prose ("the theme must not apply its footer") is no cue.
const SPEC_CUE = /\*\*Not read:?\*\*|\bMUST NOT apply\b/;
const isCue = (text) => RETIREMENT_CUE.test(text) || SPEC_CUE.test(text);

const RETIRED = DECK_SETTINGS.filter((r) => r.kind === 'retired').map((r) => r.key);
// A slide comment the engine no longer reads. The @meta cut (#3563) made `<!-- @meta{…} -->` the one way a slide sets
// anything, and lint-core reports every old comment as `legacy-directive-comment`. Rather than list the spellings
// (`_class`, `class`, `_paginate`, `footer`, a pane marker, …), the test asks the linter, so a spelling it starts or
// stops reporting moves this guard with it. The answer is cached per comment text.
const lintCore = require('../../../lib/authoring/lint-core.js');
const LINT_VOCAB = { names: new Set(), modifiers: new Set(), capacity: {} };
const retiredCache = new Map();
/** The retired spelling a comment uses (`_class`, `footer`, `_pane`), or null when the engine reads it or it is no setting. */
function retiredComment(comment) {
  if (!retiredCache.has(comment)) {
    const deck = `---\ntheme: indaco\n---\n\n${comment}\n\n## A title that makes a claim.\n`;
    const f = lintCore.lintTextWith(deck, LINT_VOCAB).find((x) => x.rule === 'legacy-directive-comment');
    const body = commentBody(comment);
    retiredCache.set(comment, f ? f.classToken || body.split(/[\s:]/)[0] : null);
  }
  return retiredCache.get(comment);
}
const esc = (k) => k.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
const ALT = RETIRED.map(esc).join('|');
const FM_LINE = new RegExp(`^[ \\t]*(${ALT})[ \\t]*:`);
// Comments are found with string scanning, not a regex, and an end is `-->` or `--!>` (HTML's two closers). This reads
// docs for the guard; it filters nothing that reaches a page.
const COMMENT_ENDS = ['-->', '--!>'];
/** The text between `<!--` and its end, trimmed. */
function commentBody(comment) {
  let body = comment.slice(comment.indexOf('<!--') + 4);
  for (const end of COMMENT_ENDS) if (body.endsWith(end)) body = body.slice(0, -end.length);
  return body.trim();
}
/** Each comment in `text` as `<!-- body -->`; one left open runs to the end of `text`. */
function commentsIn(text) {
  const out = [];
  let at = text.indexOf('<!--');
  while (at !== -1) {
    const ends = COMMENT_ENDS.map((e) => [text.indexOf(e, at + 4), e]).filter(([i]) => i !== -1).sort((a, b) => a[0] - b[0]);
    const stop = ends.length ? ends[0][0] + ends[0][1].length : text.length;
    out.push(`<!-- ${commentBody(text.slice(at, stop))} -->`);
    at = text.indexOf('<!--', stop);
  }
  return out;
}
/** The comments a line holds when the line is nothing but comments (one or several), else none. Such a line is something an author copies, wherever it sits. */
function ownLineComments(line) {
  const t = line.trim();
  if (!t.startsWith('<!--') || !COMMENT_ENDS.some((e) => t.endsWith(e))) return [];
  return commentsIn(t);
}
const INLINE = new RegExp(`\`(${ALT})[ \\t]*:`, 'g');
const CODE_SPAN = /`([^`\n]+)`/g;
/** The retired comment spellings a code span shows: a comment (`<!-- _class: kpi -->`, `# T <!-- footer: x`) or a key (`_class:`). */
function retiredInSpan(span) {
  const out = [];
  for (const comment of commentsIn(span)) {
    const key = retiredComment(comment);
    if (key) out.push(key);
  }
  const k = /^(_[\w-]+)[ \t]*:/.exec(span.trim());
  if (k && !span.includes('<!--')) {
    const key = retiredComment(`<!-- ${k[1]}: x -->`);
    if (key) out.push(key);
  }
  return out;
}
const BARE = new RegExp(`(?<![\\w-])(${ALT})[ \\t]*:`, 'g');
const FENCE = /^[ \t]*(`{3,}|~{3,})/;
// A fence whose body is settings or a deck: a bare `key:` line in one is something an author copies.
const SETTINGS_FENCE = /^[ \t]*(?:`{3,}|~{3,})[ \t]*(?:(?:md|markdown|lfm|lattice|html)(?:[ \t].*)?)?$/i;
const YAML_FENCE = /^[ \t]*(?:`{3,}|~{3,})[ \t]*(?:yaml|yml)\b/i;
const UNIT_START = /^[ \t]*(?:[-*+][ \t]|\d+\.[ \t]|\|)/;

/**
 * Every retired key a Markdown text teaches, as `{ line, key, shape }`. A mention its paragraph marks as history is
 * left out; a front-matter line never is.
 * @param {string} text
 * @returns {{ line: number, key: string, shape: 'front-matter' | 'inline' }[]}
 */
function retiredKeys(text) {
  const out = [];
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  // Paragraph id per line: a blank line, a fence line, a list item or a table row starts a new one.
  const unit = [];
  let id = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '' || FENCE.test(lines[i]) || UNIT_START.test(lines[i])) id++;
    unit[i] = id;
  }
  const cued = new Set();
  lines.forEach((line, i) => {
    if (isCue(line)) cued.add(unit[i]);
  });
  let inFence = false;
  let inYaml = false; // inside a ```yaml fence: every line is a settings line, with or without `---`
  let inDeck = false; // inside an unlabeled, ```md or ```markdown fence: a key at the fence's indent is a settings line
  let fenceIndent = '';
  let inFm = false;
  // True at the top of the file and right after a fence opens: the only places a `---` line opens front matter.
  let atStart = true;
  lines.forEach((line, i) => {
    const t = line.trim();
    if (inFm || (inYaml && !FENCE.test(line))) {
      if (t === '---') inFm = false;
      else {
        const m = FM_LINE.exec(line);
        if (m) out.push({ line: i + 1, key: m[1], shape: 'front-matter' });
      }
      return;
    }
    if (inDeck && !FENCE.test(line) && line.startsWith(fenceIndent) && /^[^ \t]/.test(line.slice(fenceIndent.length))) {
      const m = FM_LINE.exec(line);
      if (m) out.push({ line: i + 1, key: m[1], shape: 'front-matter' });
    }
    // A retired comment on its own line is copyable wherever it sits: any fence, any indent, or raw in the source an
    // agent reads.
    const owned = ownLineComments(line).map(retiredComment).filter(Boolean);
    for (const key of owned) out.push({ line: i + 1, key, shape: 'front-matter' });
    const ck = owned.length > 0;
    if (!cued.has(unit[i])) {
      for (const m of line.matchAll(INLINE)) out.push({ line: i + 1, key: m[1], shape: 'inline' });
      if (!ck) for (const m of line.matchAll(CODE_SPAN)) for (const key of retiredInSpan(m[1])) out.push({ line: i + 1, key, shape: 'inline' });
    }
    if (t === '') return;
    if ((t === '---' && atStart) || /=\s*`---$/.test(t)) inFm = true;
    if (FENCE.test(line)) {
      inFence = !inFence;
      inYaml = inFence && YAML_FENCE.test(line);
      inDeck = inFence && !inYaml && SETTINGS_FENCE.test(line);
      fenceIndent = inFence ? /^[ \t]*/.exec(line)[0] : '';
      atStart = inFence;
    } else atStart = false;
  });
  return out;
}

/** The sentence holding `at`: from the last `. ` before it to the next one after it. */
function sentenceAround(text, at) {
  const start = text.lastIndexOf('. ', at) + 1;
  const end = text.indexOf('. ', at);
  return text.slice(start, end === -1 ? text.length : end);
}

/**
 * Every retired key a plain-text string teaches as a bare `key:`, unless its sentence marks it as history.
 * @param {string} text
 * @returns {string[]} the keys, one per mention
 */
function bareRetiredKeys(text) {
  return [...text.matchAll(BARE)].filter((m) => !isCue(sentenceAround(text, m.index))).map((m) => m[1]);
}

/** The findings in one source file, as `{ line, key, shape }`. */
function scanFile(kind, file) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (kind === 'markdown') return retiredKeys(text);
  const lines = text.split('\n');
  if (kind === 'text') {
    return lines.flatMap((l, i) => bareRetiredKeys(l).map((key) => ({ line: i + 1, key, shape: 'bare' })));
  }
  // chat: every `chat` string in the use-case JSON, reported at the line that carries it.
  const out = [];
  const walk = (node, name) => {
    if (typeof node === 'string') {
      if (name !== 'chat') return;
      const line = lines.findIndex((l) => l.includes(JSON.stringify(node).slice(1, 60))) + 1;
      for (const key of bareRetiredKeys(node)) out.push({ line, key, shape: 'bare' });
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, Array.isArray(node) ? name : k);
    }
  };
  walk(JSON.parse(text), '');
  return out;
}

function sourceFiles() {
  return SOURCES.flatMap(({ kind, specs, keep }) =>
    execFileSync('git', ['ls-files', '-z', '--', ...specs], { cwd: ROOT, encoding: 'utf8' })
      .split('\0')
      .filter((f) => keep.test(f))
      .map((file) => ({ kind, file })),
  );
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

test('a mention its paragraph marks as history passes; a front-matter block never does', () => {
  // The cue sits on another line of the same paragraph.
  assert.deepEqual(retiredKeys('`fit:` replaced `guards:` in September.\nSo `guards: strict`\nbecomes `fit: trim`.\n'), []);
  // A cue in the NEXT paragraph, list item or table row does not excuse this one.
  assert.equal(retiredKeys('Use `guards: strict`.\n\nThe old one is gone.\n').length, 1);
  assert.equal(retiredKeys('- Use `guards: strict`.\n- The old one is gone.\n').length, 1);
  assert.equal(retiredKeys('| `guards:` | the fit policy |\n| `x:` | renamed |\n').length, 1);
  // A ```yaml fence is a settings block with or without `---`.
  assert.deepEqual(retiredKeys('Add:\n\n```yaml\npaginate: true\n```\n'), [{ line: 4, key: 'paginate', shape: 'front-matter' }]);
  // A deck fence with no `---` still teaches a bare key line.
  assert.deepEqual(retiredKeys('```markdown\npaginate: true\n\n## A\n```\n'), [{ line: 2, key: 'paginate', shape: 'front-matter' }]);
  // A deck fence indented under a list item: the key sits at the fence's own indent.
  assert.deepEqual(retiredKeys('1. Start with:\n   ```markdown\n   paginate: true\n   ```\n'), [{ line: 3, key: 'paginate', shape: 'front-matter' }]);
  // A loose phrase elsewhere in the sentence is not a cue.
  assert.equal(retiredKeys('Unknown keys are ignored, so set `fonts: used` on every deck.\n').length, 1);
  // "becomes", "is now" and "instead of" are cues only between two code spans: old `a:` becomes new `b:`.
  assert.equal(retiredKeys('A new deck becomes numbered with `paginate: true`.\n').length, 1);
  assert.equal(retiredKeys('Use `paginate: true` instead of a page-number comment.\n').length, 1);
  assert.deepEqual(retiredKeys('`paginate: true` becomes `pagination: true`.\n'), []);
  // "The old `marks:` key" names the key between "old" and its noun.
  assert.deepEqual(retiredKeys('The old `paginate:` key, which split in two.\n'), []);
  // A retired directive comment: in a deck fence it is a settings line; inline it needs a cue.
  assert.deepEqual(retiredKeys('```markdown\n<!-- _class: title -->\n\n# A\n```\n'), [{ line: 2, key: '_class', shape: 'front-matter' }]);
  assert.equal(retiredKeys('Put `<!-- _class: kpi -->` at the top of the slide.\n').length, 1);
  assert.deepEqual(retiredKeys('The old `<!-- _class: kpi -->` comments are not read at all.\n'), []);
  // The comment form in any fence, indented, or raw; a heading in the same code span.
  for (const deck of ['```html\n<!-- _class: kpi -->\n```\n', '```markdown title="deck.md"\n<!-- _class: kpi -->\n```\n', '- Write:\n  ```\n    <!-- _class: kpi -->\n  ```\n', '<!-- _class: kpi -->\n']) {
    assert.equal(retiredKeys(deck).filter((h) => h.key === '_class').length, 1, deck);
  }
  assert.equal(retiredKeys('Write `# Revenue <!-- _class: kpi -->` on the slide.\n').length, 1);
  // The spec's own phrasing for forms a renderer ignores.
  assert.deepEqual(retiredKeys('- **Not read:** a directive comment (`<!-- _class: … -->`, `<!-- footer: … -->`).\n  A conformant renderer MUST NOT apply any of them.\n'), []);
  // Lowercase "must not apply" is ordinary prose, not the spec's cue.
  assert.equal(retiredKeys('Put `<!-- _class: kpi -->` on the slide; the theme must not apply its footer.\n').length, 1);
  // Two comments on one line: each is read.
  assert.equal(retiredKeys('```markdown\n<!-- _class: kpi --> <!-- _paginate: false -->\n```\n').length, 2);
  // A comment closed with `--!>`, HTML's other comment end, is still a comment.
  assert.equal(retiredKeys('```markdown\n<!-- _class: kpi --!>\n```\n').length, 1);
  // "not read" is a cue only after a code span in the same sentence.
  assert.equal(retiredKeys('Add `<!-- _class: kpi -->`. Notes are not read by the engine.\n').length, 1);
  // A common word is not a cue: "before" here is an instruction, not history.
  assert.equal(retiredKeys('Set `paginate: true` before the first slide.\n').length, 1);
  // A cue next to a block does not excuse the block.
  assert.equal(retiredKeys('The old block:\n```yaml\n---\nguards: on\n---\n```\n').length, 1);
  // Plain text: the sentence is the unit.
  assert.deepEqual(bareRetiredKeys('Reads the front-matter say: entry first. Then the slide.'), ['say']);
  assert.deepEqual(bareRetiredKeys('The say: map was renamed to @say. Then the slide.'), []);
});

test('no agent-facing source teaches a retired front-matter key outside the sanctioned mentions', () => {
  const found = [];
  const counts = {};
  for (const { kind, file } of sourceFiles()) {
    for (const h of scanFile(kind, file)) {
      if (SANCTIONED[file]?.keys[h.key] === undefined) found.push(`${file}:${h.line}: \`${h.key}:\` (${h.shape}) is retired`);
      counts[`${file}\0${h.key}`] = (counts[`${file}\0${h.key}`] || 0) + 1;
    }
  }
  assert.deepEqual(
    found,
    [],
    'Retired front-matter keys taught as current. Write the key that replaced it (lint:deck names it); to name the old ' +
      'key as history, say so in the same paragraph ("renamed", "the old", "becomes"); otherwise add the file to ' +
      `SANCTIONED with its reason:\n${found.join('\n')}`,
  );
  const drift = [];
  for (const [file, { keys }] of Object.entries(SANCTIONED)) {
    for (const [key, want] of Object.entries(keys)) {
      const got = counts[`${file}\0${key}`] || 0;
      if (got !== want) drift.push(`${file}: \`${key}:\` sanctioned ${want}, found ${got}`);
    }
  }
  assert.deepEqual(drift, [], `SANCTIONED counts drifted. A new mention needs its reason; a stale one is removed:\n${drift.join('\n')}`);
});

test('every source tree is read, so a moved file cannot silently drop out of the scan', () => {
  const files = sourceFiles();
  for (const { specs } of SOURCES) {
    for (const s of specs) {
      assert.ok(
        files.some(({ file }) => file === s || file.startsWith(`${s}/`)),
        `no file found under ${s}`,
      );
    }
  }
});
