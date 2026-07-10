---
status: shipped
summary: Closed out most of the Marp-legacy audit's §6 doc-framing backlog (2026-07-09-marp-legacy-audit.md). Rewrote architecture.md's opening ("Why Marp emulation, not Marp itself" → "Why the owned engine, not a Marp CLI wrapper") and two smaller factual corrections in the same file; corrected the LFM spec's "Lattice is a Marp-based engine" and an overclaimed live marp-core parity test; reconciled cascade.md's !important framing against marp-independence.md's (both true, scoped to different render paths — not a contradiction once qualified); replaced engineering/pipeline.md's ~400 obsolete pre-engine lines with an accurate operational how-to; fixed 7 test files' phantom "marp-cli third render path" comments, surfacing one adjacent finding (an unwired kernel helper) logged but not touched. design/theming.md and design/design-system.md's Marp mentions turned out to already be accurate on inspection — left untouched, avoiding unnecessary churn.
---

# Marp-legacy audit §6 — doc-framing cleanup

**Context:** §6 of `2026-07-09-marp-legacy-audit.md` logged a backlog of
canonical docs whose Marp/Marpit framing had drifted from reality — written
when Lattice genuinely wrapped Marp, never updated once the engine became a
native, independent re-implementation (`engineering/marp-independence.md`).
Authorized to proceed on all of §6 except the already-explicitly-deferred
`legal.gallery.md` fix (HARD RULE #8 gallery isolation — separate PR) once
§5(b) (retire marp-vscode preview support?) was decided against, since two
of the backlog items were gated on that call.

## What actually needed fixing vs. what didn't

The backlog named five docs by file. On inspection, only two had a real
overclaiming problem:

- **`engineering/architecture.md`** — opened with "Why Marp emulation, not
  Marp itself," framing the engine as fundamentally an emulation layer.
  Reframed to "Why the owned engine, not a Marp CLI wrapper," leading with
  the native-re-implementation fact and demoting Marp-structural-compatibility
  to what it actually is: a deliberate interop choice (the Export-to-Marp
  bundle, the VS Code preview), not the reason the engine exists. Two smaller
  fixes in the same file: an ASCII diagram label ("HTML emulating Marp" →
  "HTML (Marpit-compatible structure)") and "markdown that Marp emits" (there
  is no Marp in this code path — it's the engine's own markdown-it output).
- **`spec/LFM-1.0.md`** — literally stated "Lattice is a Marp-based engine."
  Corrected to name the native re-implementation (zero `@marp-team` runtime
  dependency) while keeping the true, useful part: LFM's slide model is
  still Marpit-*compatible*, which is a real and load-bearing fact (the
  Export-to-Marp bundle, LFM's degradation guarantee). Also corrected a
  precision overclaim: "the reference implementation locks them to marp-core
  with a parity test" implied a live comparison; the actual test
  (`test/unit/authoring/notes-core.test.js`) pins hardcoded expected outputs
  derived from marp-core's *documented* behavior — no live marp-core runs
  anywhere in the suite. Stated plainly now.

**`design/theming.md` and `design/design-system.md`** — read in full for
every Marp/Marpit mention. Every one turned out to be an accurate, current
technical or historical fact (why `mode:` was chosen over `style:` because
Marp reserves `style:`; header/footer/pagination riding native Marp
directives; the VS Code preview Chromium quirk) — not the audit's targeted
problem (Marp/Marpit presented as the architectural frame). Left untouched.
Rewriting accurate prose to satisfy a backlog item's letter rather than its
actual intent would have been churn, not a fix.

## The cascade.md / marp-independence.md reconciliation

The audit flagged a real apparent contradiction: `cascade.md` said
`scaffold.css`'s `!important` exists "to override Marp's later-loaded
scaffold defaults"; `marp-independence.md`'s scorecard said Lattice's CSS
fidelity advantage is "no fighting marp's `!important` scaffold." Both are
true — they just needed to state which render path they're each about.
`scaffold.css` is the *same file* the Export-to-Marp bundle ships (HARD RULE
#1, one source of truth); the `!important` is genuinely dead weight in the
owned engine's own render (nothing competing loads there) but load-bearing
in the one place it does compete: real marp-core, when the bundle is
rendered via actual marp-cli. Both docs now cross-reference each other with
that qualification instead of reading as opposed claims.

## pipeline.md

Read in full before touching it — confirmed the audit's characterization was
accurate: ~400 lines instructing an agent to hand-roll a Marp-markdown
parser, Puppeteer PDF pipeline, and PptxGenJS assembly from scratch, written
for a generic sandboxed-agent context (`/home/claude/...` paths) that
predates `lib/engine` existing at all. Replaced entirely rather than
patched — the real pipeline is already documented accurately in
`architecture.md` § "The build pipeline"; this doc's job is the operational
how-to (the actual CLI, the `npm run preview` loop, `tools/
rasterize-for-review.sh`), not a second copy of the internals. One claim
in the old doc's PPTX troubleshooting table (`charSpacing` in PPTX) was
verified against `lib/export/pptx-export.js` and found to not apply at all
— PPTX export is image-per-slide (`addImage`, no text boxes) — replaced with
an accurate entry about why PPTX text isn't editable, by design.

## Test file headers

Fixed all 7 files named in the backlog
(`test/unit/transformers/{registry,below-note,pill-tag,masthead-lift}.test.js`,
`test/unit/forms/{meta-tile,progress-tile,watermark-tile}.test.js`). Each
wrongly named "marp-cli" as if it were one of Lattice's actual render paths
(per `lib/README.md`, the real three are the CLI/PDF path, the browser
playground, and the VS Code preview runtime — marp-cli was never one of
them; the phrase is P4-retirement staleness). Corrected each to name the
real consumers: `applyToHtml` (`lib/engine` — serving both the CLI/PDF path
and the browser playground, which share the call) and `applyToDom`
(`lattice-runtime.js`).

**Adjacent finding, logged not fixed:** while verifying `below-note.test.js`'s
claims against the actual kernel (`lib/core/below-note.js`), confirmed via
repo-wide grep that its exported `wrapSectionBody` helper has **zero
production callers** — not wired into the registry adapter
(`lib/transformers/below-note.js`), which only exposes `applyToHtml`/
`applyToDom`. It's exercised solely by its own unit test. Not dead code in
the pejorative sense — the kernel's own comment says it's kept for
byte-identical parity with the pre-kernel regex it replaced — but the test's
old header wrongly called it "the emulator path," implying active production
use. Comment corrected to describe it accurately as an unwired kernel
helper; the function itself untouched (HARD RULE #18 — off-path from a
comment-accuracy sweep; removing it is its own decision with its own blast
radius).

## What changed

- `engineering/architecture.md`, `spec/LFM-1.0.md`, `engineering/cascade.md`,
  `engineering/marp-independence.md`, `engineering/pipeline.md` (full
  rewrite) — prose corrections, no behavior change.
- `docs/src/content/docs/spec/lfm.md` — regenerated from `spec/LFM-1.0.md`
  (`npm run docs:spec`).
- 7 test files' header comments — prose only, zero assertion changes; all
  114 tests in the affected files still pass unchanged.
- `engineering/decisions/2026-07-09-marp-legacy-audit.md` — §5(b) recorded
  as decided (not retiring marp-vscode); §6 items closed out individually.

## Not touched

- `design/theming.md`, `design/design-system.md` — read in full, found
  already accurate; no changes.
- `lib/core/below-note.js`'s unwired `wrapSectionBody` — logged above, not
  removed.
- `lib/components/legal/legal.gallery.md`'s false "Three-renderer parity"
  bullet — still open, its own PR per HARD RULE #8 (gallery isolation).
