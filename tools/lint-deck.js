#!/usr/bin/env node
/**
 * `npm run lint:deck` — this repo's deck linter. The linter itself is lib/cli/lint-deck.js, the same one the
 * published CLI runs as `lattice lint`; this wrapper adds what only a Lattice checkout has: `--all` (every
 * deck the repo ships, below) and the sanctions that drop one rule on one deck (HARD RULE #29's glyph decks,
 * read from the ownership gate, and tools/lint-subject-decks.js).
 *
 * Usage:
 *   npm run lint:deck -- examples/my-deck.md          # one file
 *   npm run lint:deck -- 'examples/*.md'              # a glob (quote it)
 *   node tools/lint-deck.js --strict examples/a.md    # warnings fail too
 *   node tools/lint-deck.js --json examples/a.md      # machine-readable
 *   node tools/lint-deck.js --fix examples/a.md       # apply every machine fix, in place
 *   node tools/lint-deck.js --all                     # every deck in the repo
 *
 * Exit codes: 0 clean, 1 errors (or any finding under --strict), 2 usage error.
 */
const fs = require('node:fs');
const path = require('node:path');
const core = require('../lib/cli/lint-deck');

const ROOT = path.join(__dirname, '..');

// Read lazily and defensively: check-ownership.js is a heavy module, and a
// checkout that somehow cannot load it should still lint (the sanction only
// ever REMOVES a finding, so an empty set is the strict, not the lax, default).
const { isSubjectFinding } = require('./lint-subject-decks');
let glyphExemptDecksCache = null;
function glyphExemptDeckSet() {
  if (glyphExemptDecksCache) return glyphExemptDecksCache;
  try {
    const { SANCTIONED_GLYPH_DECKS } = require('./check-ownership.js');
    glyphExemptDecksCache = new Set(SANCTIONED_GLYPH_DECKS.map((d) => d.file));
  } catch {
    glyphExemptDecksCache = new Set();
  }
  return glyphExemptDecksCache;
}

/**
 * Discover every hand-authored + generated deck in the repo: examples, the
 * worked exemplar decks (exemplars/ — the Drafting picker serves these live, so
 * they stay gate-clean like any shipped deck), the baseline decks, and every
 * bucket/component/integration *.gallery.md.
 * Used by --all so CI can lint the whole tree in one invocation.
 */
function discoverDecks() {
  const out = [];
  const walk = (dir, test) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, test);
      else if (test(e.name)) out.push(full);
    }
  };
  walk(path.join(ROOT, 'examples'), (n) => n.endsWith('.md'));
  walk(path.join(ROOT, 'exemplars'), (n) => n.endsWith('.md'));
  walk(path.join(ROOT, 'test', 'integration', 'baseline-decks'), (n) => n.endsWith('.md'));
  walk(path.join(ROOT, 'lib', 'components'), (n) => n.endsWith('.gallery.md'));
  // A plugin's kinds keep their galleries beside them (lib/plugins/<plugin>/kinds/<name>/).
  walk(path.join(ROOT, 'lib', 'plugins'), (n) => n.endsWith('.gallery.md'));
  walk(path.join(ROOT, 'lib', 'integrations'), (n) => n.endsWith('.gallery.md'));
  return [...new Set(out)];
}

// A deck whose typed glyphs ARE the subject is exempt from the glyph rule and from nothing else (HARD RULE #29):
// examples/speech-symbols.md proves the read-aloud lexicon pronounces them, and the glyph-substitution fixture
// measures the very failure the rule exists to prevent. The list is READ from the ownership gate, never repeated
// (HARD RULE #1). A deck whose warning is its subject (tools/lint-subject-decks.js) is exempt from that one rule.
const exempt = (rel, f) => (f.rule === 'typed-shape-glyph' && glyphExemptDeckSet().has(rel)) || isSubjectFinding(rel, f.rule);

// Approximate a deck's NARRATED text for acronym discovery: drop the front-matter block,
// fenced code, and inline code — their all-caps tokens (HTTP, JSON, enum constants) aren't
// spoken. What's left — prose plus note/caption comment bodies — is what read-along narrates.
// The lazy `[\s\S]*?` between literal fences is the linear match-to-delimiter idiom (no nested
// quantifier). Advisory hint, so an approximation is fine.
function narrationText(source) {
  return String(source ?? '')
    .replace(/^﻿?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, '') // front matter
    .replace(/```[\s\S]*?```/g, ' ') // fenced code (backtick)
    .replace(/~~~[\s\S]*?~~~/g, ' ') // fenced code (tilde)
    .replace(/`[^`]*`/g, ' ') // inline code
    // A pane marker (`<!-- _pane: list -->`, the `pane:` / `panes:` alias) and a `_class` that
    // names a pane layout (`columns ratio-60-40`) are layout, not speech; other comments stay, because
    // speaker notes are narration.
    .replace(/<!--\s*_?panes?:[^<>]*-->/g, ' ')
    .replace(/<!--\s*_class\s*:[^<>]*\b(?:columns|rows)\b[^<>]*-->/g, ' ')
    // The same in a slide record (`<!-- @meta{pane=list} -->`, `<!-- @meta{layout=columns} -->`), so a deck reads the same
    // in either spelling; a record's other text stays, as a comment's does.
    .replace(/<!--\s*(?:@meta)?\{(?:(?!-->)[\s\S])*?\b(?:panes?\s*=|columns|rows)\b(?:(?!-->)[\s\S])*?-->/g, ' ')
    // A record's field names go, so its values split into words the way a comment's did: `footer="PMO …"` would
    // otherwise be one word and hide `PMO`, which `<!-- _footer: "PMO …" -->` reported (the meta sweep, slice D).
    .replace(/<!--\s*(?:@meta)?\{(?:(?!-->)[\s\S])*?-->/g, (rec) => rec.replace(/[\w-]+\s*=/g, ' '));
}

const main = (argv) => core.main(argv, { name: 'lint:deck', root: ROOT, discover: discoverDecks, exempt, narrationText });

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => { process.stderr.write(`lint:deck — ${err?.stack || err}\n`); process.exit(1); },
  );
}

module.exports = { main, expandArgs: core.expandArgs, discoverDecks, narrationText };
