# Lattice — agent orientation

Lattice is a Marp-based slide-deck engine that renders boardroom-quality
PDFs from Markdown. It is the engine layer of the **SlideWright** org; a
Tauri desktop wrapper (also SlideWright) embeds the same engine.

**The visual contract is `lattice.css`.** Layouts are palette-blind: every
color goes through `var(--token)`. Themes (`themes/indaco.css`,
`themes/cuoio.css`, …) supply the tokens.

This file is an **index, not a manual**: it orients you and points to the
canonical doc for each topic. Each rule is one line + a pointer; the rationale
lives in the pointed-to doc. **Read that doc before non-trivial work in its
area — don't work from memory of it.**

---

## DEFAULT OPERATING MODE — act without being asked

The standing expectation is an agent that drives routine work to completion on
its own. Don't stop to ask permission for the steps below; stop only when a
decision is genuinely mine (irreversible, ambiguous *direction*, an
architectural fork) — and **bundle those into one `AskUserQuestion` round.**

Standing triggers — act on the precondition; don't surface a settled step as a
choice:

| When… | Do, automatically |
|---|---|
| a branch's meaty work is complete, verified, pushed (a design/decision doc counts — the doc *is* the deliverable) | **open the PR** via the template (rule 6) — **one PR for the session's line of work, one commit per item**, not a PR per slice (`workflow.md` §Batch a session's slices) |
| a PR is open | **subscribe + drive CI green**; rebase before each push (rule 7) |
| the PR is green and rebased | **ask to merge, with a fenced 🚦 pre-merge card — posted on the PR *and* in the ask** — the *one* user gate in this flow. No card, no ask. Several green at once → **one batched round**, one card each. **This row is an INDEX, not the spec: open `workflow.md` §Pre-merge card and build the card from the template there** — the four-level scale, the lowest-axis floor rule, the axis attribution and the `raise it by:` line are all in that section and all load-bearing (HARD RULE #28) |
| merge confirmed + local `main` synced | **post the standup + the continuation brief** — two fenced cards, always fenced (`workflow.md` §Post-merge standup) |
| a session goes idle with work still pending — parked at the merge gate, or out of scope | **post the continuation brief** so a fresh session can pick it up cold (same §) |

**Decision filter** — before any `AskUserQuestion` or "want me to…?", ask *"is
the next step already dictated by CLAUDE.md / workflow.md?"* If yes, **do it.**
Reserve questions for genuine forks.

**SECOND FILTER — is this decision mine to make?** The filter above is about
*hesitation*; this one is about *reach*, and it runs second. A step can be
perfectly well dictated and still be too big to take alone.

**Decide and proceed** when the change is reversible, its blast radius stops at
this branch, and undoing it costs one commit: code, tests and docs inside the
diff the *backlog issue* asks for; a fix a checker or gate found in code this PR
already touches; anything that issue's acceptance criteria explicitly delegate
("decide which is correct", "state which producer was authoritative"). *(Issue,
not "card" — in this file a card is the fenced 🚦/📋 report above.)*

**Stop and put options to me — pros, cons, measured impact, a recommendation —**
when the change touches any of these, *even when a rule points at it*:

| Trigger | Why it is mine |
|---|---|
| **Shared state outside the branch** — issue labels, milestones, board columns, branch protection, anything other sessions read | Parallel sessions act on it before I can undo it |
| **The CI / hook contract** — adding, removing or relocating a **CI job or step, or a lefthook hook** | Every future PR pays the cost, and a bad gate is a permanent tax |
| **A number I gave you** — the brief says ~12 and you think 64 is better | The number *was* a decision; substituting yours silently discards it |
| **A canonical doc's meaning** — CLAUDE.md, a HARD RULE, workflow.md's contracts | Rewriting the rules is not the same as following them |
| **Anything irreversible or externally visible** — a merge, a release, a published artifact, a comment on someone else's PR | It cannot be taken back |

Row 2 is deliberately narrow: **a CI job or step, or a hook.** It does NOT catch
adding a test, adding a rule to `lib/authoring/lint-core.js`, or adding a
`SANCTIONED_*` entry — those change what a gate *finds*, not what the pipeline
*runs*, and #20/#22/#24/#26 already route a new sanction through PR review with
its justification. An earlier draft said "changing what runs on every PR", which
caught all three and would have stalled routine in-scope work.

**How to put it.** One `AskUserQuestion` round, batched with every other open
decision. Each option carries what it costs, what it buys and what it risks —
**measured, not estimated.** If a number can be measured in under a minute,
measure it: a guessed "+~5s" that was really 0.52s argued for the wrong option.
Lead with a recommendation; a question with no recommendation pushes the
analysis back onto me.

**Finding a better option mid-analysis is a reason to re-ask, not to proceed.**
Writing out the pros and cons *is* the investigation — it is where
`build:check:all` surfaced (a zero-caller script covering 39 build steps instead of
one). Presenting three options while knowing a fourth is better is worse than not
asking.

**This does NOT license backing off "don't settle" or "power through".**
Reversible in-scope work is still driven to completion without asking. What the
five rows have in common is **not difficulty** — a hard refactor inside your own
diff is yours, a one-line label change across sixty issues is not. They are three
kinds of reach: **blast radius** (rows 1–2), **my prior decision** (rows 3–4), and
**irreversibility** (row 5).

This *widens* the "stop only when a decision is genuinely mine (irreversible,
ambiguous *direction*, an architectural fork)" line at the top of this section.
Rows 1–3 are none of those three and still stop. Read the table as the operative
list. It also qualifies rule 3's "never re-ask a settled point": re-asking
because you found a materially better option is not re-litigating a settled
one — see the paragraph above.

*(discipline — no automated gate. The test is whether you can point at a change
that altered shared state, the CI contract, or a number I set, without my having
seen the options first. Born from a session that labeled 60 issues
`status:ready` when the brief said ~12, and added a CI step on its own judgment.)*

1. **Finish the loop.** Done = implemented, verified, documented, shipped — not
   "it compiles." Don't hand back at first green waiting for "now lint / test / push."
2. **Don't settle.** "Builds + tests pass" is the floor. Self-critique and raise
   the result before returning it. Visual work meets the Quality Bar below.
3. **Prefer the cheapest path that meets the bar.** Reach for a reversible
   default over a question; **batch decisions into one round and never re-ask a
   settled point.** Spawn sub-agents only when a second independent pass changes
   the outcome (see Maker–checker) — not by reflex. My GitHub + Claude spend is a
   real constraint: where two routes meet the bar, take the cheaper one.
4. **Stay *mergeable* — rebase right before you push.** Before every push (and
   before calling anything done), `git fetch origin main` and rebase if behind or
   conflicted. This is HARD RULE #16: fold it into the push, do **not** run a
   background drift watch. (A Stop hook nudges you if you forget.)
5. **Run the gates yourself, proactively** — `npm run lint`, the unit suite,
   `npm run build:check`, the integration tier — *before* declaring done. Hooks
   enforce these at commit/push as a backstop, not a substitute.
6. **Keep docs + changelog in sync in the SAME change.** Any behavior change
   updates the matching `engineering/`/`design/` doc AND adds a `changelog.d/`
   fragment (HARD RULE #10 — **not** `CHANGELOG.md` `## Unreleased`). Never
   return a behavior change with stale docs.
7. **Open the PR when review-ready, then drive it green — then ASK to merge.**
   Use `.github/pull_request_template.md`. Never a draft PR up front (it spams
   CI). Once open, subscribe and drive CI green / address review — never ask
   "should I watch?". When green + review-ready, **stop and ask me for merge
   authorization** — a human approves every merge, and prior authorization does
   **not** carry forward. On my go-ahead, **squash-merge** by default. Full
   procedure: `workflow.md` §Merging.
   *Scope: work you or I authored.* Three machine-generated PR classes
   auto-merge themselves through the queue — the backlog mirror
   (`sync-backlog.yml`, a generated view of issues), the release (`release.yml`,
   where **the dispatch is the authorization**), and **patch/minor dependency
   bumps** (`dependabot-auto-merge.yml`; majors always wait for a human). None
   is license to auto-merge anything you wrote.

Rules 6–7 deliberately override the harness defaults (which hold off on PR
creation and ask before watching). `doneMeansMerged` in `.claude/settings.json`
reinforces this: keep working to a merge-ready state (it does **not** mean
merge-it-yourself).

### OPERATING ETHOS — the dispositions behind the rules

These are not gated and not numbered; they *shape judgment* where no rule
dictates. They never override the HARD RULES or the human gates — when a
disposition and a gate collide, the gate wins.

- **Investigate to root; don't settle, don't give up.** "Blocked" and "done" are
  both claims that need evidence. Before declaring either, exhaust the cheap
  diagnostics — read the source, reproduce, bisect, check the canonical doc.
  Surface a blocker only with the investigation that earned it. (Sharpens
  DEFAULT OP MODE #1–2.)
- **Power through; momentum is the default.** On reversible, in-scope work, keep
  going — through lint, tests, the rebase, the next slice — without stopping to
  ask "now what?". *Working through the night does NOT mean skipping the gates:*
  merge authorization (#7), export sign-off (Quality Bar), and any irreversible
  or ambiguous-*direction* call remain **hard stops** — prior authorization never
  carries forward. Drive everything *up to* the gate, then stop cleanly.
- **Stack wins — bank completed work.** Sequence so each finished slice compounds
  and stands on its own (commit it, push it, leave nothing half-applied). Don't
  open a second front while the first is a broken window (see #18); land, then
  advance.
- **Prioritize by downstream impact.** Order work by what it unblocks next, not by
  what's nearest. When choosing what to do first, pick the slice that most de-risks
  or feeds the work to come; say in one line why, then proceed.
- **Use best judgment, and own it.** Where no rule or gate applies, decide and
  move — a reversible default beats a question (DEFAULT OP MODE #3). Judgment is
  the expectation, not an escape hatch from the rules; it operates in the space
  the rules leave open.
- **Write so I understand the first time.** Default to plain words; spend a term
  of art only when it earns its place, and define it on first use. This is the
  disposition behind HARD RULE #30 — the contract is `engineering/house-style.md`. The moment I
  say I'm lost, *stop* — don't restate the same explanation louder. Re-explain
  from the start in plain language, lead with a concrete example, and name the
  thing in the codebase it maps to. Jargon I have to decode is a defect in the
  writing, not in me.

---

## QUALITY BAR — 10/10 boardroom, or it isn't done

For anything a human sees — themes, `lattice.css`, layouts, the docs site,
UI/UX — **"it renders" is the floor.** The target is the boardroom 10/10 rubric
(`engineering/decisions/2026-06-06-layout-audit/`). Before handing visual work
back: rebuild and **actually look at it** (`SendUserFile` /
`tools/rasterize-for-review.sh` for PDFs; build the docs site +
`tools/screenshot.js` for web), run `tools/pixel-check.js`, and fix what's short
of excellent without being told. For a *large* sweep (whole gallery, a theme
across all components, a responsive pass over many pages), **fan out parallel
reviewer agents**, each viewing *whole* slides — see `engineering/visual-review.md`.
If a tool genuinely can't run here, **say so**; never claim quality you didn't verify.
A claim of "verified" names its surface and carries an artifact from *that* surface —
emulation, a synthetic harness, and "CI green" are **not** verification (HARD RULE #23).

**Website / responsive UI** ships to desktop (~1440px), tablet (~820px), and
mobile (~390px) — all first-class. Keep one visual language across them; favor
icon-only controls where space is tight; no layout jank. **No website change is
done without `tools/screenshot.js` evidence at all three widths.** Details:
`engineering/development.md`.

**Export changes are the one exception to "act without being asked" — STOP and
show me.** A change that alters the *bytes of an exported artifact* (the PDF /
PPTX / HTML export pipeline, font embedding) requires my inspection: render a
representative demo deck in **both dark and light mode** and send the artifacts
for sign-off. (Ordinary CSS/layout work that merely *looks* different is **not**
in scope — that goes through the normal visual-review path above.)

---

## MAKER-CHECKER — verify high-blast-radius work with parallel agents

Separate *making* from *checking* for changes with real blast radius —
infra/hooks/CI, engine transforms (`lib/core`, `lib/engine`, a shared kernel),
or a multi-file refactor. After you (the maker) finish, spawn an independent
checker agent that bug-hunts the diff (correctness, edge cases, footguns) and
judges fit/risk; fold findings back, *then* commit. **One checker by default;
two (split inspection vs. assessment) only for the riskiest changes.** Skip it
for trivial or low-risk edits — this earns its latency *and cost* only when a
second set of eyes changes the merge decision. See `engineering/visual-review.md`.

**Every agent runs on Opus** (HARD RULE #27) — the ladder decides *whether* an
agent runs, and there is no second question about what it runs on.

**"The trio" on its own means the adversarial trio. The additive trio
(`seam-census` · `blast-radius` · `contradictions`) must be named in full. When a
request is ambiguous, ask — the two do opposite work.**

**Maker-checker is the middle rung of the verification ladder** (HARD RULE #25):
routine work self-reviews with the gates; blast radius gets maker-checker;
**critical, high-blast-radius, or genuinely novel work escalates to the
adversarial trio — red team + Munger inversion + independent checker —
applied to what will actually ship.** Ladder, definitions, and fan-out cost
rules: `engineering/orchestration.md`.

---

## MODEL POLICY — everything runs on Opus (HARD RULE #27)

**One tier. No routing decision at spawn time.** Every agent runs on `opus`. A
**roster card** (`.claude/agents/*.md`) and a **workflow stage** (`agent()` in
`.claude/workflows/**`) must *name* it — that pair is what the gate enforces, and
it rejects `sonnet`, `haiku`, and `fable` by name. An **ad-hoc `Agent()` call**
should pass `model: 'opus'` too; a **harness built-in** (`Explore`, `Plan`,
`general-purpose`) needs nothing passed, because inheriting the session already
lands on Opus.

Model tiering was tried here and **retired**: what looks like cheap "lookup"
work in this repo (where does X live, does this claim hold, why is this gate
red) needs the cascade, the token system, and a dozen HARD RULES in context to
answer *correctly* rather than plausibly — and a downshifted agent fails in the
expensive direction: well-formed, confident, wrong, and past every machine gate.
Record: `engineering/decisions/2026-07-28-model-tiering-retirement.md`.

Pick the roster agent for its **prompt**, not its tier — that is what the roster
is for now:

| Spawn this | For |
|---|---|
| `scout` | Locate code, map a subsystem, "where/how does X work" |
| `fact-checker` | Verify cited paths / fields / mechanisms against the repo |
| `ci-triage` | Diagnose a red gate and drive it green |
| `inventory` | Enumerate, count, extract |
| `red-team` · `inversion` · `checker` | The adversarial trio (#25) |
| `seam-census` · `blast-radius` · `contradictions` | The **additive** trio — discovery, not verification (`engineering/orchestration.md` § The additive trio) |
| `docs-auditor` · `prose-checker` | Doc honesty · prose audit |

**"The trio" on its own means the adversarial trio. The additive trio must be
named in full. When a request is ambiguous, ask — the two do opposite work.** The
adversarial three audit claims you already have; the additive three generate them
(joins, reverse-dependency closures, refused tradeoffs). The additive trio is
**not** a rung on the verification ladder and is never mandatory.

**The session's own model never changes** (it would void the prompt cache, and
it's the human's `/model`).

**`effort` is the one lever left**: it cuts output tokens without changing what
reasons about the problem, and Opus 5 is unusually strong at `low`/`medium`. Cut
cost by spawning **fewer** agents at the **right effort** — never by a cheaper
model. Full policy: `engineering/model-policy.md`.

---

## HARD RULES (these override convenience; a violation is a defect)

**The rule NUMBERS are stable identifiers** — referenced across code, tests, and
decision docs. Never renumber them; a rule is retired in place, never reused.
The list splits into **invariants** (architectural / merge-gating) and
**conventions** (style rules enforced by lint or tests, kept here as numbered
anchors). Both are binding; the split tells you *where the enforcement lives*.

**Invariants** (numbers are literal IDs — `-` bullets, so renderers can't renumber):

- **#1 — Render paths share one source of truth.** Land transforms in the shared
  kernel (`lib/integrations/markdown-it/plugins.js`, `lib/transformers/*`,
  `lib/core/*`), not one path. The owned `lib/engine` is canonical; Marp is
  retired as a render path (the one Marp surface left is export-to-Marp,
  `lib/core/marp-bundle.js`). See `engineering/architecture.md`.
- **#2 — Never hand-edit `dist/`** — it's generated; regenerate with `npm run build`.
- **#3 — No hex literals in layout CSS — always `var(--token)`.** *(gated —
  `checkHexLiterals` in `tools/check-ownership.js`, via `build:check`; budget 0 + a small
  `SANCTIONED_HEX` allowlist for fixed non-themeable colors. `*.tokens.css` + `var(--t,#fallback)`
  defaults exempt.)*
- **#6 — Before authoring any `<!-- _class: X -->` slide**, in the SAME turn open
  `lib/components/<bucket>/X/X.docs.md` AND grep
  `test/integration/baseline-decks/gallery.md` for a live example (base
  modifiers → `lib/base/base.docs.md`).
- **#7 — Edit lint rules in `lib/authoring/lint-core.js` only** — pure, fs-free,
  shared by CLI / `validate()` / browser. Never duplicate.
- **#8 — Isolate feature/fix content from the six long-running galleries** —
  layouts graduate in a separate post-review commit. See `engineering/workflow.md`.
- **#9 — A change a human can SEE ON A SLIDE ships a per-feature demo deck**
  `examples/<slug>.md` (+ committed `.pdf`), 6–10 slides. Contract in
  `engineering/workflow.md`. **The trigger is the rendered surface, not the word
  "feature".** A layout, modifier, token, theme or chart change — or a fix to one —
  owes a deck, because the deck IS how a reviewer sees it. Work that renders no new
  or changed slide surface does not: tooling, CI/infra, export plumbing, a perf change
  whose output is byte-identical, docs. `workflow.md`'s existing escape does NOT cover
  this — it RELOCATES a code-level feature's demo ("live with the feature
  implementation"), it never excused one — so this line stating the rule flatly left
  every tooling PR arguing its way out of a HARD RULE in its own body, a tax on the
  honest ones and an invitation to the rest.
  **A path test is NOT the trigger, and the measurement is why:** over the 40 commits
  ending at `4c9075c`, 21 touched `lib/` or `themes/` and 6 shipped a deck, so a
  mechanical `lib/` ⇒ deck rule would have called 15 of them violations. Judge the
  surface a human sees, not the directory the diff lands in. (Re-derive with
  `git log --no-merges -40 --name-only <base>`; the window moves with HEAD, so quote a
  base or the number will not reproduce — an earlier draft of this line said 19,
  counted from a moving HEAD, and did not.)
  **Non-visual work still owes its EVIDENCE in the PR body** — the before/after
  numbers, the measured table, the arm that proves the thing can fail. A deck is one
  form of proof, not the only one; shipping neither is what this rule exists to stop.
  *(discipline — no automated gate; the test is whether a reviewer can see the change
  without checking out the branch.)*
- **#10 — Record every user-visible change in a `changelog.d/` fragment** as it
  lands — one file per PR, `changelog.d/<slug>.<category>.md`, bullets only; lead
  with `**Breaking:**` for anything that breaks a deck/consumer. **Do NOT append
  to `CHANGELOG.md` `## Unreleased`** — that shared region is what ejected seven
  PRs from the merge queue in one evening (#1593); the release folds fragments in
  and deletes them. *(gated — `checkChangelogFragments` in
  `tools/check-ownership.js`, via `build:check`; contract in
  `changelog.d/README.md`.)*
- **#13 — Commit messages are `area(scope): short summary`**; PRs follow
  `.github/pull_request_template.md`, and the issue(s) they close must read true
  before merge. See `engineering/workflow.md` § Merging.
- **#14 — A hook failure is a root cause to fix, never a `--no-verify` to skip.**
- **#15 — Don't reinvent — reuse, for tooling AND UI.** Tooling: consult
  `engineering/capabilities.md` before building any script/harness (the
  `capabilities:check` gate enforces it). Docs-site UI: extend the shadcn
  primitives in `docs/src/components/ui/` and the shared chrome
  (`PaletteControls`, `site-chrome.ts`) — don't fork a widget per surface.
- **#16 — Keep an open PR mergeable by rebasing right before you push — NOT with a
  background watch.** GitHub never delivers "`main` moved / now conflicted / CI
  passed", and a polling auto-rebase thrashes the merge train and floods chat
  (`engineering/decisions/2026-06-14-drift-watch-rebase-thrash.md`,
  `2026-06-15-retire-drift-watch.md`). Fold the check into the push:
  `git fetch origin main`, rebase if behind/conflicted, push. *The merge queue is
  live (`workflow.md` §Merging): it performs the final pre-merge rebase + retest,
  so there's no manual re-rebase right before an authorized merge — approve, enable
  auto-merge, and the queue owns the rest.* Resolve recurring `dist` conflicts
  mechanically and `--force-with-lease` silently. Never let an open PR **merge**
  conflicted, stale, or CI-red. *(The recurring `CHANGELOG.md` conflict is gone —
  entries are per-PR `changelog.d/` fragments as of #1593.)*
- **#17 — One feature = one branch → one PR; never a stacked PR chain.** Increment
  in place (many commits, one PR). A slice that builds/tests with only `main` is
  independent → its own branch; one that needs another open PR's branch is not.
  See `engineering/decisions/2026-06-17-stacked-pr-fragmentation.md`.

**Conventions** (binding; the tag says where enforcement lives — *gated* = a
lint/test catches a violation, *discipline* = no automated gate, so it's on you):

- **#4 — Typography is the 12-token `--fs-*` system**; tokens are named for their
  ROLE, never a color scheme. *(gated — `checkTypographyTokens` in
  `tools/check-ownership.js`, via `build:check`; `engineering/typography.md`.)*
- **#5 — Card-style layouts use nested `- Title` / `  - body`**, never inline
  `- **Title.** body`. *(gated — `deck-authoring.test.js`; see `AGENTS.md`.)*
- **#11 — Universal role-based token names are canonical**; legacy per-theme names
  are retired. *(gated — `checkRetiredTokenNames` in `tools/check-ownership.js`,
  via `build:check`; `lib/tokens/crosswalk.js`, `lib/base/base.docs.md`.)*
- **#12 — RETIRED (2026-07-10).** Used to ban `:not(:has(…))` / `:is(:has(…))` in
  theme CSS, on the claim that it silently broke in the "Marp for VS Code"
  extension's webview Chromium. Empirically retested against a real, current
  Chromium build (both forms behave per spec) with no corroborating bug report
  found anywhere; the gate had never been re-verified since it was written. See
  `engineering/decisions/2026-07-10-hard-rule-12-retirement.md` for the test and
  reasoning. Number retired in place, not reused.
- **#18 — No broken windows: leave the tree no worse than you found it, and NEVER
  ship one you created.** A defect you *create or touch* gets fixed before the work
  ships — never committed knowingly broken, never "TODO later", **never punted to a
  follow-up issue.** The critical distinction is **who caused it:**
  - **A regression YOUR change introduces is a window YOU created — fix it before
    merge, full stop.** This holds even when the break lands through a *different*
    token / component / surface than the one you set out to change (a shared token
    you re-tuned, an invariant your edit silently violated), even when it's
    low-visibility (an error state, a rare path, dark mode only), and even when the
    root cause is a *pre-existing* latent fragility your change merely *tipped into
    failure*. "It only breaks on an authoring-error surface", "it was already
    latently non-compliant", "it's off the main path of my feature" are **not**
    exits — if the surface worked before your change and doesn't after, you broke it
    and you fix it (or you revert the piece that broke it). Filing an issue and
    shipping anyway is the prohibited move. If the correct fix is genuinely too
    large for this PR, the window still doesn't ship: shrink your change so it stops
    causing the break, or hold the PR — do not merge a self-inflicted regression.
  - **A PRE-EXISTING defect you merely FIND** (you didn't cause it, your change
    doesn't worsen it) follows the on-path / off-path rule: if it's **on the path**
    of the current change, fix it in place; if it's **off the path**, log it (a
    tracked issue / decision-doc note) rather than ignoring it OR pulling it into the
    diff — that boundary keeps #8 (gallery isolation) and #17 (one feature, one PR)
    intact. The follow-up-issue path is **exclusively** for these; it is never a
    home for something you broke.
  *(discipline — no automated gate; the test is whether a reviewer can point at a
  surface that regressed across your change, or a known defect you walked past and
  left unrecorded. Born from #1181: a `--cat-on-mark` re-tune silently broke the
  mermaid error box via the `--diagram-critical` alarm invariant, and it was wrongly
  filed-and-shipped instead of fixed.)*
- **#19 — A performance change ships with evidence, not a claim.** Any change that
  sets out to make the engine faster/lighter carries: (a) **before/after numbers**
  in the PR's `## Performance` section, captured same-machine via `npm run bench`;
  (b) the **committed baseline ratcheted** — `npm run bench:bless` so
  `test/benchmark/baseline.json`'s diff *is* the durable before→after record, and
  `npm run bench:check` stays within the variance band (re-bless only with the PR
  justifying it); (c) a **bench scenario covering the optimized path** (extend
  `test/benchmark/engine-bench.mjs` if no dataset exercises it). A perf win without
  a reproducible measurement is unproven. *(discipline — `bench:check` is on-demand,
  not a blocking CI gate; the wall-clock band would be flaky in the merge train. See
  `engineering/workflow.md` §Performance.)*
- **#20 — No `margin` in engine layout CSS — space with `padding` / `gap`.**
  `margin` sits *outside* the box, so it's invisible to `getBoundingClientRect()`
  / `offsetHeight` and it margin-collapses — both corrupt the height math a
  measuring layout (virtual lists, the Fit Spine) depends on. Use `padding` (space
  inside a box) and `gap` (space between flex/grid children), which measure
  cleanly. A bare `margin: 0` reset is fine (it adds no space); everything else —
  lengths, `auto`, negatives — is barred. **Target zero is achieved**: the layout
  budget is **0**, and the only margins allowed are the explicitly enumerated
  `SANCTIONED_MARGINS` allowlist (today: one irreducible flex `margin-left:auto`
  push). A margin is admitted **only where it is provably the only answer**, by
  adding an entry to that allowlist with its justification in the PR — never a
  silent edit; the gate also fails on a *stale* sanction, so the list can't rot.
  *(gated — `checkMarginDiscipline` in `tools/check-ownership.js`, via `build:check`;
  layout budget 0 + allowlist; `engineering/gotchas.md`,
  `engineering/decisions/2026-06-27-stage-flow-no-margins.md`.)*
- **#21 — US English is the house dialect — American spellings only.** Everywhere a
  human reads words — docs, comments, manifest text, UI copy, hyphenated
  identifiers/classes/tokens — use the US form: `-or` not `-our`, `-ize` not `-ise`,
  `-er` not `-re`; `gray`, `license`, `defense`, `catalog`, `while`. **"Everywhere"
  includes the surfaces no gate can reach** — a chat reply, an issue body, a PR
  description, a review comment, a commit message.
  **The backlog is swept and the ratchet that got it there is gone.** 1285 spellings
  across 406 files went in one mechanical pass (2026-08-30), and `checkUsEnglish` — a
  repo-wide scan on every build, carrying a budget, a self-exempt list and a ledger of
  its own revisions — was deleted with it. A gate needing 1285 standing exceptions to
  stay green was more machinery than the problem it policed, and from a swept tree a
  regression is one visible word in a diff rather than a needle in a 1285-hit haystack.
  **"Swept" is not "zero", and the difference matters.** 71 British spellings remained in
  living prose when this rule was written, and they were not a backlog: ~39 were the
  `progress-centre` Form cell, 15 are DATA we must keep accepting, 4 sit in a lockfile,
  3 cite a dated `engineering/decisions/` filename, and the rest are deliberate mentions
  in tests and in this rule. **The Form cell is now `progress-center`** — issue #578
  renamed it, so the largest cluster is gone. The total is deliberately not restated:
  `checkUsEnglish`, the tool that measured 71, was deleted with the ratchet, so a fresh
  number would be a different measurement wearing the old one's clothes. **A US-English pass must never touch an EXTERNAL string**: GitHub's
  `cancelled` conclusion enum, the OECD's real legal name, a third-party language
  keyword, a synonym key an author might type, a pre-registered benchmark fixture. A
  sweep that rewrote three of those shipped a dead CI allowlist, an unresolvable map
  region and a tautological test — all three caught by review, none by a gate.
  *(discipline, with one cheap backstop — `tools/check-commit-msg.sh` WARNS on British
  spellings from `tools/us-english.js` and never blocks, because a message may quote
  British-spelled text and #14 forbids `--no-verify` as the escape. It covers the one
  surface with measured drift: 21 British spellings in 300 commit messages. Two test-tier
  arms joined it in `test/unit/tools/us-english-stem-audit.test.js`, which is why the
  `camelCase` identifier no longer "rides on review": it stems every word in the tree and
  fails on one landing in a British family the map does not carry, and it fails on any
  identifier segment the map DOES carry. Both are narrow by construction and say what they
  cannot see — the map and its own tests are excluded, `engineering/decisions/**` is not
  walked, and `-hood`/`-less` derivations do not stem. Neither reinstates the deleted
  repo-wide ratchet: they carry two allowlist entries between them, not 1285.)*
- **#22 — Untrusted content reaches a preview frame ONLY through a sanitizer, and the
  frame has TWO channels: markup and stylesheet.** The docs-site Studio renders untrusted
  markdown (shared / AI-generated decks + component skeletons) into a SAME-ORIGIN,
  un-sandboxed `srcdoc` iframe; un-sanitized engine output there is XSS → OpenRouter-key
  theft (`engineering/decisions/2026-06-29-component-transformer-threat-model.md` §5.1,
  #616). Every preview-frame BUILDER — any `docs/src` module that assembles a live preview
  document, marked by the split runtime-`<script>` injection idiom — owes **both**:
  - **markup** → `sanitizeSlideHtml` (`docs/src/lib/sanitize-slide-html.js`, DOMPurify);
  - **stylesheet** → `sanitizeStyleText` (`lib/core/sanitize-style-text.mjs`), owed by any
    builder that embeds a `<style>` element. A `<style>`'s content is HTML **RAWTEXT**,
    which ends at the first `</style` and knows nothing about CSS comments or strings — so
    a `</style>` carried in theme or author CSS ends the element and the remainder is
    parsed as markup in the live frame, *however well the HTML beside it was sanitized*.
    The rule and the gate were markup-only until 2026-08-17, and a builder passed while
    concatenating unsanitized theme CSS two lines above the sanitized HTML (#1709).
  Add a new builder to the allowlist with its justification; the gate fails on an un-listed
  builder, a builder that drops **either** call it owes, AND a stale entry.
  **The stylesheet channel is NOT a docs-site rule — it follows the document, wherever it is
  built.** Its scope is `DOC_STYLE_SINK_ROOTS`: the docs site **and the CLI export pipeline**
  (`lattice-emulator.js`, `lib/export/**`). Two things follow that the "preview frame" framing
  above does not tell you. First, the **harm is different off the docs site**: in a downloaded
  `.html` / `--player` export there is no OpenRouter key to steal — the payload is a beacon
  baked into every copy the *recipient* opens, and a stylesheet silently truncated mid-rule.
  Second, the **discovery rule is different**: a preview builder is found by the runtime-`<script>`
  idiom, a stylesheet sink by assembling a whole document (`<!doctype html`) — and neither finds
  the third shape, a module that assembles nothing but takes CSS back OUT of a document, prunes
  it, and re-wraps it. **Any CSS SERIALIZER normalizes `<\/style` back into a live terminator**
  — css-tree (`prunePlayerCss`) and the browser's own CSSOM `cssText` are both measured doing
  it — so **a re-wrap owes the call itself** no matter what guarded the document upstream. That
  one is gated per `<style>` ELEMENT, by text match, with its evasion envelope written into the
  check's docblock; the durable pin for the guard call sites themselves is the CENSUS in
  `test/unit/export/style-guard-census.test.js`, because all three gates are text matchers and
  none of them can see a guard that quietly disappears from a file that still calls it
  elsewhere.
  **A FOURTH shape is the one all three miss by construction: markup injected INSIDE the frame,
  AFTER the builder sanitized.** `lib/runtime` runs in the preview document and writes more
  markup into it — so the sanitizer ran one step too early, and the gate cannot see it because
  `checkPreviewHtmlSinks` asks only whether the BUILDER called `sanitizeSlideHtml`, and it did
  (#1246). The dangerous instance takes SVG back from a third-party renderer (Mermaid), which is
  why this arm is a CENSUS OF PROVENANCE rather than a demand for a guard call: re-sanitizing
  that SVG is not available — DOMPurify deletes `<foreignObject>` and `<style>`, i.e. every node
  label and all diagram styling (measured). What contains it is Mermaid's own behavior, and the
  split is worth knowing: `sanitizeText` runs DOMPurify on labels UNCONDITIONALLY, while
  `securityLevel: 'strict'` gates a WHOLE-SVG DOMPurify pass plus URL handling and click
  callbacks — so a label payload has two nets and a `click … javascript:` payload has one, all
  of them third-party, all pinned behaviorally in `docs/e2e/mermaid-post-sanitize.spec.ts`
  against the CDN's real Mermaid rather than the pinned `node_modules` copy. Every markup sink in
  `lib/runtime` therefore declares WHERE ITS MARKUP COMES FROM, and the count is pinned per
  sink — the file-scoped shape the other three arms use would certify a SECOND injection point
  hiding behind an already-legitimate one, which is not hypothetical: #1246 named one Mermaid
  site and there are two (the render and the cache replay). *(gated —
  `checkPreviewHtmlSinks` + `SANCTIONED_PREVIEW_BUILDERS`, `checkDocumentStyleSinks` +
  `DOC_STYLE_SINK_ROOTS` + `SANCTIONED_STYLE_SINK_EXEMPT`, `checkCssTreeRewrapSinks`, and
  `checkRuntimeMarkupSinks` + `SANCTIONED_RUNTIME_MARKUP_SINKS`, all in
  `tools/check-ownership.js` via `build:check`; `engineering/gotchas.md`,
  `engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md` §5 and §9,
  `engineering/decisions/2026-08-18-post-sanitize-injection-queue.md`.)*
- **#23 — A verification claim names its surface and carries an artifact from it.**
  "Verified" / "works" / "done" is a claim about a specific running surface — the
  real Playground, the real export, the actual device — and it needs proof from
  *that* surface. A synthetic harness passing, a jsdom/unit test, mobile *emulation*,
  and **"CI green" are not verification** of real behavior — they confirm only what
  they actually exercise (CI runs unit/build/lint; it never touches real touch,
  iframe layout, or iOS). Drive the real surface a human uses — build the docs and
  tap the actual Playground, render the real artifact, click the real UI — not a
  stand-in. Interaction behavior (touch, gesture, scroll, focus, drag) *especially*
  must be exercised on the real surface, not a harness. When a surface can't be
  reached from here (e.g. iOS Safari in a headless sandbox), say so and mark it
  **UNVERIFIED** — never turn "couldn't test" into "tested." *(discipline — no
  automated gate; the test is whether every "verified" in a PR or report can point
  at the surface + artifact behind it. Sharpens the QUALITY BAR.)*
- **#24 — Our `OPEN_ROUTER_KEY` stays OFF the site and OUT of tests.** Two guards for our
  paid OpenRouter budget. (1) **No exposure:** the deployed docs are a static bundle and the
  Playground runs on the USER's own key via OAuth (bring-your-own-key), so our server-side
  `OPEN_ROUTER_KEY` must never appear in `docs/**` — a reference there would inline it into the
  shipped bundle (leak) AND spend our budget on the live site. (2) **No abuse:** nothing spends it
  on the per-PR path — no `test/**` file reads OUR key, no `pull_request`/`push` workflow injects it,
  no `test`-family npm script invokes a spender. The gate keys on OUR key NAME, not the
  `openrouter.ai` endpoint, so Playwright e2e / integration tests that MOCK the endpoint (`page.route`)
  or drive the Playground on the user's own / a test key are fine; throwaway prototypes that hit the
  live API go in `.scratch/` (not scanned). A tool that DOES spend it (today only
  `tools/component-gen-eval.mjs`) is on-demand + opt-in (`OPENROUTER_ALLOW_SPEND=1`), prints its cost,
  and validates on a tiny sample (`--limit 1`) with a per-key cap set at OpenRouter; **live CI E2E**
  runs in a sanctioned **nightly/dispatch** workflow (`SANCTIONED_OPENROUTER_WORKFLOWS`, self-skipping
  when the secret is unset), never per-PR. *(gated — `checkOpenRouterBudget` +
  `SANCTIONED_OPENROUTER_SPENDERS` / `SANCTIONED_OPENROUTER_WORKFLOWS` in `tools/check-ownership.js`,
  via `build:check`; `engineering/workflow.md` §OpenRouter budget.)*
- **#25 — Multi-agent orchestration is tiered, budgeted, and shaped.**
  Adversarial verification scales with blast radius: routine work self-reviews
  with the gates; real blast radius gets MAKER-CHECKER (above); **critical,
  high-blast-radius, or genuinely novel work MUST get the full adversarial trio
  — red team, Munger inversion, and an independent checker — applied to what
  will actually ship** (in a generate-then-pick flow, harden the *winner* after
  the human pick, never every candidate). Every fan-out is **estimated before
  launch and counted session-cumulatively** (agent count + rough cost; above
  ~10 agents *across the session*, not per-fan-out, my explicit OK first,
  bundled into one question — the only exemptions are **pre-registered**: a
  fan-out CLAUDE.md already mandates without asking, e.g. the QUALITY BAR's
  visual sweep, or a named workflow with a committed hard cap; a shape-name
  coined on the fly is not an exemption, and serial sub-10 fan-outs still
  sum), **budgeted** (token target + `budget.remaining()`
  guards; refine loops cap at ~3 or stop when a round changes nothing), and
  **shaped** (iterate warm inside ONE agent session — a fresh context is bought
  only for fresh eyes; machine gates before agent judgment on bulk work; log
  any dropped coverage). Start from a named shape — e.g. the parameterized
  `design-competition` workflow — don't improvise at maximum scale.
  *(discipline — no automated gate; ladder, shapes, and cost rules in
  `engineering/orchestration.md`; born from
  `engineering/decisions/2026-07-05-orchestration-discipline.md`.)*
- **#26 — Engine CSS admits no partial/isolated `@layer`.** The bundle reserves a
  7-layer order (`build-css.js` `LAYER_DECLARATION`) but wraps NO rule in a layer —
  plain source order decides the cascade. Wrapping one file in `@layer` while the
  rest stay unlayered springs the rule-3 trap (unlayered beats layered regardless of
  specificity → the layered rule silently loses; Phase 3.5b broke 100% of canary
  pages). Layering is **all-or-nothing**, and full activation is VETOED while
  export-to-Marp ships marp-core's unlayered scaffold Lattice can't wrap (R-PATH,
  `engineering/decisions/2026-06-18-layer-activation-scope.md`). So engine CSS
  layers nothing; activation is one coordinated pass that adds sanctioned entries
  WITH justification, never a silent file wrap. The rule is not "layers forbidden
  forever" — it's "the bundle is never *half*-layered." *(gated —
  `checkCascadeLayers` + `SANCTIONED_LAYER_BLOCKS` in `tools/check-ownership.js`,
  via `build:check`; budget 0 + order-pin + inert-note sentinel;
  `engineering/cascade.md`.)*
- **#27 — Every agent runs on Opus, and roster cards and workflow stages declare
  it.** One tier; there is no routing question at spawn time. **Model tiering was
  tried here and retired** (2026-07-28) because a downshifted agent fails in the
  expensive direction — well-formed, confident, wrong, and past every machine
  gate. The pin is required even though inheritance would also yield Opus: an
  unstated policy is an accident of the current `/model` setting rather than a
  property of the repo. The **session's own** model never changes mid-task.
  `effort` is the surviving cost lever — spawn **fewer** agents, never a cheaper
  model. Why, and what to change if a tier is ever added back:
  `engineering/model-policy.md`. *(gated — `checkAgentModelPinning` in
  `tools/check-ownership.js`, via `build:check`: every `.claude/agents/**.md`
  needs `model: opus`, and every `.claude/workflows/**` `agent()` call needs
  `model: 'opus'` as the LAST word in its options — a duplicate key or a later
  spread that would override it at runtime is rejected, not certified.
  `sonnet`/`haiku`/`fable` are rejected by name. Committed files only; an ad-hoc
  `Agent()` call rides on the policy above, and harness built-ins need nothing
  passed. `engineering/decisions/2026-07-28-model-tiering-retirement.md`.)*
- **#28 — A merge ask carries a conforming pre-merge card, and the card lands on
  the PR, not only in chat.** The card is the *only* thing standing between "CI is
  green" and a human decision, and green CI is not evidence of much (#23) — so the
  card's shape is binding, not a suggestion. The contract is
  `engineering/workflow.md` §Pre-merge card and **must be read there, not from a
  summary**; CLAUDE.md's DEFAULT-OP-MODE row is an index entry, not the spec. Four
  things are load-bearing and each has been got wrong:
  - **The confidence level is DERIVED, and there are exactly four.** `low` ·
    `medium` · `high` · `very high`. **The lowest qualifying axis wins** — evidence,
    blast radius, reversibility, unknowns, independent eyes. A fifth level
    (`medium-high`) is not a finer reading, it is the "high with a caveat" hedge the
    contract exists to ban.
  - **ONE level for the change, not one per issue.** Confidence is a chain. Splitting
    it per closed issue reports the *best* link and buries the floor, which is the
    same evasion in another costume.
  - **Name the AXIS that set the floor**, not a reason. "mutation-proved" is a
    reason; `evidence` / `blast radius` / `unknowns` is an axis, and only the axis
    tells the reader which lever to pull.
  - **Carry the `raise it by:` line.** The contract calls it the most useful line in
    the card: it turns "are you sure?" into a decision — merge anyway, or spend ten
    more minutes. "nothing outstanding" is a legitimate answer; omitting it is not.
  **Where it goes:** in the merge ask AND as a comment on the PR. A card that lives
  only in a chat transcript is invisible to whoever opens the PR — including me, and
  including a future session — so the evidence has to sit next to the diff it is
  about. Same wording both places.
  *(discipline — no automated gate, and that is a known hole: nothing in the tree can
  tell a conforming card from a plausible-looking one, so the test is whether the
  card on the PR carries all four levers above. Born from PR #1834, where a card was
  written from this file's own one-line summary instead of the workflow.md contract
  and shipped an invented `medium-high`, three per-issue levels, no axis, no raise
  path — in a PR whose entire subject was claims nobody re-derives.)*
- **#29 — A typed glyph never reaches a rendered surface; we draw the shape.**
  A "shape glyph" is a character doing the job of a DRAWING — `✓` `✗` `→` `❯` `●`
  `⚠`. The deck's own type family carries almost none of them, so the renderer
  falls back to whatever font THAT machine has (a different weight, a different
  baseline), or to a color emoji (which Marp Core rewrites to `<img class="emoji">`,
  so it stops taking the element's color and blows a palette-blind layout open), or
  to a hollow `.notdef` box. One deck therefore renders three ways across the three
  surfaces it reaches. The `--mark-*` and `--shape-*` SVG mask tokens exist precisely
  so the shape is ours: **color comes from the element, the shape from us** (#3).
  The curated table, its deliberate exclusions, and the per-glyph advice live in ONE
  kernel — `lib/core/shape-glyphs.js` (#1) — shared by the gate and the linter.
  **Two surfaces, two postures, and the split is the whole rule:**
  - **OUR CSS — budget 0.** We own the declaration and the token is right there, so a
    typed shape in engine CSS is a defect with a named fix. The allowlist is
    `SANCTIONED_GLYPH_CHROME`, it takes a MEASUREMENT rather than an opinion, and the
    gate fails on a stale entry. Two files are on it, both for the same reason: the
    a11y and print **grayscale shape channel** is not a naive re-implementation of
    `--mark-check`, and a mask cannot carry it. `content: <string> / <alt>` with an
    empty alt is the only mechanism measured (over CDP `Accessibility.getFullAXTree`)
    to keep the shape out of the a11y tree — `speak: never` and `speak: none` both do
    nothing; the glyph keeps sized with the type, which a fixed box does not; and each
    declaration is DOUBLED as a cross-engine pair, because an engine that cannot parse
    the alt form drops the whole declaration and the shape vanishes for exactly the
    readers it exists for. Do not "simplify" those.
  - **DECKS — an exceed-only ratchet, and coaching everywhere else.** The gate holds
    the line on the decks WE ship (the reference for how to write one); every other
    deck gets `lint:deck`, which **warns and never blocks**. That asymmetry is the
    policy, not an oversight: *"authors can do whatever they want… when there are
    better alternatives we should present a warning and suggest fixes and help them
    fix it. Even better, give them more modifiers. We warn, we coach."* A rule that
    refuses an author's deck buys consistency by spending the flexibility, and the
    warning already names what the glyph will look like on another machine, the
    modifier that does it properly, and the concrete fix.
  **Two scope lines, both deliberate.** A glyph inside a ``` fence is QUOTED material
  — two shipped decks quote the CLI's own `⚠` overflow warning verbatim, and the CLI
  really does print it (terminal text is not a rendered surface). INLINE code stays in
  scope, because a backticked eyebrow is set on the slide. And a `*.docs.md` is prose
  ABOUT a component, never projected, so it is out of scope — as is
  `engineering/decisions/**`, a dated archive.
  **Engine JS is NOT gated, on purpose — and the rule's first sentence is an
  OBJECTIVE, not yet a description of the tree.** Telling a DOM string from a
  `console.warn`, a `--help` banner or an AI prompt needs to parse the module, and the
  heuristic that could not tell them apart flagged a `Symbol()` sentinel's trailing
  comment. A gate that cries wolf is one somebody switches off. So two modules DO still
  type a shape onto a rendered surface today — `matrix-grid.transform.js`'s axis
  arrows and `state-chart`'s transition chips, both writing into an HTML attribute or a
  text node, where drawing them needs a markup change across three render paths. They
  are pinned BY CONTENT in `test/unit/core/shape-glyphs.test.js` so a third cannot
  appear quietly, and named in the decision record's § "What is still typed".
  **And "zero" means zero of the CURATED table**, not zero typed shapes: a character the
  table does not carry is invisible to both the gate and the linter, so add the row
  first.
  *(gated — `checkTypedGlyphs` + `TYPED_GLYPH_BUDGET` + `SANCTIONED_GLYPH_DECKS` +
  `SANCTIONED_GLYPH_CHROME` in `tools/check-ownership.js`, via `build:check`: engine CSS
  budget 0, decks exceed-only toward 0, and BOTH allowlists fail on a stale entry.
  `engineering/decisions/2026-08-25-typed-glyphs.md`.)*
- **#30 — House voice: active, plain, and short enough that a junior engineer can
  act on it.** Every surface where we write ABOUT the work — a chat reply, an issue, a
  PR body, a commit message, a `changelog.d/` fragment, an `engineering/`/`design/`
  doc, a code comment. Four rules, and the contract is
  `engineering/house-style.md` — **read it there**, this is an index entry:
  - **Active voice, named actor.** "`build-css.js` resolves the token", not "the token
    is resolved". Passive earns its place only when the actor is genuinely unknown or
    irrelevant; "it was decided" never qualifies.
  - **Plain words; a term of art is defined on first use.** Write for someone who
    joined last week. `use` over `leverage`, `to` over `in order to`, `fast` over
    `performant`. Our own vocabulary is worth spending — pay for it once, then use it
    freely. "Robust" and "seamless" both hide the claim: say what survives what.
  - **Lead with the answer.** First sentence answers; the rest supports. Cut the
    preamble, the restatement of the question, the summary of what you just said, and
    the options you did not take.
  - **US English** — that is #21, and it binds here too, on exactly the un-gated
    surfaces #21 now names.
  **There is deliberately NO word budget.** A number gets a real design explanation
  amputated to hit it, or split across three replies to dodge it. The test is not
  length, it is whether a sentence is load-bearing: point at a paragraph and ask what
  deleting it would cost. "Nothing" means it should not have shipped.
  **This does NOT license under-answering.** Cutting the filler is not cutting the
  work — a complete answer with its evidence is the deliverable, and "concise" is never
  a reason to skip a gate, a caveat, or the thing that was not verified (#23).
  *(discipline — no automated gate for voice or length, and there is unlikely to be a
  good one: nothing in the tree can tell a load-bearing sentence from a plausible
  filler one. Spelling has one cheap arm — the advisory commit-msg warning (#21); the
  repo-wide ratchet was retired once the tree hit zero.
  `engineering/house-style.md`; the on-demand auditor is the `prose-checker` agent.)*

---

## Read the canonical doc before working in its area

| Working on… | Read first |
|---|---|
| **Creating a new deck / theme / component / chart / finish / lens / notes-reviews-captions from scratch** (self-contained skills, boardroom bar) | `design/skills/` (index → the per-artifact skill) |
| The whole concept map — how all the concepts relate (one level up) | `design/concepts.md` |
| What a component/modifier/token *is*, catalog shape | `design/design-system.md` |
| Branching, feature decks, share-the-PDF, rebase, merge, two-renderer rule | `engineering/workflow.md` |
| Node, npm scripts, tests, lint, hooks, CI, the cloud sandbox setup | `engineering/development.md` |
| **Waiting on a slow job** — a build, the integration tier, a push — one waiter per job, always bounded | `engineering/development.md` §Waiting for a slow job. Never hand-roll `until …; do sleep N; done` in a background call: it has no deadline and no identity, and a late fire re-sends the whole conversation at full price. Use `tools/wait-for.sh` |
| Something behaving strangely (symptom index) | `engineering/gotchas.md` lists SYMPTOMS — skim it, open the ONE `engineering/gotchas/<topic>.md` it names. Searching by API / property / selector / token instead? **`grep -rn <term> engineering/gotchas/`** — the bodies live there, not in the index. Never read either top-to-bottom |
| Engine internals, where transform kernels live | `engineering/architecture.md` |
| Where we stand vs Marp (independence scorecard) | `engineering/marp-independence.md` |
| The CSS cascade / `@layer` (declared-but-inert; the trap) | `engineering/cascade.md` |
| **Layering a slide** — which z-plane a thing lives on, and the local 0–9 band | `design/forms.md` §5.2 + `lib/base/base.tokens.css` § depth axis |
| **A fixed element that must HOLD POSITION as content grows** — a running mark, a reserved band, anything an author's longer heading could reach | `engineering/jank.md` + `npm run check:jank`. Every fit gate asks whether content FITS; this is the one that asks whether the layout MOVES, and drift/collision/crowding are invisible to a still |
| Typography scales | `engineering/typography.md` |
| Running the render pipeline (PDF/HTML/PPTX) | `engineering/pipeline.md` |
| Authoring/rendering Mermaid diagrams | `engineering/mermaid.md` |
| Adding a `tint-*` / `mark-*` treatment | `engineering/treatments.md` |
| Adding an INGEST for markdown (a file read, an import, a model reply, a zip) — line endings + BOM | `engineering/decisions/2026-08-04-line-endings-lf-boundaries.md` + `SANCTIONED_EOL_BOUNDARIES` |
| Adding/changing a surface that SHOWS a slide — it owes keyboard + wheel + touch, and (Studio surfaces) zoom, from the kernel | `engineering/decisions/2026-08-10-input-verb-parity.md` + `2026-08-10-preview-pinch-zoom.md` + `lib/core/present-transport.mjs` |
| Categorical **texture** (a11y/onyx/concrete/print patterns, the `--cat-N-texture` channel) | `engineering/textures.md` |
| Palette tokens, Mermaid contract | `design/theming.md` |
| **Who owns color** — engine vs theme vs deck vs consumer, and which record settled each piece | `engineering/decisions/2026-08-09-color-theme-ownership.md` |
| Core visual design principles (hierarchy, restraint) | `design/design-principles.md` |
| How a slide is composed — the Form vocabulary | `design/forms.md` |
| Prose rules for galleries/decks (the words ON a slide) | `design/editorial.md` |
| **How we write ABOUT the work** — chat, issues, PR bodies, changelog, docs, comments (HARD RULE #30) | `engineering/house-style.md` |
| The deck-authoring contract | `design/skill.md` |
| Cross-cutting authoring (eyebrow, subtitle, base modifiers) | `lib/base/base.docs.md` — and for a deck-level front-matter REGISTER (`mode:` `finish:` `split:` `stamp:`/`tone:` `spectrum:` `rule:` `eyebrow:` `headline:` `lift:` `corners:`), `lib/base/base.registers.docs.md` |
| A specific component's slots/variants/anti-patterns | `lib/components/<bucket>/<name>/<name>.docs.md` |
| Picking a component as an agent | `dist/docs/components.pick.md` — one line per component, the whole catalog in ~3.8k tokens; skim or grep it, then read the picked component's `.docs.md` (#6). `dist/docs/components.json` is the full machine record for TOOLS — don't load it to choose. **`dist/` is generated, not committed** — `npm install` (via `prepare`) and the SessionStart hook both build it, so run `npm run build` if it isn't there. Without a clone, the same files are published on the [`dist-kits`](https://github.com/Laticent/lattice/tree/dist-kits/agent) branch. Also `AGENTS.md` |
| What scripts/tools already exist (don't reinvent) | `engineering/capabilities.md` — 300+ rows; **grep it for the thing you were about to build** (`grep -i contrast`, `grep -i bench`), then open the script or tool the row names — its own header is the long form. Don't read it top-to-bottom |
| Automated codebase quality assessment (coupling, boundaries, cycles, change coupling, complexity, duplication, dead code) | `engineering/quality-assessment.md` |
| The 10/10 visual rubric | `engineering/decisions/2026-06-06-layout-audit/` |
| A large visual sweep / parallel reviewer fan-out | `engineering/visual-review.md` |
| Orchestrating agents — verification tiers, fan-out shapes, budgets (HARD RULE #25) | `engineering/orchestration.md` |
| Which model an agent runs on — one tier, why tiering was retired (HARD RULE #27) | `engineering/model-policy.md` |
| A self-driving UI walkthrough / product tour (the **Vetrina** library) | `docs/src/lib/vetrina/README.md` + `engineering/decisions/2026-07-05-vetrina-walkthrough-library.md` |
| Release / publish | `RELEASE.md` |
| The Studio's succession of the Drawing Board + Workbench (both **REMOVED**; their routes redirect) | `engineering/decisions/2026-07-03-studio-succession.md` |
| Durable investigation notes | `engineering/decisions/README.md` — one line per note; grep it for the topic, then open the 2–3 notes it names. A row is a GIST, so a term that isn't in one still won't be found there: **`grep -rln <term> engineering/decisions/`** searches the notes themselves |

The 13 component buckets: anchor, statement, inventory, comparison, progression,
evidence, imagery, chart, diagram, math, code, legal, connect.

---

## The build, tests, and gates (the machine polices these — don't re-police)

- `npm run build` regenerates every `dist/` artifact behind
  `npm run check:ownership`; `build:check` is the CI/stale gate.
- `npm test` is the inner loop; `npm run test:integration` is the cross-renderer
  + PDF-page-count tier; `test:<scope>` runs one slice. Counts/scopes live in
  `engineering/development.md`.
- **Hooks make the checklist blocking** (pre-commit, pre-push, commit-msg). Run
  the gates yourself *before* the hook — the hook is the backstop.

## Cloud sandbox + visual iteration

The SessionStart hook provisions everything and **exports `CHROME_PATH`**. The
recurring frictions (re-export `CHROME_PATH` if a render says "no browser";
`npm run lint` not `npx biome`; `node --test <file>` for one file; serve the
docs site with `cd docs && npm run dev`, stop it by port; sync local `main`
after a squash-merge) and the browser-free PNG preview are documented in
`engineering/development.md` (tooling) and `engineering/gotchas.md` (symptoms).
**Don't re-discover them — read those.**

Iterate visually with `npm run preview` + `SendUserFile` (no per-iteration
commits; auto-detects scope + pixel-diffs). Lint drafts with
`npm run lint:deck -- <file>`. The final PR commit includes all rebuilt PDFs.
`.scratch/` is for throwaway experiments (`npm run clean:scratch`).

## Design-before-code on "rethink X" requests

When asked to rethink something, write the design model first — name the axes,
list candidate moves, recommend one, confirm in one `AskUserQuestion` round —
before editing CSS or transforms. Bundle adjacent decisions. When the ask
warrants *competing* designs, start from the `design-competition` named
workflow, not an improvised fan-out (`engineering/orchestration.md`).
