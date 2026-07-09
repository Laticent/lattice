---
status: in-progress
summary: Full-repo audit of Marp coupling beyond the sanctioned one-way export channel (lib/core/marp-bundle.js). Red team + Munger inversion + independent checker (8-agent adversarial pass, 100% of a 33-item sample confirmed) converge on one finding — the real, regenerative tax is engineering/workflow.md's "Two-renderer rule," which mandated every authoring transform be duplicated in lattice-runtime.js forever to keep the third-party marp-vscode preview (which runs raw marp-core, not our engine) looking right. Everything else is either a one-time inert cost, phantom/stale "marp-cli" references from before the P4 retirement, or canonical docs that disagree with each other about what Lattice even is. §5(a) — demoting the Two-renderer rule to opt-in-and-sunsettable — is now DONE (engineering/workflow.md rewritten). §5(b) — whether to retire marp-vscode as a first-party-supported preview surface — remains an open product decision. §6's doc-framing rewrites remain backlog.
---

# Marp legacy audit — what's really left, and what to do about it

**Ask:** "we still have marp legacy baggage… treat marp as export channel not
something that holds us back from innovating." This note is the inventory,
run through a red team, a Munger inversion, and an independent checker before
being trusted.

## TL;DR

`engineering/marp-independence.md` claims Marp is "fully externalized… nothing
of ours uses Marp, especially not verification." That's **true on the narrowest
reading** — no `@marp-team` package sits in `package.json`/`package-lock.json`,
confirmed clean. It's **false on every broader reading**. Five things are true
at once, all confirmed against the actual repo:

1. **A third-party tool — the "Marp for VS Code" extension — runs raw
   `marp-core` to preview `.md` decks, not Lattice's own engine**, and
   `engineering/workflow.md`'s binding **"Two-renderer rule"** requires every
   authoring transform to be built *twice* — once for the owned engine, once
   as a `lattice-runtime.js` DOM mirror — forever, specifically to keep that
   third-party preview looking right. This is the one **regenerative** cost:
   it manufactures a new duplicate-path finding on every future feature by
   written policy, not by accident. (~800 lines of `lib/runtime/index.js`,
   a dozen dual-kernel test files, a permanent theme-CSS selector ban, a
   Chromium-91 feature ceiling on the whole runtime bundle.)
2. A handful of **one-time, now-inert** architecture choices are still
   Marp-shaped (a `highlight.js` version pin, heading-`id` attribute
   tolerance, a background-image capability ceiling) — paid once, not
   regenerating, low priority.
3. **Dozens of comments, test-file headers, and even one shipped example
   deck** assert a **third render path (`marp-cli`) and marp-core-based
   "parity tests"** that were deleted in the P4 retirement
   (`2026-06-12-p4-regression-gate-retire-marp.md`) and **do not exist
   anymore** — pure stale/phantom references with zero functional coupling,
   cheap to fix, high value to fix (they actively mislead the next agent or
   engineer who reads them, including this codebase's own docs-honesty
   auditor subagent).
4. **Vestigial branding** — `package.json`'s description/keywords, `AGENTS.md`'s
   opening line, a test helper named `makeMarp()` that has zero Marp
   dependency — reinforces the wrong mental model at zero functional cost to
   fix.
5. **Six canonical docs disagree with each other** about what Lattice
   fundamentally *is*: `marp-independence.md` ("fully externalized"),
   `architecture.md` ("Why Marp emulation, not Marp itself"), `cascade.md`
   (documents live `!important` rules whose *stated purpose* is defeating
   Marp's scaffold — directly contradicting `marp-independence.md`'s own "no
   fighting marp's `!important` scaffold" line), the LFM spec ("Lattice is a
   Marp-based engine"), `design/theming.md` (Marp-first "anatomy of a
   palette"), and `engineering/pipeline.md` (~400 lines of stale pre-engine
   marp-cli bootstrap instructions). A reader gets a different story
   depending which doc they land on first.

**What this PR does:** ships this audit + fixes the ~20 cheapest, zero-risk,
purely-factual items (§4) and adds an honest cost line to
`marp-independence.md`. **What it deliberately does NOT do:** touch the
Two-renderer rule, rewrite the contradicting framing docs, or change any
runtime behavior — those are product/architecture decisions, flagged below,
not mine to make unilaterally.

## Method

8-agent workflow: 5 parallel discovery agents partitioned by area (core
kernel; runtime + component transforms; the sanctioned export boundary; tests
+ build tooling; docs/content), each classifying every `marp`-hit in its area
against a taxonomy (sanctioned-export-boundary / preview-compat-constraint /
render-path-residue / docs-drift / branding-naming / harmless-citation, the
last one dropped). 69 raw findings, merged. Then the adversarial trio, each
given the full merged list and told to distinguish real load-bearing coupling
from noise:

- **Red team** flagged 2 findings as over-classified (a theme-packaging
  finding that conflated a generic browser-`<link>` limitation with a live
  Marp dependency; the "marp-cli path" label on ~8 test files, which the
  registry/transform kernels' own "Consumers:" lists show has exactly **two**
  real consumers, never marp-cli) and surfaced 7 findings the discovery pass
  missed (folded into §4 below).
- **Munger inversion**, asked "how would we guarantee Lattice stays shackled
  to Marp forever?", identified the Two-renderer rule as the single
  structural, regenerative cause — see §3 — and steelmanned keeping
  marp-vscode support (a free, ubiquitous, zero-build preview loop authors
  may currently rely on), then undercut its own steelman: `gotchas.md`
  documents that despite the full duplication cost, the preview **still
  doesn't work correctly** for several directives ("no path works in the
  marp-vscode preview" — the logo-directive entry). Paying the full
  architectural tax without collecting the full benefit is the tell that
  this crossed from "reasonable trade" to "sunk-cost legacy tax."
- **Independent checker** sampled 33 of the 69+7 findings (all high-severity
  plus a spread of medium/low), verifying file/line/quote against the actual
  repo. **33/33 substantively confirmed** (one, `examples/build.md`'s "~230
  decks" figure, confirmed-in-substance with an imprecise count — actual is
  ~207). No fabricated citations, no misquoted evidence.

Full raw output (76 findings, red-team verdict, inversion analysis, checker
verifications) is in the workflow journal for this run if a future audit
wants the complete list rather than this note's synthesis.

## §1 — The real, regenerative cost: the Two-renderer rule

`engineering/workflow.md` §"Two-renderer rule" is binding today:

> Any authoring transform must land in the shared kernels so every render
> path stays in step… 1. the owned `lib/engine`… 2. `lattice-runtime.js` (the
> **vscode Marp preview** and the published-HTML runtime)… The owned engine
> is canonical (the marp-parity gate was retired in P4; **Marp is no longer a
> render path**).

That last sentence and the rule it closes contradict each other in the same
paragraph: Marp is "no longer a render path," yet the rule mandates a whole
second render path exist **specifically to serve marp-vscode**. Concretely,
this is why:

- `lib/runtime/index.js` re-implements ~800 lines of front-matter parsing and
  deck-wide `class:`/`finish:`/`mode:`/`logo:`/`form:` propagation — work the
  owned engine's markdown-it plugins already do at render time — purely
  because marp-vscode "has no `markdown.marp.engine` setting… never runs
  Lattice's plugins" (`engineering/gotchas.md`).
- The whole Form/Tile default-composition system, chart-family's structural
  HTML transforms, masthead-lift, below-note, pill-tag, and meta/progress/
  watermark-tile each carry **two independently-tested kernels** — an
  HTML-string kernel and a DOM-mirror kernel — with dedicated test files
  proving the two agree (`masthead-lift.test.js`, `pill-tag.test.js`,
  `below-note.test.js`, `meta-tile.test.js`, `progress-tile.test.js`,
  `watermark-tile.test.js`, `runtime-form-wiring.test.js`).
- `lib/core/collections.js` hand-rolls string tree-walkers instead of CSS
  `:has()`/`:nth-child()` because those selectors are "silently broken in the
  Marp preview Chromium" — now CLAUDE.md HARD RULE #12, a **permanent,
  CI-gated ban** on that selector form across every theme file, forever,
  because one third-party extension bundles an old Chromium.
- `tools/build-runtime.js` caps the *entire* runtime bundle's JS/CSS target
  at `chrome91+` because "the marp-vscode preview webview runs on a Chromium
  version a few major releases behind stable" — holding back the web-export
  and human-DevTools-inspection bundle too, not just the preview path.
- `design/theming.md`'s official new-palette workflow requires registering
  every palette in `.vscode/settings.json` under `markdown.marp.themes` "so
  the Marp VS Code extension picks it up."
- `engineering/gotchas.md`'s "VS Code / marp-vscode" section runs 15+ entries
  deep, several ending in "no path works in the marp-vscode preview" (the
  `logo:` directive, after three separate implementation attempts) or
  "Removable when: marp-vscode adds engine config support… no indication
  this is planned" — permanent workarounds for a dependency the project
  cannot fix or remove.

**This is real and current**, not legacy in the sense of "dead code" — it's a
live, binding, CI-relevant policy that will keep generating this exact class
of finding on every future component or transform, because the rule requires
it by name. That's what makes it different from everything else in this
audit: the rest is a bill already paid; this one is a standing order.

## §2 — One-time, now-inert residue (low priority)

Marp-shaped, but paid once and not regenerating — no urgency, listed for
completeness:

| File | What |
|---|---|
| `lib/engine/index.js` (`highlight.js` pin) | Pinned to match marp-core's bundled `highlight.js` version so fenced-code token spans stay byte-identical to the historical marp baseline |
| `lib/components/chart/_chart-family/chart-family.js`, `lib/components/code/compare-code/compare-code.transform.js` | Regexes stay attribute-tolerant because marp-core stamps `id="…"` on headings and the owned engine doesn't |
| `lib/core/bg-image.js` | The owned engine's own `bg left/right` handling is capped to match marp-core's WEB-mode collapse-to-full-bleed behavior; a sibling kernel exists solely to reconstruct the richer layout for PDF |
| `lib/components/chart/_chart-family/chart-family.css` (`.chart-body` width) | Pinned to an absolute `calc()` instead of `100%` because VS Code Marp preview's webview resolves percentages against an indeterminate ancestor |
| `lib/core/section-walk.js`, `lib/core/split-panels.js` | Pure string-in/string-out tree-walking (no DOM) — architected this way originally to survive marp-vscode's script-blocked webview, now also the pattern the owned engine's own export path inherited |

None of these block a new feature the way §1 does; they're closer to a fixed
historical tax than an ongoing one. Worth a look if `lib/core/section-walk.js`
is ever rewritten for its own sake, not worth a dedicated cleanup pass today.

## §3 — Phantom "marp-cli" references (stale, zero functional coupling)

The P4 retirement (`2026-06-12-p4-regression-gate-retire-marp.md`) deleted
`marp.config.js` and the marp-cli render path outright. A surprising number of
comments, test headers, and even one shipped example deck never got the
memo — they still describe a **third render path** or a **marp-core-based
parity test** that no longer exists anywhere in the repo (confirmed by grep +
the independent checker, both zero-hit). These are pure honesty fixes:

- `test/unit/playground/engine.test.js` — claims "the playground runs the
  marp-cli render path client-side"; `lib/playground/index.js`'s own header
  says the opposite ("Marp was retired in P4; this entry no longer bundles
  marp-core"). Also cites a renamed sibling file.
- `test/unit/authoring/notes-core.test.js` — claims a "parity block… renders
  the same bodies through marp-core"; zero `marp-core` import in the file,
  only hardcoded expected outputs with comments like `// marp-core collects
  only the first here`.
- `test/unit/engine/engine.test.js` — advertises a "Differential parity"
  test category comparing the engine against `@marp-team/marp-core`; no such
  code exists in the file.
- `test/README.md` — still labels `integration/` "the cross-renderer + PDF
  tier"; cross-renderer comparison was retired in P4.
- `test/unit/parsing/splitter.test.js` — claims "cross-renderer parity with
  marp-cli is asserted in the integration tier"; that test
  (`marp.gallery.test.js`) doesn't exist.
- `test/integration/parity/deck-class-fm.test.js` — cites the same deleted
  `marp.gallery.test.js` as verifying the marp-cli side of a parity contract.
- `RELEASE.md` — describes `marp.config.js` as shipping in the release zip;
  the file was deleted in P4.
- `.claude/agents/docs-auditor.md` — the docs-honesty auditor subagent's own
  "sources of truth" inventory instructs future audits to treat
  `marp.config.js` as a live theme-registration source and lists "three
  render paths" including it — **the meta-doc that's supposed to catch this
  exact class of drift was itself perpetuating it.**
- `lib/core/split-slides.js` — cites "the parity test that asserts emulator
  and marp-cli agree on slide count" as a live safety net; no such test
  exists.
- `lib/engine/directives.js` — self-contradicts within one comment block:
  says a design choice matches "exactly what it does on the marp-cli path"
  (present tense), then four lines later lists that same path as
  "(historical: the retired marp-cli path…)".
- `lib/components/chart/_chart-family/svg-legend.js` — miscites CLAUDE.md
  HARD RULE #1 itself to justify "all three render paths… the marp-cli engine
  plugin" — HARD RULE #1 says the opposite ("Marp is retired as a render
  path").
- `lib/transformers/chart-family.js` — its own "Consumers:" list names
  exactly two consumers, then a comment eleven lines later casually asserts
  an uncounted third ("the runtime route through the same kernel marp-cli
  uses").
- `lib/components/legal/legal.gallery.md` — a false "Three-renderer parity:
  marp-cli, emulator, and runtime all process the same transforms" bullet is
  baked into **shipped, rendered slide content** — visible in the PDF/HTML
  output of a component gallery deck, not just source.
- `docs/src/playground/drawing-board-export.js` — a dead `engineLabel()`
  branch still returns `'marp-core'` for a `meta.engine` value
  (`PG.engine`/`window.LatticePlayground.engine`) that is never set anywhere
  in the codebase — unreachable code dressed as a live dual-engine choice.
- `tools/build-playground.js` — attributes the playground bundle's size to
  "marp-core pulls in markdown-it + KaTeX"; the playground no longer bundles
  marp-core at all.
- `lib/engine/index.js` (`geometry()`), `lib/engine/math.js` — both justify a
  live design choice by keeping parity with "the playground/marp A/B," a
  comparison mode that was dropped; `geometry()` has zero live callers.
- `lib/integrations/markdown-it/plugins.js` — two comments: one cites a unit
  suite that "exercises each plugin through a real marp-core instance" (the
  file was renamed and no longer imports marp-core at all); another
  references "the marp-cli render hook," a hook that no longer exists.
- `test/unit/parsing/markdown-it-plugins.test.js` — the shared test helper
  that builds a markdown-it instance on Lattice's **owned** pipeline, with
  zero Marp dependency, is still named `makeMarp()`.

## §4 — Fixed in this PR

The items in §3 plus the branding items below are pure text/comment
corrections — no behavior change, no render-path change, nothing gated by the
QUALITY BAR's export sign-off. Fixed directly:

- 16 of the 17 phantom-reference items in §3 (all except
  `legal.gallery.md` — see below).
- `package.json` — description/keywords de-emphasized from "A Marp-based
  slide deck system" to describe Lattice as its own engine (Marp export kept
  as a named capability, not the framing).
- `AGENTS.md` — opening line no longer calls a deck "a Marp Markdown file."
- `engineering/capabilities.md` — `emulator:build` description no longer
  calls the CLI "Marp-faithful."
- `engineering/marp-independence.md` — added Cost item 3 naming the
  marp-vscode preview-compat tax (§1 above) and narrowed the TL;DR's "nothing
  of ours uses Marp" claim, since the doc's job is to be the accurate living
  scorecard and it wasn't naming this cost at all.

**One phantom-reference item deliberately left alone:**
`lib/components/legal/legal.gallery.md`'s false "Three-renderer parity"
bullet is baked into *shipped, rendered slide content* with committed
light/dark PDFs. HARD RULE #8 isolates gallery content from feature/fix work
— fixing it means rebuilding + re-reviewing the gallery PDFs, which belongs
in its own pass, not folded into an unrelated audit PR. Logged in §6.

**Deliberately NOT fixed here** (bigger, needs its own scoped pass, listed so
it isn't silently dropped):

- `engineering/architecture.md`'s "Why Marp emulation, not Marp itself"
  framing, the LFM spec's "Lattice is a Marp-based engine" line,
  `design/theming.md` and `design/design-system.md`'s Marp-first framing of
  the theme/directive vocabulary, `engineering/cascade.md`'s contradiction of
  `marp-independence.md`'s `!important`-scaffold claim, and
  `engineering/pipeline.md`'s ~400 lines of stale pre-engine marp-cli
  bootstrap instructions. These are real rewrites (some hundreds of lines),
  not one-line corrections — §6 below.
- `lib/layout/bridge.js`'s framing of an owned Workbench feature in Marp's
  vocabulary ("A Marp class directive," "a Marp global `<style>` block") —
  low severity, bundle into the same pass as the framing docs above since
  it's the same kind of edit.
- The Two-renderer rule policy itself was decided and shipped separately —
  §5(a). The *existing* `lattice-runtime.js` mirrors it produced (§1's file
  list) are untouched; sunsetting any of them individually is still §5(b)
  territory or its own case-by-case follow-up.

## §5 — The decision that actually matters (needs your call)

Per the inversion: demoting the Two-renderer rule is the *one* structural
edit that stops manufacturing new findings of this shape — everything else in
this audit is a one-time cost already paid. Two honest options, neither mine
to pick unilaterally because both touch a currently-documented author
workflow:

**(a) Demote, don't remove. DONE (2026-07-09).** Rewrote the Two-renderer
rule (`engineering/workflow.md`) from "every transform MUST land in both
kernels, no removal path" to "ships against `lib/engine` by default; a
`lattice-runtime.js` DOM mirror is opt-in, added only when an author actually
needs a feature to look right mid-draft in VS Code, and every mirror added
from 2026-07-09 forward carries a comment naming its sunset condition."
Existing mirrors stay (no rewrite of `lib/runtime`); new features stop
paying the tax by default. Cheapest, reversible, addresses the regenerative
cause directly — approved and shipped.

**(b) Retire marp-vscode as a first-party-supported preview surface**,
pointing authors at the docs-site Studio/Playground instead, and let
`lattice-runtime.js` degrade to best-effort. Bigger cut, more honest given
`gotchas.md`'s own receipts that the investment doesn't fully pay off today —
but it changes what authors currently do to draft a deck, and this audit
didn't verify whether Studio/Playground is actually a drop-in substitute for
"open a `.md` file, watch the preview panel update on save." **Still open —
not proceeding without that verification and your explicit sign-off.**

## §6 — Backlog (logged per HARD RULE #18, not pulled into this diff)

- Rewrite `architecture.md`, the LFM spec, `design/theming.md`,
  `design/design-system.md`'s directive-naming rationale, and
  `engineering/cascade.md`'s framing to describe Lattice in its own
  vocabulary (Form/Tiles/LFM), demoting Marp/Marpit compatibility to a
  clearly labeled historical/VS-Code-preview footnote rather than the
  architectural frame. Reconcile `cascade.md`'s "!important rules override
  Marp's scaffold" against `marp-independence.md`'s "no fighting marp's
  `!important` scaffold" — pick one true statement.
- Rewrite `engineering/pipeline.md` Part 6/7 — ~400 lines of obsolete
  pre-engine bootstrap instructions telling an agent to fall back to raw
  Marp CLI, written before `lib/engine` existed.
- If (a) or (b) from §5 is approved: the actual code change (loosen
  `engineering/workflow.md`'s rule text, then decide case-by-case which
  existing `lattice-runtime.js` mirrors are worth keeping vs. sunsetting).
- `examples/build.md`'s and `engineering/workflow.md`'s house convention of
  `marp: true` front matter on every example/exemplar deck — worth revisiting
  once §5 is decided, since the convention exists for marp-vscode preview.
- `lib/components/legal/legal.gallery.md`'s false "Three-renderer parity"
  bullet, baked into shipped slide content with committed PDFs — deferred
  out of this PR per HARD RULE #8 (gallery isolation); needs its own
  rebuild-and-review pass.
