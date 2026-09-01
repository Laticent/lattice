#!/usr/bin/env node
/**
 * build-agent-kit — assemble dist/agent-kit/, the kit an LLM or coding agent
 * uses to author Lattice artifacts, published to the `dist-kits` branch.
 *
 * ORGANIZED BY TASK, not by file type. The first cut was a flat pile of ten
 * entries and the owner's verdict was that everything had been "shoved in there
 * and not thoughtfully". Four folders, each answering a question a person
 * actually has:
 *
 *   authoring/    I am writing a deck        canon (what good looks like), rules, primer
 *   components/   which layout, and how      the pick index + one file per component
 *   skills/       I am creating a NEW X      the seven design/skills, verbatim
 *   reference/    I am building a tool       the machine catalogs + the Studio's prompts
 *
 * WHAT THIS FIXES BEYOND LAYOUT. The kit could tell an agent WHICH component to
 * use and HOW to author it, and nothing at all about whether the resulting deck
 * was any good. `DECK_CANON` — the 925-token statement of one-idea-per-slide,
 * narrative arc, rhythm, restraint, and 18 named traps with their fixes — is sent
 * by the Studio chat on every single turn and was not in the kit. Neither were
 * the seven `design/skills/` files, which are already written to stand alone and
 * to say what good and bad look like for each artifact.
 *
 * Usage:
 *   node tools/build-agent-kit.mjs           # write dist/agent-kit/
 *   node tools/build-agent-kit.mjs --check   # exit 1 if the kit is stale
 *
 * WHY IT COPIES RATHER THAN RE-DERIVES. The catalogs are written by
 * `build-docs-portal.js` / `build-forms.js` / `build-concepts.js`; the
 * per-component docs by `build-component-docs.js`; the skills by hand in
 * `design/skills/`. This step COPIES all of them. A second derivation would be a
 * second source of truth (HARD RULE #1) and the failure would be silent — a kit
 * that disagrees with the engine it documents is worse than no kit. The skills
 * are hand-written rather than generated, so their copy is additionally pinned
 * byte-for-byte by `test/unit/tools/agent-kit-structure.test.js`.
 *
 * WHAT IT DOES NOT SHIP. The finish generator prompt (FINISH_SYSTEM) is computed
 * inside architect.ts, which imports `fuse.js` and `react` from the DOCS workspace.
 * Extracting it made a root-only `npm ci` fail — `prepare` runs this build, so the
 * whole install died. `skills/finish.md` teaches the same system more fully and a
 * repo test already reconciles the two, so the kit points there instead. Every
 * other module this generator loads was verified to have zero bare imports.
 *
 * WHY THE PRIMER SHARES THE STUDIO'S BUILDER. `authoring/primer.md` is the SAME
 * authoring primer the Studio chat injects, produced by calling the same two
 * functions it calls. Be exact about the scope, because the looser claim is
 * false: the Studio's full system turn is persona + DECK_CANON + EDIT_PROTOCOL +
 * this primer + a dynamic tail, and it injects the primer only on the cloud tier.
 * The primer BODY is shared byte-for-byte; the whole prompt is not. That is why
 * DECK_CANON now ships beside it rather than being alluded to.
 *
 * ORDER MATTERS. This step runs AFTER the docs-portal, forms and concepts steps —
 * it reads their output. `tools/build.js` places it accordingly.
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = path.join(ROOT, 'dist', 'docs');
const SKILLS_DIR = path.join(ROOT, 'design', 'skills');
const OUT_DIR = path.join(ROOT, 'dist', 'agent-kit');

const AUTHORING = 'authoring';
const REVIEW = 'review';
const COMPONENTS = 'components';
const SKILLS = 'skills';
const REFERENCE = 'reference';

const approxTokens = (b) => Math.round(b / 4);
const fmtTok = (b) => {
  const t = approxTokens(b);
  return t >= 1000 ? `~${(t / 1000).toFixed(t >= 10000 ? 0 : 1)}k` : `~${t}`;
};
const bytesOf = (files, key) => files.get(key)?.length || 0;

/**
 * One markdown TABLE CELL, from text this file does not control.
 *
 * Escape the BACKSLASH FIRST, then the pipe — the other order double-escapes,
 * and escaping the pipe alone (which is what shipped, and what CodeQL flagged as
 * two high-severity alerts) leaves a trailing `\` free to escape the table's own
 * delimiter and silently break the row. Newlines collapse for the same reason: a
 * cell cannot span lines.
 *
 * Latent rather than live today — no RUBRIC entry or CLAUDE.md rule title
 * currently contains either character — but the inputs are prose that anyone may
 * edit, and a broken table is exactly the kind of silent wrongness this kit is
 * meant not to ship.
 */
const mdCell = (v) =>
  String(v)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, ' ')
    .trim();

/** Catalogs copied verbatim from dist/docs/, with where each one lands. */
const CATALOGS = [
  {
    file: 'components.pick.md',
    to: `${COMPONENTS}/_index.md`,
  },
  {
    file: 'components.md',
    to: `${REFERENCE}/components.md`,
  },
  {
    file: 'components.json',
    to: `${REFERENCE}/components.json`,
  },
  {
    file: 'grammar.json',
    to: `${REFERENCE}/grammar.json`,
  },
  {
    file: 'forms.json',
    to: `${REFERENCE}/forms.json`,
  },
  {
    file: 'concepts.json',
    to: `${REFERENCE}/concepts.json`,
  },
];

/**
 * ONE FILE PER COMPONENT, plus the shared FAMILY contracts.
 *
 * Without these, an agent that knows it wants `matrix-2x2` has to read the whole
 * prose catalog (~107k tokens) to get one ~1.8k-token entry. The payload is the
 * component's own generated `<name>.docs.md` — the exact file HARD RULE #6
 * requires an author to open.
 *
 * Family docs (`lib/components/<bucket>/_<family>/`) are not components, so
 * `loadAll()` skips them — but 8 chart docs point AT chart-family for the
 * `.chart-frame` skeleton they all wrap in, so omitting it ships a dangling
 * pointer one level down.
 */
/**
 * Rewrite a copied doc's outbound references so they resolve INSIDE the kit.
 *
 * The component docs are written for someone standing in the repo, and the kit
 * copied them verbatim: 305 `../../<bucket>/<name>/<name>.docs.md` sibling
 * links, 62 pointers at `design/design-system.md §6.5` and 61 at a gallery PDF
 * — 428 references, none of which resolves for a reader who has no clone. That
 * is the kit's whole audience.
 *
 * A NOTE SAYING "MENTALLY REWRITE THIS PATH" IS NOT THE FIX. The kit shipped one
 * for a single such pointer and the other 428 stayed broken; the fix is to
 * rewrite the paths, and to pin link resolution in a test so a new one cannot
 * appear. Prose that merely NAMES an engine file ("the contrast is
 * `lib/shared/shared.docs.md`") is left alone — it is information, not an
 * instruction to open something the reader does not have.
 */
function relocate(text) {
  return (
    String(text)
      // A sibling component doc — `../../comparison/verdict-grid/verdict-grid.docs.md`
      // (and the `_family` directories) — is one flat file here.
      .replace(/\]\(\.\.\/\.\.\/[a-z-]+\/_?([a-z0-9-]+)\/\1\.docs\.md\)/g, '](./$1.md)')
      .replace(/\]\(\.\.\/\.\.\/[a-z-]+\/_([a-z0-9-]+)\/\1\.docs\.md\)/g, '](./_$1.md)')
      // The rendered-gallery PDFs are not in the kit (they are ~1 MB each and the
      // kit is text). Drop the sentence rather than leave a link to nothing.
      .replace(/^See \[[a-z0-9-]+\.gallery\.[a-z]+\.pdf\]\([^)]*\)[^\n]*\n/gm, '')
      // The universal-variant catalog now ships as authoring/modifiers.md. The
      // repo link was doubly dead here: the anchor still said `three-tiers` after
      // the section became four.
      .replace(
        /\[design\/design-system\.md §6\.5\]\([^)]*\)/g,
        `[the universal modifier catalog](../${AUTHORING}/modifiers.md)`,
      )
      // `components.pick.md` is generated for repo users and routes readers to a
      // path a kit consumer does not have.
      .replace(/`lib\/components\/<bucket>\/<name>\/<name>\.docs\.md`/g, '`./<name>.md`')
      // chart-family lists its members as a shell brace expansion over the repo
      // tree. Same file, flat, in the kit.
      .replace(/`lib\/components\/[a-z-]+\/\{[^}]*\}\/<name>\.docs\.md`/g, '`./<name>.md`')
      // HARD RULE numbers are the repo's internal index; the kit's reader has no
      // CLAUDE.md to resolve them against. Keep the requirement, drop the citation.
      .replace(/ — HARD RULE #6 requires that before you write the slide/g, ' — always read it before you write the slide')
      .replace(/, which HARD RULE #6 requires you to open before/g, ', which you should always open before')
      .replace(/ \(HARD RULE #5, lint[^)]*\)/g, '')
      .replace(/ \(HARD RULE #5\)/g, '')
  );
}

function componentDocs() {
  const { loadAll, manifestBucket } = require(path.join(ROOT, 'lib', 'components'));
  const out = [];
  for (const m of loadAll()) {
    const bucket = manifestBucket(m);
    const src = path.join(ROOT, 'lib', 'components', bucket, m.name, `${m.name}.docs.md`);
    if (!existsSync(src)) continue;
    out.push({ name: m.name, bucket, body: Buffer.from(relocate(readFileSync(src, 'utf8')), 'utf8') });
  }
  for (const bucket of readdirSync(path.join(ROOT, 'lib', 'components'))) {
    const bucketDir = path.join(ROOT, 'lib', 'components', bucket);
    let inner;
    try {
      inner = readdirSync(bucketDir);
    } catch {
      continue;
    }
    for (const dir of inner) {
      if (!dir.startsWith('_')) continue;
      const family = dir.slice(1);
      const src = path.join(bucketDir, dir, `${family}.docs.md`);
      if (!existsSync(src)) continue;
      out.push({ name: `_${family}`, bucket, family: true, body: Buffer.from(relocate(readFileSync(src, 'utf8')), 'utf8') });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** The seven hand-written skills, copied verbatim from design/skills/. */
function skillDocs() {
  return readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => ({ name: f, body: readFileSync(path.join(SKILLS_DIR, f)) }));
}

/**
 * review/check.mjs — the INDEPENDENT checker, and the only executable in the kit.
 *
 * An LLM reviewing its own draft against a rubric it just read will declare it
 * fine; that is the failure this exists to stop. So the kit ships the REAL
 * reviewer — the same `reviewText` the Studio runs on decks its own model
 * writes — as one dependency-free file. `node check.mjs deck.md` prints
 * structured findings in ~0.1s at ZERO token cost, which is the whole point: an
 * agent writes once, checks deterministically, fixes what is named, ships.
 *
 * It wires the kit's OWN `reference/components.json` for `bucketOf`/`densityOf`.
 * That is not optional polish — without the catalog the reviewer silently skips
 * a whole class: a matrix-2x2 element at 28 words against a ~10-word budget is
 * found only when the catalog is passed (measured).
 *
 * ITS FIRST-PARTY GRAPH IS lib/ → lib/ ONLY, and that is the load-bearing half.
 * An earlier attempt to bundle a DOCS module broke `npm ci` for everyone,
 * because `prepare` runs this build and the docs workspace's deps are not
 * installed by a root-only install. Verified by running this build with
 * `docs/node_modules` hidden.
 *
 * It is NOT dependency-free. review-core requires markdown-it, so esbuild inlines
 * it and five transitive deps (linkify-it, mdurl, uc.micro, punycode.js, entities)
 * — root deps, so `npm ci` is safe, but MIT/BSD-2-Clause code whose notices the
 * bundler strips. `thirdPartyLicenses()` restores them from the packages' own
 * LICENSE files and throws if one cannot be found. An earlier revision of this
 * docblock said "lib/ → lib/ only" full stop, and the kit published with no
 * notices and no LICENSE at all on the strength of it.
 */
/** The universal + semi-universal modifier names, for the kit checker's vocab. */
function universalModifierNames() {
  const { UNIVERSAL_VARIANTS, SEMI_UNIVERSAL_VARIANTS } = require(path.join(ROOT, 'lib', 'components', 'index.js'));
  return [...new Set([...(UNIVERSAL_VARIANTS || []), ...(SEMI_UNIVERSAL_VARIANTS || [])])].sort();
}

function reviewBundle() {
  const tmp = mkdtempSync(path.join(tmpdir(), 'lattice-review-'));
  try {
    const entry = path.join(tmp, 'entry.mjs');
    const out = path.join(tmp, 'check.mjs');
    writeFileSync(
      entry,
      [
        "import { readFileSync } from 'node:fs';",
        "import { dirname, join } from 'node:path';",
        "import { fileURLToPath } from 'node:url';",
        `import { reviewText, RUBRIC } from ${JSON.stringify(path.join(ROOT, 'lib', 'authoring', 'review-core.js'))};`,
        `import { lintTextWith } from ${JSON.stringify(path.join(ROOT, 'lib', 'authoring', 'lint-core.js'))};`,
        '',
        // The universal modifier names, embedded as a literal. They live in
        // lib/components/index.js, which reads the manifest tree off disk and so
        // cannot be bundled — but the VALUES are static, and lintTextWith only
        // wants `{ names, modifiers }`.
        `const UNIVERSALS = ${JSON.stringify(universalModifierNames())};`,
        '',
        '// The catalog lives beside this file in the kit. Without it neither half',
        '// can do its job: the reviewer loses per-element word budgets, and the',
        '// linter loses the component names it checks `_class` against.',
        'function catalogLookups() {',
        '  try {',
        "    const here = dirname(fileURLToPath(import.meta.url));",
        "    const raw = readFileSync(join(here, '..', 'reference', 'components.json'), 'utf8');",
        '    const all = JSON.parse(raw).components;',
        '    const byName = new Map(all.map((c) => [c.name, c]));',
        '    return {',
        '      bucketOf: (n) => byName.get(n)?.bucket || null,',
        '      densityOf: (n) => byName.get(n)?.density || null,',
        '      vocab: {',
        '        names: new Set(all.map((c) => c.name)),',
        '        modifiers: new Set([...UNIVERSALS, ...all.flatMap((c) => c.variants || [])]),',
        '      },',
        '      found: byName.size,',
        '    };',
        '  } catch {',
        '    return { found: 0 };',
        '  }',
        '}',
        '',
        '// lint-core writes for someone standing in the repo; two of its fix strings',
        '// name paths a kit reader does not have.',
        'function kitPaths(text) {',
        '  return String(text)',
        "    .replace(/dist\\/docs\\/components\\.json/g, 'reference/components.json')",
        "    .replace(/design\\/design-system\\.md §6\\.5/g, 'authoring/modifiers.md');",
        '}',
        '',
        '// The two halves answer different questions and a deck needs both. The',
        '// LINTER asks whether the deck is even valid — an invented `_class` is the',
        '// single most likely mistake a model makes here, and the reviewer cannot',
        '// see it. The REVIEWER asks whether the deck is any good. Shipping only the',
        '// second told a reader "the floor is met" over a deck that would not render.',
        'export function review(source) {',
        '  const { bucketOf, densityOf, vocab } = catalogLookups();',
        '  const lint = vocab ? lintTextWith(source, vocab) : [];',
        '  const findings = [',
        '    ...lint.map((f) => ({ ...f, fix: f.fix ? kitPaths(f.fix) : f.fix, message: kitPaths(f.message) })),',
        '    ...reviewText(source, { bucketOf, densityOf }),',
        '  ];',
        "  const rank = { error: 0, warning: 1, suggestion: 2 };",
        '  return findings.sort(',
        '    (a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3) || (a.slide || 0) - (b.slide || 0),',
        '  );',
        '}',
        'export { RUBRIC };',
        '',
        // A BASENAME match is not an identity check: a consumer wrapper named
        // check.mjs (the obvious name) imported this module and got the CLI,
        // which then exited the process instead of returning. realpath both
        // sides — the same idiom this generator uses on itself.
        "import { realpathSync } from 'node:fs';",
        'const sameFile = (a, b) => {',
        '  try {',
        '    return realpathSync(a) === realpathSync(b);',
        '  } catch {',
        '    return false;',
        '  }',
        '};',
        'const invoked = process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url));',
        'if (invoked) {',
        '  const args = process.argv.slice(2);',
        "  const strict = args.includes('--strict');",
        "  const asJson = args.includes('--json');",
        "  const files = args.filter((a) => !a.startsWith('--'));",
        '  if (!files.length) {',
        '    console.error([',
        "      'Lattice deck checker',",
        "      '',",
        "      '  node check.mjs <deck.md> [more.md ...] [--json] [--strict]',",
        "      '',",
        "      'Prints what is wrong with a deck: placeholder titles, label headings, a missing',",
        "      'ask, elements past their word budget. Deterministic, offline and free — it is',",
        "      'code, not a model, so it cannot talk itself into approving. It catches the',",
        "      'checkable half; taste is still yours.',",
        "      '',",
        "      '  --json    machine-readable findings',",
        "      '  --strict  exit 1 when anything is found (default exits 0)',",
        "    ].join('\\n'));",
        '    process.exit(2);',
        '  }',
        '  const { bucketOf, densityOf, found } = catalogLookups();',
        '  const results = [];',
        '  for (const file of files) {',
        '    let source;',
        '    try {',
        "      source = readFileSync(file, 'utf8');",
        '    } catch (err) {',
        '      // A missing path or a directory used to dump a raw Node stack trace',
        '      // out of a shipped CLI. Say what is wrong in one line.',
        "      const why = err && err.code === 'ENOENT' ? 'no such file'",
        "        : err && err.code === 'EISDIR' ? 'is a directory, not a deck'",
        "        : (err && err.message) || 'could not be read';",
        "      console.error('check.mjs: ' + file + ' — ' + why);",
        '      process.exit(2);',
        '    }',
        '    results.push({ file, findings: review(source) });',
        '  }',
        '  const total = results.reduce((n, r) => n + r.findings.length, 0);',
        '  if (asJson) {',
        '    // ONE envelope shape, whatever the file count — and it carries `partial`.',
        '    // The array form suppressed the partial marker in exactly the mode a',
        '    // machine reads, so a check that skipped a whole rule class came back',
        '    // as [] and read as clean.',
        '    console.log(JSON.stringify({ partial: !found, files: results }, null, 2));',
        '  } else {',
        '    for (const r of results) {',
        "      if (files.length > 1) console.log(r.file);",
        '      if (!r.findings.length) {',
        "        console.log(found",
        "          ? 'No findings. The checkable half is clean — now read it and judge the argument.'",
        "          : 'No findings — but see the note below; this was a PARTIAL check.');",
        '      } else {',
        '        console.log(r.findings.length + (r.findings.length === 1 ? \' finding\' : \' findings\'));',
        "        console.log('');",
        '        for (const f of r.findings) {',
        '          const where = f.slide ? \'slide \' + f.slide : \'deck\';',
        '          console.log(\'  \' + where + \'  [\' + f.rule + \']  \' + f.message);',
        '          if (f.line) console.log(\'            at:  \' + f.line);',
        '          if (f.fix) console.log(\'            fix: \' + f.fix);',
        '        }',
        '      }',
        "      if (files.length > 1) console.log('');",
        '    }',
        '    // Warn on a PARTIAL check whether or not anything was found. Reporting',
        '    // "clean" when a whole rule class was skipped is the silent under-report',
        '    // this checker exists to prevent.',
        '    if (!found) {',
        "      console.log('');",
        "      console.log('  note: reference/components.json was not found beside this file, so');",
        "      console.log('        per-element word budgets were NOT checked. Keep check.mjs inside');",
        "      console.log('        the kit for the full set.');",
        '    }',
        '  }',
        '  process.exit(strict && total ? 1 : 0);',
        '}',
        '',
      ].join('\n'),
    );
    execFileSync(
      path.join(ROOT, 'node_modules', '.bin', 'esbuild'),
      [entry, '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=error'],
      { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    // esbuild writes each module's path as a comment, and the ENTRY lives in a
    // randomly named temp dir — so two builds of identical source differ by one
    // line and the freshness gate fails on every CI run. Normalize it to a stable
    // label, which also tells a reader of check.mjs where the CLI came from.
    const body = readFileSync(out, 'utf8').replace(
      /^\/\/ .*lattice-review-[A-Za-z0-9]+\/entry\.mjs$/m,
      '// <CLI entry, generated by tools/build-agent-kit.mjs>',
    );
    rmSync(tmp, { recursive: true, force: true });
    return Buffer.from(body, 'utf8');
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true });
    throw new Error(
      `build-agent-kit: could not bundle the deck checker — ${err?.message || err}\n` +
        '  review-core.js and its lib/ graph must bundle for the node platform with no bare imports.\n' +
        '  If a new import reached in from the docs workspace, that is the bug: a docs dep here breaks\n' +
        '  `npm ci` for every consumer, because `prepare` runs this build.',
    );
  }
}

/**
 * The third-party packages esbuild actually pulled into `review/check.mjs`.
 *
 * DERIVED FROM THE BUNDLE, never from a hand-kept list: esbuild writes each
 * module's source path as a banner comment, so the set of `node_modules/<pkg>/`
 * prefixes IS the set of packages redistributed. A hand list would silently rot
 * the first time review-core's import graph moves — which is exactly how these
 * six shipped with no notices at all.
 *
 * `markdown-it` and its five transitive deps are MIT / BSD-2-Clause. Both
 * require the copyright notice to accompany a redistribution, and esbuild
 * strips comments from the packages it inlines, so the notice has to be
 * restored beside the file. Missing LICENSE text is a hard error: publishing
 * without it is the defect this function exists to prevent.
 */
function bundledPackages(bundle) {
  const names = new Set();
  for (const m of String(bundle).matchAll(/^\/\/ node_modules\/((?:@[^/\n]+\/)?[^/\n]+)\//gm)) {
    names.add(m[1]);
  }
  return [...names].sort();
}

const LICENSE_FILENAMES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENSE-MIT.txt', 'LICENSE-MIT'];

function thirdPartyLicenses(bundle) {
  const pkgs = bundledPackages(bundle);
  if (!pkgs.length) {
    throw new Error(
      'build-agent-kit: no bundled packages detected in review/check.mjs.\n' +
        '  Either esbuild stopped emitting its path banners (so the license list can no longer be\n' +
        '  derived and must be rewritten), or the bundle is empty. Do not publish either way.',
    );
  }
  const rule = '='.repeat(78);
  const out = [
    'THIRD-PARTY LICENSES',
    '',
    'The Lattice engine itself is AGPL-3.0-only — see LICENSE and NOTICE.md.',
    '',
    'review/check.mjs is a single-file bundle. The packages below are third party,',
    'inlined into it unmodified, and governed by their own terms, reproduced here in',
    'full because the bundler strips the notices from the code itself.',
    '',
  ];
  for (const name of pkgs) {
    const dir = path.join(ROOT, 'node_modules', name);
    const file = LICENSE_FILENAMES.map((f) => path.join(dir, f)).find((f) => existsSync(f));
    if (!file) {
      throw new Error(
        `build-agent-kit: ${name} is bundled into review/check.mjs but ships no LICENSE file.\n` +
          '  Its terms cannot be reproduced, so the kit cannot be published with it. Vendor the\n' +
          "  text into assets/licenses/ and extend LICENSE_FILENAMES, or drop the dependency.",
      );
    }
    let version = '';
    try {
      version = `@${JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).version}`;
    } catch {
      version = '';
    }
    out.push(rule, `${name}${version}`, rule, '', readFileSync(file, 'utf8').trimEnd(), '');
  }
  return out.join('\n');
}

/**
 * NOTICE.md — the license facts a recipient cannot get from the files.
 *
 * The agent kit is mostly prose, and prose about an AGPL engine is not itself
 * the engine. One file is different: `review/check.mjs` is Lattice's own
 * reviewer compiled to a runnable bundle — engine code, handed over loose — so
 * the AGPL applies to it in full and the output exception (which covers engine
 * assets embedded inside a RENDERED deck) does not reach it.
 */
function noticeDoc(bundle) {
  return [
    '# Notices',
    '',
    '## Lattice',
    '',
    'Copyright (c) 2025-2026 SlideWright. Licensed under the **GNU Affero General',
    'Public License, version 3** — the full text is in `LICENSE`, beside this file.',
    '',
    'Most of this kit is documentation: the component references, the authoring',
    'canon, the skills and the catalogs describe Lattice rather than being it. Decks',
    'you write from them are yours, and were never covered either way.',
    '',
    '**`review/check.mjs` is different.** It is the Lattice reviewer itself,',
    'compiled to one runnable file — engine code handed over loose, not engine code',
    'embedded in a rendered deck — so the AGPL applies to it in full and the output',
    'exception in `LICENSE-EXCEPTIONS` does not reach it. Running it on your own',
    'decks is ordinary use and asks nothing of you; redistributing it, or a service',
    'built on it, is what the license speaks to.',
    '',
    '## Third-party code inside `review/check.mjs`',
    '',
    'The bundle inlines the packages below. The bundler strips their comments, so',
    'their notices are reproduced in full in `THIRD-PARTY-LICENSES.txt`.',
    '',
    '| Package | License |',
    '|---|---|',
    ...bundledPackages(bundle).map((n) => {
      let lic = 'see THIRD-PARTY-LICENSES.txt';
      try {
        lic = JSON.parse(readFileSync(path.join(ROOT, 'node_modules', n, 'package.json'), 'utf8')).license || lic;
      } catch {
        /* fall through to the pointer */
      }
      return `| \`${mdCell(n)}\` | ${mdCell(lic)} |`;
    }),
    '',
  ].join('\n');
}

/** review/rubric.md — the same 17 checks, for a reader rather than a runtime. */
function rubricDoc() {
  const { RUBRIC } = require(path.join(ROOT, 'lib', 'authoring', 'review-core.js'));
  return [
    '# The review rubric',
    '',
    `The ${RUBRIC.length} checks \`check.mjs\` applies, in plain form — so you can see what it looks for,`,
    'and so a human reviewing by hand looks for the same things.',
    '',
    '**Prefer running the checker.** It is deterministic and costs nothing; reading this',
    'list and self-assessing costs a full pass over the deck and is easy to be generous with.',
    '',
    '| Trap | Fix |',
    '|---|---|',
    ...RUBRIC.map((r) => `| ${mdCell(r.trap)} | ${mdCell(r.fix)} |`),
    '',
    '---',
    '',
    'Source: `RUBRIC` in `lib/authoring/review-core.js` — the same array the checker runs.',
    '',
  ].join('\n');
}

/** review/README.md — the local bootstrap for checking your work. */
function reviewReadme(files) {
  return [
    '# Check your work',
    '',
    'You have written a deck. Before you hand it over, find what is wrong with it.',
    '',
    '## Run the checker',
    '',
    '```sh',
    'node check.mjs your-deck.md',
    '```',
    '',
    'It prints findings like this:',
    '',
    '```',
    '3 findings',
    '',
    '  slide 1  [title-incomplete]  the title slide has no subtitle — one line of framing orients the room',
    '  slide 4  [label-title]       "Next Steps" is a label, not a takeaway — say what the slide proves',
    '  deck     [no-ask]            no clear ask or recommendation — what should the audience do?',
    '```',
    '',
    'Pass more than one file to check them all. Add `--strict` to exit non-zero when',
    'anything is found.',
    '',
    '`--json` emits one envelope, whatever the file count:',
    '',
    '```json',
    '{ "partial": false, "files": [ { "file": "deck.md", "findings": [ … ] } ] }',
    '```',
    '',
    '`partial` is `true` when `../reference/components.json` was not found beside the',
    'checker — half the rules are skipped without it, so an empty `findings` in that',
    'state does NOT mean clean. Keep the kit together and it stays `false`.',
    '',
    '## Why run it rather than self-review',
    '',
    'It is **code, not a model.** It cannot be talked into approving a deck, it costs',
    '**no tokens**, and it runs in about a tenth of a second offline. It is the same',
    'reviewer AND the same linter the Lattice Studio runs on decks its own model writes,',
    'so it cannot drift into a second opinion.',
    '',
    'A model checking its own draft against a rubric it read two minutes ago will tell you',
    'the draft is fine. That is the failure this file exists to prevent.',
    '',
    '## What it does and does not catch',
    '',
    'It runs TWO passes and merges them, because they answer different questions.',
    '',
    '**The linter asks whether the deck is valid.** An invented `_class`, a card written',
    'as one inline line when the layout needs nested bullets, a front-matter key that does',
    'not exist. Reported as `error` / `warning` and listed first — these are the ones that',
    'stop a deck rendering the way you meant, and an invented component name is the single',
    'most likely mistake a model makes here.',
    '',
    '**The reviewer asks whether the deck is any good** — the falsifiable half of that:',
    'placeholder titles, headings that are labels rather than takeaways, a data slide with',
    'no "so what", a hero number with nothing to compare it to, elements past their word',
    'budget, a deck with no ask, duplicate claims, missing image alt text. Reported as',
    '`suggestion`.',
    '',
    '**Neither catches whether the argument is any good.** No checker can. Clean output',
    'means the deck is valid and clears the mechanical bar — the judgment is still yours,',
    'against `../authoring/deck-canon.md`.',
    '',
'## Files',
    '',
    `- \`check.mjs\` — the checker (${(bytesOf(files, `${REVIEW}/check.mjs`) / 1024).toFixed(0)} KB, self-contained, needs Node 18+)`,
    '- `rubric.md` — the same checks in plain form, for reading or for a human pass',
    '',
    'The checker reads `../reference/components.json` for per-element word budgets. Keep the',
    'kit together and it just works; move `check.mjs` alone and it still runs, minus that check.',
    '',
  ].join('\n');
}

/** authoring/deck-canon.md — what good looks like. */
function deckCanonDoc() {
  const { DECK_CANON, DECK_CANON_SHORT } = require(path.join(ROOT, 'lib', 'authoring', 'deck-canon.js'));
  return [
    '# What a good deck looks like',
    '',
    "> This is the Lattice Studio chat's own deck canon, sent with **every turn** it takes.",
    '> Read it before writing slides. The component files tell you how to author a layout',
    "> correctly; this tells you whether the deck is worth showing.",
    '',
    'It ends with the traps the deck reviewer actually flags — each with its fix. Avoiding',
    'them up front is cheaper than being told afterwards.',
    '',
    '## The canon',
    '',
    '```',
    DECK_CANON.trim(),
    '```',
    '',
    '## The short form',
    '',
    'A small on-device model loses the thread on a long system prompt, so the Studio sends',
    'this reduced canon to local models instead. Use it when context is very tight — it is',
    'the load-bearing subset, not a summary.',
    '',
    '```',
    DECK_CANON_SHORT.trim(),
    '```',
    '',
    '---',
    '',
    'Source: `lib/authoring/deck-canon.js`. Generated by `tools/build-agent-kit.mjs`.',
    '',
  ].join('\n');
}

/** authoring/rules.md — the cross-cutting rules a per-component file cannot carry. */
function rulesDoc(authoringRules) {
  return [
    '# Rules that apply to every slide',
    '',
    'These are the half a per-component file cannot tell you: how classes compose, how card',
    'layouts nest, what a title slide is. Shared verbatim with the Studio chat.',
    '',
    '> Where a rule says "below" or "listed with each layout", it means **the component file',
    `> you open next** (\`${COMPONENTS}/<name>.md\`) — or \`${AUTHORING}/primer.md\`, which carries`,
    '> every layout skeleton in one document.',
    '',
    ...authoringRules.map((r) => `- ${r}`),
    '',
    '---',
    '',
    'Source: `docs/src/components/studio/ai/architect-knowledge.js` (`AUTHORING_RULES`).',
    '',
  ].join('\n');
}

/**
 * authoring/modifiers.md — the cross-cutting vocabulary, which the kit named and
 * never listed.
 *
 * `rules.md` tells an author to compose `tint-*` / `mark-*` / `with-*` / `tone-*`
 * onto the class, and every component doc ended a paragraph with "see
 * design/design-system.md §6.5 for the catalog" — a file outside the kit. So the
 * catalog was mandatory to use and impossible to read: a cold consumer measured
 * it and used no modifier at all rather than guess.
 *
 * GENERATED FROM `UNIVERSAL_GROUPS`, not copied from the prose (HARD RULE #1).
 * The prose had already drifted — the anchor those 62 links used still said
 * `three-tiers` after the section became four.
 */
function modifiersDoc() {
  const { UNIVERSAL_GROUPS, SEMI_UNIVERSAL_VARIANTS } = require(path.join(ROOT, 'lib', 'components', 'index.js'));
  // What each group is FOR. The names alone do not say when to reach for one,
  // and "when not to" is the line that actually saves a reader a bad slide.
  const BLURBS = {
    mood: 'Flip a single slide to the dark companion palette. Deck-wide dark is a theme choice, not this.',
    decoration: 'Ambient art on the canvas. One per slide at most — two read as clutter, and none is the right answer on a dense slide.',
    typography: 'Scale the slide’s type up, or control the auto-period on headings. `scale-*` buys emphasis on a SPARSE slide; on a full one it just overflows.',
    chrome: 'Turn the running header, footer, page number or section rail off for one slide. `silent` bundles the first three — it is what bookends use.',
    note: 'Act on a trailing sentence: keep it as body copy, or mark the slide’s callout as an alarm (the warning triangle is drawn, so a caveat needs no typed glyph).',
    social: 'Crop-safe framing for a slide destined to be screenshotted.',
    table: 'Table treatment switches: drop the zebra, spread rows into leftover height, or decode `[x]` `[-]` `[ ]` `[/]` cells into status discs.',
    state: 'Collaboration markers — a visible stamp that a slide is in progress, confidential or superseded. Meta-signal about the slide, independent of its content.',
    tone: 'Cast the whole slide in a pass/warn/fail/skip color. Use for "this is the failure slide", not to color one item.',
    insight: 'Rename the key-insight callout’s eyebrow (TAKEAWAY, VERDICT, THE ASK, …). Changes the WORD, never the styling.',
    claim: 'Let content claim the stage by receding the chrome — quiet, then hero. Composes with the chrome switches above.',
  };
  const rows = Object.entries(UNIVERSAL_GROUPS).map(
    ([group, names]) =>
      `| \`${mdCell(group)}\` (${names.length}) | ${names.map((n) => `\`${n}\``).join(' · ')} | ${mdCell(BLURBS[group] || '')} |`,
  );
  const total = Object.values(UNIVERSAL_GROUPS).reduce((n, v) => n + v.length, 0);
  return [
    '# Universal modifiers',
    '',
    'Class tokens that work on **every** layout. Compose them on the same comment,',
    'space-separated, after the layout name:',
    '',
    '```',
    '<!-- _class: cards-grid dark tone-warn insight-the-ask -->',
    '```',
    '',
    `There are ${total}, in ${Object.keys(UNIVERSAL_GROUPS).length} groups. A layout never has to declare them and`,
    'cannot opt out of them.',
    '',
    '| Group | Tokens | What it is for |',
    '|---|---|---|',
    ...rows,
    '',
    '## Two rules that save a slide',
    '',
    '**Colors come from the theme, never from you.** There is no way to author a hex',
    'value, and that is the point: a token means the same thing in every theme, a hex',
    'means one thing in one theme and is wrong in the rest.',
    '',
    '**One decoration per slide, and usually none.** `tint-*` and `mark-*` are ambient',
    'art. They earn their place on a bookend or a divider; on a slide already carrying',
    'content they compete with it.',
    '',
    '## Position suffixes',
    '',
    'The `tint-corner` / `tint-edge` treatments take a companion `at-*` token that says',
    'where: `at-tl` `at-top` `at-tr` `at-right` `at-br` `at-bottom` `at-bl` `at-left`.',
    'Author both — `tint-corner at-tl`.',
    '',
    '## Semi-universal',
    '',
    'These apply to MOST layouts; a layout whose shape they would break opts out, so a',
    'component file is the authority for its own:',
    '',
    ...(Array.isArray(SEMI_UNIVERSAL_VARIANTS) && SEMI_UNIVERSAL_VARIANTS.length
      ? [SEMI_UNIVERSAL_VARIANTS.map((v) => `\`${v}\``).join(' · '), '']
      : []),
    'Per-layout variants are listed in each `../components/<name>.md`.',
    '',
    '---',
    '',
    'Generated from `UNIVERSAL_GROUPS` in the component index — the same source the',
    'engine composes against, so this list cannot drift from what actually renders.',
    '',
  ].join('\n');
}

/** reference/studio-prompts.md — the generator canons that can be shipped safely. */
function studioPromptsDoc() {
  const { THEME_CANON } = require(path.join(ROOT, 'lib', 'theme', 'ai.js'));
  const { COMPONENT_CANON } = require(path.join(ROOT, 'lib', 'layout', 'ai.js'));

  return [
    "# The Studio's generator prompts",
    '',
    "> These are the instructions Lattice's own product sends its model when it GENERATES a",
    '> theme or a component. They are here so an outside agent can reproduce what the Studio',
    '> does.',
    '',
    '**Which wins.** For learning how to build one of these properly, the matching',
    `\`${SKILLS}/\` file is fuller and is the better teaching surface — it carries the 10/10 bar,`,
    'a recipe, what-good/what-bad, and a ship checklist. These prompts are tuned for a model',
    'producing one artifact in one shot.',
    '',
    'That distinction is load-bearing rather than pedantic: a 2026-07-19 investigation found',
    'these product prompts had **silently drifted** from the shared design canon in two',
    'confirmed places, while the skills had been recertified against it. When a prompt below',
    'and a skill disagree, **the skill is the safer bet** — and the disagreement is a bug worth',
    'reporting.',
    '',
    '## THEME_CANON',
    '',
    `Sent when generating a palette. See \`${SKILLS}/theme.md\` for the full method.`,
    '',
    '```',
    String(THEME_CANON).trim(),
    '```',
    '',
    '## COMPONENT_CANON',
    '',
    `Sent when generating a layout. See \`${SKILLS}/component.md\`.`,
    '',
    '```',
    String(COMPONENT_CANON).trim(),
    '```',
    '',
    '## FINISH_SYSTEM — not shipped, and why',
    '',
    'The finish generator prompt lives in `docs/src/components/studio/architect.ts` and is',
    'computed from the live finish catalog, so it cannot be read without loading that module —',
    'which imports `fuse.js` and `react` from the docs workspace. Extracting it made a root-only',
    '`npm ci` fail, so it is deliberately absent rather than shipped through a build step that',
    'breaks installation.',
    '',
    `Nothing is lost that matters: \`${SKILLS}/finish.md\` teaches the same four-layer system`,
    '(wash · texture · mark · edge) at length, with the closed vocabularies, the intensity',
    'ranges, what good and bad look like, and a ship checklist — and a test in the repo already',
    'reconciles that skill against the prompt, so they cannot say different things.',
    '',
    '---',
    '',
    'Sources: `lib/theme/ai.js`, `lib/layout/ai.js`. Generated by `tools/build-agent-kit.mjs`.',
    '',
  ].join('\n');
}

/** authoring/primer.md — the Studio's layout dossier, body byte-identical. */
async function buildPrimer() {
  const { buildStudioCatalog } = await import(
    path.join(ROOT, 'docs', 'src', 'lib', 'studio-catalog.mjs')
  );
  const { buildLatticePrimer, AUTHORING_RULES } = await import(
    path.join(ROOT, 'docs', 'src', 'components', 'studio', 'ai', 'architect-knowledge.js')
  );
  const catalog = buildStudioCatalog(ROOT);
  if (!catalog.length) {
    throw new Error(
      'build-agent-kit: the component catalog came back empty — dist/docs/components.json is missing or unreadable. Run `npm run build` first.',
    );
  }
  const body = buildLatticePrimer(catalog);
  const text = [
    '# Every layout, with its authoring skeleton',
    '',
    '> The **authoring primer the Lattice Studio chat injects into its own system prompt**,',
    '> generated from the live component manifests. The body below is byte-for-byte what the',
    "> Studio sends — not a summary. It is not the Studio's WHOLE prompt: the persona, the",
    `> deck canon (\`${AUTHORING}/deck-canon.md\`) and the edit protocol sit alongside it there.`,
    '',
    `> Authoring ONE slide? \`${COMPONENTS}/<name>.md\` is ~1.8k tokens against this file's`,
    `> ${fmtTok(Buffer.byteLength(body, 'utf8'))}. This is for writing a whole deck in one pass.`,
    '',
    `Covers ${catalog.length} layouts.`,
    '',
    '---',
    '',
    body,
    '',
  ].join('\n');
  return { text, layoutCount: catalog.length, authoringRules: AUTHORING_RULES };
}

/** The bucket → members map, shared by the root and components READMEs. */
function bucketIndex(components) {
  const byBucket = new Map();
  for (const c of components) {
    if (!byBucket.has(c.bucket)) byBucket.set(c.bucket, []);
    byBucket.get(c.bucket).push(c);
  }
  const { BUCKET_BLURBS } = require(path.join(ROOT, 'tools', 'build-bucket-galleries.js'));
  const { BUCKETS } = require(path.join(ROOT, 'lib', 'components'));
  return BUCKETS.filter((b) => byBucket.has(b)).map((b) => ({
    bucket: b,
    blurb: String(BUCKET_BLURBS[b] || b).replace(/^[^—]*—\s*/, ''),
    members: byBucket.get(b).filter((c) => !c.family),
    families: byBucket.get(b).filter((c) => c.family),
  }));
}

/**
 * components/README.md — the local bootstrap, and the one that carries the
 * WHEN-NOT-TO-USE signal.
 *
 * `components/_index.md` (the repo's pick list) deliberately truncates each
 * component to a first sentence and says so: "the half telling you when NOT to
 * use a component is deliberately not on this surface". That is right for a
 * ~3.8k-token grep surface and wrong for routing — picking between `matrix-2x2`
 * and `quadrant` is exactly where an agent goes wrong, and the deciding fact is
 * the anti-pattern, not the purpose.
 *
 * So this file pairs each component with its FIRST anti-pattern (~727 tokens for
 * all 61, measured) and the `related` edges that name what to use instead. Both
 * come from the manifests; nothing here is restated by hand.
 */
function componentsReadme(components, files) {
  const cat = JSON.parse(readFileSync(path.join(DOCS_DIR, 'components.json'), 'utf8'));
  const byName = new Map(cat.components.map((c) => [c.name, c]));
  const rows = [];
  for (const { bucket, blurb, members, families } of bucketIndex(components)) {
    rows.push(`### ${bucket} — ${blurb}`, '');
    for (const m of members) {
      const c = byName.get(m.name) || {};
      const use = String(c.description || c.purpose || '').split(/(?<=\.)\s/)[0];
      const not = (c.antiPatterns || [])[0];
      rows.push(`- **\`${m.name}\`** — ${use}`);
      if (not) rows.push(`  - *not for:* ${not.title}`);
      const alts = (c.related || []).filter((r) => r.when).slice(0, 2);
      for (const a of alts) rows.push(`  - *use \`${a.name}\` when* ${a.when}`);
    }
    for (const f of families) {
      rows.push(`- **\`${f.name}.md\`** — the shared contract every ${bucket} component wraps in. Read it too.`);
    }
    rows.push('');
  }
  return [
    '# Which layout, and how to author it',
    '',
    'One file per component. Open the one you picked and it tells you everything: slots,',
    'variants, budgets, common mistakes, the data shape.',
    '',
    '## How to pick',
    '',
    '1. Find your intent in the families below. Each entry says what it is **for**, what it',
    '   is **not for**, and which component to use **instead** when yours is the wrong fit.',
    `2. Open \`<name>.md\` — median ${fmtTok(median(components.map((c) => c.body.length)))} tokens.`,
    '3. Author the slide against that file, plus the rules in `../authoring/rules.md`.',
    '',
    `\`_index.md\` (${fmtTok(bytesOf(files, `${COMPONENTS}/_index.md`))} tokens) is the same catalog as a flat, greppable table —`,
    'reach for it when you want to search by tag or capacity rather than browse by intent.',
    '',
    '**The "not for" lines are the ones that save you.** Choosing between two plausible',
    'components is where an agent goes wrong, and the deciding fact is almost always the',
    'anti-pattern, not the purpose.',
    '',
    '## The families',
    '',
    ...rows,
    '---',
    '',
    '_Generated from the component manifests. Every line here is derived; nothing is restated by hand._',
    '',
  ].join('\n');
}

/**
 * The real cost of the skills row, measured.
 *
 * It was the ONE hand-typed cell in a table where every other number is computed
 * from bytes, and it was wrong: "~3k each" against a real 3.0k-5.6k. An agent
 * budgeting context off this table would have run out on the theme skill, which
 * is nearly double the quoted figure. §3b of the decision record is about
 * exactly this failure, in exactly this table.
 */
function skillsRange(files) {
  const sizes = [...files.keys()]
    .filter((k) => k.startsWith(`${SKILLS}/`) && k.endsWith('.md') && !k.endsWith('README.md'))
    .map((k) => files.get(k).length);
  if (!sizes.length) return 'n/a';
  const lo = approxTokens(Math.min(...sizes));
  const hi = approxTokens(Math.max(...sizes));
  const k = (n) => `${(n / 1000).toFixed(1)}k`;
  return `${k(lo)}–${k(hi)} each`;
}

const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

/** authoring/README.md — the local bootstrap for writing a deck. */
function authoringReadme(files, layoutCount) {
  return [
    '# Writing a deck',
    '',
    'Read these in order. The first one matters most.',
    '',
    `1. **[\`deck-canon.md\`](./deck-canon.md)** (${fmtTok(bytesOf(files, `${AUTHORING}/deck-canon.md`))} tokens) — what a good deck IS.`,
    '   How a boardroom deck argues: one idea per slide, a narrative arc, rhythm, restraint,',
    '   stereotyped bookends. Ends with the traps a reviewer flags, each with its fix. This is',
    '   what the Lattice Studio sends its own model on every turn. **If you read one file',
    '   before writing slides, read this one.**',
    `2. **[\`rules.md\`](./rules.md)** (${fmtTok(bytesOf(files, `${AUTHORING}/rules.md`))} tokens) — the mechanics that apply to every slide:`,
    '   how classes compose, how card layouts nest, what a title slide is.',
    `3. **[\`../${COMPONENTS}/\`](../${COMPONENTS}/)** — pick the layout, then author it from its own file.`,
    `4. **[\`../${REVIEW}/\`](../${REVIEW}/)** — run the checker before you hand it over.`,
    '',
    `**[\`modifiers.md\`](./modifiers.md)** (${fmtTok(bytesOf(files, `${AUTHORING}/modifiers.md`))} tokens) when you need one — the`,
    'cross-cutting tokens (`dark`, `tone-*`, `insight-*`, the `tint-*` / `mark-*` decorations)',
    'that compose onto any layout. Not on the path above: you can write a good deck without',
    'reaching for one, and a component file names its own variants.',
    '',
    '## Front matter',
    '',
    'Every deck opens with it. This is the whole of what you need:',
    '',
    '```markdown',
    '---',
    'marp: true',
    'theme: indaco',
    'paginate: true',
    '---',
    '```',
    '',
    '`theme:` picks the palette — `indaco` and `cuoio` ship with the engine. `paginate:`',
    'turns on page numbers. A deck with no front matter still renders, but with no theme.',
    '',
    '## primer.md — the other way to work',
    '',
    `**[\`primer.md\`](./primer.md)** (${fmtTok(bytesOf(files, `${AUTHORING}/primer.md`))} tokens) carries all ${layoutCount} layouts with their`,
    'authoring skeletons in one document. Use it when you are drafting a whole deck in one',
    'pass and want every option in front of you.',
    '',
    `Authoring ONE slide? Do not load it — \`../${COMPONENTS}/<name>.md\` is the same content for`,
    'the layout you actually chose, at a fraction of the cost.',
    '',
  ].join('\n');
}

/** reference/README.md — the local bootstrap for tool builders. */
function referenceReadme(files) {
  const row = (f, what) =>
    `| \`${f}\` | ${what} | ${fmtTok(bytesOf(files, `${REFERENCE}/${f}`))} |`;
  return [
    '# Reference — machine records',
    '',
    'For building a tool over Lattice, not for authoring a deck. If you are writing slides,',
    `you want [\`../${AUTHORING}/\`](../${AUTHORING}/) and [\`../${COMPONENTS}/\`](../${COMPONENTS}/) instead —`,
    'everything here is either bulk or internals.',
    '',
    '| File | What it is | ~tokens |',
    '|---|---|---|',
    row('components.json', 'The full machine record for every component: slots, skeletons, variants, capacity, density, when-to-use and anti-patterns.'),
    row('grammar.json', 'Which class tokens, variants and modifiers are legal where. What a linter or validator keys off.'),
    row('forms.json', 'The Form vocabulary — how a slide is composed (cells, mastheads, stage regions), one level above components.'),
    row('concepts.json', 'The ontology joining the two levels: what a component, modifier, token and Form each are, and how they relate.'),
    row('components.md', 'The prose catalog, whole. Almost never what you want — one component file is the same content for one component.'),
    row('studio-prompts.md', "The prompts Lattice's product sends its own model when generating a theme or component."),
    '',
    '~token figures are bytes ÷ 4, a rough cross-model approximation. Your tokenizer will differ;',
    'the ratios are what matter.',
    '',
  ].join('\n');
}

/**
 * skills/README.md — GENERATED for the kit, unlike the seven skills beside it.
 *
 * The repo's own `design/skills/README.md` is written for someone inside the
 * repo and points at paths a kit reader does not have. The seven SKILLS still
 * ship verbatim and byte-pinned; only this index is rewritten for the audience,
 * and it carries the glossary that makes their HARD RULE citations legible.
 */
function skillsReadme(skills) {
  const files = skills.map((s) => s.name).filter((n) => n !== 'README.md');
  // Only the skills that actually SHIP. Scanning every file in design/skills/
  // swept in the repo's own README — which this kit replaces — and listed two
  // rules in the glossary that nothing a reader can open ever cites.
  const cited = new Set();
  for (const s of skills) {
    if (s.name === 'README.md') continue;
    for (const m of String(s.body).matchAll(/HARD RULE #(\d+)/g)) cited.add(Number(m[1]));
  }
  const claude = readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  const titles = new Map();
  for (const m of claude.matchAll(/^- \*\*#(\d+) — (.+?)\*\*/gm)) {
    titles.set(Number(m[1]), m[2].replace(/\.$/, ''));
  }
  const glossary = [...cited]
    .sort((a, b) => a - b)
    .filter((n) => titles.has(n))
    .map((n) => `| #${n} | ${mdCell(titles.get(n))} |`);

  const LABEL = {
    'deck.md': 'A **deck** — a full presentation from a blank `.md`',
    'theme.md': 'A **theme** — a palette',
    'component.md': 'A **component** — a new `<!-- _class: X -->` layout',
    'chart-component.md': 'A **chart component** — a data visualization',
    'finish.md': 'A **finish** — a backdrop layer stack',
    'lens.md': 'A **lens** — a reader-side subset of a deck',
    'speaker-notes.md': '**Speaker notes, reviews and captions**',
  };

  return [
    '# Creating something new',
    '',
    'Each file here teaches you to build **one** kind of Lattice artifact from a blank file,',
    'end to end. They are self-contained on purpose: the tokens, slots, budgets and commands',
    'are inlined so you never have to chase a link mid-task.',
    '',
    '## Which one',
    '',
    '| You want to create… | Open |',
    '|---|---|',
    ...files.map((f) => `| ${LABEL[f] || `\`${f.replace(/\.md$/, '')}\``} | [\`${f}\`](./${f}) |`),
    '',
    '## What each one gives you',
    '',
    'Every skill follows the same nine-part shape, so once you have read one you can navigate',
    'all of them: the **10/10 bar** for that artifact · a **mental model** · **where it lives** ·',
    'a numbered **recipe** · a copy-paste **contract** · **what good and bad look like** ·',
    'a **ship checklist** · **common mistakes** · **canonical sources**.',
    '',
    'They name the falsifiable bar — the rules you can check. The last mile is taste, and every',
    'skill ends in the same place for that reason: **render it and actually look at it.**',
    '',
    '## Reading these outside the Lattice repository',
    '',
    'These files ship **verbatim** from the Lattice repo, so they cite things a kit reader does',
    'not have. That is deliberate — rewriting them would fork a second copy that drifts from the',
    'originals. Read the references as context, not instructions:',
    '',
    '- **`npm run …` commands and paths like `lib/…`, `tools/…`** assume a clone of the Lattice',
    '  repository. Skip them unless you have one.',
    '- **"HARD RULE #N"** cites the engine\'s own engineering rules. The ones these skills',
    '  actually reference:',
    '',
    '| Rule | What it says |',
    '|---|---|',
    ...glossary,
    '',
    'Nothing in the recipes depends on being able to follow those citations — they explain',
    '*why* a step exists, not *how* to do it.',
    '',
  ].join('\n');
}

/**
 * README.md — the ONE front door, at the kit root.
 *
 * GitHub renders a folder's README automatically, so a human who opens the
 * branch lands oriented with no clicks and an agent handed the folder URL has
 * one obvious entry point. There is no separate BOOTSTRAP.md: two front doors
 * is how the previous cut drifted into redundancy.
 */
function bootstrap(components, skills, files, layoutCount, selfBytes = 0) {
  const idx = bucketIndex(components);
  const compMedian = median(components.map((c) => c.body.length));
  const canonB = bytesOf(files, `${AUTHORING}/deck-canon.md`);
  const rulesB = bytesOf(files, `${AUTHORING}/rules.md`);
  const primerB = bytesOf(files, `${AUTHORING}/primer.md`);
  const compReadmeB = bytesOf(files, `${COMPONENTS}/README.md`);

  return [
    '# Lattice agent kit',
    '',
    '**Lattice turns plain Markdown into boardroom-quality slides.** One layout per slide,',
    'chosen with `<!-- _class: NAME -->`; slides separated by a line containing only `---`.',
    '',
    'This kit is everything you need to author Lattice artifacts well — no clone, no install.',
    'It works with any model; nothing here is vendor-specific.',
    '',
    '## Start here',
    '',
    '| You are… | Read, in order | ~tokens |',
    '|---|---|---|',
    // FIXED + PER-COMPONENT, because a deck is not one slide. The single figure
    // this used to quote described a ONE-component read and a cold agent
    // measured a real nine-slide deck at 2.9x it — the row an agent budgets
    // against was the row that would run it out of context.
    `| **writing a deck** | \`${AUTHORING}/deck-canon.md\` → \`${AUTHORING}/rules.md\` → \`${COMPONENTS}/README.md\` → \`${REVIEW}/\` | **${fmtTok(canonB + rulesB + compReadmeB)}** once |`,
    `| …then one \`${COMPONENTS}/<name>.md\` per layout you use | the file for that component | + ${fmtTok(compMedian)} each |`,
    `| **drafting a whole deck** in one pass | \`${AUTHORING}/deck-canon.md\` → \`${AUTHORING}/primer.md\` | ${fmtTok(canonB + primerB)} |`,
    `| **creating a theme, component, finish or lens** | \`${SKILLS}/README.md\` → the one skill | ${skillsRange(files)} |`,
    `| **checking a deck you already wrote** | \`${REVIEW}/README.md\` | ${fmtTok(bytesOf(files, `${REVIEW}/README.md`))} |`,
    `| **building a tool** over the catalog | \`${REFERENCE}/README.md\` | ${fmtTok(bytesOf(files, `${REFERENCE}/README.md`))} |`,
    '',
    '**Every folder has its own README.** Open the folder and it tells you what is inside and',
    'in what order to read it. Take only what you need — nothing here expects you to load it all.',
    '',
    '## The five folders',
    '',
    `| Folder | For | Contains |`,
    '|---|---|---|',
    `| [\`${AUTHORING}/\`](./${AUTHORING}/) | Writing a deck | The canon (what good looks like), the cross-cutting rules, and all ${layoutCount} layouts with skeletons |`,
    `| [\`${COMPONENTS}/\`](./${COMPONENTS}/) | Choosing and authoring a layout | One file per component — what it is for, what it is **not** for, slots, budgets, mistakes |`,
    `| [\`${SKILLS}/\`](./${SKILLS}/) | Creating a NEW artifact from blank | ${skills.filter((x) => x.name !== 'README.md').length} self-contained guides, each with its own 10/10 bar |`,
    `| [\`${REVIEW}/\`](./${REVIEW}/) | Checking your work | A runnable checker + the rubric it applies |`,
    `| [\`${REFERENCE}/\`](./${REFERENCE}/) | Building a tool | The machine catalogs and the Studio's own prompts |`,
    '',
    '## Two things worth knowing before you start',
    '',
    `**Read \`${AUTHORING}/deck-canon.md\` before you write slides.** It is what the Lattice Studio`,
    'sends its own model on every turn: how a deck argues, and the traps its reviewer flags with',
    'the fix for each. The component files tell you how to author a layout *correctly*; the canon',
    'is what makes the deck worth showing.',
    '',
    `**Run \`${REVIEW}/check.mjs\` when you are done.** It is code, not a model — it costs no tokens,`,
    'runs offline in about a tenth of a second, and cannot be talked into approving a deck. A model',
    'checking its own draft will tell you the draft is fine.',
    '',
    `## The ${idx.length} component families`,
    '',
    ...idx.map(({ bucket, blurb, members, families }) => {
      const names = members.map((c) => `\`${c.name}\``).join(' · ');
      const fam = families.length
        ? `\n  Shared contract: ${families.map((c) => `\`${COMPONENTS}/${c.name}.md\``).join(', ')}`
        : '';
      return `- **${bucket}** — ${blurb}\n  ${names}${fam}`;
    }),
    '',
    `Which one, and which to avoid: [\`${COMPONENTS}/README.md\`](./${COMPONENTS}/README.md).`,
    '',
    '---',
    '',
    '_Generated from the Lattice sources — do not hand-edit. Republished whenever an input_',
    `_changes. ~token figures are bytes ÷ 4, a rough cross-model approximation. This file is ${fmtTok(selfBytes)} tokens._`,
    '',
  ].join('\n');
}

async function buildKit() {
  const files = new Map();
  const missing = [];
  for (const c of CATALOGS) {
    const src = path.join(DOCS_DIR, c.file);
    if (!existsSync(src)) {
      missing.push(c.file);
      continue;
    }
    // Markdown catalogs get the same relocation as the component docs — the
    // pick list is generated for repo users and hands out a `lib/components/...`
    // path. JSON is machine input and is copied byte-for-byte.
    files.set(c.to, c.file.endsWith('.json') ? readFileSync(src) : Buffer.from(relocate(readFileSync(src, 'utf8')), 'utf8'));
  }
  if (missing.length) {
    throw new Error(
      `build-agent-kit: missing generated catalogs: ${missing.join(', ')}. Run \`npm run build\` first (this step runs after the docs-portal/forms/concepts steps).`,
    );
  }

  const { text: primer, layoutCount, authoringRules } = await buildPrimer();
  files.set(`${AUTHORING}/primer.md`, Buffer.from(primer, 'utf8'));
  files.set(`${AUTHORING}/deck-canon.md`, Buffer.from(deckCanonDoc(), 'utf8'));
  files.set(`${AUTHORING}/rules.md`, Buffer.from(rulesDoc(authoringRules), 'utf8'));
  files.set(`${AUTHORING}/modifiers.md`, Buffer.from(modifiersDoc(), 'utf8'));
  files.set(`${REFERENCE}/studio-prompts.md`, Buffer.from(studioPromptsDoc(), 'utf8'));

  // The checker and its rubric. check.mjs is the only executable in the kit —
  // and the only reason the kit needs license files at all, since it inlines six
  // third-party packages whose notices the bundler strips.
  const checker = reviewBundle();
  files.set(`${REVIEW}/check.mjs`, checker);
  files.set(`${REVIEW}/rubric.md`, Buffer.from(rubricDoc(), 'utf8'));
  files.set('LICENSE', readFileSync(path.join(ROOT, 'LICENSE')));
  files.set('LICENSE-EXCEPTIONS', readFileSync(path.join(ROOT, 'LICENSE-EXCEPTIONS')));
  files.set('NOTICE.md', Buffer.from(noticeDoc(checker), 'utf8'));
  files.set('THIRD-PARTY-LICENSES.txt', Buffer.from(thirdPartyLicenses(checker), 'utf8'));

  const components = componentDocs();
  const componentCount = components.filter((c) => !c.family).length;
  if (componentCount !== layoutCount) {
    process.stderr.write(
      `[build-agent-kit] warning: ${layoutCount} layouts in the catalog but ${componentCount} component docs found.\n`,
    );
  }
  for (const c of components) files.set(`${COMPONENTS}/${c.name}.md`, c.body);

  // The seven skills ship VERBATIM and are byte-pinned. Their index does not:
  // the repo's own README is written for someone inside the repo, so the kit
  // generates its own, carrying the glossary that makes the skills' HARD RULE
  // citations legible to an outside reader.
  const skills = skillDocs();
  if (!skills.length) {
    throw new Error(
      `build-agent-kit: no skills found in ${SKILLS_DIR}. The kit ships them verbatim; an empty skills/ is a silently short kit.`,
    );
  }
  for (const s of skills) {
    if (s.name === 'README.md') continue;
    files.set(`${SKILLS}/${s.name}`, s.body);
  }
  files.set(`${SKILLS}/README.md`, Buffer.from(skillsReadme(skills), 'utf8'));

  // Local bootstraps. Order matters: each quotes sizes of files already set.
  files.set(`${COMPONENTS}/README.md`, Buffer.from(componentsReadme(components, files), 'utf8'));
  files.set(`${AUTHORING}/README.md`, Buffer.from(authoringReadme(files, layoutCount), 'utf8'));
  files.set(`${REFERENCE}/README.md`, Buffer.from(referenceReadme(files), 'utf8'));
  files.set(`${REVIEW}/README.md`, Buffer.from(reviewReadme(files), 'utf8'));

  // Two passes: the root README quotes its own token cost, so the first measures
  // and the second states it. Converges — only a same-order number changes.
  const pass1 = bootstrap(components, skills, files, layoutCount, 0);
  const pass2 = bootstrap(components, skills, files, layoutCount, Buffer.byteLength(pass1, 'utf8'));
  files.set('README.md', Buffer.from(pass2, 'utf8'));
  return files;
}

/**
 * Walks RECURSIVELY. Filtering to top-level files would leave one staleness class
 * invisible: a leftover subdirectory is then neither `extra` nor `changed`,
 * `--check` reports up to date, and the workflow's `cp -r` publishes it.
 */
function readExisting() {
  const seen = new Map();
  const walk = (dir, prefix) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), rel);
      else seen.set(rel, readFileSync(path.join(dir, e.name)));
    }
  };
  walk(OUT_DIR, '');
  return seen;
}

async function main(argv) {
  const fresh = await buildKit();
  if (argv.includes('--check')) {
    const cur = readExisting();
    const missing = [...fresh.keys()].filter((k) => !cur.has(k));
    const extra = [...cur.keys()].filter((k) => !fresh.has(k));
    const differs = [...fresh.keys()].filter((k) => cur.has(k) && !fresh.get(k).equals(cur.get(k)));
    if (missing.length || extra.length || differs.length) {
      process.stderr.write('error: dist/agent-kit is stale.\n');
      if (missing.length) process.stderr.write(`       missing: ${missing.join(', ')}\n`);
      if (extra.length) process.stderr.write(`       unexpected: ${extra.join(', ')}\n`);
      if (differs.length) process.stderr.write(`       changed: ${differs.join(', ')}\n`);
      process.stderr.write('       Run `npm run build` to regenerate.\n');
      return 1;
    }
    process.stdout.write(`dist/agent-kit is up to date (${fresh.size} files).\n`);
    return 0;
  }

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, body] of fresh) {
    const dest = path.join(OUT_DIR, name);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, body);
  }
  const kb = [...fresh.values()].reduce((n, b) => n + b.length, 0) / 1024;
  process.stdout.write(
    `[build-agent-kit] dist/agent-kit (${fresh.size} files, ${kb.toFixed(0)} KB)\n`,
  );
  return 0;
}

// realpath BOTH sides: comparing an unresolved argv against an already-resolved
// module URL makes the guard false through a symlink, and the process would then
// exit 0 having written nothing and printed nothing.
const realpathOr = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};
const invokedDirectly =
  process.argv[1] && realpathOr(process.argv[1]) === realpathOr(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err?.message || err}\n`);
      process.exit(1);
    },
  );
}

export { buildKit, main, mdCell, OUT_DIR };
