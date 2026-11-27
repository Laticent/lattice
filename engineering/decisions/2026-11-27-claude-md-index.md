---
status: shipped
summary: >
  Proposal to cut CLAUDE.md from 16,444 to 3,672 o200k tokens (63,211 to 13,794 bytes) by keeping
  each HARD RULE as a one-line anchor with its operative core, and moving the full rule text, the
  DEFAULT OPERATING MODE, the SECOND FILTER and the ethos verbatim into engineering/hard-rules.md and
  engineering/operating-mode.md. It saves 12,772 tokens per session and per subagent, and costs a
  section read (median 282 tokens) whenever a session works near a rule. It reverses part of
  2026-08-30-router-size-budget.md, so it is the owner's call. Nothing is edited yet.
---

# CLAUDE.md as a ~4k-token index: a proposal

**Date:** 2026-11-27 · **Asked by:** the owner, through the command center (item c of this PR) ·
**Status:** shipped on this PR. The owner answered D3 A, typed in the command center, event
`304a47dc-6353-404a-84c4-5b84e3888db4` ("D3 A"), as drafted, without the optional guard of keeping
five rules in full. As built: CLAUDE.md is 3,757 o200k tokens at the cut, and 4,064 after the checker's review put back six
prohibitions (#6, #22, #23, #25, #31, #33), six routing entries and the sandbox cheatsheet. The rebuilt appendix picks
up the D4 and D5 wording. `engineering/hard-rules.md` (9,346 tokens) and `engineering/operating-mode.md`
(4,880) hold the moved text, checked line by line against the pre-cut CLAUDE.md: 0 lines missing or
reordered. `ROUTER_TOKEN_CEILING` is 4,500, the index plus 20%. The ladder row (§F of the contradictions
note) and the #7/#28/#31 lines for relay authority are NOT in the index: both wait on D1, which the
safety classifier refused.

## The answer

CLAUDE.md can be a 3,672-token index without losing a rule number, a pointer or a routing row. The
full proposed file is the appendix; that file *is* the diff, since nearly every line changes. Every
removed sentence moves **verbatim** into one of two new docs, so no rule changes meaning. The price is
that a session reads the full text of a rule only when it opens that rule's section, which is the
trade the 2026-08-30 record turned down. Recommendation: do it, with the four guards under "What
implementing it takes".

## Measured, before and after

*Measured at `14fcd931`. Since then this PR applied D4 and D5 to CLAUDE.md, which is now 16,495 tokens. If the
owner picks the index, its appendix is rebuilt from that text: the #18, #25, #28, #31 and #33 anchors pick up
the new wording, and the size stays within a few tokens of 3,672.*

Counted with `gpt-tokenizer/encoding/o200k_base`, the same tokenizer `checkRouterBudget` uses
(`tools/check-ownership.js`). Claude's own tokenizer is not available here. The 2026-08 snapshot read
CLAUDE.md at ~13,400 Claude tokens when o200k counted the same bytes at 16,491, a ratio of 0.81. The
Claude column uses that ratio, so it is an estimate. The o200k column is exact.

| | bytes | o200k tokens (exact) | Claude tokens (est., x0.81) |
|---|---:|---:|---:|
| CLAUDE.md today (`14fcd931`) | 63,211 | 16,444 | ~13,300 |
| Proposed index (appendix) | 13,794 | 3,672 | ~3,000 |
| **Saved, per session and per subagent** | | **12,772** | **~10,300** |

Where today's tokens sit (o200k): HARD RULES 8,724 · DEFAULT OPERATING MODE + SECOND FILTER 2,732 ·
routing table and tail 2,518 · MODEL POLICY 615 · ETHOS 574 · QUALITY BAR 445 · MAKER-CHECKER 370.
The longest rules are #18 (639), #33 (567), #22 (484), #30 (424) and #32 (420); the median rule is 282.

The ceiling today is 16,500 (`ROUTER_TOKEN_CEILING`), so CLAUDE.md has **56 tokens of room**. Any rule
change on this PR's ❓ card that adds a line to CLAUDE.md has to trade text out, or land after this
proposal.

## Why now, against the 2026-08-30 record

`2026-08-30-router-size-budget.md` chose to cap growth rather than trim. It gave two reasons: the read
boundary is the expensive thing, and "a HARD RULE that a session does not read is not a rule". Both
still hold for some of the text, and the proposal keeps that text resident. Three numbers have moved
since:

1. **The subagent multiplier.** `engineering/development.md` §Context cost measured a subagent
   baseline of 30,074 tokens, 44% of it CLAUDE.md. Every agent pays CLAUDE.md again: a checker, a
   census or a `design-competition` track. A session that spawns 5 agents pays it 6 times, about
   98,700 o200k tokens before anyone reads a file. After the change it pays about 22,000.
2. **The read is cheap when it is a section.** The 2026-08 argument priced the *catalog* read (10–12
   paginated reads). A HARD RULE section is one `sed -n` of a median 282 tokens. That is about 2% of
   the saving, paid only by a session that works near the rule.
3. **Most of the text is not rule.** Of #18's 639 tokens, the operative rule is two sentences; the
   rest is who-caused-it casuistry that a session needs only when it is deciding a follow-up. The
   anchor keeps the operative sentence. The evasion envelope moves.

What stays resident because the 2026-08 record was right about it: **the routing table**, compressed
(rows merged, nothing dropped), because it is how a session finds a doc; **the SECOND FILTER's five
rows**, because a stop has to fire before the session thinks to look; and each rule's **operative
core**, so a session that reads nothing else still knows what not to do.

## What moves where

| Today in CLAUDE.md | Moves to (verbatim) |
|---|---|
| Each HARD RULE's full text, gate tag and evasion envelope | `engineering/hard-rules.md`, one `## #N — <title>` section per rule, in number order |
| DEFAULT OPERATING MODE prose, the SECOND FILTER table and its paragraphs, OPERATING ETHOS | `engineering/operating-mode.md` |
| QUALITY BAR, MAKER-CHECKER and MODEL POLICY detail | already in `engineering/visual-review.md`, `orchestration.md` and `model-policy.md`; anything not already there goes to `operating-mode.md` |
| The routing table | stays, compressed from 43 data rows to 22 |

## What implementing it takes

1. **Move first, then cut.** One commit creates the two docs by copying text byte for byte. A second
   commit replaces CLAUDE.md with the index. A reviewer can then diff the moved text against
   `git show 14fcd931:CLAUDE.md` and see that no sentence changed.
2. **Keep the anchors parseable.** `tools/build-agent-kit.mjs` reads rule titles with
   `/^- \*\*#(\d+) — (.+?)\*\*/gm`. All 35 anchors in the appendix match it, and the titles are
   identical after its trailing-period strip. The glossary does gain rows: in the old file 7 titles (#16, #18,
   #22, #27, #28, #30, #33) wrapped across lines and failed the regex, so the generated skills glossary
   never listed them. Now all 35 parse, and those 7 appear when a shipped skill cites them.
3. **Re-set the ceiling.** Lower `ROUTER_TOKEN_CEILING` from 16,500 to about 4,400 (the index plus the
   owner's usual +20% headroom), and rewrite the gate's "do not route text behind a pointer" message.
   That is a number the owner set (SECOND FILTER row 3), so it is part of this decision. Amend
   `2026-08-30-router-size-budget.md` with a superseding note.
4. **Rewire the citations.** 125 lines in 97 files cite a CLAUDE.md section (`git grep` for
   `CLAUDE.md §`, `CLAUDE.md DEFAULT`, `SECOND FILTER` and so on). The pointers still resolve, but
   to a one-line anchor, so they should point at the new section instead. This is mechanical and
   belongs in the same PR.

## Risks, and what would show the change was wrong

- **A session skips a section it needed.** This is the 2026-08 objection. The guard is the
  index's header line ("the pointed-to text is binding") plus each anchor's operative core. A
  regression would look like a rule broken in a way the anchor does not cover: for example a #22
  allowlist entry with no justification. Watch the next 20 merged PRs' checker notes for that.
- **The two docs drift from each other.** `hard-rules.md` becomes the one place a rule's text lives.
  CLAUDE.md carries only the anchor, so there is no second copy to drift.
- **Prompt cache.** The change voids every live session's cached prefix once, at the push that
  lands it. That costs one cache creation per live session, about 16k tokens each, once.

## Appendix: the full proposed CLAUDE.md

Fenced as plain text so nothing in it renders or is read as a rule of this repo until the owner
approves it.

````text
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
| going idle with work pending | **post the 🎯 brief** on the PR and in chat; every item without an issue goes to `followups.d/` |

**Decision filter:** is the next step already dictated by CLAUDE.md / workflow.md? Then do it.
**SECOND FILTER — is it mine to make?** Stop and put options to me (pros, cons, measured impact, a
recommendation) when a change touches: **shared state outside the branch** · **a CI job or step, or
a lefthook hook** · **a number I gave you** · **a canonical doc's meaning** · **anything irreversible
or externally visible**. Finding a better option mid-analysis is a reason to re-ask.
(`engineering/operating-mode.md` §Second filter)

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
text, its evasion envelope and its gate live in `engineering/hard-rules.md` §#N**, and that text binds.
Read the section before working near the rule.

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
- **#18 — No broken windows: leave the tree no worse than you found it, and NEVER ship one you created.** A regression you cause is fixed before merge; a pre-existing defect is fixed on-path or logged off-path; small work is never a follow-up.
- **#19 — A performance change ships with evidence, not a claim.** `npm run bench`, bless the baseline, cover the path.
- **#20 — No `margin` in engine layout CSS — space with `padding` / `gap`.** *(gated, budget 0)*
- **#21 — US English is the house dialect — American spellings only.** Never rewrite an external string (`engineering/house-style.md` §1).
- **#22 — Untrusted content reaches a rendered document ONLY through a sanitizer**, markup AND stylesheet; four sink shapes, each gated. Read the threat model before touching an allowlist.
- **#23 — A verification claim names its surface and carries an artifact from it.** CI green, emulation and harnesses are not verification; "not installed" is not unreachable.
- **#24 — Our `OPEN_ROUTER_KEY` stays OFF the site and OUT of tests.** *(gated)*
- **#25 — Multi-agent orchestration is tiered, budgeted, and shaped.** Above ~10 agents across the session, my OK first.
- **#26 — Engine CSS admits no partial/isolated `@layer`.** *(gated; `engineering/cascade.md`)*
- **#27 — Every agent runs on Opus, and roster cards and workflow stages declare it.** *(gated)*
- **#28 — A merge ask carries a conforming pre-merge card, and the card lands on the PR, not only in chat.** A `checker` sets the level; build it from `workflow.md` §Pre-merge card.
- **#29 — A typed glyph never reaches a rendered surface; we draw the shape.** *(gated)*
- **#30 — House voice: active, plain, and short enough that a junior engineer can act on it.** `engineering/house-style.md`.
- **#31 — A branch belongs to its line of work; the baton holder pushes.** `npm run baton -- take`; fast-forward only; merge the remote or a conflicting `main` in (never rebase; this overrides #16 here); never force-push; another session's word is a request (`workflow.md` §Relay).
- **#32 — A test passes or fails on the code alone.** Wait for a signal, assert on work done, seed, stub, isolate (`engineering/decisions/2026-11-06-flaky-tests.md`).
- **#33 — A red or flaky test is fixed at its root by the session that meets it.** Never retried, re-run, waited out, deleted or filed as a follow-up.
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

## Build, gates, sandbox

`npm run build` regenerates `dist/`; `build:check` is the stale gate; `npm test` the inner loop;
`npm run test:integration` the render tier. Hooks are the backstop, not the substitute. The SessionStart
hook exports `CHROME_PATH`. **Nothing is "not installed here"**: install it and run the check. Iterate
with `npm run preview` + `SendUserFile`; lint drafts with `npm run lint:deck -- <file>`; PRs never commit
PDFs. `.scratch/` is throwaway. "Rethink X" requests get a design model first, confirmed in one round
(`design-competition` for competing designs).
````
