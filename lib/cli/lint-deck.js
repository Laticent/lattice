#!/usr/bin/env node
/**
 * Deck linter, shared by `lattice lint` (the published CLI, dispatched from lattice.js) and this repo's
 * `npm run lint:deck` (tools/lint-deck.js, which adds the repo's own deck list and sanctions). It runs the
 * authoring footgun checks on a deck and prints structured, fix-oriented diagnostics, with no Chromium render.
 *
 * Usage:
 *   lattice lint deck.md                   # one file
 *   lattice lint 'decks/*.md'              # a glob (quote it)
 *   lattice lint --strict deck.md          # warnings fail too
 *   lattice lint --json deck.md            # machine-readable
 *   lattice lint --fix deck.md             # apply every machine fix, in place
 *
 * Exit codes:
 *   0  clean (no errors; no warnings under --strict)
 *   1  one or more error-severity findings (or any finding under --strict)
 *   2  usage error (no files matched, a named file that does not exist, or an unknown option)
 */
const fs = require('node:fs');
const path = require('node:path');
const { lintText, buildVocab } = require('../authoring/lint');
const { fixAllDetailed } = require('../authoring/lint-core');
// review-core carries the advisory presentation suggestions (brevity / density /
// verbose chrome). Wiring it here means a CLI / agent author SEES density budgets
// too — not just the browser Drawing Board panel (2026-06-30 red-team fix). It is
// pure + render-free, so it costs nothing on the no-Chromium fast path.
const { reviewText } = require('../authoring/review-core');
const { loadAll } = require('../components');

// Load the live manifests for the advisory review pass; never let a manifest
// problem break the linter — degrade to lint-only.
function safeLoadAll() {
  try { return loadAll(); } catch { return []; }
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

/**
 * Lint the decks `argv` names. `opts` lets a caller add what only it knows: `name` (the prefix on every line, with `usage` the command to show in a usage line,
 * `lattice lint` by default), `root` (the folder file names print relative to), `discover()` (the files `--all`
 * means; without it `--all` is a usage error), `exempt(rel, finding)` (true drops a finding the caller has
 * sanctioned for that deck) and `narrationText(source)` (the deck's spoken text, for the advisory acronym and
 * passthrough passes; tools/lint-deck.js keeps it, because its regexes are not yet linear enough for lib/'s
 * census, HARD RULE #32). The published CLI passes none of the last three.
 */
async function main(argv, opts = {}) {
  const NAME = opts.name || 'lattice lint';
  const ROOT = opts.root || process.cwd();
  const relFromRoot = (file) => path.relative(ROOT, file).split(path.sep).join('/');
  const exempt = typeof opts.exempt === 'function' ? opts.exempt : () => false;
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  if (flags.has('--help') || argv.includes('-h')) {
    process.stdout.write(`Usage: ${NAME} <deck.md> [more.md …] [--fix] [--strict] [--json] [--no-review] [--fit]

Check a deck for authoring mistakes without rendering it. Each finding names its slide, the rule, the line and
the fix.

  --fix        apply every machine fix in place, then lint what is left
  --strict     exit 1 on a warning too, not only on an error
  --json       print the findings as JSON
  --no-review  leave out the advisory presentation suggestions
  --fit        render each deck and name the smallest claim that makes a clipping slide fit (advisory)

Exit codes: 0 no error, 1 an error is left (or a warning, under --strict), 2 a usage error (no file matched,
a named file that does not exist, or an unknown option).
`);
    return 0;
  }
  // An unknown flag is a usage error, not a silent no-op: `--fxi` must not read as a run that fixed nothing.
  const KNOWN = ['--fix', '--strict', '--json', '--no-review', '--fit', ...(opts.discover ? ['--all'] : [])];
  const unknownFlags = [...flags].filter((f) => !KNOWN.includes(f) && f !== '--all');
  if (unknownFlags.length) {
    process.stderr.write(`${NAME} — unknown option ${unknownFlags.join(', ')}. Options: ${KNOWN.join(', ')}.\n`);
    return 2;
  }
  const patterns = argv.filter((a) => !a.startsWith('--'));
  const strict = flags.has('--strict');
  const asJson = flags.has('--json');
  // --fix: apply every machine-appliable finding in place, then lint what is left. The
  // SAME engine as the Studio's "Fix all" (lint-core `applyAllFixes`, which runs Squadra's fix
  // driver), so the two surfaces cannot disagree about what a fix does. It is how a deck written before a
  // grammar change migrates in one command — e.g. rule 16 rewriting an old verdict-grid
  // `[ ]` ("not met") to `[!]`.
  const fix = flags.has('--fix');

  if (flags.has('--all') && typeof opts.discover !== 'function') {
    process.stderr.write(`${NAME} — --all lints a Lattice checkout's own decks; name the deck files instead.\n`);
    return 2;
  }
  // A named file that does not exist is a usage error, so a typo never reads as a clean deck. A glob that matches
  // nothing is not named, so it adds nothing and is not one.
  const USAGE = opts.usage || NAME;
  const missing = flags.has('--all') ? [] : patterns.filter((p) => !p.includes('*') && !fs.existsSync(p));
  if (missing.length) {
    process.stderr.write(`${NAME} — no such file: ${missing.join(', ')}\n`);
    return 2;
  }
  const files = (flags.has('--all') ? opts.discover() : expandArgs(patterns)).filter((f) => fs.existsSync(f));
  if (!files.length) {
    process.stderr.write(`${NAME} — no files matched. Usage: ${USAGE} <file.md> [more.md]${opts.discover ? ' | --all' : ''}\n`);
    return 2;
  }

  // Build the catalog vocabulary once, reuse across all files.
  const vocab = buildVocab();
  // The zip plugins installed here (their names, fences and inline kinds): a deck that lists one is not wrong, and attributes
  // after one's fence name are ignored today. Read from the package store, as a render reads it.
  try {
    const home = require('../packages/home.js');
    // The plugins a render would USE: the same gate and shipped-name rule as lattice.js withInstalledPlugins.
    const { refusePackage } = require('./package-gate.js');
    const shipped = require('../plugins/registry.generated.js').PLUGINS.map((g) => g.name);
    const plugins = home.listInstalled(home.packagesRoot()).filter((p) => p.type === 'plugin' && p.ok && !shipped.includes(p.name) && !refusePackage(p.pkg, { forRender: true }));
    vocab.externalPlugins = plugins.map((p) => p.name);
    // Installed theme packages render (`theme: <name>`), so they are themes, not typos.
    const themes = home.listInstalled(home.packagesRoot()).filter((p) => p.type === 'theme' && p.ok).map((p) => p.name);
    if (themes.length) vocab.themeNames = [...new Set([...(vocab.themeNames || []), ...themes])];
    vocab.externalFenceOf = Object.fromEntries(plugins.map((p) => [p.name, Object.keys(p.pkg.manifest.contributes.fences ?? {})[0]]).filter(([, f]) => f));
    // Their inline kinds (`@kind{…}`, 2026-10-14-plugin-inline-door.md): a listed plugin's kind is not unknown.
    const { pluginInlineKinds } = require('../core/code-shape.mjs');
    vocab.externalInlineKinds = Object.fromEntries(plugins.map((p) => [p.name, pluginInlineKinds(p.pkg.manifest)]).filter(([, k]) => k.length));
  } catch {
    /* no store: no external plugins */
  }
  // Advisory review pass (brevity / density / verbose chrome) — on by default for
  // explicit file args, OFF under --all (the gallery sweep deliberately stress-
  // tests density, so its suggestions are noise there) and skippable with
  // --no-review. Suggestions NEVER affect the exit code; they're guidance.
  const doReview = !flags.has('--all') && !flags.has('--no-review');
  const skipped = [
    ...(doReview ? [] : [{ tier: 'review', why: flags.has('--all') ? 'the review tier (§3.9) is off under --all' : 'the review tier (§3.9) is off under --no-review' }]),
    // The fit checks need a browser and run only in the text report (`--fit`), after this JSON one returns.
    { tier: 'fit', why: 'the fit checks need a browser and run only in the text report, with --fit' },
  ];
  const byName = new Map((doReview ? safeLoadAll() : []).map((m) => [m.name, m]));
  const bucketOf = (n) => { const m = byName.get(n); return m ? (m.bucket || m.function) : null; };
  const densityOf = (n) => byName.get(n)?.density || null;

  // Narration acronym-discovery pass (§16): list multi-letter all-caps tokens that read
  // letter-by-letter in narration because NOTHING expands them — not the built-in lexicon and
  // not the deck's own `terms:` registry (or the `acronyms:` / `lexicon:` it absorbs) — so the author can register the ones they want
  // spoken as words. Advisory (never affects the exit code). Off under --all (the gallery sweep
  // would list every acronym as noise). Uses the shared front-matter parser (HARD RULE #1) and
  // cadenza's normalizer (Node layer can require the built package; lint-core cannot).
  const doDiscover = !flags.has('--all') && typeof opts.narrationText === 'function';
  const narrationText = opts.narrationText;
  let termsSpokenMap = null;
  let unmatchedAcronyms = null;
  let unspokenTokens = null;
  let AMBIGUOUS_TERMS = null;
  if (doDiscover) {
    ({ termsSpokenMap } = await import('../core/resolve-narration.mjs'));
    ({ unmatchedAcronyms, unspokenTokens } = require('@laticent/cadenza'));
    ({ AMBIGUOUS_TERMS } = require('../authoring/ambiguous-terms'));
  }

  const report = [];
  const suggestions = [];
  let errors = 0;
  let warnings = 0;

  for (const file of files) {
    // LINE ENDINGS: normalize at the READ, like `lattice.js` does, because a deck on
    // disk is author input and may be CRLF. Without it the same deck lints DIFFERENTLY by
    // encoding — measured on examples/a11y.md: LF reported verbose-eyebrow, verbose-key-insight
    // and no-ask; CRLF silently dropped verbose-eyebrow; lone CR dropped it and invented
    // title-incomplete. A Windows author got different advice for identical content.
    // `\r\n?` covers CRLF and classic-Mac lone CR; it is a no-op on LF.
    const raw = fs.readFileSync(file, 'utf8');
    let source = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    if (fix) {
      // Name what changed, by rule and slide — `--fix` applies every machine fix, not only rule
      // 16's, and the author should see each one — and every fix the driver refused, with why
      // (a fix inside a code fence, one that would change the slide count, one that did not
      // resolve its finding), so a refusal never reads as "nothing to fix".
      const { text: fixed, applied, skipped } = fixAllDetailed(source, vocab);
      for (const s of skipped) process.stderr.write(`${NAME} --fix — ${relFromRoot(file)} · slide ${s.slide} · ${s.rule} — not applied: ${s.reason}${s.detail ? ` (${s.detail})` : ''}\n`);
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
        process.stderr.write(`${NAME} --fix — rewrote ${relFromRoot(file)}\n`);
        for (const a of applied) process.stderr.write(`  · slide ${a.slide} · ${a.rule}\n`);
        source = fixed;
      }
    }
    const findings = lintText(source, { vocab })
      // A finding the caller sanctions for this deck (the repo's subject decks, HARD RULE #29's glyph decks).
      .filter((f) => !exempt(relFromRoot(file), f));
    // `asset:<name>` is the Library's name in the Studio and a file in `assets/` beside the deck in the CLI
    // (lib/export/deck-assets.js). The linter is fs-free, so the folder check lives here, with the file system.
    {
      const { buildAssetUrls, assetRefs, ASSET_FOLDER } = require('../export/deck-assets');
      const deckDir = path.dirname(path.resolve(file));
      const have = buildAssetUrls(deckDir, require('../core/file-confine').createFileConfiner([deckDir])).urls;
      const seen = new Set();
      for (const ref of assetRefs(source)) {
        if (Object.hasOwn(have, ref.name) || seen.has(ref.name)) continue;
        seen.add(ref.name);
        findings.push({
          slide: ref.slide, rule: 'asset-missing', severity: 'warning', line: `asset:${ref.name}`,
          message: `\`asset:${ref.name}\` names no file in ${ASSET_FOLDER}/ beside this deck (a symlink out of the deck folder does not count), so the CLI draws the missing-picture stand-in.`,
          fix: `Put a picture named ${ref.name}.jpg (or .png, .webp, .svg …) in ${ASSET_FOLDER}/ beside the deck, or fix the name (lowercase letters, digits, - and _).`,
        });
      }
    }
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
      let unknown = unmatchedAcronyms(narrationText(source), { terms: termsSpokenMap(source) })
        .filter((t) => !COMMON_INITIALISMS.has(t)); // format/web initialisms read fine letter-by-letter
      // A token with more than one known reading is NEVER expanded by the built-in dictionary; the
      // deck must say which one it means. Name the readings, so the author picks instead of guessing.
      for (const t of unknown.filter((u) => Object.hasOwn(AMBIGUOUS_TERMS, u))) {
        const readings = AMBIGUOUS_TERMS[t];
        suggestions.push({
          file,
          slide: 0,
          rule: 'narration-acronym-ambiguous',
          severity: 'suggestion',
          message: `\`${t}\` has more than one meaning (${readings.join('; ')}), so it is read letter by letter until the deck says which.`,
          fix: `Add the one you mean to the deck's terms: front matter, e.g.\nterms:\n  ${t}: { expansion: ${readings[0]} }`,
        });
      }
      unknown = unknown.filter((u) => !Object.hasOwn(AMBIGUOUS_TERMS, u));
      if (unknown.length) {
        suggestions.push({
          file,
          slide: 0, // deck-level (front-matter registry), not a single slide
          rule: 'narration-acronyms',
          severity: 'suggestion',
          message: `${unknown.length} all-caps token(s) will read letter-by-letter in narration: ${unknown.join(', ')}.`,
          fix: `Say how you want any of them spoken in the deck's terms: front matter, e.g.\nterms:\n  ${unknown[0]}: { expansion: <what it stands for>, pronounce: <how to say it> }\nA plain value (${unknown[0]}: <spoken form>) is what the voice says.`,
        });
      }
      // The SIBLING discovery pass (§P3): slash, ratio and identifier shapes that reach the
      // voice as glyphs because the normalizer deliberately has no rule for them — a slash
      // means a ratio, a rate, a date OR an alternative, and guessing reads worse than the
      // glyph. The author knows which one they meant, so this coaches rather than decides.
      // Advisory, like the acronym pass beside it, and off under --all for the same reason.
      // See engineering/decisions/2026-09-21-token-passthrough-coaching.md.
      const unspoken = unspokenTokens(narrationText(source), { terms: termsSpokenMap(source) });
      if (unspoken.length) {
        suggestions.push({
          file,
          slide: 0, // deck-level (front-matter registry), not a single slide
          rule: 'narration-passthrough',
          severity: 'suggestion',
          message: `${unspoken.length} token(s) will read as glyphs in narration, because a slash or a colon means several different things and the normalizer will not guess: ${unspoken.join(', ')}.`,
          fix: `Say how you want each one read, in the deck's terms: front matter, e.g.\nterms:\n  "${unspoken[0]}": <spoken form>\nA ratio reads "x to y", a rate reads "x per y", an alternative reads "x or y" — only you know which.`,
        });
      }
    }
  }

  if (asJson) {
    // Diagnostics 1.0 §1.2, the report: the protocol version, what was checked (every slide of each file, against the
    // rules of these LFM parts), then the findings. Silence in `findings` means clean only for what `coverage` names.
    const envelope = {
      version: '1.0',
      scope: { files: files.map((f) => { const rel = path.relative(process.cwd(), f); return rel && !rel.startsWith('..') ? rel : f; }), slides: 'all' },
      coverage: {
        profiles: ['core', 'presentation', 'notation', 'lens', 'timing'],
        // Diagnostics 1.0 §1.1: a tier this run left out is listed, so an empty `findings` is not read as a pass for it.
        ...(skipped.length ? { skipped } : {}),
      },
    };
    process.stdout.write(`${JSON.stringify({ ...envelope, files: files.length, errors, warnings, suggestions: suggestions.length, findings: report, reviewFindings: suggestions }, null, 2)}\n`);
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
  // --fit: render each deck and, for every slide that clips, name the smallest `claim` that makes it fit, CHECKED by
  // rendering it again (lib/cli/fit-grace.js, the same check the export prints under its overflow warnings). Lint
  // itself never renders, so this is the opt-in that does; it advises and never changes the exit code.
  if (flags.has('--fit')) {
    const grace = require('./fit-grace.js');
    for (const file of files) {
      // A render that fails (no browser, a broken deck) is reported and skipped: the lint report below still prints and
      // the exit code is still the lint's (review of #3362: an uncaught throw here lost both).
      let lines;
      try {
        lines = grace.describe(grace.plan(fs.readFileSync(file, 'utf8'), { dir: path.dirname(path.resolve(file)) }));
      } catch (e) {
        process.stderr.write(`${file} · fit: not checked (${String(e.message).split('\n')[0]}).\n`);
        continue;
      }
      process.stderr.write(lines.length ? `${file} · fit\n${lines.join('\n')}\n\n` : `${file} · fit: nothing clips.\n`);
    }
  }
  if (!report.length && !suggestions.length) {
    process.stdout.write(`${NAME} — ${files.length} file(s) clean.\n`);
    return 0;
  }
  const tail = suggestions.length ? `, ${suggestions.length} suggestion(s)` : '';
  if (report.length) {
    process.stderr.write(`${NAME} — ${errors} error(s), ${warnings} warning(s)${tail} across ${files.length} file(s).\n`);
  } else {
    process.stdout.write(`${NAME} — no errors or warnings${tail} across ${files.length} file(s).\n`);
  }
  return errors > 0 || (strict && warnings > 0) ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => { process.stderr.write(`lattice lint — ${err?.stack || err}\n`); process.exit(1); },
  );
}

module.exports = { main, expandArgs };
