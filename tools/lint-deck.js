#!/usr/bin/env node
/**
 * Deck linter CLI — run the authoring footgun checks on a draft deck and
 * print structured, fix-oriented diagnostics. The author-facing companion
 * to the commit-time gate (test/unit/components/deck-authoring.test.js):
 * fast feedback while drafting, no Chromium render required.
 *
 * Usage:
 *   npm run lint:deck -- examples/my-deck.md          # one file
 *   npm run lint:deck -- 'examples/*.md'              # a glob (quote it)
 *   node tools/lint-deck.js examples/a.md examples/b.md
 *   node tools/lint-deck.js --strict examples/a.md    # warnings fail too
 *   node tools/lint-deck.js --json examples/a.md      # machine-readable
 *
 * Exit codes:
 *   0  clean (no errors; no warnings under --strict)
 *   1  one or more error-severity findings (or any finding under --strict)
 *   2  usage error (no files matched)
 */

const fs = require('node:fs');
const path = require('node:path');
const { lintText, buildVocab } = require('../lib/authoring/lint');
// review-core carries the advisory presentation suggestions (brevity / density /
// verbose chrome). Wiring it here means a CLI / agent author SEES density budgets
// too — not just the browser Drawing Board panel (2026-06-30 red-team fix). It is
// pure + render-free, so it costs nothing on the no-Chromium fast path.
const { reviewText } = require('../lib/authoring/review-core');
const { loadAll } = require('../lib/components');

const ROOT = path.join(__dirname, '..');

// Load the live manifests for the advisory review pass; never let a manifest
// problem break the linter — degrade to lint-only.
function safeLoadAll() {
  try { return loadAll(); } catch { return []; }
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
  walk(path.join(ROOT, 'lib', 'integrations'), (n) => n.endsWith('.gallery.md'));
  return [...new Set(out)];
}

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
    .replace(/`[^`]*`/g, ' '); // inline code
}

function expandArgs(patterns) {
  // Minimal glob: support a single `*` within a directory listing. Anything
  // without a `*` is taken literally. Keeps the tool dependency-free.
  const files = [];
  for (const pat of patterns) {
    if (!pat.includes('*')) { files.push(pat); continue; }
    const dir = path.dirname(pat);
    const base = path.basename(pat);
    const rx = new RegExp(`^${base.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (rx.test(name)) files.push(path.join(dir, name));
    }
  }
  return [...new Set(files)];
}

async function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const patterns = argv.filter((a) => !a.startsWith('--'));
  const strict = flags.has('--strict');
  const asJson = flags.has('--json');

  const files = (flags.has('--all') ? discoverDecks() : expandArgs(patterns)).filter((f) => fs.existsSync(f));
  if (!files.length) {
    process.stderr.write('lint:deck — no files matched. Usage: npm run lint:deck -- <file.md> [more.md] | --all\n');
    return 2;
  }

  // Build the catalog vocabulary once, reuse across all files.
  const vocab = buildVocab();
  // Advisory review pass (brevity / density / verbose chrome) — on by default for
  // explicit file args, OFF under --all (the gallery sweep deliberately stress-
  // tests density, so its suggestions are noise there) and skippable with
  // --no-review. Suggestions NEVER affect the exit code; they're guidance.
  const doReview = !flags.has('--all') && !flags.has('--no-review');
  const byName = new Map((doReview ? safeLoadAll() : []).map((m) => [m.name, m]));
  const bucketOf = (n) => { const m = byName.get(n); return m ? (m.bucket || m.function) : null; };
  const densityOf = (n) => byName.get(n)?.density || null;

  // Narration acronym-discovery pass (§16): list multi-letter all-caps tokens that read
  // letter-by-letter in narration because NOTHING expands them — not the built-in lexicon and
  // not the deck's own `acronyms:` registry — so the author can register the ones they want
  // spoken as words. Advisory (never affects the exit code). Off under --all (the gallery sweep
  // would list every acronym as noise). Uses the shared front-matter parser (HARD RULE #1) and
  // cadenza's normalizer (Node layer can require the built package; lint-core cannot).
  const doDiscover = !flags.has('--all');
  let acronymSpokenMap = null;
  let unmatchedAcronyms = null;
  if (doDiscover) {
    ({ acronymSpokenMap } = await import('../lib/core/resolve-captions.mjs'));
    ({ unmatchedAcronyms } = require('@slidewright/cadenza'));
  }

  const report = [];
  const suggestions = [];
  let errors = 0;
  let warnings = 0;

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const findings = lintText(source, { vocab });
    for (const f of findings) {
      if (f.severity === 'error') errors += 1;
      else warnings += 1;
      report.push({ file, ...f });
    }
    if (doReview) {
      for (const s of reviewText(source, { bucketOf, densityOf })) suggestions.push({ file, ...s });
    }
    if (doDiscover) {
      const unknown = unmatchedAcronyms(narrationText(source), { acronyms: acronymSpokenMap(source) });
      if (unknown.length) {
        suggestions.push({
          file,
          slide: 0, // deck-level (front-matter registry), not a single slide
          rule: 'narration-acronyms',
          message: `${unknown.length} all-caps token(s) will read letter-by-letter in narration: ${unknown.join(', ')}.`,
          fix: `Register any you want spoken as words in the deck's acronyms: front matter, e.g.\nacronyms:\n  ${unknown[0]}: <spoken expansion>`,
        });
      }
    }
  }

  if (asJson) {
    process.stdout.write(`${JSON.stringify({ files: files.length, errors, warnings, suggestions: suggestions.length, findings: report, reviewFindings: suggestions }, null, 2)}\n`);
    return errors > 0 || (strict && warnings > 0) ? 1 : 0;
  }

  for (const f of report) {
    const mark = f.severity === 'error' ? '✗' : '⚠';
    process.stderr.write(`${mark} ${f.file} · slide ${f.slide} · ${f.rule} [${f.classToken}]\n`);
    process.stderr.write(`    ${f.message}\n`);
    if (f.line) process.stderr.write(`    at: ${f.line}\n`);
    process.stderr.write(`    fix: ${f.fix.replace(/\n/g, '\n    ')}\n\n`);
  }
  if (suggestions.length) {
    process.stderr.write('Presentation suggestions (advisory — never block):\n');
    for (const s of suggestions) {
      process.stderr.write(`ℹ ${s.file} · slide ${s.slide} · ${s.rule}\n    ${s.message}\n`);
      if (s.fix) process.stderr.write(`    fix: ${s.fix.replace(/\n/g, '\n    ')}\n`);
    }
    process.stderr.write('\n');
  }
  if (!report.length && !suggestions.length) {
    process.stdout.write(`lint:deck — ${files.length} file(s) clean.\n`);
    return 0;
  }
  const tail = suggestions.length ? `, ${suggestions.length} suggestion(s)` : '';
  if (report.length) {
    process.stderr.write(`lint:deck — ${errors} error(s), ${warnings} warning(s)${tail} across ${files.length} file(s).\n`);
  } else {
    process.stdout.write(`lint:deck — no errors or warnings${tail} across ${files.length} file(s).\n`);
  }
  return errors > 0 || (strict && warnings > 0) ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}

module.exports = { main, expandArgs, discoverDecks, narrationText };
