# Operating mode — the full text

The DEFAULT OPERATING MODE, the SECOND FILTER, the OPERATING ETHOS, the QUALITY BAR, MAKER-CHECKER and
the MODEL POLICY, moved here word for word from `CLAUDE.md` on 2026-11-27
(`engineering/decisions/2026-11-27-claude-md-index.md`). `CLAUDE.md` keeps an index of each; **this
text binds**. "I" and "me" are the owner. Read by section: `grep -n '^##' engineering/operating-mode.md`.

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
| a PR is open | **subscribe + drive CI green**; rebase **only on a real conflict** (rule 4). **A check red, or green you doubt? Read `engineering/gotchas/ci.md` first** (stale-head events, a canceled "green" beacon, route-budget bytes, `studio-smoke`, a stale `dist/` or missing workspace link) |
| the PR is green and the card would be below VERY HIGH | **run the raise loop before asking** — `npm run evidence`, drive every surface it lists (Playwright Chromium/WebKit/Gecko, the macOS/Windows/iOS-Simulator suites by dispatch), have a `checker` agent grade the card, do its `raise it` line, regrade; up to 3 rounds (2 for docs-only or test-only). Never ask me to run a check a runner can reach; a visual taste call goes with the artifact attached (`workflow.md` §The raise loop) |
| the PR is green and `npm run queue:precheck` exits 0 (being *behind* `main` is fine) | **ask to merge, with a fenced 🚦 pre-merge card (build it with `npm run card`) — posted on the PR *and* in the ask** — the *one* user gate in this flow. No card, no ask. Several green at once → **one batched round**, one card each. **This row is an INDEX, not the spec: open `workflow.md` §Pre-merge card and build the card from the template there** — the four-level scale, the lowest-axis floor rule, the axis attribution, the `raise it` line, the checker's `graded by`, the `raised` rounds, `left behind` and the `pick` line are all in that section and all load-bearing (HARD RULE #28) |
| merge confirmed + local `main` synced | **post the standup + the continuation brief** — two fenced cards, always fenced, **as one comment on the PR *and* in chat, same wording** (`workflow.md` §Post-merge standup + §Where the cards go) |
| a session stops with a decision, question or veto-able call still open, **or I ask for "open items / questions / decisions"** | **post the ❓ decision card** (build it with `npm run card`) — fenced, plain words, each item with options (+/−/→), a recommendation and a default-if-silent; **on the PR as well as in chat** (`workflow.md` §❓ Decision card — build it from the template there, not from this row). Never answer "open items?" with a free-form list |
| a blocker you didn't cause | **send the command center a 🧱 line** (`workflow.md` §Desks) |
| a session goes idle with work still pending — parked at the merge gate, or out of scope | **post the continuation brief** so a fresh session can pick it up cold — **on the PR as well as in chat** (same §) — and **write every item that has no issue to `followups.d/`** in the PR, as #18 allows (never a red test). A pending item that exists only in chat or a PR comment is lost work (`followups.d/README.md`; `npm run followups` lists them) |

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
its justification.

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
seen the options first.)*

1. **Finish the loop.** Done = implemented, verified, documented, shipped — not
   "it compiles." Don't hand back at first green waiting for "now lint / test / push."
2. **Don't settle.** "Builds + tests pass" is the floor. Self-critique and raise
   the result before returning it. Visual work meets the Quality Bar below.
3. **Prefer the cheapest path that meets the bar.** Reach for a reversible
   default over a question; **batch decisions into one round and never re-ask a
   settled point.** Spawn sub-agents only when a second independent pass changes
   the outcome (see Maker–checker) — not by reflex. My GitHub + Claude spend is a
   real constraint: where two routes meet the bar, take the cheaper one.
4. **Stay *mergeable* — rebase on a conflict, never on drift.** The merge queue
   re-tests every PR on top of current `main` before merging, so a PR that is only
   *behind* `main` needs nothing. Rebase only when the branch conflicts with `main`,
   the queue ejected it, or you need code that landed on `main`. This is HARD RULE
   #16; the live queue settings are `workflow.md` §Merge queue — the facts. Before
   the merge ask, `npm run queue:precheck` says whether to rebase. (The Stop hook
   runs the same check without fetching and warns on a real conflict.)
5. **Run the gates yourself, proactively** — `npm run lint`, the unit suite,
   `npm run build:check`, the integration tier — *before* declaring done. Hooks
   enforce these at commit/push as a backstop, not a substitute.
6. **Keep docs + changelog in sync in the SAME change.** Any behavior change
   updates the matching `engineering/`/`design/` doc AND adds a changeset in
   `.changeset/` (HARD RULE #10 — **never** an edit to a `CHANGELOG.md`). Never
   return a behavior change with stale docs.
7. **Open the PR when review-ready, then drive it green — then ASK to merge.**
   Use `.github/pull_request_template.md`. Open ready; iterate as a draft, then mark ready.
   Once open, subscribe and drive CI green / address review — never ask
   "should I watch?". When green + review-ready, **stop and ask me for merge
   authorization** — a human approves every merge, and prior authorization does
   **not** carry forward; it covers the head it was given on, and a new head beyond a
   clean rebase needs a fresh ask. While a `desk:merge` session is live, post your card
   on the PR; its digest is the ask. On my go-ahead, **squash-merge** by default.
   Full procedure: `workflow.md` §Merging.
   *Scope: work you or I authored.* Four machine-generated PR classes
   auto-merge themselves through the queue — the backlog mirror
   (`sync-backlog.yml`, a generated view of issues), the release (`release.yml`,
   where **the dispatch is the authorization**), **patch/minor dependency
   bumps** (`dependabot-auto-merge.yml`; majors always wait for a human), and the
   **nightly golden bless** (`golden-bless.yml`, per golden; a golden that adds,
   removes or resizes a page its source's slide count does not explain is held until
   the owner dispatches `bless_held` —
   `engineering/decisions/2026-11-16-blessing-invariants-attribution.md`).
   None is license to auto-merge anything you wrote.

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
  of art only when it earns its place, and define it on first use (HARD RULE #30). The moment I
  say I'm lost, *stop* — don't restate the same explanation louder. Re-explain
  from the start in plain language, lead with a concrete example, and name the
  thing in the codebase it maps to. Jargon I have to decode is a defect in the
  writing, not in me.
  Name a PR to me as `[#N](url) ([session name](url))`, linked.

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
second set of eyes changes the merge decision. **The card grader is separate and
always runs:** one `checker` per merge ask sets the pre-merge card's level
(HARD RULE #28). It is mandated here, so it counts toward #25's session total but
needs no OK of its own. **It is not a rung of the ladder:** it grades the card, it
does not review the code, so routine work still self-reviews and the card's
"Independent eyes" axis still asks whether the tier the work earned ran. See `engineering/visual-review.md`.

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

The adversarial three audit claims you already have; the additive three generate them
(joins, reverse-dependency closures, refused tradeoffs). The additive trio is
**not** a rung on the verification ladder and is never mandatory.

**The session's own model never changes** (it would void the prompt cache, and
it's the human's `/model`).

**`effort` is the one lever left**: it cuts output tokens without changing what
reasons about the problem, and Opus 5 is unusually strong at `low`/`medium`. Cut
cost by spawning **fewer** agents at the **right effort** — never by a cheaper
model. Full policy: `engineering/model-policy.md`.
