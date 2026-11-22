/**
 * NO NEW HAND-ROLLED DIRECTIVE READER (engineering/decisions/2026-10-17-meta-record.md §15, slice A).
 *
 * A slide's settings are written two ways until the cut: the directive comment (`<!-- _class: cards -->`) and the slide
 * record (`<!-- @meta{layout=cards} -->`). A tool that finds a slide's class with its own regex (`/<!--\s*_class:\s*(…)/`)
 * sees only the first, so the day the repo is swept to records it goes quietly blind: `npm run preview` finds no deck
 * using a component, the Coach finds no decision slide, Present stops waiting for a slide's steps. The shared readers
 * read both spellings: `scanMetaSource` (lib/core/meta-scan.mjs), `readMetaField` (lib/core/meta-edit.mjs) and the views
 * over them: `slideClassDirectives` and `classDirectiveAt` (lib/core/class-directive-scan.mjs) and `classEntries`
 * (lib/core/class-entries.mjs).
 *
 * This test parses every source file with the TypeScript scanner, so a regex is found as a regex (a literal, or the
 * first argument of `RegExp(…)`) and never as prose or a string a writer emits. A regex READS A DIRECTIVE when its
 * source spells a directive key with its punctuation: `_class`, `_?class`, `_(?:build|focusSteps)`, `_[A-Za-z]…`,
 * `<!-- pane:`, a negative lookahead on `_` after `<!--`. Every file holding one is either listed below with the number
 * it holds and the reason it may, or it fails. A count that rises is a new reader in a listed file; a count that falls,
 * or a file that no longer matches, is a stale entry, and fails too, so the list only shrinks.
 *
 * The reasons sort into five kinds, and a new entry names one:
 *   guard     refuses, detects, strips or carries a shape, and over-matches on purpose; its record arm sits beside it
 *   cursor    completion or a hover reading the unclosed comment the cursor is in; slice B owns completion
 *   writer    rewrites or emits the comment form; slice C owns what writers write
 *   internal  runs after the engine's door (lib/core/meta-door.mjs, `lattice_meta_expand`) or on the Marp bundle after
 *             `recordsToComments`, so a record has already become the directive comment it reads
 *   grammar   the shared reader or marker grammar itself, or a line it already holds
 *   research  a dated research script that reproduces a recorded measurement and ships nothing
 *
 * What it does not catch, stated: a reader written without a regex (`line.startsWith('<!-- _class:')`), a regex
 * built from pieces in variables, and a regex inside an `.astro` page's template `{…}` expression (its front-matter
 * script and `<script>` blocks are read). The census in meta-readers-census.test.js covers the files the note named.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..', '..', '..');

// The directive keys of the vocabulary (lib/core/meta-keys.mjs KNOWN_KEYS) plus the pane marker names. Written out, not
// imported, so a key dropped from the vocabulary does not silently shrink what this test looks for.
const KEYS = 'theme|paginate|header|footer|hide|class|backgroundColor|backgroundImage|backgroundPosition|backgroundRepeat|backgroundSize|color|size|style|lang|logo|focus|focusStyle|focusSteps|build|debug|lens|track|pane|panes';
/** `_class:`, `_?class\s*:`, `_(?:header|footer)[ \t]*:` … : a spot key, then a colon later in the pattern. */
const SPOT = new RegExp(String.raw`_(?:\\?\?|\?)?\(?(?:\?:)?(?:[A-Za-z|]*\|)?(?:${KEYS})(?![A-Za-z])[^/]*:`);
/** After `<!--`: `_` then a key group, a character class or a capture (`_?(?:build|focusSteps)\b`, `_[A-Za-z][\w-]*`). */
const OPEN = new RegExp(String.raw`_(?:\\?\?|\?)?(?:\(\?:|\()?(?:\[A-Za-z|\[\\w|\[a-z|(?:[A-Za-z|]*\|)?(?:${KEYS})(?![A-Za-z]))`);
/** The running global form after `<!--`: `<!--\s*pane:`, `<!--\s*(?:class)\s*:`. */
const GLOBAL = new RegExp(String.raw`<!--.{0,12}(?:\(\?:)?(?:${KEYS})(?:\)\??)?(?:\\s\*|\[ \\t\]\*)?:`);
/** A lookahead on the underscore right after `<!--`: `<!--\s*(?!_)…:`, `<!--\s*_(?!class\b)…`. */
const NEG = /<!--\\s\*\(\?!_|<!--\\s\*_\(\?!/;
/** After `<!--`: an underscore that opens a generic key (`_(\w+)`, `_[^>]*`, `_\S+`) or ends the pattern (`^<!--\s*_`). */
const OPEN_ANY = /<!--(?:\\s[*+?]|\[ \\t\][*+?]|[ ]?)*_\??(?:$|\(|\[|\\[wS])/;
/** A key named whole, with or without its colon: `\b_class\b`, `_?class:\s*(…)\s*-->` (both the spot and the global form). */
const NAMED = new RegExp(String.raw`(?:\\b|^|[^A-Za-z\\])_(?:${KEYS})\\b|(?:^|[^A-Za-z-])(?:class|pane)(?:\\s\*)?:.*-->`);
function readsDirective(src) {
  if (SPOT.test(src) || GLOBAL.test(src) || NEG.test(src) || OPEN_ANY.test(src) || NAMED.test(src)) return true;
  const at = src.indexOf('<!--');
  return at >= 0 && OPEN.test(src.slice(at));
}

const SKIP = /(^|\/)(node_modules|dist|vendor)\/|\.generated\.|\.min\.js$|^test\/|^docs\/e2e\/|\.test\.|\.spec\.|^\.scratch\//;
function sourceFiles() {
  return execFileSync('git', ['ls-files', '*.js', '*.mjs', '*.cjs', '*.ts', '*.tsx', '*.astro'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !SKIP.test(f));
}

/** An `.astro` page's code, line for line: its front-matter script and its `<script>` blocks, every other line blank, so
 *  a line number still points into the page. Template `{…}` expressions are not read (a stated gap). */
function astroCode(text) {
  const lines = text.split('\n');
  const out = [];
  let fm = lines[0]?.trim() === '---' ? 1 : 0; // 1 inside the front-matter script, 2 past it
  let script = false;
  lines.forEach((line, i) => {
    let keep = false;
    if (fm === 1 && i > 0 && line.trim() === '---') fm = 2;
    else if (fm === 1 && i > 0) keep = true;
    else if (!script && /<script\b[^>]*>/.test(line) && !/<\/script>/.test(line)) script = true;
    else if (script && /<\/script>/.test(line)) script = false;
    else keep = script;
    out.push(keep ? line : '');
  });
  return out.join('\n');
}

/** Every directive-reading regex in a file: `[line, source]`. */
function readersIn(file, rawText) {
  const text = file.endsWith('.astro') ? astroCode(rawText) : rawText;
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const out = [];
  const visit = (n) => {
    let src = null;
    if (n.kind === ts.SyntaxKind.RegularExpressionLiteral) src = n.text.slice(1, n.text.lastIndexOf('/'));
    else if ((ts.isNewExpression(n) || ts.isCallExpression(n)) && n.expression.getText(sf) === 'RegExp' && n.arguments?.[0]) src = n.arguments[0].getText(sf);
    if (src && readsDirective(src)) out.push([sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, src]);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

// [file, count, kind, reason]. Keep it sorted by file.
const ALLOWED = [
  ['docs/src/components/studio/Editor.tsx', 1, 'guard', "the editor's FALLBACK underline for an unknown `_class` name, used only when the lint core has not loaded; the real lint (lint-core.js `meta-record`, slice B) reports an unknown layout in a record"],
  ['docs/src/components/studio/StudioMap.tsx', 1, 'guard', "a poster cache key: every carried (running-global) comment text before a slide; over-matching only retires a poster early, and `CARRIED_RECORD` beside it adds a record's `carry`"],
  ['docs/src/components/studio/architect-agent.ts', 1, 'guard', "normalizes a component name the model passes to a tool, which may arrive as a pasted directive; it strips a `_class:` or an `@meta{layout=` prefix, and reads no slide"],
  ['docs/src/components/studio/pane-probe.ts', 1, 'guard', "a cheap over-matching pane probe with its record arm, held to meta-door `parsePaneMarker` by pane-probe.test.ts (design \u00a75.4.1)"],
  ['docs/src/components/studio/split-slide.ts', 1, 'guard', "picks the directive comment lines to repeat on a split's second half; records are carried beside it through meta-door `isRecordOpener` (deck-ops.test.ts)"],
  ['docs/src/lib/compose/comment-block.ts', 2, 'guard', "Compose's security guard: refuses any pasted `_name`, `{` or `@meta{` comment, a strict pane marker excepted; slice C owns Compose and its pane marker form"],
  ['docs/src/lib/compose/deck-doc.ts', 1, 'guard', "a shape check that a directive line joined into the source cannot open a boundary or a front-matter fence; it reads no value"],
  ['docs/src/lib/compose/deck-source.ts', 2, 'grammar', "Compose's directive-line finder (records included) and the global-scope test of a comment the walk already parsed through meta-edit `commentReadings`"],
  ['docs/src/lib/compose/image-objects.ts', 2, 'writer', "Compose rewrites a slide's class comment when a picture is placed (only when the comment holds the class alone), and skips `_` comments when it reads a running global class; slice C moves Compose's writers to the record"],
  ['docs/src/lib/compose/markdown-clipboard.ts', 1, 'guard', "a paste heuristic, 'does this text look like Markdown': a directive or an `@name{` comment is one signal among many; it reads no value"],
  ['docs/src/lib/compose/pane-model.ts', 1, 'writer', "tells a directive line from a pane pill in a component skeleton when Compose builds a pane; slice C writes the skeletons and decides their record form"],
  ['docs/src/lib/compose/raw-block.ts', 1, 'guard', "a security guard: a foreign page's raw block may not set slide attributes with a `_` directive comment (comment-block.ts refuses records)"],
  ['docs/src/pages/index.astro', 1, 'guard', "a syntax-highlight hint on the home page's hero source: it colors the class line, a `_class` comment or a `@meta{` record; the hero's class itself is read through meta-edit `readMetaField`"],
  ['docs/src/pages/libraries/lente/index.astro', 1, 'grammar', "Lente's demo page reads the class of its own inline demo deck, the string literals written just above it; it reads no author's deck"],
  ['docs/src/playground/context-sources.js', 1, 'cursor', "value completion for the directive key typed on the cursor's line, inside an unclosed comment; slice B owns completion (record values: `recordCompletion`)"],
  ['docs/src/playground/single-slide-render.ts', 4, 'guard', "raw, over-matching probes that decide whether a preview needs the whole deck; each has its record arm (`recordHasWord`, the `carry` probe), pinned by single-slide-render.deck-context.test.ts"],
  ['docs/src/playground/slide-context.js', 4, 'cursor', "completion triggers on the line before the cursor, inside an unclosed `_class:`, `_focusStyle:` or `_focus:` comment; slice B owns completion (records: `recordCompletion`)"],
  ['engineering/decisions/2026-10-17-meta-syntax-bakeoff/slides.mjs', 1, 'research', "the syntax bake-off's frozen sampler, the companion of a dated decision note; it reproduces a measurement on the corpus as it stood and ships nothing"],
  ['kit/vscode/extension.js', 1, 'cursor', "the VS Code extension's class-name completion on the line being typed, inside an unclosed comment; slice B owns completion"],
  ['lib/authoring/lint-core.js', 1, 'grammar', "reads the FRONT MATTER `class:` key for the `no-form` migration check, not a comment; slide classes come from `scanMetaSource`. Slice B owns lint-core"],
  ['lib/authoring/notes-core.js', 1, 'grammar', "classifies one line of a comment the notes extractor already holds: a `hide:` line with no on/off value is a note; it decides no slide setting"],
  ['lib/authoring/prose-budgets.js', 1, 'grammar', "strips class comments from a list block before the word count; a record is never read inside a list item (D1), so it never sits in a counted block"],
  ['lib/core/agenda-autofill.js', 1, 'internal', "the engine's agenda fill adds class words to the slide's comment after the door; a record arrives as `lat-meta` and is handled by `readInternal` beside it"],
  ['lib/core/bake-splits.js', 1, 'internal', "de-duplicates the `<!-- _hide: \u2026 -->` line the split bake itself writes; it reads its own output"],
  ['lib/core/meta-door.mjs', 1, 'grammar', "the shared door: `recordsToComments` writes a record back as the directive comments Marp reads, and reads its own output to quote a YAML value"],
  ['lib/core/pane-spec.js', 6, 'grammar', "the shared pane marker and layout grammar (`parseMarker`, `classOf`, which reads a record through meta-door `readRecord`) and the engine's internal `lat-pane` forms"],
  ['lib/core/panes.js', 2, 'internal', "the pane carve runs on tokens after `lattice_meta_expand`, so a record is already the `_class` directive block it reads (design \u00a75.4.1)"],
  ['lib/core/style-markdown-scan.mjs', 1, 'guard', "a style-needs HINT read from source; a miss costs one second render. Its record arm reads `@meta{\u2026}` values beside it (style-needs-markdown.test.js)"],
  ['lib/diagnostics/slice-equivalence-core.mjs', 1, 'guard', "the pane-map refusal test, with its record arm `recordNamesPaneLayout` beside it"],
  ['lib/export/marp-bleed-ink.js', 1, 'internal', "a Marp bundle pass after `recordsToComments` (the first of `MARP_PASSES`): every record is already a Marp comment"],
  ['lib/export/marp-bundle-html.js', 1, 'internal', "code serialized into the Marp bundle, run by marp-core on the bundle's comments, which `recordsToComments` wrote"],
  ['lib/export/marp-bundle-math.js', 1, 'internal', "a Marp bundle pass after `recordsToComments`: escapes math in the header and footer comments Marp reads"],
  ['lib/layout/gate.js', 1, 'writer', "`skeletonInvokes`, the gate on a model-written skeleton; slice C moves skeletons and this gate to the record (\u00a715.3, writers)"],
  ['lib/packages/rename.js', 1, 'writer', "rewrites a class token in place inside a package gallery's comment; records are rewritten beside it, in their class-shaped fields only"],
  ['lib/plugins/image/image.lint.js', 1, 'writer', "finds the class comment the `image-marp-keyword` fix adds a word to; slices B and C move lint fixes to the record"],
  ['lib/plugins/image/shared/image-migrate.js', 1, 'writer', "the `![bg]` migration's class-comment rewrite (`classLineWith`); slices B and C move lint fixes to the record"],
  ['tools/build-component-docs.js', 4, 'writer', "composes doc specimens by appending a modifier, a stress marker or a footer to a manifest sample's class comment; slice C writes the samples and moves this"],
  ['tools/build-galleries.js', 1, 'writer', "`injectDark` appends `dark` to each class comment of a generated gallery; slice C owns the generators"],
  ['tools/check-jank.js', 1, 'guard', "the `_key:` comment arm of `carriesSetting`, which carries a manifest sample's non-class settings into the sweep; its record arm reads through meta-door `recordParts` and `readRecord` beside it"],
  ['tools/conformance-render.js', 1, 'writer', "writes a `_header` before each slide's class, a comment or a record; slice C owns what writers write"],
  ['tools/lib/calibrate-panel.js', 1, 'writer', "rewrites the class comment a calibration deck builder (`gradedDeck`) just wrote; it reads its own output"],
  ['tools/lib/calibrate-points.js', 1, 'writer', "merges two class comments a calibration deck builder (`gradedDeck`) just wrote; it reads its own output"],
  ['tools/lib/calibrate-rows.js', 1, 'writer', "merges two class comments a calibration deck builder (`gradedDeck`) just wrote; it reads its own output"],
  ['tools/lint-deck.js', 2, 'guard', "strips pane comments from the narration approximation for acronym discovery; a record is stripped whole beside them"],
  ['tools/measure-pane-fit.js', 1, 'guard', "strips every settings line from the probe body: the `_key:` comment arm, with the record arm beside it through meta-door `isRecordOpener`"],
  ['tools/migrate-state-chart-v1.js', 1, 'writer', "a one-shot codemod for state-chart v1 decks, which predate records; it reads the form those decks were written in"],
  ['tools/parser-bakeoff/list-text.mjs', 1, 'research', "the parser bake-off's frozen text sampler; it reproduces a dated measurement on the corpus as it stood and ships nothing"],
];

/** A cheap text gate before the parse: a file with no `<!--` and no `_` + key spelling cannot hold a reader. */
const MAY = new RegExp(String.raw`<!--|_\??\(?(?:\?:)?(?:${KEYS})`);

function census() {
  const found = new Map();
  for (const f of sourceFiles()) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (!MAY.test(text)) continue;
    const hits = readersIn(f, text);
    if (hits.length) found.set(f, hits);
  }
  return found;
}


describe('no new hand-rolled directive reader (meta-record §15, slice A)', () => {
  test('the detector reads a directive regex and leaves the rest', () => {
    for (const src of [String.raw`<!--\s*_class:\s*([^>]*?)\s*-->`, String.raw`<!--\s*_?class\s*:`, String.raw`<!--\s*_?(?:build|focusSteps)\b`, String.raw`^<!--\s*_[A-Za-z][\w-]*:`, String.raw`class:\s*([^>]*?)\s*-->`, String.raw`<!--\s*_(\w+)\s*:`, String.raw`<!--\s*_?(\w+):`, String.raw`\b_class\b`, String.raw`^<!--\s*_`, String.raw`<!--\s*_[^>]*-->`, String.raw`<!--\s*_\S+:`, String.raw`<!--\s*pane:\s*([a-z]+)`, String.raw`<!--\s*(?!_)[a-zA-Z][\w-]*\s*:`, String.raw`^\s*_hide\s*:\s*(\S*)\s*$`, String.raw`(^|\n|<!--)([ \t]*)_?(?:header|footer)[ \t]*:`]) {
      assert.ok(readsDirective(src), src);
    }
    for (const src of [String.raw`class\s*=\s*"([^"]*)"`, String.raw`<!--[\s\S]*?-->`, String.raw`(^|[^\p{L}\p{N}_])_(?=\S)([\s\S]*?\S)_(?![\p{L}\p{N}_])`, String.raw`<!--\s*(?:@meta)?\{`, String.raw`^\s*class\s*:[^\n]*\bproof\b`]) {
      assert.ok(!readsDirective(src), src);
    }
  });

  test('every file holding a directive-reading regex is listed with its count and a reason', () => {
    const found = census();
    const allowed = new Map(ALLOWED.map(([f, n, kind, why]) => [f, { n, kind, why }]));
    const problems = [];
    for (const [f, hits] of found) {
      const a = allowed.get(f);
      const where = hits.map(([line, src]) => `${f}:${line}  /${src.slice(0, 90)}/`).join('\n    ');
      if (!a) problems.push(`NEW reader, not listed: read through scanMetaSource / readMetaField / classEntries, or list it with a reason\n    ${where}`);
      else if (hits.length > a.n) problems.push(`${f}: ${hits.length} readers, listed for ${a.n}: a new one was added\n    ${where}`);
      else if (hits.length < a.n) problems.push(`${f}: ${hits.length} readers, listed for ${a.n}: lower the count (the list only shrinks)`);
    }
    for (const f of allowed.keys()) if (!found.has(f)) problems.push(`${f}: listed, but holds no directive-reading regex now: drop the entry`);
    assert.deepEqual(problems, []);
  });

  test('every entry names its kind and a reason, and the list is sorted', () => {
    const KINDS = new Set(['guard', 'cursor', 'writer', 'internal', 'grammar', 'research']);
    for (const [f, n, kind, why] of ALLOWED) {
      assert.ok(Number.isInteger(n) && n > 0, `${f}: count`);
      assert.ok(KINDS.has(kind), `${f}: kind "${kind}"`);
      assert.ok(typeof why === 'string' && why.length > 30, `${f}: needs a reason`);
    }
    const files = ALLOWED.map(([f]) => f);
    assert.deepEqual(files, [...files].sort(), 'sorted by file');
  });
});
