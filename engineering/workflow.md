# Lattice — branching and feature workflow

## Branch naming

| Prefix | When to use | Example |
|--------|-------------|---------|
| `feat/` | New capability or layout | `feat/background-tokens` |
| `fix/` | Bug fix | `fix/mermaid-catdeep` |
| `chore/` | Maintenance, gallery rebuilds, deps | `chore/gallery-rebuild` |
| `docs/` | Documentation only | `docs/workflow` |

Branch names use kebab-case. No ticket numbers, no dates in the name.

## Starting a feature

Always branch from `main`:

```bash
git checkout main && git pull
git checkout -b feat/my-feature
git push -u origin feat/my-feature   # push early — remote backup from day one
```

## Working on multiple features in parallel

Use git worktrees so each feature lives in its own directory with no stashing or branch-switching:

```bash
# From the primary Lattice directory
git worktree add ../Lattice-contrast-audit feat/contrast-audit
git worktree add ../Lattice-pill-layout feat/pill-layout

# List active worktrees
git worktree list

# Remove when the branch is merged
git worktree remove ../Lattice-contrast-audit
```

Each worktree is fully independent — you can run `npm test` in both simultaneously. The `.git` metadata is shared; branches see each other.

## One feature, one branch — never a stacked PR chain

A worktree-per-feature (above) is for **different** features in parallel, each
off `main`. It is **not** licence to split **one** feature across many PRs.

**One feature = one branch, incremented in place → one PR.** Many commits on that
branch is good — review it commit-by-commit if it's large (PR #272, the shadcn
migration, is the model: one branch, six phases, one PR). What's forbidden is
**a PR per increment** and, worse, **basing a PR on another unmerged branch**
(a *stacked* PR). A stacked chain:

- only the author can hold — no single diff is "the feature";
- never CI-tests as a unit (each PR runs against its *parent branch*, not `main`);
- forces retarget + rebase as each link merges — the thrash **HARD RULE #16**
  forbids, now at PR granularity.

If a slice is **genuinely independent** — it compiles and tests with only `main`,
not some other unmerged branch — give it its own branch off `main` and let it
merge on its own. That's *parallel off `main`*, which is fine. The test for
"independent": if it needs another open PR's branch to build, it is **not**
independent — keep it on that branch and grow the one PR. This is the §Merging
rule *"land a large migration as one squash, not N separately-merged commits"*
moved upstream to PR *creation*. See
`engineering/decisions/2026-06-17-stacked-pr-fragmentation.md`.

## The gallery decks

Three top-level decks survive in `examples/` after the docs refactor.
Per-component prose lives in `lib/components/<name>/<name>.manifest.json`
and is rendered into `<name>.gallery.pdf` per component. The isolation
rule below applies to the three top-level decks.

**Regression baseline** — page counts asserted in CI (each test file
inlines its expected count; the 58 per-component galleries derive
theirs from `expectedGallerySlideCount(manifest)`):

| Deck | npm script | Slides |
| --- | --- | --- |
| `test/integration/baseline-decks/gallery.md` | `npx lattice test/integration/baseline-decks/gallery.md …` | 87 |


A page-count drift on either fails `npm run test:integration`.

**Editorial long-runner** — stable, hand-curated, not page-count
asserted (but still long-running and shared):

| Deck | npm script | Purpose |
| --- | --- | --- |
| `examples/gallery-jargon.md` | `build:gallery-jargon` | Decision-framework deck |

## Feature decks

**Every feature or visual-bug branch ships a per-feature demo deck.** This
is how reviewers see the work: a small, focused PDF on the branch, linked
directly from the PR body. It is independent of all six long-running
decks listed above.

**Feature/fix content is isolated to the feature deck until merge.** Do
not add new slides, new modifiers, or new copy into any of the six
long-running decks while the feature is in development — the
regression baseline would churn (page counts, parity tests) on every
iteration, and the editorial decks would lose their hand-curated
coherence. The long-running decks pick up the new layout in a separate
"graduation" commit after the feature has been reviewed and approved.

### Authoring

1. Create `examples/<feature-slug>.md`. The slug matches the branch noun
   (e.g. branch `feat/legal-layouts` → `examples/legal-layouts.md`,
   branch `fix/mermaid-catdeep` → `examples/mermaid-catdeep.md`).
   Features whose primary purpose is "demonstrate a code-level feature"
   (rather than "showcase a real-world deck") should instead live with
   the feature implementation — see `lib/base/_logo/` for an example
   of a feature demo colocated with its docs and sample asset.
2. Keep the deck small — title slide, one slide per surface the work
   changes, closing. Six to ten slides is the comfortable cap.
3. Use the same front matter as the galleries (`marp: true`, `theme:
   indaco`, `paginate: true`, a deck-scoped `header:`).
4. Author the slides as you would any boardroom deck — the eyebrow
   above the heading, the heading itself, the demo, and a one-line
   below-note explaining the change.

### Build

Run the emulator directly — no npm script is added per feature:

```bash
node lattice-emulator.js examples/<feature-slug>.md examples/<feature-slug>.pdf
```

Commit `examples/<feature-slug>.md` and `examples/<feature-slug>.pdf`
together. If you push without the rebuilt PDF the reviewer's link
404s — that is the bug the convention prevents.

### Iteration cycle

Feature decks are built to iterate fast. Three rules keep the cycle
from churning:

**Design before code.** When a design decision is open ("rethink the
pill," "what glyphs make sense?"), write the model first: name the
axes you're working on, list the candidate moves, recommend one.
Confirm direction in a single round trip before touching CSS. This
avoids the "ship → critique → re-ship" loop that ends up costing
three or more build cycles to land what could be done in one.

**Bundle adjacent decisions.** When one design move depends on two
or three downstream picks, surface all of them in one
`AskUserQuestion`, not sequentially as each becomes evident. A
bundled question costs one round trip; three sequential ones cost
three build cycles.

**Atomic commits per design decision.** One thematic change (e.g.
"swap pill placement to meta-on-the-right") ships in one commit that
covers CSS + transforms + examples + docs together. The commit is
the unit of "this design move." Smaller mechanical splits (a typo in
a `<name>.docs.md` after the design ships) get their own commit.

### Share — during dev, `SendUserFile`; at PR end, the raw URL

The visual-iteration loop is **`npm run preview` + `SendUserFile`**
for every change. The preview tool auto-detects scope from
`git diff`:

| Level | What changed | What's built + diffed |
|---|---|---|
| **L0** | tests, docs, manifest, README | nothing |
| **L1** | one deck source, one `example.md` | that deck only |
| **L2** | per-component CSS or transform | every deck using the component |
| **L3** | shared CSS, engine, theme | all decks; top 5 diffs surfaced |

Output is a list of file paths (PDFs + per-page diff PNGs). The
agent reads the list and `SendUserFile`s each one. The user reviews
the bytes directly in chat — no commit, no push, no remote round-trip.

```
edit source  →  npm run preview [-- <deck>]  →  SendUserFile <files>
```

For desktop: `npm run preview:watch -- <deck>` runs a file watcher
that rebuilds on save and opens the PDF in the default viewer (which
auto-reloads). For VS Code users, the marp-vscode preview pane is the
fastest inner loop — no preview tool needed.

**Pre-commit auto-rebuild.** Lefthook's `pdf-rebuild` job
(`tools/build-staged-pdfs.js`) regenerates and re-stages the PDF for
every staged deck markdown — incrementally, only the decks whose source
changed (examples decks, the baseline deck, per-component and bucket
gallery markdown). It supersedes the old `check-pdf-freshness.sh` gate:
rather than failing when a PDF is stale and making you rebuild by hand,
it rebuilds for you. Scope is markdown-only — component CSS, shared CSS,
themes, and the engine affect many decks at once (a full rebuild is
~30 min), so those stay in CI via the integration page-count tests and
`build:galleries:check`. Bypassable via `git commit --no-verify` only
as last resort.

**At PR end, paste the raw URL** on its own line, plain text, last
paragraph of the reply — for external reviewers who don't have the
`SendUserFile` deliverable in their feed:

```
https://raw.githubusercontent.com/slidewright/lattice/<branch>/examples/<slug>.pdf
```

Use `raw.githubusercontent.com`, never `github.com/.../blob/...`
(lower-fidelity web preview) or `github.com/.../raw/...`
(302-redirects).

### Link the Cloudflare preview in the PR body

When a PR changes what the docs site renders, **end the PR body** with the
Cloudflare Pages preview link (last content line, before any footer) so
reviewers can open the live build:

```
🔍 Live preview: https://<alias>.lattice-docs-5ji.pages.dev/
```

**Only include it when the diff actually changes the site.** Cloudflare
rebuilds a preview for every PR, but it only differs from production when
the PR touches a path the docs deploy rebuilds from — `docs/`, `dist/`,
`themes/`, or `lib/` (the same trigger set as
`.github/workflows/docs.yml`). A PR that touches none of those (tests,
`engineering/` docs, CI config) doesn't change the rendered site, so the
link is noise — omit it.

`<alias>` is the **deterministic branch alias**: the head branch name
lowercased, with every non-alphanumeric character replaced by `-` (e.g.
`claude/live-preview-l2eb0c` → `claude-live-preview-l2eb0c`). It always
points at the branch's latest preview and refreshes on every push.
`lattice-docs-5ji` is the project's fixed preview host.

- The URL **404s until the first preview build finishes** (~1–2 min).
  That is expected timing, not a broken link — it resolves once
  Cloudflare deploys.
- Only construct the link when the sanitized alias is **≤ 63 characters**
  (the DNS-label limit). Cloudflare truncates longer names unpredictably,
  so for those, link the PR's **Cloudflare Pages** check instead.
- The per-deployment URL (`<random-hash>.lattice-docs-5ji.pages.dev`) is
  **not** predictable — always use the branch alias, never the hash.

### When the deck retires

Feature decks live on the branch. They are not deleted when the branch
merges — they stay in `examples/` as a permanent record of what each
feature looked like at ship time, and as ready-made source for the
gallery editor to fold into the long-running decks if the layout
graduates from "new" to "documented". Treat them like
`chart-family-experiment.md` and `image-concepts.md`.

## Commit discipline

- Small, focused units. One logical change per commit.
- Message format: `area(scope): short summary` — follow `git log` for the established pattern.
- If a fix is non-obvious, add a `engineering/gotchas.md` entry **before** committing. The commit message then links to it.
- Gallery edits: rebuild the PDF (`npm run preview -- <deck>` during dev; include the rebuilt PDF in the PR's final commit).
- Feature decks: rebuild `examples/<slug>.pdf` and include it in the same commit as the `.md` change.

## Before opening a PR

1. `npm test` — full unit suite must be green.
2. `npm run test:integration` — rebuilds both galleries through both renderers; asserts page-count parity. This is the merge gate in CI.
3. `npm run lint` — Biome over every JS file. CI runs this on Node 22/24.
4. If you touched CSS or themes, confirm the visual result in a rebuilt PDF. If you cannot rebuild, say so explicitly — do not claim success.
5. Rebase onto current `main` if the branch has drifted:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

   Two conflicts recur on nearly every rebase here — resolve them
   mechanically, never hand-merge:

   - **Generated artifacts** (`dist/**`, `docs/public/playground/*.js`)
     conflict constantly. Don't merge them by hand — take *either* side just
     to continue (you're about to overwrite it), finish the rebase, then
     **regenerate** with `npm run build` and fold the result into its owning
     commit (`git commit --fixup=<sha>` then `git rebase -i --autosquash`).
     The build is deterministic, so `npm run build:check` on a **clean** tree
     is the real proof HEAD is fresh (uncommitted-but-rebuilt files mask a
     stale HEAD).
   - **`CHANGELOG.md` `## Unreleased`** conflicts every time (everyone
     appends) — resolve by **keeping both** entries, never picking a side.
   - Binary `examples/*.pdf` conflicts: resolve the `.md` first, re-render
     with the owned engine (`node dist/lattice-emulator.js <deck> <out.pdf>`,
     with `CHROME_PATH` set), `git add` both, continue.

   Force-push the rebased branch with `git push --force-with-lease` — never
   plain `--force`.

For inner-loop iteration, scoped test scripts (`test:palette`, `test:components`, …), `test:watch`, the pre-commit / pre-push / commit-msg hooks, coverage, and the integration-test cache all live in `engineering/development.md`. That file is the tooling reference; this one is the process reference.

## Performance — measuring before/after (HARD RULE #19)

A performance change ships with **evidence, not a claim**. The harness already
exists (`tinybench`, `test/benchmark/engine-bench.mjs`); the discipline is to use
it the same way every time and leave the numbers where they outlive the chat.

The committed `test/benchmark/baseline.json` is the durable **"before"** — its diff
in the PR *is* the permanent before→after record (no need to transcribe numbers by
hand). Wall-clock timings are machine-relative, so the baseline is a **ratchet**,
not an absolute, and `bench:check` is **variance-aware**: it flags a regression only
when a dataset is slower beyond the band — `max(tolerancePct, baseline RME + current
RME)` — never inside the noise.

The loop for any perf-intent change:

1. **Capture before.** On the *base* commit (or trust the committed baseline if it's
   current), `npm run bench` — note the SUMMARY (slides, ms, slides/s).
2. **Make the change**, then **capture after** on the branch: `npm run bench` again,
   *same machine, same session* (cross-machine ms aren't comparable).
3. **Add coverage.** If no dataset exercises the path you optimized, add one to the
   `datasets` array in `engine-bench.mjs` so the win is tracked over time (HARD RULE
   #19c). A perf PR that touches an unbenchmarked path should grow the bench.
4. **Ratchet the baseline.** `npm run bench:bless` rewrites `baseline.json`; commit
   it in the SAME PR. The file diff is your before→after of record.
5. **Verify the band.** `npm run bench:check` must end *within variance* (exit 0).
   Re-bless **only to record a measured win or a justified trade-off** (e.g. a
   correctness fix that costs measurable time) — and **only from the same class of
   machine that set the current baseline.** Never re-bless just because your slower
   laptop reports every dataset as `REGRESSION`; that overwrites the canonical
   numbers with machine noise. The baseline is a ratchet for *real* deltas, not a
   per-machine scratchpad.
6. **Record it.** Fill the PR's `## Performance` section with the before/after table;
   add a `CHANGELOG.md` line for user-visible wins; for a *large* perf effort, also
   write an `engineering/decisions/YYYY-MM-DD-*.md` note.

`bench:check` is **on-demand, not a blocking CI gate** — a wall-clock threshold in
the merge train would be flaky on shared runners (see HARD RULE #19's note and the
reasoning that keeps the bench out of `npm test`). It's a tool you and the reviewer
run; the baseline-diff + `## Performance` section are what make the claim auditable.

## OpenRouter budget — our key stays cheap (HARD RULE #24)

We have a paid `OPEN_ROUTER_KEY` in the environment. Two failure modes to prevent, and
they are **separate**:

1. **Don't expose it to the site.** The docs site is a **static** bundle shipped to the
   browser; the Playground connects to the user's **own** OpenRouter account via OAuth
   (bring-your-own-key — their wallet, their spend limit). Our server-side key has no
   business in `docs/**`, and a reference there would both *leak* it into the shipped
   bundle and *drain our budget on the live site*. The gate fails on any `OPEN_ROUTER_KEY`
   in `docs/src`.
2. **Don't abuse it in tests/dev.** The automated suite must never spend *our* budget: no
   `test/**` file reads `OPEN_ROUTER_KEY`, no CI workflow injects it, no `test`-family npm
   script invokes a spender. **Playwright e2e / integration tests are welcome** — they MOCK the
   endpoint (`page.route('**/openrouter.ai/**', …)`) or drive the Playground on the user's own /
   a dedicated test key, none of which is our key. The gate keys on the key NAME, not the
   `openrouter.ai` endpoint, so mocking it never trips the gate. **Throwaway prototype tests**
   that hit the live API go in `.scratch/` (gitignored, not scanned, not shipped) — or run as an
   on-demand tool. The only thing barred is a *committed* `test/**` file reading our key, which
   would then spend on every CI run.

**Sanctioned spend is fine — but validate and budget first.** A tool that really needs the
key (today only `tools/component-gen-eval.mjs`, the component-generation eval) is:

- **on-demand + opt-in** — it prints its planned spend and *refuses to run* without
  `OPENROUTER_ALLOW_SPEND=1`, so it can never fire by accident (or in CI);
- **validated small first** — run `--limit 1` to confirm the prompt/model/parse assumptions
  on one call before spending on the whole set;
- **capped at the source** — set a hard per-key spend limit at
  `https://openrouter.ai/settings/keys` so a bug can't run away with the wallet.

Adding a NEW server-side key consumer? Follow the same shape (opt-in flag + printed cost +
`--limit`), and add it to `SANCTIONED_OPENROUTER_SPENDERS` in `tools/check-ownership.js`
with a one-line justification — the gate fails on a stale sanction, so the list can't rot.

**Live E2E in CI — yes, but nightly, never per-PR.** A real-browser test that actually spends
the key (the Studio live-AI tier, `docs/e2e/**` driven by `.github/workflows/studio-e2e-nightly.yml`)
belongs **off the PR critical path**: a `schedule`/`workflow_dispatch` workflow that self-skips
when the secret is unset, with a tiny per-run budget (~a cent a night) and a hard cap at the key.
Such a workflow goes on `SANCTIONED_OPENROUTER_WORKFLOWS`; the gate **rejects it if it triggers on
`pull_request`/`push`** (that would spend on every PR — the exact hole). Per-PR CI stays mock-only.

*Scope of the gate: it scans `docs/` code (incl. `.astro` build-time frontmatter and the
astro/build config), `test/**`, CI workflows, and `test`-family npm scripts for the key
NAME. It is **name-based**, not a secret-scanner: it
won't catch a raw key VALUE pasted as a literal, and can't follow a key read through an
imported helper — which is exactly why any code that reads the key must be a sanctioned,
opt-in spender, never a quiet `lib/` helper a test could import.*

## Two-renderer rule

Any authoring transform must land in the shared kernels so every render path
stays in step — don't patch one path:

1. the owned `lib/engine` (the `lattice` CLI/emulator **and** the docs playground)
2. `lattice-runtime.js` (the vscode Marp preview **and** the published-HTML runtime)

Both consume the same `lib/integrations/markdown-it/plugins.js` +
`lib/transformers/*` kernels, so a transform that lands there reaches both. The
owned engine is canonical (the marp-parity gate was retired in P4; Marp is no
longer a render path). The one remaining Marp surface is **Export to Marp**
(`lib/core/marp-bundle.js`) — a one-way bundle for recipients, NOT a Lattice
render path, so it isn't a third renderer to keep in parity. Do not close a
feature branch until the shared kernels carry the transform and the integration
tier — including the per-component semantic-invariant suite — passes.

## Keeping an open PR mergeable while it waits

A PR is not "done and parked" the moment CI goes green — it sits open while you
wait for merge authorization, and `main` keeps moving under it. **GitHub webhooks
never deliver the events that matter here:** "`main` moved", "this PR is now
conflicted", and "CI passed" are all silent. There is no cheap signal that a
parked PR has gone stale. This is HARD RULE #16.

**Don't try to watch for drift.** An earlier version of this rule armed a
continuous background `Monitor` that polled `origin/main` and rebased on every
movement. It backfired two ways: against a parallel merge train it produced N
force-pushes, N cancelled CI runs, and a spurious red gate, with green
unreachable until the chasing stopped
(`decisions/2026-06-14-drift-watch-rebase-thrash.md`); and the steady stream of
poll events, timer pings, and force-push churn made the chat unusable. The watch
is **retired** (`decisions/2026-06-15-retire-drift-watch.md`).

**The goal is to keep the PR *mergeable*, not "zero commits behind" at every
instant.** Under squash-merge a branch that is merely *behind* — no file overlap,
`mergeable_state: clean` — is harmless until merge; its history is squashed away
regardless of how far it drifted. So a green PR can sit behind `main` while it
waits; you don't touch it until you have a reason to push or to merge.

Fold the mergeability check into the two moments you act on the PR anyway:

1. **Right before every push** — `git fetch origin main` and rebase if the branch
   is behind or conflicted, then push. This is the primary mechanism: you were
   already touching the remote, so the check is free, and it guarantees you never
   push from a stale branch. The Stop hook (`.claude/hooks/stop-rebase-check.sh`)
   is the local, non-blocking backstop — it warns when local `HEAD` is behind the
   locally-known `origin/main`.
2. **Right before an authorized merge executes** — re-fetch and confirm the PR is
   still mergeable; authorization given against a `main` from an hour ago does not
   survive a conflict that has since landed. Rebase if behind or conflicted, let
   CI re-confirm, then merge.

```bash
git fetch origin main
git rebase origin/main          # resolve the recurring CHANGELOG / dist /
                                # examples-*.pdf conflicts mechanically — see
                                # the rebase step above, never hand-merge them
git push --force-with-lease
```

A pure *behind-but-not-conflicted* branch can alternatively be advanced at merge
time with GitHub's "Update branch" (`update_pull_request_branch`) — harmless
under squash-merge — but a real conflict always needs the local rebase above.
After any rebase, re-run the gates (the content under you changed) and re-confirm
CI before you ask to merge.

The honest limit of *manual* rebase-before-push: if `main` moves while your PR
sits green and you take no action, you won't *notice* until your next push or the
pre-merge check — and a conflict that lands in that window sits silently until
then. Under squash-merge a clean-behind PR is fine, and a real conflict is caught
at the pre-merge checkpoint before anything merges — but the checkpoint is manual.

**The structural fix — a GitHub merge queue — is adopted** (see §Merging →
*Merge queue*). When it's enabled in branch protection, the queue rebases + tests
each PR once at the front of the line, so the manual pre-merge re-rebase (step 2
above) becomes the queue's job and the silent-parked-conflict window closes:
nothing merges except on a freshly-rebased, freshly-green state. Rebase-*before-
push* (step 1) still holds — it keeps the PR current and the queue fast.

### "CI passed" is no longer silent — the CI-green beacon

Of the three silent events above, **"CI passed" is now delivered.** The `ci`
aggregate job posts a one-line `✅ CI green for <sha>` comment the instant the gate
goes green (`.github/workflows/ci.yml`). A subscribed session receives that as a
`<github-webhook-activity>` comment and **wakes within seconds — no polling
`get_check_runs`, no waiting on the hourly check-in for the success transition.**
So once subscribed, *react to the beacon* rather than re-checking on a timer.

The contract, and its limits — be precise about what it does and doesn't cover:

- **Success only.** CI *failures* already arrive as webhook events; the beacon
  fills only the green gap the integration doesn't forward. It does not fire on red.
- **Create, not update.** It deletes the prior beacon and posts a fresh comment —
  only a newly *created* comment is forwarded as a wake event; an in-place edit
  (the golden-diff sticky's `updateComment`) is not, so it would never wake you.
- **CI-passed only — NOT the drift events.** "`main` moved" and "now conflicted"
  are still silent; nothing here changes that. Rebase-before-push (step 1) and the
  merge queue remain the answer for drift.
- **Keep a long fallback check-in as a backstop.** The beacon is a delivered
  comment, not a guaranteed-delivery channel; if one is ever dropped you must not
  hang forever. A single far-out check-in (≈1 h) catches the miss — react fast to
  the beacon, fall back slowly if it never comes.

## Merging

- **Merging requires explicit human authorization.** An agent drives the PR to
  green and *asks* to merge — it never merges on its own, and prior approval of
  one PR is not license to merge the next. A human reviews and authorizes every
  merge.
- PRs merge into `main` via **squash-and-merge by default** — across many
  parallel AI sessions a single PR can carry 20+ noisy commits, and squashing
  keeps `main` one reviewable, revertable commit per PR. Use rebase-and-merge
  only for a deliberately curated, atomic commit series (each commit
  independently meaningful). Never a merge commit. (This is the *merge* method;
  it's independent of keeping the branch rebased on `main` before merge — see
  the rebase step above.)
- **Land a large migration as *one* squash, not N separately-merged commits.**
  Every separate merge to `main` is a drift event for *every* open PR in the repo
  — N merges in quick succession is a merge train each open PR must rebase past
  before its own merge. One squash (or a tight curated series behind a single
  merge) is one drift event. See
  `decisions/2026-06-14-drift-watch-rebase-thrash.md`.
- **Merge queue (live since 2026-06-30).** Authorization stays human (above); the
  queue automates only what happens *after* you approve. The flow is: you review →
  approve → **enable auto-merge (squash)** → the queue rebases the PR onto current
  `main` (plus any PRs ahead), re-runs the required `ci` check on that combined
  state, and merges only if green. This is the structural fix for the
  parked-conflict window (§Keeping an open PR mergeable) and it **retires the manual
  pre-merge re-rebase dance — the queue now owns it** (so step 2 of §Keeping
  mergeable no longer applies before an authorized merge). Background:
  `decisions/2026-06-17-workflow-efficiency-review.md` §F.
- **Bind a closing keyword to *every* issue the PR resolves.** GitHub
  auto-closes only the issues whose number carries its own keyword, so
  `Closes #1, #2, #3` closes **only #1** and silently leaves the rest open.
  Write `Closes #1, closes #2, closes #3` (one keyword per number) or one per
  line. Two workflows enforce this: `pr-closing-keywords.yml` fails the PR when
  it sees a bare comma-list after a keyword, and `pr-autoclose-issues.yml`
  re-parses the body on merge and closes the whole list as a backstop. Don't
  hand-close the stragglers after the fact — fix the keywords.
- **Reconcile each closing issue with what shipped — before the merge.** A
  card's title/body is the upstream *request*; implementation routinely narrows,
  shifts, or splits it. The merge auto-closes the issue and **freezes its text as
  the permanent record**, so before you merge, make the card read true: tighten a
  now-misleading title, strike scope that was dropped or split out, and note
  anything deferred. If the PR body is the fuller account, a one-line pointer
  (`superseded by the PR — see #N`) is enough; the card need not restate the PR.
  The bar is **no closed card describes work that didn't happen.** This is the
  issue-side analogue of keeping the PR title/body honest (HARD RULE #13) — and
  nothing automates it, so it's on the agent driving the merge.
- **Post-merge teardown.** Once the merge is confirmed:
  1. `git fetch origin`
  2. `git reset --hard origin/main` (or cut the next branch straight from
     `origin/main`).
  3. Delete the remote branch (usually automatic on merge); remove the worktree if
     one was used.
  4. Post-merge standup.
  There is no background drift watch to stop first — it's retired (see §"Keeping
  an open PR mergeable"), which is what made the old teardown a strict,
  one-at-a-time sequence (a background poller racing a foreground `reset` for a
  ref lock). Distinguish drift cases: "`main` moved under an OPEN PR" is handled by
  rebase-before-push; "my PR just merged, `main` moved" is expected — just sync, it
  is not a rebase trigger (it's the local-`main` divergence below).
- After a squash-merge, your **local `main` has diverged** from the squashed
  `origin/main` (it still carries the pre-squash commits). Don't rebase onto it
  or branch from it — `git fetch origin && git reset --hard origin/main`, or cut
  the next branch straight from `origin/main`. The Stop hook's "N unverified
  commits / rewrite history" nag is exactly this divergence surfacing
  (`origin/main..HEAD` enumerating the stale local commits); the fix is to
  **sync local `main`**, never to force-push or rewrite shared history. GitHub
  is the verification source of truth — squash merges are committed by GitHub
  (`noreply@github.com`) and show **Verified** there regardless of the local
  `%G?` check.

## Post-merge standup — orient me, every merge

I run many of your sibling sessions in parallel and lose the thread between them.
So **the moment a merge is confirmed and local `main` is synced, post a brief
standup** — it is the closing beat of every merge, not an optional extra. Keep it
to ~5 lines, *derived from signals already in the repo and GitHub* — there is no
separate swimlane/card tracker to maintain:

- **Swimlane** — the line of work this card sits in: the governing
  `engineering/decisions/YYYY-MM-DD-*.md` doc if one exists, else a short, *stable*
  label inferred from the branch/PR theme. Reuse the same label across a session so
  I recognise the thread at a glance (e.g. "agent-workflow hardening").
- **Card** — what this PR set out to do (its title), and the branch.
- **Completed** — the PR just merged (`#N`, squashed sha), plus any sibling PRs
  merged earlier in the *same* thread/session so multi-PR work reads cumulatively.
  Note the `CHANGELOG` / release category if the change is user-visible.
- **On deck (this thread)** — the next concrete step(s) for *this* line of work,
  pulled from the decision doc's remaining steps, branch TODOs, or the obvious
  follow-on. If nothing remains, say so: "thread complete — awaiting direction."
  Scope is deliberately *this thread*, not a cross-session sweep.

Template:

```
📋 Standup — merged #N (<sha>)
• Swimlane:  <decisions-doc / inferred label>
• Card:      <what the PR did> · <branch>
• Completed: #N <one line> (+ #M, #K earlier this thread)
• On deck:   <next step for this thread, or "thread complete — awaiting direction">
```

## Work queue — the kanban board (cards, swimlanes, the mirror)

Where work *comes from*. The model is the lean-kanban ADR
(`engineering/decisions/2026-06-14-github-project-management.md`): durable design
stays in markdown; GitHub owns only the **claimable queue**. **Docs are the
brain, issues are the hands.** This section is the operational how-to.

### Labels — the taxonomy (`.github/labels.json`)

Four **required** namespaced dimensions plus one **advisory** one (`model:`,
below), applied as code. Edit `.github/labels.json`; the **Sync labels** workflow
upserts them on merge (or run `npm run sync:labels` locally with `gh` auth to
bootstrap a repo).

- `area:*` — the 12 buckets + cross-cutting (`engine`, `theming`, `docs`,
  `infra`, `website`). Doubles as the **swimlane** grouping.
- `type:*` — `feat | fix | docs | infra | refactor | spike`.
- `priority:*` — `critical | high | medium | low` (words, **not** `pN` — bare
  `P0`–`P4` already mean marp-program *phase*/severity here).
- `status:*` — the board state machine, below.
- `model:*` — `haiku | fable | sonnet | opus`: the **recommended Claude model**
  for the card. *Advisory, not gated* — the intake gate never flags a card for
  lacking it. Rubric below (§ Model recommendation).
- `needs:triage` — a **process flag**, not a dimension: the intake gate
  (below) sets it when a required axis is missing and clears it once complete.
  Filtering the board on a non-empty `needs:triage` is the "unlabelled intake"
  queue — it should normally be empty.

New cards filed via the work-item form get `status:backlog` from the template;
the **Apply work-item form labels** workflow then applies the selected
`area:`/`type:`/`priority:` (and `model:` if picked — a GitHub form doesn't turn
dropdown picks into labels on its own). It's add-only — re-triage stays a human
call.

### Model recommendation — which Claude model (`model:*`)

Every card should carry a **recommended model** so whoever picks it up (human or
dispatcher) knows the right tier before starting. It's the fifth axis in the
work-item form and the applier materializes the pick — but it's **advisory**:
the triage gate doesn't require it, because model choice is a judgment call
softer than area/type/priority. Tag by the *dominant* nature of the work. The
tags name a role/tier, never a pinned version (they don't rot when models bump):

- **`model:haiku`** — trivial / mechanical. No design judgment; local and
  obvious. A typo, a mechanical rename, a count/number reconciliation, a
  stale-golden refresh with a mechanical fix, deleting a phantom row.
- **`model:fable`** — prose-heavy / editorial / voice. The deliverable is *words
  a human reads* and the craft is the writing: doc-prose rewrites, editorial/
  voice sweeps, gallery/deck copy. NOT a structural doc fix (that's Haiku/Sonnet).
- **`model:sonnet`** — standard, well-scoped engineering. A known-shape
  implementation with bounded blast radius: most `feat`/`fix` cards, a
  self-contained component or website change, a localized refactor. The default.
- **`model:opus`** — complex / novel / high-blast-radius. Engine transforms
  (`lib/core`, `lib/engine`, shared kernel), architecture, `type:spike`,
  multi-file refactors, security hardening — HARD RULE #25's "critical / novel"
  tier, or where a subtly-wrong output is costly and hard to catch.

Tie-breakers: **blast radius beats line count** (a 10-line `lib/engine` change is
Opus); **novelty beats familiarity**; `type:spike` → Opus by default; a prose
card with an engineering half → tag by the harder half. When torn between two
tiers, pick the higher **only** if a plausible-but-wrong output would be costly
to catch — otherwise take the cheaper tier (DEFAULT OP MODE #3).

### Intake floor — enforced on every path

The form is the easy path, not the only one. A card can also arrive as a blank
web issue, a `gh issue create`, a REST/MCP **agent** call, or a scheduled
**workflow** — none of which run the form template, so each one used to land
unlabelled (issues #356/#380/#381/#384 were exactly this miss). The **Issue
triage gate** workflow is the universal backstop: on open/edit it adds
`status:backlog` when a card has no lane, and adds `needs:triage` + one comment
when `area:`/`type:`/`priority:` is missing from *both* the labels and the
(optional) parsed form — clearing `needs:triage` automatically once the axes are
filled. So **no card sits on the board unlabelled** — no matter which intake
path filed it (bar the one bot caveat below). The gate **detects and flags**; it
can't *prevent* creation (GitHub has no pre-receive hook for issues), so the
guarantee is "an unlabelled card is auto-flagged within seconds and surfaced
until fixed," not "an unlabelled card can't exist." The flag is also **pushed**
into `BACKLOG.md` (a ⚠️ banner lists every `needs:triage` card), so it can't hide
behind a board filter no one opened. The decision logic is pure and unit-tested
(`.github/scripts/triage.js`); the YAML is just the wiring.

One gap the gate cannot close *by design*: an issue opened by another workflow
via the repo `GITHUB_TOKEN` does not trigger workflow runs (GitHub's recursion
guard), so **a bot that files issues must self-label at creation** — e.g. the
perf-nightly watch tags its tracking issue
`area:website type:fix priority:high status:backlog`.

**Filing an issue yourself — agents included — apply all four axes.** Don't lean
on the gate; it's the backstop, not the front door. When you open an issue via
the API/MCP/`gh`, set `area:`/`type:`/`priority:`/`status:backlog` (or file
through the **Work item** form). The gate exists to catch a miss, not to excuse
skipping the taxonomy. **Also add a `model:*` recommendation** (§ Model
recommendation) — it's not gated, but a card without one makes the next picker
guess the tier.

### Card lifecycle (the `status:` columns)

A **card** is one small, claimable unit (links its swimlane doc; doesn't restate
it). It flows left to right:

| `status:` label | Column | Meaning |
|---|---|---|
| `status:backlog` | Backlog | Captured, not yet ready (the default on a new card). |
| `status:ready` | Ready | Meets the Definition of Ready — pickable (**gated**, below). |
| `status:in-progress` | In progress | Claimed: assignee set, branch `claude/issue-<n>-<slug>`. |
| `status:review` | In review | PR open with `Closes #n`, awaiting CI + human merge. |
| *(issue closed)* | Done | PR merged → issue auto-closes. |

### Definition of Ready — enforced

A card is `status:ready` only with **both**: a linked governing doc/spec
(Swimlane) **and** a concrete acceptance check. The work-item issue form
captures them as the two ★ fields; the **Definition of Ready gate** workflow
re-checks on every `status:ready` application and strips the label + comments if
either is missing — so `status:ready` is a guarantee, not a hope.

### BACKLOG.md — the one-way mirror

`BACKLOG.md` is a committed, read-only snapshot of open issues grouped by column,
regenerated by `tools/sync-backlog.js` (the **Sync backlog mirror** workflow runs
it on issue events + daily). The render is pure, so it only commits on a real
queue change. Issues own *status*; decision docs own *design*; the mirror never
feeds back. If we ever leave GitHub, the repo still carries the queue.

> The mirror workflow pushes `BACKLOG.md` to `main`. If `main` is protected
> against direct pushes, allow `github-actions[bot]` to bypass for that path
> (one-time setting) — otherwise the push step fails visibly.

### Board setup (one-time, manual — needs your GitHub UI)

The GitHub Project (v2) board itself is an org/user resource, so it's created in
the UI, once:

1. **New Project** (Board layout) on the org → name it e.g. *Lattice queue*.
2. Add a **Status** single-select with options *Backlog · Ready · In progress ·
   In review · Done* matching the `status:` labels.
3. Built-in **workflows** (Project → ⚙ → Workflows): *Item added → Backlog*;
   *PR merged → Done*; auto-add issues/PRs from this repo. These cover the board
   *column* automation the ADR describes — no token or Action required.
4. Optionally group/swim-lane by `area:` (the swimlane view).
5. **Allow `github-actions[bot]` to push `BACKLOG.md` to `main`** — add it to the
   branch-protection bypass list (or exempt the path). Without this, the
   sync-backlog workflow's first push fails.

**Deliberate boundary — the `status:review` *label* has no automated writer.**
The Project's built-in *PR → Done* workflow moves the board **column** when a PR
merges, which covers the visible flow. The ADR's "thin Action covers the rest"
(flip `status:in-progress → status:review` when a PR opens with `Closes #n`) is
**not** shipped here: a robust closes-ref parser (drafts, multiple linked
issues, reopens) needs live validation this sandbox can't give it. Tracked as an
L2 follow-up; for now set `status:review` by hand or lean on the board column.

No WIP limits at first (kanban "start where you are"); add a per-agent cap when
L3 autonomous dispatch lands. See the ADR's *Resolved decisions* and *L3*
sections.
