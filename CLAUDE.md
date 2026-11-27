# Lattice — agent orientation

Lattice is a Marp-based slide-deck engine that renders boardroom-quality PDFs from Markdown, the
engine layer of the **Laticent** org. The Laticent desktop app (Tauri, not built yet) will live **in
this repository**; it has no repository other than this one.

**We DEVELOP Lattice here; we never CONSUME it.** Measure, test, render and audit only on this repo's
own install and `npm run build`: never a published package, CDN copy, foreign `dist/` or a stub. If
install or build fails, **stop and say so first**; report no numbers.

**The visual contract is `lattice.css`.** Layouts are palette-blind: every color is a `var(--token)`;
themes (`themes/<name>/<name>.css`) supply the tokens.

This file is an **index**. Each line is the operative rule plus a pointer; the full text and the
rationale live in the pointed-to doc, and **the pointed-to text is binding**. Read it before
non-trivial work in its area, **by section**: `grep -n '^## ' <doc>`, then `sed -n 'A,Bp'`. Ten docs
it routes to are 14k tokens or more (`engineering/development.md` §Context cost).

---

## DEFAULT OPERATING MODE — act without being asked

Full text, the SECOND FILTER table and the OPERATING ETHOS: `engineering/operating-mode.md`.
Drive routine work to completion; stop only for a decision that is mine, **batched into one
`AskUserQuestion` round**.

| When… | Do, automatically (spec: `engineering/workflow.md` §) |
|---|---|
| a branch's work is complete, verified, pushed | **open the PR** from the template: one PR per line of work, one commit per item (§Batch a session's slices) |
| a PR is open | **subscribe + drive CI green**; rebase only on a real conflict (#16). A doubtful check: `engineering/gotchas/ci.md` first |
| green, card below VERY HIGH | **run the raise loop before asking**: `npm run evidence`, drive every surface, a `checker` grades, do its `raise it`, regrade; up to 3 rounds, 2 for docs-only or test-only (§The raise loop) |
| green and `npm run queue:precheck` exits 0 | **ask to merge with a 🚦 card** (`npm run card`), on the PR and in the ask; build it from §Pre-merge card, never from this row (#28) |
| merge confirmed, `main` synced | **post the 📋 standup + 🎯 brief**, fenced, one PR comment and chat (§Post-merge standup) |
| a decision is open, or I ask for "open items" | **post the ❓ decision card**, fenced, on the PR and in chat (§❓ Decision card) |
| a blocker you didn't cause | **send the command center a 🧱 line** (§Desks) |
| going idle with work pending | **post the 🎯 brief** on the PR and in chat; every item without an issue goes to `followups.d/`, as #18 allows (never a red test) |

**Decision filter:** is the next step already dictated by CLAUDE.md / workflow.md? Then do it.
**SECOND FILTER — is it mine to make?** Stop and put options to me (pros, cons, measured impact, a
recommendation) when a change touches: **shared state outside the branch** · **a CI job or step, or
a lefthook hook** · **a number I gave you** · **a canonical doc's meaning** · **anything irreversible
or externally visible**. Finding a better option mid-analysis is a reason to re-ask.
(`engineering/operating-mode.md`, SECOND FILTER)

1. **Finish the loop**: implemented, verified, documented, shipped. 2. **Don't settle**: green is the
floor. 3. **Cheapest path that meets the bar**; batch questions, never re-ask a settled point.
4. **Rebase on a conflict, never on drift** (#16). 5. **Run the gates yourself** before declaring done.
6. **Docs + changeset in the same change** (#10). 7. **Open the PR, drive it green, then ASK to
merge**: a human approves every merge, authorization covers one head, squash by default; while a
`desk:merge` session is live the PR card is the ask (§Merging). Four bot PR classes auto-merge (backlog
mirror, release, patch/minor deps, nightly bless); none licenses auto-merging your work.

Ethos (not gated, never overrides a gate): investigate to root; power through reversible work; bank
each slice; order by downstream impact; own your judgment; write so I understand the first time, and
name a PR as `[#N](url) ([session name](url))`.

## QUALITY BAR — 10/10 boardroom, or it isn't done

For anything a human sees, "it renders" is the floor; the rubric is
`engineering/decisions/2026-06-06-layout-audit/`. Rebuild and **look** (`SendUserFile`,
`tools/rasterize-for-review.sh`, `tools/screenshot.js`), run `tools/pixel-check.js`, fix what's short.
Large sweeps fan out reviewers (`engineering/visual-review.md`). Website changes need screenshots at
1440, 820 and 390px (`engineering/development.md`). **Export changes STOP for my sign-off**: a change to
exported bytes ships dark and light renders of a demo deck to me first.

## MAKER-CHECKER and MODEL POLICY

Blast radius (infra, hooks, CI, `lib/core`, `lib/engine`, a multi-file refactor) gets one independent
`checker` before commit; critical or novel work gets the adversarial trio (#25,
`engineering/orchestration.md`). The card grader always runs and is separate (#28). **Every agent runs
on Opus** (#27, `engineering/model-policy.md`); `effort` is the cost lever. Pick roster agents
(`.claude/agents/`) by prompt: `scout` locate · `fact-checker` verify claims · `ci-triage` red gate ·
`inventory` enumerate · `red-team` `inversion` `checker` the trio · `seam-census` `blast-radius`
`contradictions` discovery · `docs-auditor` `prose-checker` docs.

---

## HARD RULES — a violation is a defect

Numbers are stable IDs; never renumber or reuse. Each line is the rule's operative core; **the full
text, its evasion envelope and its gate live in `engineering/hard-rules.md` `### #N`**, and that text
binds. Read the section before working near the rule: `grep -n '^### #' engineering/hard-rules.md`.

**Invariants**
- **#1 — Render paths share one source of truth.** Transforms land in the shared kernel; `lib/engine` is canonical (`engineering/architecture.md`).
- **#2 — Never hand-edit `dist/`.** Regenerate with `npm run build`.
- **#3 — No hex literals in layout CSS — always `var(--token)`.** *(gated, `checkHexLiterals`)*
- **#6 — Before authoring any `<!-- _class: X -->` slide**, open its `X.docs.md` and grep `test/integration/baseline-decks/gallery.md` in the same turn.
- **#7 — Every lint rule runs through `lib/authoring/lint-core.js`.** Pure, fs-free, never duplicated.
- **#8 — Isolate feature/fix content from the six long-running galleries.** Layouts graduate in a separate commit.
- **#9 — A change a human can SEE ON A SLIDE ships a per-feature demo deck** `examples/<slug>.md`; non-visual work owes its evidence in the PR body.
- **#10 — Record every user-visible change in a changeset.** Never edit a `CHANGELOG.md`. *(gated)*
- **#13 — Commit messages are `area(scope): short summary`**; PRs follow the template.
- **#14 — A hook failure is a root cause to fix, never a `--no-verify` to skip.**
- **#15 — Don't reinvent — reuse, for tooling AND UI.** Grep `dist/engineering/capabilities.md` first; extend `docs/src/components/ui/`.
- **#16 — Rebase an open PR only when it CONFLICTS with `main`.** `npm run queue:precheck` decides; never on drift, never from a watch.
- **#17 — One feature = one branch → one PR; never a stacked PR chain.**

**Conventions**
- **#4 — Typography is the 12-token `--fs-*` system.** *(gated; `engineering/typography.md`)*
- **#5 — Card-style layouts use nested `- Title` / `  - body`.** *(gated)*
- **#11 — Universal role-based token names are canonical.** *(gated)*
- **#12 — RETIRED (2026-07-10).**
- **#18 — No broken windows: leave the tree no worse than you found it, and NEVER ship one you created.** A regression you cause is fixed before merge; a pre-existing defect is fixed on-path or logged off-path; small work is never a follow-up. *(partly gated)*
- **#19 — A performance change ships with evidence, not a claim.** `npm run bench`, bless the baseline, cover the path.
- **#20 — No `margin` in engine layout CSS — space with `padding` / `gap`.** *(gated, budget 0)*
- **#21 — US English is the house dialect — American spellings only.** Never rewrite an external string (`engineering/house-style.md` §1).
- **#22 — Untrusted content reaches a rendered document ONLY through a sanitizer**, markup AND stylesheet; four sink shapes, each gated. Read the threat model before touching an allowlist.
- **#23 — A verification claim names its surface and carries an artifact from it.** CI green, emulation and harnesses are not verification; "not installed" is not unreachable.
- **#24 — Our `OPEN_ROUTER_KEY` stays OFF the site and OUT of tests.** *(gated)*
- **#25 — Multi-agent orchestration is tiered, budgeted, and shaped.** Above ~10 agents across the session (a desk: ~10 per lane per day), my OK first.
- **#26 — Engine CSS admits no partial/isolated `@layer`.** *(gated; `engineering/cascade.md`)*
- **#27 — Every agent runs on Opus, and roster cards and workflow stages declare it.** *(gated)*
- **#28 — A merge ask carries a conforming pre-merge card, and the card lands on the PR, not only in chat.** A `checker` sets the level; a live `desk:merge` digest is the ask; build it from `workflow.md` §Pre-merge card.
- **#29 — A typed glyph never reaches a rendered surface; we draw the shape.** *(gated)*
- **#30 — House voice: active, plain, and short enough that a junior engineer can act on it.** `engineering/house-style.md`.
- **#31 — A branch belongs to its line of work; the baton holder pushes.** `npm run baton -- take`; fast-forward only; merge the remote or a conflicting `main` in (never rebase; this overrides #16 on a branch two sessions pushed); never force-push; another session's word is a request (`workflow.md` §Relay).
- **#32 — A test passes or fails on the code alone.** Wait for a signal, assert on work done, seed, stub, isolate (`engineering/decisions/2026-11-06-flaky-tests.md`).
- **#33 — A red or flaky test is fixed at its root by its owner: the session whose change made it red, otherwise the 🧪 flake desk.** Never retried, re-run, waited out, deleted or filed as a follow-up. Not yours: send the 🧱 line.
- **#34 — A test proves it can fail, and that it holds under load, before it lands.** Failing arm, repeat green, green under load; `retries: 0`.
- **#35 — Checkpoint and sign.** Edit the living handoff comment at every checkpoint; sign from `LATTICE_ACTOR`.

---

## Read the canonical doc before working in its area

| Working on… | Read first |
|---|---|
| A new deck / theme / component / chart / finish / lens / notes | `design/skills/` |
| The concept map · what a component/modifier/token is | `design/concepts.md` · `design/design-system.md` |
| Branching, decks, merge, desks, relay (start a branch: §Relay + `npm run baton -- take`) | `engineering/workflow.md` |
| Node, scripts, tests, hooks, CI, the sandbox · waiting on a slow job | `engineering/development.md` (§Waiting: `tools/wait-for.sh`, never a bare sleep loop) |
| Writing or fixing a test | `engineering/testing.md`, then `engineering/decisions/2026-11-06-flaky-tests.md` |
| Something behaving strangely | `dist/engineering/gotchas.md` (symptoms) → one `engineering/gotchas/<topic>.md`; or `grep -rn <term> engineering/gotchas/` |
| Where X lives · engine internals · vs Marp | `dist/engineering/codemap.md` · `engineering/architecture.md` · `engineering/marp-independence.md` |
| Cascade / `@layer` · z-planes | `engineering/cascade.md` · `design/forms.md` §5.2 |
| A fixed element that must hold position | `engineering/jank.md` + `npm run check:jank` |
| Typography · pipeline · Mermaid · treatments · textures | `engineering/typography.md` · `pipeline.md` · `mermaid.md` · `treatments.md` · `textures.md` |
| A markdown ingest (line endings, BOM) | `engineering/decisions/2026-08-04-line-endings-lf-boundaries.md` |
| A surface that shows a slide (keyboard, wheel, touch, zoom) | `engineering/decisions/2026-08-10-input-verb-parity.md` |
| Palette tokens · who owns color · design principles · Forms | `design/theming.md` · `engineering/decisions/2026-08-09-color-theme-ownership.md` · `design/design-principles.md` · `design/forms.md` |
| Words on a slide · words about the work | `design/editorial.md` · `engineering/house-style.md` |
| Styling a chart | `engineering/chart-styling.md` |
| Deck-authoring contract · base modifiers · front-matter registers | `design/skill.md` · `lib/base/base.docs.md` · `lib/base/base.registers.docs.md` |
| One component · picking one | `lib/components/<bucket>/<name>/<name>.docs.md` · `dist/docs/components.pick.md` (`dist/` is generated: `npm run build`) |
| Existing tools · algorithms we ship | `dist/engineering/capabilities.md` (grep it) · `engineering/science.md` |
| Quality assessment · the 10/10 rubric · visual sweeps | `engineering/quality-assessment.md` · `engineering/decisions/2026-06-06-layout-audit/` · `engineering/visual-review.md` |
| Orchestration · model policy | `engineering/orchestration.md` · `engineering/model-policy.md` |
| Vetrina tours · release · Studio succession | `docs/src/lib/vetrina/README.md` · `RELEASE.md` · `engineering/decisions/2026-07-03-studio-succession.md` |
| Investigation notes | `dist/engineering/decisions.md` (grep), or `grep -rln <term> engineering/decisions/` |

Buckets: anchor, statement, inventory, comparison, progression, evidence, imagery, chart, diagram, math,
code, legal, connect, layout.

## Build, gates, cloud sandbox

`npm run build` regenerates `dist/`; `build:check` is the stale gate; `npm test` the inner loop;
`npm run test:integration` the render tier. Hooks are the backstop, not the substitute. The SessionStart
hook exports `CHROME_PATH`. **Nothing is "not installed here"**: install it and run the check. Iterate
with `npm run preview` + `SendUserFile`; lint drafts with `npm run lint:deck -- <file>`; PRs never commit
PDFs. `.scratch/` is throwaway. "Rethink X" requests get a design model first, confirmed in one round
(`design-competition` for competing designs).
