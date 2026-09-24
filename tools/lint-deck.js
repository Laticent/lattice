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
 *   node tools/lint-deck.js --fix examples/a.md       # apply every machine fix, in place
 *
 * Exit codes:
 *   0  clean (no errors; no warnings under --strict)
 *   1  one or more error-severity findings (or any finding under --strict)
 *   2  usage error (no files matched)
 */

const fs = require('node:fs');
const path = require('node:path');
const { lintText, buildVocab } = require('../lib/authoring/lint');
const { applyAllFixes } = require('../lib/authoring/lint-core');
// review-core carries the advisory presentation suggestions (brevity / density /
// verbose chrome). Wiring it here means a CLI / agent author SEES density budgets
// too — not just the browser Drawing Board panel (2026-06-30 red-team fix). It is
// pure + render-free, so it costs nothing on the no-Chromium fast path.
const { reviewText } = require('../lib/authoring/review-core');
const { loadAll } = require('../lib/components');

const ROOT = path.join(__dirname, '..');

// Read lazily and defensively: check-ownership.js is a heavy module, and a
// checkout that somehow cannot load it should still lint (the sanction only
// ever REMOVES a finding, so an empty set is the strict, not the lax, default).
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
const relFromRoot = (file) => path.relative(ROOT, file).split(path.sep).join('/');

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

// Format / file / web initialisms that are CONVENTIONALLY spoken letter-by-letter ("P-D-F",
// "H-T-M-L") — flagging them as "register these to speak as words" would be wrong and trains
// authors to ignore the hint. So the discovery lint skips them; a genuinely deck-specific token
// (a company/product initialism) still surfaces. Kept deliberately tight, not a spell-out dump.
const COMMON_INITIALISMS = new Set([
  'PDF', 'HTML', 'VTT', 'PPTX', 'PNG', 'JPG', 'JPEG', 'SVG', 'GIF', 'CSV', 'CSS', 'JS', 'JSON',
  'XML', 'YAML', 'HTTP', 'HTTPS', 'URL', 'URI', 'API', 'SDK', 'CLI', 'UI', 'UX', 'FAQ', 'RSS',
  'SQL', 'PPT', 'DOC', 'DOCX', 'XLS', 'XLSX', 'TSV', 'MD', 'ID', 'OK',
]);

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
  // --fix: apply every machine-appliable finding in place, then lint what is left. The
  // SAME engine as the Studio's "Fix all" (lint-core `applyAllFixes`), so the two
  // surfaces cannot disagree about what a fix does. It is how a deck written before a
  // grammar change migrates in one command — e.g. rule 16 rewriting an old verdict-grid
  // `[ ]` ("not met") to `[!]`.
  const fix = flags.has('--fix');

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
  let lexiconMap = null;
  let unmatchedAcronyms = null;
  let unspokenTokens = null;
  if (doDiscover) {
    ({ acronymSpokenMap, lexiconMap } = await import('../lib/core/resolve-captions.mjs'));
    ({ unmatchedAcronyms, unspokenTokens } = require('@laticent/cadenza'));
  }

  const report = [];
  const suggestions = [];
  let errors = 0;
  let warnings = 0;

  for (const file of files) {
    // LINE ENDINGS: normalize at the READ, like `lattice-emulator.js` does, because a deck on
    // disk is author input and may be CRLF. Without it the same deck lints DIFFERENTLY by
    // encoding — measured on examples/a11y.md: LF reported verbose-eyebrow, verbose-key-insight
    // and no-ask; CRLF silently dropped verbose-eyebrow; lone CR dropped it and invented
    // title-incomplete. A Windows author got different advice for identical content.
    // `\r\n?` covers CRLF and classic-Mac lone CR; it is a no-op on LF.
    const raw = fs.readFileSync(file, 'utf8');
    let source = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    if (fix) {
      // Name what is about to change, by rule and slide, BEFORE rewriting — `--fix` applies
      // every machine fix, not only rule 16's, and the author should see each one.
      const planned = lintText(source, { vocab }).filter((f) => f.autofixable);
      const fixed = applyAllFixes(source, vocab);
      if (fixed !== source) {
        // Write back in the file's own encoding: its BOM and EACH LINE'S OWN ending, so a
        // fix is a diff on the lines it changed and nowhere else — CRLF, lone CR and a
        // mixed file alike. When a fix changes the line count (another rule's autofix may),
        // lines no longer pair up, so the file's most common ending is used throughout.
        const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : '';
        const ends = raw.replace(/^\uFEFF/, '').match(/\r\n|\r|\n/g) || [];
        const out = fixed.split('\n');
        let text;
        if (out.length === ends.length + 1) {
          text = out.map((l, i) => l + (i < ends.length ? ends[i] : '')).join('');
        } else {
          const tally = { '\n': 0, '\r\n': 0, '\r': 0 };
          for (const e of ends) tally[e]++;
          const eol = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
          text = fixed.replace(/\n/g, eol);
        }
        fs.writeFileSync(file, bom + text);
        process.stderr.write(`lint:deck --fix — rewrote ${relFromRoot(file)}\n`);
        for (const f of planned) process.stderr.write(`  · slide ${f.slide} · ${f.rule}\n`);
        source = fixed;
      }
    }
    const findings = lintText(source, { vocab })
      // A deck whose typed glyphs ARE the subject is exempt from the glyph rule
      // and from nothing else (HARD RULE #29). examples/speech-symbols.md proves
      // the read-aloud lexicon pronounces them; the glyph-substitution fixture
      // measures the very failure the rule exists to prevent; and one deck quotes
      // the retired gantt delimiter as the wrong input. Coaching them to convert
      // would be coaching them to delete what they test.
      //
      // The list is READ from the ownership gate, never repeated (HARD RULE #1) —
      // three consumers now honor one list: the gate counts against it, the
      // deck-lint-clean unit test skips against it, and `--strict` here would
      // otherwise fail the pre-push hook on decks the gate itself sanctions.
      .filter((f) => !(f.rule === 'typed-shape-glyph' && glyphExemptDeckSet().has(relFromRoot(file))));
    for (const f of findings) {
      // `info` / `suggestion` are the ADVISORY tier — they report something true about a
      // deliberate choice (a deck that opts into autosplit WILL have over-budget slides),
      // not a defect. Route them to the never-blocking suggestions channel, so `--strict`
      // stays a real gate for warnings instead of reddening on every intentional split.
      // Mirrors what the Playground already does (editor-diagnostics.js maps anything
      // below `warning` to the lowest tier).
      if (f.severity === 'info' || f.severity === 'suggestion') {
        suggestions.push({ file, ...f });
        continue;
      }
      if (f.severity === 'error') errors += 1;
      else warnings += 1;
      report.push({ file, ...f });
    }
    if (doReview) {
      for (const s of reviewText(source, { bucketOf, densityOf })) suggestions.push({ file, ...s });
    }
    if (doDiscover) {
      const unknown = unmatchedAcronyms(narrationText(source), { acronyms: acronymSpokenMap(source) })
        .filter((t) => !COMMON_INITIALISMS.has(t)); // format/web initialisms read fine letter-by-letter
      if (unknown.length) {
        suggestions.push({
          file,
          slide: 0, // deck-level (front-matter registry), not a single slide
          rule: 'narration-acronyms',
          message: `${unknown.length} all-caps token(s) will read letter-by-letter in narration: ${unknown.join(', ')}.`,
          fix: `Register any you want spoken as words in the deck's acronyms: front matter, e.g.\nacronyms:\n  ${unknown[0]}: <spoken expansion>`,
        });
      }
      // The SIBLING discovery pass (§P3): slash, ratio and identifier shapes that reach the
      // voice as glyphs because the normalizer deliberately has no rule for them — a slash
      // means a ratio, a rate, a date OR an alternative, and guessing reads worse than the
      // glyph. The author knows which one they meant, so this coaches rather than decides.
      // Advisory, like the acronym pass beside it, and off under --all for the same reason.
      // See engineering/decisions/2026-09-21-token-passthrough-coaching.md.
      const unspoken = unspokenTokens(narrationText(source), { lexicon: lexiconMap(source) });
      if (unspoken.length) {
        suggestions.push({
          file,
          slide: 0, // deck-level (front-matter registry), not a single slide
          rule: 'narration-passthrough',
          message: `${unspoken.length} token(s) will read as glyphs in narration, because a slash or a colon means several different things and the normalizer will not guess: ${unspoken.join(', ')}.`,
          fix: `Say how you want each one read, in the deck's lexicon: front matter, e.g.\nlexicon:\n  ${unspoken[0]}: <spoken form>\nA ratio reads "x to y", a rate reads "x per y", an alternative reads "x or y" — only you know which.`,
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
    // The bracket names the COMPONENT TOKEN a finding is about, and a rule is allowed to
    // have none: `focus-spec` / `focus-style` / `focus-steps` judge a `_focus` DIRECTIVE,
    // which belongs to the slide rather than to any one component, so they set no
    // `classToken` and this line printed a literal `[undefined]` at the author. Omit the
    // bracket instead of inventing a token — an empty `[]` would read as "no component",
    // which is a different claim from "this rule is not about a component".
    const token = f.classToken ? ` [${f.classToken}]` : '';
    process.stderr.write(`${mark} ${f.file} · slide ${f.slide} · ${f.rule}${token}\n`);
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
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => { process.stderr.write(`lint:deck — ${err?.stack || err}\n`); process.exit(1); },
  );
}

module.exports = { main, expandArgs, discoverDecks, narrationText };
