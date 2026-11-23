---
status: proposed
summary: >
  Design for a durable handoff folder. Each line of work keeps handoffs.d/<slug>/HANDOFF.md plus
  artifacts/ on its own work branch. The baton holder updates it, it travels with every handover,
  and the session removes it in the last commit before the merge ask; a new rule inside the existing
  build:check fails when it would reach main. The PR's living handoff comment becomes a summary
  npm run card generates from HANDOFF.md, never edited by hand. The owner picked the place, the
  lifecycle, the artifact layout and rules, rewriting one HANDOFF.md in place at each usage
  checkpoint, HANDOFF.md as the single source, gotchas written to engineering/gotchas/ when found, and
  building it this week; only the size numbers are desk defaults. The same rule fails when the branch
  has work newer than its HANDOFF.md, and never blocks the push that saves it. Nothing is built yet.
---

# Handoff folder: `handoffs.d/<slug>/` on the work branch, removed before merge

**Status:** proposed; the build has not started. This note is docs only: no tool, gate or workflow
rule changes until the follow-up PR in §Implementation slices.

**Where each decision comes from.** This session read every owner answer below in the session where
the owner typed it.

| Decision | Source | Strength |
|---|---|---|
| H1 Shape | the workflow desk's question (`session_01DPMMjHSgQqpuNVxFhptqgf`, event `38af7cc9-92b2-4c8a-96c0-7064aa34a1ad`, 2026-11-23 00:25:52 UTC) named "handoffs.d/<line-of-work>/: HANDOFF.md + artifacts/"; H6 then made it concrete | owner's answer, through H6 |
| H2 Where | the owner picked "On the work branch itself (Recommended)" in that answer | owner's own answer |
| H3 Lifecycle | the owner picked "Removed before merge; build:check enforces (Recommended)" in that answer | owner's own answer |
| H4 Size and secrets | the workflow desk's default numbers (5 MB per folder, 1 MB per binary file); H6 made a binary cap and a scrub rule the owner's | numbers open to veto |
| H5 One source | first a desk proposal (no earlier owner answer contained it); then the owner answered "One store or two?" with "HANDOFF.md is the source (Recommended)" (command center, event `a48dc38f-2e8b-4101-925c-8d390b84a0e5`, 12:33:14 UTC) | owner's own answer |
| H6 Artifacts and shape | the command center showed the owner a worked example, the artifact rules and the table against `followups.d/` (`session_01DPMMjGth4jH37uLv1XPwcA`, 2026-11-23 12:01 and 12:03 UTC); the owner typed "yes, put that in #3454" (event `107c227e-7c9a-4f05-990d-6d4b66209796`, 12:03:45 UTC) | owner's own answer |
| H7 Update in place | the owner asked "will handoff be duplicated or updated at 25, 50,75 and 90?" and typed "yes, update in place" (same session, event `63b640e1-1a70-4601-9e8b-b6b2ac34f015`, 12:05:27 UTC) | owner's own answer |
| H8 Freshness is machine-checked | the owner asked "are we efficient and deterministic in our handoff workflow? … are there edge cases we have not considered?" and typed "do all three" (command center, event `c0034b91-35e9-4fee-8cb0-44b0a389e06d`, 12:12:25 UTC); the command center's 12:12:55 relay names this as item 1 of 3 | owner's own answer, to the command center's proposal |
| H9 75% and the lease | two answers to the command center's `AskUserQuestion` (event `4d1ec72c-82d0-4572-8662-988aad4b3aca`, 12:27:53 UTC): "What should happen at 75%?" = "Checkpoint, keep working (Recommended)", and "Should silence alone ever free a branch?" = "No: only explicit release (Recommended)" | owner's own answers; they change #3427 |
| H10 Gotchas, artifacts, timing | the same answer: gotchas "To gotchas/ when found (Recommended)"; artifacts "On the work branch (Recommended)"; build timing "This week" (the recommendation was after 1.0.0) | owner's own answers |

The W1 to W5 incident facts below reached the desk in a command-center message (the desk's
transcript, 2026-11-22 22:36 UTC), relayed from the presets desk. This session could not read the
presets desk's own sessions.

**Builds on** the two-person relay, PR #3427
(`engineering/decisions/2026-11-22-two-person-relay.md`, `engineering/workflow.md` §Relay). That PR
makes a branch belong to its line of work, adds the baton (who may push), the living handoff comment
and the usage checkpoints at 25, 50, 75 and 90% of the weekly limit. This note adds the place a line
of work keeps what a comment cannot hold. If #3427 changes before it merges, the slices below change
with it.

## Decisions (2026-11-23; sources above)

- **H1 Shape.** `handoffs.d/<line-of-work-slug>/HANDOFF.md` plus `artifacts/`, laid out as H6 says.
- **H2 Where.** On the work branch itself. The baton holder updates it, it travels with every
  handover, and each line of work has one folder, so two PRs never edit the same file and the merge
  queue never ejects one on a conflict (#1593).
- **H3 Lifecycle.** Removed before merge. A new rule inside the **existing** `build:check` fails when
  `handoffs.d/` would reach `main`; no new CI job or hook. What is worth keeping moves to
  `followups.d/` or a decision note first.
- **H4 Size and secrets** *(the numbers are desk defaults; the owner can veto them)*. At most 5 MB per
  folder and 1 MB per binary file; a text file over 1 MB needs a reason line. Never an environment
  value, key or token. Two layers: `checkHandoffs` runs its own token-pattern scan over the folder at
  pre-push, and GitHub push protection (enabled 2026-11-23, read from the repository's
  security settings at 12:43 UTC) rejects a known secret at the server. Push protection can be
  bypassed by an admin role with a reason, so the local scan stays.
- **H5 One source.** HANDOFF.md is the single truth. The PR's living handoff comment is a short
  summary that `npm run card` generates from it and is never edited by hand, so a session writes one
  thing and the two cannot drift.
- **H10 Gotchas when found; artifacts on the branch; build this week.** A session writes know-how to
  `engineering/gotchas/<topic>.md` the moment it learns it, not at close. Artifacts stay in
  `artifacts/` on the work branch, with no side refs. The build PR lands this week, before 1.0.0.
- **H6 Artifacts and shape.** `artifacts/` has the subfolders `decks/`, `css/`, `recipes/`,
  `prototypes/`, `tools/`, `measurements/`, plus `LINKS.md`. HANDOFF.md's front matter carries the
  owner session, branch, PR, status, updated time and budget used; its sections are Where it stands
  (with SHAs), Open questions (full context, the owner's earlier words quoted exactly, options and a
  recommendation), Next steps in order, Gotchas met, and Do not. Small text is always committed;
  PDFs and large images are linked in `LINKS.md`, never committed; anything binary has a size cap;
  no tokens or secrets. A handoff is distinct from a follow-up (§Not `followups.d/`).
- **H7 Update in place.** One handoff per line of work for its whole life. At each usage checkpoint
  (25, 50, 75 and 90%) the session rewrites the same HANDOFF.md and adds or replaces files in
  `artifacts/`, one commit per checkpoint, and never keeps a copy per checkpoint: git history holds
  the earlier versions. The living PR comment is edited in place, not reposted. Front matter gains
  `checkpoint:` beside `updated:`; this note adds whose meter it read (`checkpoint: 50% (picard)`),
  because each account has its own weekly meter. At 90% the session also sets `status: released`, so the next owner
  can take the branch. The folder is gone by the time the PR merges (H3).
- **H9 75% keeps working; no timed lease.** At 75% weekly usage a session checkpoints and keeps
  working (release-gate work never pauses); at 90% it stops and releases. A branch is freed only by
  an explicit release or the owner's "take over", never by silence, which replaces #3427's 60-minute
  lease. #3427's current head already says both (its rule 3, "No clock frees a branch", and its
  usage table); this note follows them and needs nothing from the lease.
- **H8 Freshness is machine-checked.** The `build:check` rule fails when the branch has work newer
  than its HANDOFF.md. It never blocks a push that updates the handoff itself, and when it fails it
  prints one exact command that fixes it, so a session saving its work can always land the handoff
  (§The `build:check` rule, Freshness).

## Why

The presets desk took over a colleague's Wave 1 and found five kinds of state that lived nowhere
durable:

| # | What was lost or nearly lost | Where it lived |
|---|---|---|
| W1 | Gaps G2, G3 and G4 were named but defined nowhere | the colleague's session |
| W2 | The round-6 recipes (`candidates.json`, the study gallery), so the looks that scored 8.5 cannot be reproduced | a sandbox that was reclaimed |
| W3 | The agent budget used: "3" in one session, "4" in the other | two sessions' heads |
| W4 | Know-how: the route budget, the export byte-diff method, the pinned `marp-cli` install, Firefox failures that happen only in the sandbox | reached the taker through one lucky peer message |
| W5 | Artifact links | per-account private on claude.ai, so Kirk cannot open Picard's links |

The living handoff comment from #3427 fixes when a handoff is written (at every checkpoint, before a
session stops). It does not fix what fits in it. A GitHub comment holds at most 65,536 characters,
carries no files, has no diff history a reader can blame, and is not checked out with the code. W2
and W4 need files next to the code; W5 rules out the one file store each account already has.

## The axes

| Axis | Options considered | Picked |
|---|---|---|
| **A1 Where it lives** | on `main` · a separate handoffs branch · the work branch · PR comments only · claude.ai Artifacts · Actions artifacts | the work branch (H2) |
| **A2 How long it lives** | forever · until the next session picks it up · until merge | until merge (H3) |
| **A3 What enforces the end** | nothing · a new CI job · a hook · a rule inside `build:check` | a rule inside `build:check` (H3) |
| **A4 How many sources** | comment and folder each hand-written · folder is the source, comment generated | folder is the source (H5) |
| **A5 What it may hold** | text only (like `followups.d/` evidence) · text plus small images · anything | small text always; PDFs and large images linked; binaries capped (H4, H6) |
| **A6 How it changes over time** | a copy per checkpoint · one file rewritten in place | rewritten in place; git history keeps the earlier versions (H7) |

## Rejected options

**On `main`, like `followups.d/`.** `followups.d/` works on `main` because an item changes rarely and
each change is a reviewed PR. A handoff changes at every checkpoint, at least every 30 minutes of work
(#3427 D1). On `main`, each checkpoint would need its own PR through the merge queue, and the state
would land after the work it describes. It would also put half-finished work state into every clone.

**A separate `handoffs` branch.** One branch shared by every line of work brings back the race the
baton removes: two sessions on two different lines of work would both push to it, and a
fast-forward-only push rejects one of them for reasons that have nothing to do with its work. The
folder would also not travel with the code it describes, so a taker who checks out the work branch
sees nothing, and a session that forgets the second push leaves a handoff that is out of date with no
sign of it. It adds a long-lived branch, which D2 (one branch per line of work) argues against.

**Delete on pickup.** The taker reads the folder and deletes it. That survives one handover and loses
everything at the second: the know-how in W4 is exactly what the third session needs too. It is the
failure in W1, repeated by design.

**No check.** Removal before merge would rest on memory. The cheapest gate is a few lines inside a run
every PR already makes. Without it, the first forgotten folder puts a few megabytes of stale work
state on `main`, where every gate that walks the tree then reads it.

**Remove before the PR leaves draft.** It saves one CI run, but the raise loop and any handover on a
ready PR then have nowhere to write (§Lifecycle, What this costs).

**PR comments only** (#3427 as it stands). Ruled out by the 65,536-character limit and by having no
files (W2). **claude.ai Artifacts as the store.** Ruled out by W5: each page is private to one account unless it
is shared. A shared page can still appear as a link in `LINKS.md` (H6). **GitHub
Actions artifacts.** They need a workflow run to create them and expire after at most 90 days, and
neither person can attach one from a session without a dispatch.

## Not `followups.d/`

The two folders look alike and do different jobs. The owner saw this table and approved it
(H6).

| | `followups.d/` | `handoffs.d/` |
|---|---|---|
| **What it records** | one piece of work **not being done now**: deferred, blocked or off the path | work **in flight** that the next session picks up and continues |
| **Shape** | one small Markdown file (plus an optional text-only evidence folder) | a folder: `HANDOFF.md` plus `artifacts/` |
| **Who reads it** | whoever triages the backlog, someday | the next session, right away, starting cold |
| **Where it lives** | on `main`, until it is done or becomes an issue | on the work branch only, removed before merge |
| **Lifetime** | weeks or months | hours to days |
| **Required field** | `deferred: large \| blocked \| off-path` | `owner`, `branch`, `pr`, `status`, `updated`, `budget` |
| **Checked by** | `checkFollowups` in `build:check` | `checkHandoffs` in `build:check` (§The `build:check` rule) |

In short: a follow-up says "this was left for later"; a handoff says "here is everything needed to
continue this now". At close (§Lifecycle), anything in a handoff that will not be done in this PR
becomes a follow-up.

## The contract

### Layout (H6)

```
handoffs.d/
  <slug>/
    HANDOFF.md            the one file a new session reads first
    artifacts/
      decks/              source .md decks the work used or a judge scored
      css/                the CSS as last tried
      recipes/            config and JSON, e.g. candidates.json
      prototypes/         HTML mockups shown to the owner
      tools/              scripts that built the evidence
      measurements/       CSV and other tables
      LINKS.md            PDFs and large images: links, never the files
```

- **`<slug>` is the work branch's name with a leading `claude/` removed and every other `/`
  turned into `-`** (`claude/presets-wave-1` → `handoffs.d/presets-wave-1/`). D2 makes a branch one
  line of work for its whole life, so the slug never changes. The gate does not check the slug
  against the branch: a PR run checks out `refs/pull/<N>/merge` and a queue run checks out
  `gh-readonly-queue/…`, so CI never sees the branch name in the tree. The slug only helps a reader.
- **One folder per branch.** A tree with two folders under `handoffs.d/` is an error: it means one
  line of work merged another's branch.
- **Subfolders are created when needed.** An empty one is not committed. Besides HANDOFF.md, files
  go only in these six subfolders, `LINKS.md`, and a `since-<session>.md` after a lost race (below),
  so a reader always knows where to look. The inversion review asked for a
  leaner layout with no fixed subfolders; the owner approved this one (H6), so it stays, and because a
  subfolder exists only once something is in it, an ordinary handoff is HANDOFF.md plus one or two
  folders.
- **`since-<session>.md` after a lost race** (red-team R4). A session that loses the baton race
  (#3427 rule 4) does not touch HANDOFF.md in its rescue commits, because the holder has rewritten
  the same file and the merge would conflict on all of it, losing one side's decisions. It writes
  what it learned to `handoffs.d/<slug>/since-<session>.md` instead; #3427's `baton rescue` posts
  its marked note on the PR as well, and the file carries the detail the note cannot. A change to the
  `since-` file freshens the handoff (§Freshness), so the rescue push, which runs the pre-push hook,
  is never blocked, provided the `since-` file is written in the rescue's last commit, after its work
  commits (`npm run baton -- rescue` writes that commit itself in the build, slice 1). A `since-`
  file is a delta waiting to be folded, not a substitute for HANDOFF.md: while one exists, the layout
  check warns "fold pending", and `npm run handoff -- close` refuses until it is folded and deleted,
  so it cannot stand in for the handoff all the way to the merge ask. The holder merges the rescue and then, in a separate commit after the merge,
  folds the file into HANDOFF.md and deletes it.

### HANDOFF.md (H6, H7)

Front matter that tools read, then fixed sections that people read, in this order.

```markdown
---
owner: John Luke Picard · session_01…      # the session holding the line of work now
branch: claude/presets-wave-1
pr: 3401                                    # or: none yet
status: active                              # active | released | closing
checkpoint: 50% (picard)                    # the last usage checkpoint written, and whose weekly meter it was
updated: 2026-11-23T18:40:00Z
budget: 3 of 4 agent runs (Opus)            # the line of work's running total, all sessions
---

## Where it stands
Commits and what each holds (ed32c33, ae181a0). Terms the work coined, defined here: G2 is …,
G3 is …, G4 is …

## Open questions
### Q1 Does G3 cover the dark cover slide?
Context: the measurements (artifacts/measurements/contrast-round1.csv) and what was tried.
> "keep the cover as quiet as the agenda slide" (the owner, 2026-11-21, session_01…, event <id>)
Options: A … B … Recommendation: … Default if silent: …

## Next steps, in order
1. …
2. …

## Gotchas met
- Route budget: see engineering/gotchas/ci.md §Route budget (written when found, H10)
- Export byte-diff method: see engineering/gotchas/<topic>.md §…
- This branch only: the fixture in decks/wave1-sample.md must not be renamed while …

## Do not
- Push to claude/… (another session's branch, HARD RULE #31).
```

The sections map onto what went missing in §Why. **Where it stands** defines the work's own terms
(W1). The **artifacts** subfolders hold what a reclaimed sandbox lost (W2): each `tools/` script
names in its header what it produced and at which commit, and each `measurements/` table carries
the commit it was measured at. **`budget:`** is one running total the holder updates at each agent
run, so there is one number, not two memories (W3). **Gotchas met** holds pointers to the
`engineering/gotchas/` entries the session wrote the moment it learned them (H10), plus traps that
apply only to this branch (W4). Know-how lives where every session reads it, and is not lost if the
handoff is rushed or removed.
**Open questions** keeps the owner's words exactly, in quotes, with date and session, because a
paraphrase of an owner decision is how a later session re-asks a settled point (CLAUDE.md DEFAULT
OPERATING MODE #3). An exact quote is an external string under `engineering/house-style.md` §1, so
the US-English audit must not rewrite it; slice 2 checks that the audit and the typed-glyph census
leave quoted lines alone. **Every quote carries the transcript event it came from** (red-team R5),
because the other account cannot read this account's sessions: a reader who cannot check a quote
treats it as unconfirmed and asks their own owner before acting on it as settled. A false quote that
looks settled is worse than an open question. **Do not** names what a cold reader would otherwise get wrong, starting
with branches other sessions own.

**The repository is public, and so is every branch.** The owner's quoted words become public. Quote
only what the owner said in a session about the work, never anything marked private, and never
personal details.

### Worked example: presets Wave 1

The example the owner approved (H6), with the Wave 1 names as they were relayed. Slice 1 commits a
filled-in version as the test fixture.

```
handoffs.d/presets-wave-1/
  HANDOFF.md
  artifacts/
    decks/wave1-sample.md            the source deck the judges scored
    css/earnings.css                 the preset as last tried
    css/museum-cuoio.css
    recipes/candidates.json          the exact looks that scored 8.5 and up (lost last time)
    prototypes/cover-sizes.html      the G4 mockup shown to the owner
    tools/judge-packet.mjs           the script that builds a judge packet
    measurements/contrast-round1.csv tone ramp 1.4 to 2.9:1 on pies and bars
    LINKS.md                         CI-render links to the round's PDFs
```

### Contents and limits (H4, H6)

- **Always commit small text** (H6): source decks, CSS, HTML prototypes, tool scripts, recipe and
  config JSON, measurement tables, Markdown notes.
- **PDFs and large images are linked, never committed** (H6, HARD RULE #9): `checkCommittedPdfs`
  already fails on a PDF no `PDF_OWNERSHIP` rule claims, and pull requests never commit PDFs
  (CLAUDE.md, cloud sandbox section). The link goes in `artifacts/LINKS.md`, one line each: what it
  is, the URL, and the commit it shows. **A link must open for both people.** A CI-render link on the
  PR always does, since the repository is public. A claude.ai Artifact page opens for the other
  person only if it was shared with them (W5), so `LINKS.md` says which it is, and a CI link is
  preferred when both exist.
- **A size cap on anything binary** (H6; the numbers are desk defaults, H4): a binary file (a PNG,
  WebP or JPEG screenshot) is at most **1 MB**; anything larger is linked. The whole folder is at most
  **5 MB**. A text file over 1 MB needs a reason line in HANDOFF.md under Gotchas met. No archives and
  no symbolic links, as in `followups.d/` evidence folders. A file is binary when its first 8 KB hold
  a NUL byte, the test `followups.d/` evidence folders already use.
- **Never a secret** (H6 scrub rule): no environment variable values, no keys or tokens, no `.env`
  contents. `checkHandoffs` scans every file in the folder for token patterns (provider key prefixes,
  `Authorization:` headers, private-key blocks, long high-entropy strings) and fails the push, at
  pre-push, before the branch makes it public. GitHub secret scanning and push protection (enabled
  2026-11-23; the repository's security settings read enabled at 12:43 UTC) are the second layer:
  the server rejects a push carrying a secret it recognizes. The local scan stays for two reasons: a
  pusher can request a bypass that an admin role then approves, and the local patterns are ours, so
  they cover what GitHub's list does not.
- **Prefer a link for an image that changes every checkpoint.** Replacing a binary in place still
  keeps every earlier version in the branch's history, so a 1 MB screenshot refreshed at four
  checkpoints costs 4 MB there. The per-file cap bounds each version, not the sum.
- **Nothing for an unfixed vulnerability**, by the same rule as `followups.d/` evidence folders.
- **The commit and push hooks skip it, so they cannot block saving it.** The red-team review showed
  the commit that saves a handoff is the one most likely to be blocked. At pre-commit,
  `tools/affected-tests.js` matches no rule for a `handoffs.d/` path that is not `.md`, so a handoff
  commit with a `.json` or `.mjs` artifact runs the whole unit suite, and the staged-file Biome check
  lints `artifacts/tools/*.js`; at pre-push, the whole-repo `npm run lint` lints them again. One lint
  error in a throwaway script stopped a push. The folder never reaches `main`, so it is the
  `transient` class `biome.jsonc` already admits: slice 2 adds `"!handoffs.d"` there with that class
  (and re-blesses `npm run lint:coverage`), adds `handoffs.d/` to `isSkippable`, and has any
  ownership arm that walks `*.css` skip it. `lint:deck:all` walks only `examples/`, `exemplars/`,
  `test/integration/baseline-decks/` and the galleries under `lib/` (`tools/lint-deck.js`), none of
  which reaches `handoffs.d/`, so it needs nothing; slice 2 confirms that with a sample folder. This differs from `followups.d/` evidence on purpose: evidence lands on `main` and is
  read there; a handoff is gone before merge.

The cost to the repository is bounded: the folder never reaches `main`, and a squash merge keeps only
the final tree, so clones of `main` never fetch it. That depends on the merge queue's
`merge_method: SQUASH` (`workflow.md` §Merge queue — the facts). **A branch that ever carried
`handoffs.d/` squash-merges only**: the `rebase-and-merge` that `workflow.md` §Batch allows for a
batched PR would replay every checkpoint commit, folder included, into `main`'s history. #3427 rule 5
already turns it off for relay branches. The branch commits stay reachable on GitHub through the PR's
`refs/pull/<N>/head`.

### Lifecycle

1. **Create** the folder with the first checkpoint of a line of work (#3427 §Relay rule 6): the PR
   opens as a draft, and the folder goes in the same push.
2. **Update it in place** (H7) at every checkpoint, in the same commit as the work when there is one.
   The holder writes it; nobody else pushes to the branch (#3427 rule 2). The session rewrites the
   same HANDOFF.md and adds or replaces files in `artifacts/`. It never keeps a copy per checkpoint
   (no `HANDOFF-50.md`, no `candidates-v2.json` beside `candidates.json`): git history holds the
   earlier versions. At the usage checkpoints (25, 50, 75 and 90% of the weekly limit, #3427
   §Usage checkpoints) the checkpoint is one commit that sets `checkpoint:` and `updated:`, and the
   living PR comment is edited in place, never reposted.
3. **Keep working at 75%, release at 90%** (H9). At 75% the checkpoint commit makes the work easy to
   take over and the session keeps working: `status:` stays `active` and the baton stays held. At
   90% the session stops and sets `status: released` in the same commit and runs
   `npm run baton -- release --pause` (#3427's usage table), which marks the stop as a usage pause,
   so nobody mistakes it for finished work. The folder and the baton then say the same thing: the
   branch is free for the next owner. A taker sets `status: active` and its own `owner:` in its first
   commit.
4. **Keep it through ready, CI and the raise loop.** The folder stays while the PR is ready, so the
   raise loop's judge packets, measurements and checker results (`workflow.md` §The raise loop) have a
   home, and a taker on a ready PR (#3427 rule 7, or a 90% release) finds the same folder
   a taker on a draft does. The presence check (below) fails only in the merge queue, so ready-PR CI
   stays green with the folder present.
5. **Close** it in the last commit before the merge ask: `npm run handoff -- close` (slice 1). It
   moves nothing on its own. It commits `status: closing` first, so a session that stops mid-close
   leaves that state on the branch, and lists every open question, next step and artifact. The
   session moves each item worth keeping into `followups.d/`, a decision note or an issue. Recipes and tables can
   go in a `followups.d/` evidence folder, which takes text only and at most 512 KB
   (`followups.d/README.md` §Evidence folders); a PNG or a larger file stays reachable through the
   permalink instead. Then `close` prints a permalink to the folder at the current head, removes the
   folder with `git rm -r`, and writes the permalink into the living comment. The gotchas are
   already in `engineering/gotchas/` (H10), so close checks that each pointer under Gotchas met
   resolves to an entry there, and lists any branch-only trap that should become one.
6. **Ask to merge** once CI is green on that head. `npm run queue:precheck`, which every merge ask
   already runs (HARD RULE #16), refuses while `handoffs.d/` is in the tree (slice 2), so a session
   cannot reach the ask with the folder still there.
7. **Reopen** if the PR needs more work after close: the taker parks it (`npm run pr:park`, #3427
   rule 7) and restores the folder with `git fetch origin pull/<N>/head` then
   `git checkout <permalink-sha> -- handoffs.d/<slug>`. The fetch matters after a merge: the branch
   is deleted on merge, and a fresh clone has the earlier commits only through the PR's ref.

Two more checkpoint rules, from the red-team review:

- **Checkpoint right after any owner answer** (R5). An answer that lives only in the session that
  asked is lost if that session cannot push afterwards. The next commit writes it into Open questions
  (moved to Where it stands once settled), with its event id.
- **At the merge gate, checkpoint by comment edit only** (R8). After close the folder is gone and
  the head is the one the 🚦 card names; a push would void the card and, with an old checkout,
  bring the folder back. A parked session records new state with `card --living --note` instead.

**What this costs.** The close commit is a new head, so ready-PR CI runs once more on it unless the
session folds the removal into the last raise-loop fix. The rejected alternative removes the folder
before the PR leaves draft, which costs no extra run but leaves the raise loop and any handover on a
ready PR with nowhere to write, which is the W2 and W4 loss this note exists to stop. Only the owner's
merge needs the folder gone, and CLAUDE.md DEFAULT OPERATING MODE #7 already makes a new head
need a fresh ask, so the removal sits just before the ask.

### One source (H5)

`npm run card -- --living <PR>` reads HANDOFF.md instead of a hand-written YAML card. The living
comment keeps the `BATON` block that `npm run baton` and `npm run relay` parse (holder, since,
checkpoint, head, next), then a short summary generated from HANDOFF.md: status, owner, usage
checkpoint, budget, the 🎯 continuation card built from Next steps, the open question titles, and a
link to `handoffs.d/<slug>/HANDOFF.md` at the head commit. The `TRAPS` and `UNVERIFIED` lists that
#3427 puts in the comment's `relay:` block move to HANDOFF.md's Gotchas met and Open questions. `CLAIMS` stay in the comment, copied from HANDOFF.md, because `npm run relay` reads claims
from the comment to show the board across both accounts.

**The generator checks who is writing** (red-team R7). Both people's sessions post as the same
GitHub login, so any of them could edit the comment. `card --living` refuses unless the branch tip's
`Claude-Session:` trailer is the session running it (the check #3427's tool already makes), and it
writes the HANDOFF.md blob hash into the comment, so a reader can confirm the summary matches the file
at that commit: `git rev-parse <head>:handoffs.d/<slug>/HANDOFF.md`. A hand-edited comment no longer
matches.

**The generated comment stays short** (inversion item e). Every session rewrites it at every
checkpoint, so its size is a cost paid many times a day. It holds the `BATON` block, five front-matter
fields, the 🎯 card, and one line per open question, about one screen; everything else is a link to
the file. A checkpoint commit edits the sections that changed, not the whole file.

Two cases where the pushed HANDOFF.md is not enough, and what the comment carries then:

- **A comment-only checkpoint** (#3427 rule 6: the work is red, or the hooks would outlast the window).
  The pushed HANDOFF.md is behind the work exactly then. The comment gets one free-text
  `since last push:` field, written by `card --living --note "<text>"`, that says what changed and is
  not yet pushed. The next push folds it into HANDOFF.md and clears it.
- **After close.** There is no HANDOFF.md to read. `card --living` falls back to #3427's YAML card
  (with its `relay:` block and `CLAIMS`) and adds the permalink to the closed folder.

## The `build:check` rule

A new arm, `checkHandoffs`, in `tools/check-ownership.js`. It runs everywhere that file runs: the
existing `build:check` (the CI `lint` job and the pre-push hook), `npm run build` (whose first step is
the ownership gate, `tools/build.js`) and `build:check:all`. `tools/build.js` tells the arm which
mode it is in (`--check` or not), so a check can be an error under `build:check` and a notice under a
plain `npm run build` without any change to a hook. The format is defined once, in a new
`tools/handoff.js`, the way `checkFollowups` only surfaces `followupProblems()` from
`tools/followups.js`. The arm reads committed files (`git ls-files handoffs.d`, as `checkCommittedPdfs`
does), so an untracked scratch folder never trips it. No CI job, step or hook is added (CLAUDE.md
SECOND FILTER row 2).

**Four kinds of check, because the same arm runs on a work branch too.** The pre-push hook runs
`build:check`, and `platform-suites.yml` and `golden-bless.yml` run `npm run build` when a session
dispatches them on a work branch (`workflow.md` documents branch dispatches, and #3427 rule 6 lists a
platform dispatch as a checkpoint). A rule that failed whenever `handoffs.d/` exists would block every
checkpoint push and every one of those runs, which is the opposite of H2.

- **Secrets and size: always an error**, locally and in CI, each with a one-line fix in the message.
  A token-pattern match, a PDF, an archive, a symbolic link, a binary file over 1 MB, or a folder over
  5 MB. A secret on a public branch, or a file the repository keeps forever, costs more than a handoff
  saved a few minutes later; the fix (delete the file, or move it to `LINKS.md`) is one command.
- **Layout: a warning, and an error only in the merge queue** (where the presence check fails
  anyway). At most one folder; a HANDOFF.md whose front matter has `owner`, `branch`, `pr`, `status`
  (one of `active`, `released`, `closing`), `updated` and `budget`, and `checkpoint` (one of
  `25%`, `50%`, `75%`, `90%`, with the account) when present; files only in the six `artifacts/`
  subfolders, `LINKS.md` and any `since-<session>.md`; a reason line for any text file over 1 MB. A
  malformed handoff on the branch is better than one a session could not push.
- **Freshness: an error under `build:check` where the branch's history is available** (H8), a notice
  under a plain `npm run build`, so a session can rebuild `dist/` between checkpoints. A *handoff
  commit* is one that changes `handoffs.d/<slug>/HANDOFF.md` or a `since-<session>.md` beside it; a
  *work commit* is a non-merge commit in `<merge-base>..HEAD` that changes anything outside
  `handoffs.d/`. The check passes when every work commit is an ancestor of (or is) some handoff
  commit: `git merge-base --is-ancestor <work> <handoff>`. That is ancestry, never a clock: commit
  dates and the `updated:` field can both be wrong across two machines, and `git log`'s default order
  is by commit date. It also holds after a rescue merge, where the two sides have no order of their
  own: the holder's fold commit, made after the merge, descends from both. Four properties follow:
  - **A handoff commit always passes**, whatever else it changes. So the push that saves the
    handoff is never blocked, a rescue push carrying a `since-` file is never blocked, and neither is
    a work commit that updates the handoff in the same commit.
  - **Merges are skipped**, so merging `main` in (#3427 rule 5) does not make the handoff look stale.
  - **No folder, no check.** Before the first checkpoint and after close there is nothing to keep
    fresh.
  - **No history, no verdict.** CI's `lint` job checks out with `fetch-depth: 2`, which does not
    reach the merge base. The arm detects a shallow clone with `git rev-parse
    --is-shallow-repository` and, there, prints a notice and passes. The check that counts is the one
    the pre-push hook runs, on the full local history, before the work leaves the sandbox.

  The arm cannot tell whether the new HANDOFF.md says anything true; it checks that the handoff moved
  with the work. Its failure message gives the one-line fix:

  ```
  handoffs.d/<slug>/HANDOFF.md has not been updated since work commit <sha> "<subject>". Update it
  and commit: npm run handoff -- checkpoint && git commit -m "handoff: update" handoffs.d
  ```

  `npm run handoff -- checkpoint` (no percentage) rewrites `updated:` and the commit list under
  Where it stands, and opens nothing else, so the fix itself always passes the arm.
- **Presence: an error only in the merge queue**, when `GITHUB_EVENT_NAME` is `merge_group`. The
  queue's run tests the exact tree that lands, so this is the one place the folder is certainly headed
  for `main`. Every other run, a ready PR's `pull_request` run included, prints a notice and passes.
  In GitHub Actions the notice is a `::warning::` line, so it shows on the PR's checks.

`npm run queue:precheck` is the earlier guard: it refuses the merge ask while the folder is in the
tree, so the queue error is the backstop for a session that skipped the precheck, not the usual way a
session finds out. A queue ejection costs one queue run; the precheck costs nothing.

**What freshness does not read.** It uses local git ancestry only, never GitHub's push-activity API
or the PR commits list, so two bugs the red team found elsewhere do not reach it: push-activity
timestamps that miss branch creations and force pushes (R2), and the PR commits list that stops at
250 commits (R11).

The exact error text (merge queue):

```
handoffs.d/<slug>/ is in a merge-queue tree, so it would land on main. A handoff folder lives
on its work branch and the session removes it in the last commit before the merge ask
(engineering/decisions/2026-11-23-handoff-folder.md §Lifecycle). Move what is worth keeping to
followups.d/, a decision note or an issue, then run `npm run handoff -- close`.
```

The notice (everywhere else):

```
handoffs.d/<slug>/ present (fine on a work branch). Close it before the merge ask:
`npm run handoff -- close`.
```

## Implementation slices (the build PR, this week, after #3427 merges)

One PR, one commit per slice (`workflow.md` §Batch a session's slices).

1. **Tool: `tools/handoff.js`, `npm run handoff`.** `init` writes the skeleton for the current
   branch; `checkpoint [25|50|75|90]` rewrites the front matter in place (with no percentage it only
   refreshes `updated:` and the commit list; at 90 it also sets `status: released`); `check` reports shape problems (the function the gate calls); `close` runs
   §Lifecycle step 5. Unit tests cover each shape problem, against a fixture filled in from the
   presets Wave 1 example (§Worked example), which `handoffs.d/README.md` also shows. Reuse `tools/followups.js` for the evidence-folder move and
   `tools/card.js` for the 🎯 card. Check `dist/engineering/capabilities.md` first (HARD RULE #15).
2. **Gate: `checkHandoffs` with a failing arm, and the precheck refusal.** Add the arm and a unit test
   that proves each kind can fail (HARD RULE #34): a fixture tree with a folder and
   `GITHUB_EVENT_NAME=merge_group` goes red; the same tree with `pull_request`, with
   `workflow_dispatch` and with no variable passes with the notice; a 6 MB fixture and an untracked
   folder show that shape counts committed files only and fails in every context. Freshness gets its
   own arms on a throwaway repository: a work commit after the handoff goes red with the one-line fix;
   running that fix turns it green; a merge of `main` on top stays green; a work commit that also
   touches HANDOFF.md is green; a rescue commit with only a `since-` file is green; a merged rescue
   followed by the fold commit is green; a plain `npm run build` with a stale handoff prints the
   notice and passes; a shallow clone prints the notice and passes. Add the refusal to
   `tools/queue-precheck.sh`. Before adding the arm, list every gate that walks the whole tree and run
   it over a sample folder, so a deck in `artifacts/` does not trip `lint:deck:all`, and a quoted owner
   line does not trip the US-English audit or the typed-glyph census. Add the Biome `transient`
   exclusion and the `isSkippable` entry (§Contents), and arms that show a handoff commit carrying a
   `.mjs` artifact with a lint error and a `.json` file still pushes without running the unit suite.
   The token scan gets a failing arm per pattern, on fake tokens built at test time so no
   key-shaped string is committed.
3. **`npm run card -- --living` reads HANDOFF.md** (H5), with the `since last push:` note and the
   fallback after close, keeping the `BATON` block and `CLAIMS` intact for `npm run baton` and
   `npm run relay`.
4. **Docs: amend `workflow.md` §Relay** (added by #3427): the folder in rule 6's checkpoint, the
   close step before the merge ask, squash-only for a branch that carried a folder, and §The living
   handoff comment as a generated summary. Add a `handoffs.d/README.md` with the contract above. The
   CLAUDE.md table row for an idle session names the continuation brief; pointing it at the folder
   changes a canonical doc's meaning (SECOND FILTER row 4), so the PR puts that one-line change to the
   owner as an option, not a silent edit.

**Proven before it merges** (inversion item a). The owner's rule for this week is not to merge an
untested change to how sessions hand work over. The build PR's card carries one real cold pickup: a
session on the second account (or, until that account is back, a fresh session on this one acting as
the second person) takes a line of work from its handoff alone, adds a commit, and hands it back,
with the freshness check and the generated comment exercised on the way.

Slices 1 to 3 are internal tooling that no user of the engine sees, so they should owe no
`changelog.d/` fragment; the build PR confirms that against `changelog.d/README.md`.

## What this does not fix

- **A session that stops before its first push** leaves no folder, as it leaves no living comment.
  #3427 rule 6 (checkpoint at the first push and every 30 minutes) is the only defense.
- **A handoff that moved but says nothing new** passes. The freshness check (H8) proves HANDOFF.md
  changed with the work, not that it is true.
- **A secret neither scan recognizes**, or one pushed through a push-protection bypass, reaches the
  public branch. Once pushed it is public; rotation is the only fix.

— John Luke Picard · workflow desk
