/**
 * The reader census of engineering/decisions/2026-10-17-meta-record.md §14, with a decision for every
 * file (§9 step 1: "migrate the 42 readers"). Each file under the note's census is either
 *
 *   migrated   it reads comments through the shared modules (lib/core/meta-record.mjs, meta-keys.mjs,
 *              comment-directive.mjs, the Studio's slide-directives.ts, which wraps them), or
 *   door       it reads the pane marker grammar and waits for the step 2 door (design §5.4.1); step 2 moved
 *              all six, so no row may read `door` any more, or
 *   stays      it reads a different grammar, only strips or tokenizes comments, or cannot move without
 *              changing its output; the reason names what would have to change.
 *
 * The test pins three things: the census in the note and this table are the same set (a file added to
 * or removed from one fails), a `migrated` file really imports a shared module, and a `stays` file has
 * a reason, and every file design §5.4.1 names reads `migrated` with no `door` row left. It does not stop a NEW hand-rolled reader in a file outside the census; the key-list guard in
 * meta-keys.test.js stops the costlier half of that (a sixth copy of the vocabulary).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const M = 'migrated';
const S = 'stays';
const D = 'door';

// [path, status, one-line reason]
const CENSUS = [
  // ── Studio and docs site ────────────────────────────────────────────────
  ['docs/src/components/studio/Editor.tsx', S, 'the unknown-component underline needs a document offset and matches inside fences; needs an offset-returning helper'],
  ['docs/src/components/studio/PresentOverlay.tsx', M, 'the pane gate is the editor\'s pane-probe, pinned to meta-door parsePaneMarker; its `<!-- pane:` regex is gone (design §5.4.1)'],
  ['docs/src/components/studio/StudioShell.tsx', M, 'the pane skeleton class read goes through getClassTokens'],
  ['docs/src/components/studio/coach/coach-core.ts', S, 'deck-wide heuristic probes that deliberately match fenced and quoted examples'],
  ['docs/src/components/studio/editor-complete.ts', S, 'inCollageSlide walks its own boundary rule; the shared resolution would change its answer'],
  ['docs/src/lib/deck-lint.ts', M, 'class read through the shared slideClassDirectives; pane markers through meta-door parsePaneMarker (design §5.4.2)'],
  ['docs/src/components/studio/pane-pages.ts', M, 'paneMarkerComponents reads every marker spelling through meta-door parsePaneMarker; PANE_MARKER is gone (design §5.4.1)'],
  ['docs/src/components/studio/pane-probe.ts', M, 'stays a cheap over-matching regex by design, with the record arms added; pane-probe.test.ts pins it to meta-door parsePaneMarker (design §5.4.1)'],
  ['docs/src/components/studio/present-sections.ts', S, 'reads a lone chunk with no deck context; the shared read would change section boundaries'],
  ['docs/src/components/studio/present/rehearsal.js', S, 'classOf takes the first spot class; the shared reader takes the last plus the running global'],
  ['docs/src/lib/slide-directives.ts', M, 'key list, fences, comment finder, class read and write all come from the shared modules; isPaneMarkerBody reads through meta-door parsePaneMarker'],
  ['docs/src/components/studio/split-slide.ts', M, 'the local-directive list comes from LOCAL_KEYS'],
  ['docs/src/lib/code-packages/door.ts', M, 'reads class through commentBodies and readDirectiveComment, pane markers through meta-door parsePaneMarker'],
  ['docs/src/lib/compose/comment-block.ts', S, 'a security guard that refuses ANY _name comment, vocabulary or not'],
  ['docs/src/lib/compose/deck-doc.ts', M, 'class read through deck-source classNameOf'],
  ['docs/src/lib/compose/deck-source.ts', M, 'class read through readDirectiveComment; a pane marker kept in place through meta-door parsePaneMarker'],
  ['docs/src/lib/compose/pane-model.ts', M, 'reads markers through pane-spec parseMarker (meta-door parsePaneMarker); its writers keep `_pane:` until the cut switches the written form (design §5.4.1)'],
  ['docs/src/lib/compose/registers.ts', M, 'class reads go through classPayloadOf and classNameOf'],
  ['docs/src/lib/lente/tags.ts', S, 'a published zero-dependency package; importing lib/core breaks its contract'],
  ['docs/src/playground/single-slide-render.ts', S, 'a gate that over-triggers on purpose (quoted and fenced matches included)'],
  ['docs/src/playground/slide-context.js', M, 'class read is classDirectiveAt; key completion is COMPLETE_KEYS; the rest reads an unclosed comment before the cursor'],
  // ── Authoring ───────────────────────────────────────────────────────────
  ['lib/authoring/lint-core.js', M, 'directive, marker and focus reads go through scanMetaSource, hasMarker and directiveKey; pure strips stay'],
  ['lib/authoring/notes-core.js', M, 'key lists come from meta-keys; lat-* comments and registered markers are tooling'],
  ['lib/authoring/prose-budgets.js', S, 'a strip that removes a class comment from the word count; needs a character span the scan does not report'],
  ['lib/authoring/review-core.js', S, 'class read is the shared slideClassDirectives; the rest strips or skips comments'],
  // ── Core, engine, render path ───────────────────────────────────────────
  ['lib/conformance/kinds/component.contract.js', M, 'galleryRealizes reads _class and _footer through readDirectiveComment'],
  ['lib/core/auto-split.js', S, 'deckChromeFrom reads front matter only since 2026-10-20: a plain header: or footer: comment is the slide\'s own (SLIDE_ONLY_KEYS), so no comment directive is deck chrome'],
  ['lib/core/bg-image-lift.js', M, 'parses each comment with readDirectiveComment (the Marp export\'s lift, moved out of bg-image.js)'],
  ['lib/core/chart-narration.js', M, 'spot class read through commentBodies and readDirectiveComment'],
  ['lib/core/class-directive-scan.mjs', M, 'a view over scanMetaSource'],
  ['lib/export/marp-bundle-math.js', S, 'inserts escapes at byte offsets inside header and footer values; needs a positional reader'],
  ['lib/core/pane-spec.js', M, 'parseMarker and the layout read go through meta-door parsePaneMarker; the internal-form regexes stay (design §5.4.1)'],
  ['lib/core/panes.js', M, 'reads authored markers through pane-spec parseMarker; the door compiles a record and guards the internal form first; the carve reads the internal form (design §5.4.1)'],
  ['lib/core/resolve-motion.mjs', S, 'matches motion words in ANY comment, notes included'],
  ['lib/core/slide-speech.js', S, 'only blanks comments and keeps the line count'],
  ['lib/diagnostics/slice-equivalence-core.mjs', M, 'synthesizePrelude and dividerTokens read through commentBodies and readDirectiveComment; positionIsTrustworthy counts markers through meta-door parsePaneMarker'],
  ['lib/engine/directives.js', M, 'the vocabulary is the registry'],
  ['lib/exemplars/tier-filter.js', S, 'tier: is a producer-owned pragma, not a directive'],
  ['lib/integrations/markdown-it/plugins.js', S, 'reads no directive comment since the _focusSteps parse-time copy was retired (2026-11-09-steps-as-a-behavior.md)'],
  ['lib/layout/bridge.js', M, 'class reads go through commentBodies and readDirectiveComment'],
  ['lib/layout/gate.js', S, 'a gate on model-written skeletons that matches a _class prefix on purpose'],
  ['lib/packages/rename.js', S, 'rewrites class tokens in place inside the comment bytes; the shared reader unquotes'],
  ['lib/playground/index.js', M, 'chartsNeeded reads comment text through commentBodies'],
  // ── Strip, skip, tokenize or escape only (18) ───────────────────────────
  ['docs/src/components/studio/architect-agent.ts', S, 'only strips, skips or tokenizes comments'],
  ['docs/src/lib/caret-probe.ts', S, 'only strips, skips or tokenizes comments'],
  ['docs/src/lib/deck-outline/deck-outline.ts', S, 'only strips, skips or tokenizes comments'],
  ['docs/src/lib/playground-controller.ts', S, 'only strips, skips or tokenizes comments'],
  ['lib/authoring/fact-check-core.js', S, 'only skips comment lines; its class read is already shared'],
  ['lib/plugins/chart-family/shared/mark-detail.js', S, 'only strips, skips or tokenizes comments'],
  ['lib/core/closed-comments.js', S, 'the linear comment tokenizer'],
  ['lib/core/flowchart-html.js', S, 'only strips, skips or tokenizes comments'],
  ['lib/core/heading-split-core.mjs', S, 'only strips, skips or tokenizes comments'],
  ['lib/core/live-author-html.js', S, 'only strips, skips or tokenizes comments'],
  ['lib/core/pane-css.js', S, 'only strips, skips or tokenizes comments'],
  ['lib/core/prose-code.js', S, 'only strips, skips or tokenizes comments'],
  ['lib/core/slide-class-spans.js', M, 'already reads class through readDirectiveComment'],
  ['lib/core/split-panels.js', S, 'strips comments from rendered HTML'],
  ['lib/export/html-player.js', S, 'a rendered-HTML comment tokenizer'],
  ['lib/forms/cell/masthead/masthead.transform.js', S, 'only strips, skips or tokenizes comments'],
  ['lib/core/code-door-core.mjs', S, 'only strips, skips or tokenizes comments'],
  ['lib/plugins/chart-family/chart-family.dispatch.js', S, 'only strips, skips or tokenizes comments'],
];

const SHARED = /meta-record|meta-edit|meta-keys|meta-door|pane-spec|pane-probe|comment-directive|class-directive-scan|slide-directives|lib\/engine\/directives|\.\/directives|deck-source|classNameOf|classPayloadOf|slide-class-spans/;

// A reader that stays a regex on purpose (it must stay cheap), held to the shared reader by a test instead of an import.
const PINNED = { 'docs/src/components/studio/pane-probe.ts': 'docs/src/components/studio/pane-probe.test.ts' };

describe('the reader census (design note §14)', () => {
  const note = fs.readFileSync(path.join(ROOT, 'engineering/decisions/2026-10-17-meta-record.md'), 'utf8');
  const section = note.slice(note.indexOf('## 14. Appendix'));
  const listed = [...section.matchAll(/^- `([^`]+)`$/gm)].map((m) => m[1]);

  test('every file the note lists has a decision here, and nothing else is claimed', () => {
    const have = new Set(CENSUS.map(([f]) => f));
    // The shared scanner is listed as "the one not re-spelling"; every other listed file needs a row.
    const missing = listed.filter((f) => !have.has(f));
    assert.deepEqual(missing, [], 'a file in §14 with no decision');
    assert.ok(listed.length >= 60, `expected the note's 61 files, parsed ${listed.length}`);
    const extra = CENSUS.map(([f]) => f).filter((f) => !listed.includes(f));
    assert.deepEqual(extra, [], 'a row here that §14 does not list: add it to the note or drop it');
  });

  test('every file exists, and a stays row has a reason', () => {
    for (const [f, status, why] of CENSUS) {
      assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} does not exist`);
      assert.ok(status === M || status === S || status === D, `${f}: unknown status`);
      assert.ok(why && why.length > 12, `${f}: needs a reason`);
    }
  });

  test('a migrated file imports a shared module', () => {
    const bad = CENSUS.filter(([, s]) => s === M).map(([f]) => f).filter((f) => !SHARED.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    assert.deepEqual(bad, []);
  });

  test('every file design §5.4.1 names is migrated, and no row waits for the door (step 2)', () => {
    const sub = note.slice(note.indexOf('### 5.4.1'), note.indexOf('### 5.4.2'));
    const named = [...sub.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]).sort();
    assert.equal(named.length, 6, 'the six pane marker readers');
    const status = new Map(CENSUS.map(([f, st]) => [f, st]));
    assert.deepEqual(named.filter((f) => status.get(f) !== M), [], 'a §5.4.1 file not yet migrated');
    assert.deepEqual(CENSUS.filter(([, st]) => st === D).map(([f]) => f), [], 'a row still waits for the door');
  });

  test('a pinned reader\'s test reads the shared parser it is held to', () => {
    for (const [f, pin] of Object.entries(PINNED)) {
      assert.ok(CENSUS.some(([g, st]) => g === f && st === M), `${f}: a pinned row is a migrated row`);
      assert.match(fs.readFileSync(path.join(ROOT, pin), 'utf8'), /import \{[^}]*\bparsePaneMarker\b[^}]*\} from '[^']*lib\/core\/meta-door\.mjs'/, `${pin} must import parsePaneMarker`);
    }
  });

  test('§5.4.2 traces the other pane readers, and each file exists', () => {
    const sub = note.slice(note.indexOf('### 5.4.2'), note.indexOf('### 5.5'));
    const named = [...sub.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]).sort();
    assert.equal(named.length, 8, 'six regex readers and two that follow pane-spec');
    for (const f of named) assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} does not exist`);
  });

  test('the tally the PR reports', () => {
    const n = (s) => CENSUS.filter(([, x]) => x === s).length;
    console.log(`# reader census: ${CENSUS.length} files · ${n(M)} migrated · ${n(D)} wait for the door · ${n(S)} stay`);
    assert.equal(n(M) + n(D) + n(S), CENSUS.length);
  });
});
