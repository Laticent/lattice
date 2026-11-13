# Audit chapter 4 — The knowledge system: doc types, memory, backlog, follow-ups

Repo: `/home/user/lattice` at HEAD on 2026-09-24. All counts below are **MEASURED** by commands run
during this audit unless marked **ESTIMATED** or **CLAIMED** (meaning the repo says so and I did not
re-derive it). Token counts use `gpt-tokenizer/encoding/o200k_base`, the same encoder the repo's own
method uses (`engineering/development.md` §Context cost). The repo itself warns that this encoder is
±10–20% off Claude's tokenizer in absolute terms.

---

## 1. Doc types

### 1.1 The type system the repo actually has

Lattice has **one** formal lifecycle vocabulary. It covers only `engineering/decisions/`. It is a
`status:` field in YAML front matter, and `tools/build-decisions-index.js` reads it
(`engineering/decisions/README.md` §Convention, lines 32–56):

| `status` | Glyph | Meaning (verbatim) | Index group |
|---|---|---|---|
| `proposed` | ☐ | A design/decision written, not yet built | Active |
| `in-progress` | ◐ | Being built now | Active |
| `blocked` | ⏸ | Needs an owner decision or a dependency | Active |
| `shipped` | ☑ | Built + verified; *absorb into canon, then delete* | Shipped |
| `superseded` | ⊘ | Replaced by `superseded-by` | Historical |

This is a **lifecycle** axis: how far along the work is. It is not a **type** axis: what kind of
document it is. The repo has no `type:` field for proposal, ADR, spec, scoping note or audit. Those
types exist only as **filename words and self-descriptions in the prose**. So "proposal", "spec",
"ADR", "scoping" and "audit" are informal genres that all share one folder and one lifecycle.

Separate, formally distinct doc classes do exist *outside* `decisions/`:

| Class | Location | What makes it that class |
|---|---|---|
| **Normative spec** | `spec/LFM-1.0.md` (22.6 KB), `spec/diagnostics.md` (9.5 KB) | RFC-style MUST language, conformance levels (§1), versioning (§7), a conformance-testing section (§8), governance/license (§12). `spec/README.md` declares them "the source of truth". `docs:spec:check` fails CI if the generated docs-site copies drift. |
| **Canonical how-it-works docs** | `engineering/*.md`, `design/*.md` (14 entries in `design/`) | The documents CLAUDE.md routes to. A decision note is supposed to be "absorbed" into these. |
| **Component contracts** | `lib/components/<bucket>/<name>/<name>.docs.md` | Each one sits next to its code. HARD RULE #6 makes reading one mandatory before authoring that component. |
| **Authoring skills** | `design/skills/*.md` (8 files, 128 KB total) | Self-contained, per-artifact "how to make a deck/theme/component" guides. |
| **Generated indexes** | `engineering/capabilities.md`, `engineering/gotchas.md`, the decisions index, `BACKLOG.md`, `dist/docs/components.pick.md` | Each carries a "DO NOT EDIT" header and a `--check` freshness gate. |

### 1.2 Counts: decision notes by status (measured from front matter)

`engineering/decisions/` holds 583 top-level notes plus `README.md` and 6 subfolders (590 entries in all).
**Every** note carries a `status:` line (`grep -L '^status:'` returned nothing).

| status | count |
|---|---:|
| proposed ☐ | 91 |
| in-progress ◐ | 89 |
| blocked ⏸ | 5 |
| shipped ☑ | 382 |
| superseded ⊘ | 16 |

By month of authorship (from the filename date):

| month | proposed | in-progress | blocked | shipped | superseded |
|---|---:|---:|---:|---:|---:|
| 2026-04 | – | – | – | 1 | – |
| 2026-05 | 11 | 1 | – | 17 | – |
| 2026-06 | 38 | 21 | 1 | 62 | 6 |
| 2026-07 | 22 | 36 | 1 | 112 | 7 |
| 2026-08 | 10 | 8 | 3 | 130 | 1 |
| 2026-09 | 9 | 23 | – | 60 | 2 |

**Stale "Active" status (measured).** 71 notes from May–July are still `proposed` and 58 are still
`in-progress`. At least 3 `proposed` notes say in their own body that the decision is made:

- `2026-06-16-narrative-step-spec.md`: front matter `status: proposed`, body "**Status:** spec decided 2026-06-16".
- `2026-06-16-narrative-step-model.md`: `proposed`, body "direction decided 2026-06-16".
- `2026-06-16-form-manifest-medium-independent-contract.md` and `2026-06-17-content-capacity-contract.md`: the same pattern.

Both triage notes (`2026-06-26-issue-backlog-triage.md`, `2026-08-09-issue-priority-triage.md`) are
still `proposed`. Their own recommended actions were gated on the owner, and nothing flips a note's
status once the owner acts. The follow-up `followups.d/2353-p3-mark-the-html-player-decision-note-shipped.md`
exists **only** to flip one note's status. Status upkeep is manual, and it lags.

**Filename genres (measured with `ls | grep -i`):** `proposal` 5, `spec` 9 (this count includes words like "spectrum", so treat it as an overcount), `retire` 9, `audit` 16, `scop` 2.
The genre word is unreliable as a type signal. `2026-06-18-layer-activation-scope.md` is a decision.
`2026-08-03-export-fidelity-gate-scoping.md` is a scoping note. 14 notes call themselves "not a decision".

### 1.3 One exemplar per genre

| Genre | Exemplar | What makes it that type |
|---|---|---|
| **Proposal / RFC** | `2026-05-04-authoring-proposals.md` (45.7 KB, `proposed`) | It opens with "**Not canonical.** This is a design-speculation document, written ahead of implementation", and "A design document, not a spec. Every proposal here is reversible." It is a catalog of candidates, and a legend added 2026-05-15 tags each one Shipped or Open. **Decay:** its "ground truth" pointers (`../references/templates.md`, `../../examples/gallery.md`) no longer exist (measured with `ls`). |
| **Proposal-miss register** | `2026-05-15-shipped-without-proposal.md` (8 KB, `shipped`) | It lists 9 layouts or families that shipped without going through the May 4 and May 7 proposal catalogs. In practice this admits early that the "proposal first" flow was bypassed. After May the repo stopped writing catalog-style proposals and moved to one note per decision. |
| **Decision note (ADR-like)** | `2026-07-10-hard-rule-12-retirement.md` (6.2 KB, `shipped`) | It follows the README convention: symptom, then the claim tested, then evidence, then the decision (retire rule #12). CLAUDE.md cites it as the record. 40 notes use the word "ADR" for themselves or a sibling note. |
| **Spec (inside decisions/)** | `2026-06-16-narrative-step-spec.md` (6.5 KB) | It calls itself a "field-level spec … increment 1" of a parent note it calls "that ADR". It owns a grammar and a data contract. Its front matter still says `proposed`. |
| **Scoping note** | `2026-08-03-export-fidelity-gate-scoping.md` (16 KB, `in-progress`) | It opens "**Not a decision — a scoping note.** The owner asked for this to be scoped, not built." A dated banner corrects it in place: "Partly built, 2026-08-04 … Steps 2 and 3 … shipped". |
| **Audit** | `2026-09-20-gesture-audit.md` (25.7 KB, `in-progress`) | It measures current behavior over a corpus (for example "88.9% of 10,551 cues resolve"), attributes the failures, and names one seam as the cause. |
| **Normative spec** | `spec/LFM-1.0.md` | "1.0-draft (pre-ratification)". It uses MUST/SHOULD, conformance levels and versioning, sits in its own folder and has a CI drift gate. |
| **Superseded** | `2026-06-10-marp-replacement-proposal.md` | It carries `superseded-by: ../marp-independence.md`, which points at a canonical doc rather than another note. The body is kept "as the rationale of record". |

### 1.4 Are the genres kept distinct? Partly. The lifecycle is kept; the type is blurred.

- **Kept:** `spec/` is really separate. It has normative language, its own README, and a drift gate against the docs site.
- **Blurred:** proposals, ADRs, specs, scoping notes, audits, triage passes and the "shipped-without-proposal" register all live in `decisions/` under one lifecycle. The type lives only in the prose, and sometimes in bold at the top ("Not a decision").
- **Scope creep:** the README says a note is "one root cause or one decision", "lead with the symptom". But notes run to 45 KB, some are multi-part initiatives with roll-up banners (a pattern the README sanctions), and some are backlogs (`2026-07-11-biome-safe-fix-backlog.md`, `2026-06-28-studio-polish-backlog.md`).

### 1.5 Superseded or corrected: in place, overwhelmingly

- Only **16** notes are `superseded`, and 15 carry `superseded-by`.
- **31** notes contain an `Amendment` / `Correction` / `Update` / `Addendum` heading, for example `2026-08-17-context-index-tiering.md` §"Amendment (2026-08-17) — why rule 1 was restated", written the same day the rule failed its own test. Dated in-place banners are the dominant pattern.
- MEASURED: 331 of 583 notes (57%) have more than one commit (`git log --follow`), so post-creation editing is the norm.
- **"Absorb into canon, then delete" is not practiced.** 382 notes are `shipped`, and git history shows about 2 note files ever deleted (`git log --diff-filter=D`): `2026-07-11-old-browser-chart-fallback.md` was reverted, and `2026-06-09-asset-import.md` was re-scoped. The README says "This folder is not an archive". In practice it is one.

---

## 2. Agent context architecture

### 2.1 Sizes (measured, o200k tokens)

| Doc | Bytes | Tokens | Role / access mode |
|---|---:|---:|---|
| `CLAUDE.md` | 53,436 | **13,732** | Auto-loaded every session and every subagent. It calls itself "an index, not a manual". CLAUDE.md has 140 commits of history. |
| `AGENTS.md` | 9,341 | 2,369 | For external or deck-authoring agents. It points contributors to CLAUDE.md and says to grep `capabilities.md`. |
| `engineering/decisions/README.md` | 133,300 | **37,132** | The decisions index. Its intended access mode is grep-first. |
| `engineering/workflow.md` | 119,466 | 29,777 | The operational contract. The pre-merge card section is about 1.2k of it (claimed). |
| `lib/base/base.docs.md` | 88,843 | 22,557 | A mandatory read under HARD RULE #6. |
| `engineering/development.md` | 78,095 | 20,273 | Tooling reference. |
| `engineering/capabilities.md` | 69,987 | 17,311 | Generated "don't reinvent" registry, grep-first, 428 table rows. |
| `BACKLOG.md` | 64,739 | 17,183 | Generated issue mirror. |
| `engineering/gotchas.md` | 39,488 | **10,398** | Generated symptom index, read-whole. It points to 14 bodies in `gotchas/` (500 KB total). |
| `dist/docs/components.pick.md` | 19,499 | **4,420** | One line per component, read-whole. |
| `engineering/house-style.md` | 11,669 | 2,863 | The writing contract (HARD RULE #30). |
| `design/skills/README.md` + `deck.md` | – | 1,274 + 3,321 | Per-artifact skills. |
| `followups.d/README.md` / `changelog.d/README.md` | – | 954 / 992 | Small contracts. |

**What a session loads (CLAIMED in `development.md` §Context cost, from one session's `prompt_snapshot`):**
the main-thread baseline is 86,790 tokens before any work: tool schemas about 36.7k, CLAUDE.md about 13.4k,
the harness prompt about 7.4k, and listings about 5.9k. The subagent baseline is 30,074 tokens, and CLAUDE.md
is 44% of it ("the router is paid again per agent"). **ESTIMATED** typical first-hour loads for a component
task: CLAUDE.md (13.7k, automatic) + components.pick (4.4k) + one `<name>.docs.md` + sections of base.docs,
which gives about 20–30k before any code is read.

### 2.2 The context-cost method (`development.md` lines 570–722)

1. **Measure from transcripts, not guesses.** The per-message `usage` blocks in `~/.claude/projects/**/*.jsonl`
   are the data. The claimed finding: the charge is about `0.7 × (new tokens + output tokens)`, and cached-prefix
   re-reads cost almost nothing, so **every read is a purchase paid once**.
2. **Read sections, not files:** `grep -n '^## '` then `sed -n 'A,Bp'`.
3. **Delegate any read over ~10k tokens** to a subagent, because only its report enters the main context.
   Measured claim: a 2.4 MB log cost 55,951 subagent tokens and returned about 1.2k, against 657,806 if read in-thread.
4. **Tame verbose tools:** `npm test` went from a TAP reporter (657,806 tokens) to a dot reporter (1,182).
5. **Batch tool calls. Let microcompact run. Don't idle past the cache TTL. `effort` beats a thinking cap:**
   thinking is 37% of output but only about 6% of the bill.
6. **Re-measure with o200k and quote the commit.** A worked JS estimator is included, with five annotated "traps".
   Each trap produced a plausible wrong number first, and #2298 once published 477 where the true figure was 1,182.

`2026-08-17-context-index-tiering.md` (`shipped`) adds the index rules:
(1) **a read-whole index must stay ≤10k tokens.** A **grep-first** index is budgeted **per row** (`ROW_CAP` = 285 chars),
never by file total. The crossover is about 165 items at about 60 tokens per row.
(2) **An index is generated or gated, never hand-maintained.** Both `gotchas:index:check` and `decisions:index:check`
run in `build:check`.
(3) **Don't map what grep gives free.** No summary layer over `lib/`.
(4) **Generated indexes assert no row order and no totals**, to avoid merge-queue ejections.

**Practice vs theory (measured drift in the repo's own numbers):**

| Figure | Claimed in docs | Measured today |
|---|---|---|
| `gotchas.md` | 7k, inside the ≤10k read-whole budget | **10,398, over the budget the rule set** |
| `components.pick.md` | 3.8k (CLAUDE.md and the tiering note) | **4,420** |
| decisions index | 27.1k (README text), 36k (development.md) | **37,132** |
| CLAUDE.md | "~13,400" | 13,732 |

The CLAUDE.md preamble predicts exactly this: "No list of names or sizes here on purpose — it would rot".
The size gate is per-row, so nothing fails when a read-whole index crosses 10k.

### 2.3 Registries and gates: what they enforce vs what they can't

- **`capabilities.md` / `capabilities:check`.** The file is generated from `package.json` scripts and `tools/*` headers
  (`tools/build-capabilities.js`). The generator gives its origin as "Sessions rolled their own benchmark harness without
  knowing `npm run bench` existed". The gate enforces **cataloging**: a new script or tool without a description fails.
  It **cannot** enforce **consultation**, meaning whether an agent grepped before building. The hand-curated
  "Frameworks" section is explicitly ungated.
- **`gotchas.md`** is a generated one-line symptom index over 14 body files. CLAUDE.md says to grep `gotchas/` for an
  API or selector, "never read either top-to-bottom".
- **The decisions index** is generated. A README warning measured that 205 of 425 rows were truncated, and two rows
  advertised a claim their own note refuted. That was fixed at the source, and "nothing gates the rest".
- **`house-style.md`** is short (2.9k) and deliberately carries no automated gate, apart from a US-English audit test.

---

## 3. Backlog and follow-ups

### 3.1 Three layers of pending-work memory

| Layer | Source of truth | Mechanism | Size today |
|---|---|---|---|
| GitHub issues | Issues | `.github/labels.json` taxonomy, synced by `labels.yml` (labels-as-code, upsert-only) | **342 open** (per BACKLOG.md) |
| `BACKLOG.md` | Generated from issues | `sync-backlog.yml`: nightly, one-way, a PR through the merge queue with auto-merge on. 101 commits touch it. | Backlog 327 · Ready 12 · In progress 0 · In review 0 · Inbox 3 |
| `followups.d/` | Repo files | One file per unticketed item, `checkFollowups` shape gate in `build:check`, `npm run followups` | **90 items** |

**Label taxonomy (measured from `.github/labels.json`):** `area:` 17 (the 13 component buckets plus others), `type:` 6,
`priority:` 4, `status:` 4 (backlog/ready/in-progress/review), `needs:` 2 (triage, definition), and a bare `feedback`.
Issue #2213 P3 (measured live 2026-09-14) found **12** `type:` labels on the repo against 6 in the taxonomy, with 13 open
cards using the strays. The triage gate tests only the `type:` prefix, and `sync-labels.js` never prunes. So
labels-as-code drifted.

**Intake and readiness gates:**

- `triage-gate.yml` runs on issue open, edit or label. It adds `status:backlog`, `needs:triage` when area/type/priority
  is missing, and `needs:definition` when the swimlane or acceptance check is missing. Cards opened before `DOR_CUTOFF`
  are grandfathered, because checking them all "would storm the ~218 legacy cards". Known hole: issues filed by a
  workflow's `GITHUB_TOKEN` don't trigger it.
- `dor-gate.yml` runs when `status:ready` is applied. It strips the label unless the body has a governing doc **and** an
  acceptance check.
- `npm run audit:queue` (`tools/audit-queue-dor.js`) needs an issue JSON on `--input`. `gh` is not installed in the
  sandbox (measured: `gh: command not found`), so you paginate the REST API yourself.
- **Outcome today:** BACKLOG.md flags **29 cards needing triage** and **21 needing definition**. Only **12 of 342** are
  Ready. Issue #2213 measured 218 of 318 open cards failing the DoR, all for a missing swimlane. That sweep is still open
  and waits on the owner's approval, because rewriting 218 issue bodies is shared state (CLAUDE.md second filter, row 1).
- **Issue-count growth, from the triage notes:** 45 open (2026-06-26) → 156 (2026-08-09) → 317 (2026-09-20) → 342 (today).
  Each pass was a full note: `2026-06-26` used 4 cluster agents plus a checker, `2026-08-09` checked against the CI record,
  and `2026-09-20` sorted by cost-of-delay "work class" and produced the `queue-triage` skill (3k tokens). The 2026-08-09
  pass found the Studio E2E nightly "red for 30 consecutive nights" and "not run a single test" since 2026-08-06, with
  nothing tracking it. That is concrete evidence that labels can say "fine" while the queue is not.
- **Nightly bot issues** (#1845, #2060, #2085, #2120, all `critical`) sit at the top of Backlog as standing "red on main" markers.

### 3.2 The "a pending item that exists only in chat is lost work" rule: evidence

**This rule was learned by losing work, and the follow-up log measures the loss.** `followups.d/README.md` (created
2026-09-22 in #2313, two days before this audit):

- CLAIMED: "In the two months to 2026-09-22, 29 of 506 merged PRs left **79** `[no ticket]` items in their final brief."
  The handoff-issue rule (#2215) that was supposed to catch them produced only 4 handoff issues.
- CLAIMED: a triage on 2026-09-24 re-checked all 79 against `main`. **28 were already done and 6 were duplicates (34 of 79, 43%)**. 45 were kept.
  So chat-only follow-ups go stale fast. Nearly half had been silently finished, and nobody had recorded that.
- MEASURED: 90 items now. Priority mix: P1 15, P2 35, P3 30, P4 9, P5 1. Recorded dates: 32 on 09-22, 3 on 09-23, 56 on 09-24.
  33 commits have touched the folder and 67 item files have already been deleted. Only 31 remaining files originate from
  PRs before #2313, and only 32 carry the "Triaged 2026-09-24" line, while the README says 45 were kept.
  The discrepancy is unexplained (probably later completions, but not verified).
- **The gate's own admission:** "It checks the shape of the files that exist. It cannot read a chat, so it cannot tell that
  a brief left an item out. That half is still discipline." Prose deferrals from before the brief format existed "are not harvested".
- **Verdict:** the mechanism is too new to show whether it works (2 days old). The loss it responds to is well measured.

---

## 4. `changelog.d/` fragments

- **Contract** (`changelog.d/README.md`): one file per PR, named `<slug>.<category>.md`, where category is one of
  added/changed/deprecated/removed/fixed/security. The category is in the filename so the release bump comes from a
  directory listing. The body is bullets only. `**Breaking:**` forces a major bump. `tools/release.js` folds the
  fragments into `CHANGELOG.md` and deletes them. `checkChangelogFragments` rejects a bad name, a heading, a body with no
  bullet, conflict markers, CRLF, a BOM, or a missing directory.
- **Why** (CLAIMED, #1593 and `2026-08-11-changelog-fragments.md`): one evening of five PRs produced 7 merge-queue
  ejections, all `MERGE_CONFLICT` on `CHANGELOG.md`. An ejection silently clears auto-merge. #1566 needed 6 cycles over
  about 4 hours. The same "one file per item, no shared region" reasoning was later reused for `followups.d/`.
- **Measured:** **627 pending fragments** (fixed 328, changed 154, added 124, security 17, removed 4). The first was added
  2026-08-11. `CHANGELOG.md`'s latest section is `## 1.0.0`, and no git tags exist, so **no release has folded a fragment
  yet** in about six weeks. The README calls the mechanism "interim": its successor is Changesets, gated on a first npm
  publish that "has not happened". The mechanism solved the conflict problem. Whether the release fold works at this
  scale has not been tested.

---

## Spec vs ADR vs proposal — a crisp definition grounded in Lattice's own examples

- **Proposal**: a *speculative* document written **before** the work, offering options or candidates. It is explicitly
  non-canonical, and its authority expires as items ship. Lattice example: `2026-05-04-authoring-proposals.md` ("Not
  canonical … A design document, not a spec. Every proposal here is reversible"). Test: *if it disagrees with the shipped
  thing, the shipped thing wins.*
- **Decision note (ADR)**: a dated record of **one** choice and the evidence behind it: symptom, then cause, then
  decision, plus "removable when". It stays as the *rationale of record* after the decision is absorbed into canon.
  Lattice example: `2026-07-10-hard-rule-12-retirement.md`. Test: *it answers "why is it this way?" and would be wrong to
  edit into agreement with later reality. Instead a later note supersedes it.*
- **Spec**: a *normative contract* for a surface that others implement or author against. It uses MUST language,
  conformance, versioning and a drift gate, and **it is edited to stay true**. Lattice example: `spec/LFM-1.0.md` (plus,
  one level down, each `<name>.docs.md`). Test: *if it disagrees with the code, one of them is a bug.*
- **Scoping note** (Lattice's fourth genre): it sizes a problem the owner asked to have scoped, *not* decided. Example:
  `2026-08-03-export-fidelity-gate-scoping.md` ("Not a decision — a scoping note").

Lattice's practice blurs the middle three because they share a folder and a lifecycle field. `narrative-step-spec.md` is a
spec living as a decision note in `proposed` status, and it calls its parent "that ADR". A standard should make **type**
a separate field from **status**.

## Surprises

1. **The context-budget rules miss their own numbers.** `gotchas.md` is 10.4k against the ≤10k read-whole rule the
   tiering note set, and that note records it at 7k. `components.pick.md` is 4.4k against the 3.8k that CLAUDE.md cites.
   The decisions index is 37k against 27k in its own README. Per-row gating means none of these fails a gate.
2. **"Absorb then delete" is dead letter:** 382 shipped notes, about 2 ever deleted. The folder *is* an archive.
3. **Status rot:** 71 notes from May–July are still `proposed`, and some say "decided" in the body. A follow-up file
   exists just to flip one status.
4. **43% of the chat-only follow-ups** turned out to be already done or duplicated when finally audited.
5. **627 changelog fragments and zero releases.** The anti-conflict mechanism works, but the release fold is untested at scale.
6. **Proposal links rot too.** The 2026-05-04 proposal's "ground truth" pointers lead to files that no longer exist.
7. **Queue growth outpaces triage:** 45 → 342 open issues in 3 months, 12 of them Ready, and the 218-card DoR sweep is
   blocked on the owner's gate, by design.
