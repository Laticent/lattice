/**
 * Unit: the CLI docs stay true to the CLI.
 *
 * Three surfaces restate the `lattice` command's options by hand: the docs-site
 * guide (`guides/cli.md`), the docs-site reference (`reference/cli.md`) and the
 * kit skill (`design/skills/cli.md`). Nothing generates them, so this test ties
 * them to the parsers that define the options:
 *
 *   1. COMPLETE — every option a parser accepts is in the reference. A new flag
 *      that ships undocumented fails here, not in a user's terminal.
 *   2. NO PHANTOMS — every `--option` the three docs mention is one some parser
 *      accepts. A renamed or removed flag fails here, not in a copied command.
 *
 * The flags are read from the parser SOURCE rather than from `--help`, because
 * the help text is itself hand-written and is exactly the kind of copy that
 * drifts.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const DOCS = {
  guide: 'docs/src/content/docs/guides/cli.md',
  reference: 'docs/src/content/docs/reference/cli.md',
  skill: 'design/skills/cli.md',
};

const FLAG_LITERAL = /'(--?[A-Za-z][\w-]*)'/g;

/** Every quoted flag literal in `src` between `start` and the first `end` after it. */
function flagsBetween(src, start, end, file) {
  const from = src.indexOf(start);
  assert.ok(from >= 0, `${file}: could not find ${JSON.stringify(start)}; the parser moved, so update this test`);
  const to = src.indexOf(end, from);
  assert.ok(to > from, `${file}: could not find ${JSON.stringify(end)} after the parser start`);
  return new Set([...src.slice(from, to).matchAll(FLAG_LITERAL)].map((m) => m[1]));
}

/** The options the `lattice` render command, `lattice packages` and `lattice video` accept. */
function latticeCliFlags() {
  const render = flagsBetween(read('lattice.js'), 'function parseArgs(argv)', 'return { flags, positional };', 'lattice.js');
  // --help / --version are handled before parseArgs runs.
  for (const f of ['-h', '--help', '-v', '--version']) render.add(f);
  const packages = flagsBetween(read('lib/packages/cli.js'), 'function parse(argv)', 'return { flags, pos };', 'lib/packages/cli.js');
  const videoSrc = read('lib/export/video-cli.mjs');
  const video = new Set([...videoSrc.matchAll(/a === '(--?[A-Za-z][\w-]*)'/g)].map((m) => m[1]));
  video.add('--help');
  return { render, packages, video };
}

/** The options of the repo helper scripts the docs also teach. */
function helperFlags() {
  const out = new Set();
  for (const f of ['tools/lint-deck.js', 'tools/new-slide.js', 'tools/export-marp.js']) {
    for (const m of read(f).matchAll(FLAG_LITERAL)) out.add(m[1]);
  }
  return out;
}

/** True when `doc` mentions `flag` as a whole token (so `--notes` does not match `--notes-icon`). */
function mentions(doc, flag) {
  const esc = flag.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  return new RegExp(`(^|[^\\w-])${esc}(?![\\w-])`).test(doc);
}

test('the parsers were found and read (the arms below look at something)', () => {
  const { render, packages, video } = latticeCliFlags();
  assert.ok(render.size >= 30, `found only ${render.size} render flags`);
  assert.ok(render.has('--player') && render.has('--image-format'));
  assert.ok(packages.has('--replace') && packages.has('--trust'));
  assert.ok(video.has('--fps') && video.has('--lead-in'));
});

test('COMPLETE: every option the CLI accepts is in the CLI reference', () => {
  const doc = read(DOCS.reference);
  const { render, packages, video } = latticeCliFlags();
  const missing = [...render, ...packages, ...video].filter((f) => !mentions(doc, f));
  assert.deepEqual(
    [...new Set(missing)].sort(),
    [],
    `${DOCS.reference} does not document: ${missing.join(', ')}. Add each to the right table there, ` +
      `and to ${DOCS.guide} if it serves a common task.`,
  );
});

test('NO PHANTOMS: every --option the CLI docs mention is one a parser accepts', () => {
  const { render, packages, video } = latticeCliFlags();
  const real = new Set([...render, ...packages, ...video, ...helperFlags()]);
  // The reference spells the value-syntax rule with a placeholder name.
  real.add('--flag');
  // Another tool's flag the docs quote verbatim: npm's, in the optional voice install
  // (`npm i --no-save kokoro-js …`) that `lattice video` and `--narrate` print in their help.
  real.add('--no-save');
  for (const [name, file] of Object.entries(DOCS)) {
    const doc = read(file);
    const named = new Set([...doc.matchAll(/(?:^|[^\w-])(--[A-Za-z][\w-]*)/g)].map((m) => m[1]));
    const phantom = [...named].filter((f) => !real.has(f)).sort();
    assert.deepEqual(phantom, [], `${file} (${name}) mentions options no parser accepts: ${phantom.join(', ')}`);
  }
});

test('the COMPLETE arm bites: a flag the parser gained is reported missing', () => {
  const doc = read(DOCS.reference);
  assert.equal(mentions(doc, '--not-a-real-flag'), false);
  // Whole-token matching: a documented `--notes-icon` must not count as `--notes`.
  assert.equal(mentions('use --notes-icon here', '--notes'), false);
  assert.equal(mentions('use `--notes` here', '--notes'), true);
});
