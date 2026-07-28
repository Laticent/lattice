---
status: shipped
summary: >
  The replacement for the lint gate that was removed before merge in #1232. That one
  validated how exclusions are SPELLED in `biome.jsonc`; nine measured attacks un-linted
  real source without it noticing, and one legitimate edit made it false-positive at
  pre-push. `tools/check-lint-coverage.js` asks what Biome actually checks instead, in
  three arms: a committed baseline of the tracked files it does NOT process, a comparison
  of Biome's own scanned-vs-checked tallies, and a violation-carrying probe written into
  every checked directory AND LANGUAGE to prove the linter still has teeth there. Each of
  the nine attacks is an executable test against a real Biome in a real git repo, as is each
  finding from the independent checker — which measured three more bypasses green against
  the first draft (an extension-scoped override worth 556 files, a pattern excluding the
  probe's then-fixed filename, and a whole-file `biome-ignore-all`) plus two false positives
  that would have blocked pre-push. What it still does not catch is enumerated. The 34-gate
  consolidation the issue raised was deliberately NOT done, and the reason is stated.
---

# Gate lint coverage by effect, not by config syntax

**Date:** 2026-07-28
**Status:** shipped
**Closes:** #1235, #1223
**Follows:** `2026-07-28-lint-exclusions-and-off-studio-back.md`

---

## What went wrong, in one paragraph

`#1223` asked that every lint exclusion say why it exists. The prose shipped; the gate
written to enforce it did not. `checkLintExclusions` required each `!` entry in
`biome.jsonc` to carry a class and to match at least one tracked file — a check on
**spelling**, in a file where coverage is decided by at least four other mechanisms. An
adversarial pass measured nine ways past it. Two need no config edit at all.

Then the failure stopped being theoretical. The same PR that removed the gate also shipped
a one-line `.gitignore` addition, `docs/src/components/site/`, which silently dropped
**14 tracked source files** out of lint. `biome.jsonc` was untouched, so nothing a syntax
gate could read had changed. It took a merge cycle and a manual count to notice (#1238).

That line is now test case one.

## The three arms, and why it takes three

No single question covers the table. Each arm exists because a measured attack defeats the
other two.

| arm | question | catches |
|---|---|---|
| **1. Coverage baseline** | which tracked, lintable files does Biome not process? | `.gitignore`, a deleted POSITIVE include, any `!` entry however spelled, a shadowing second config |
| **2. Scanned vs checked** | did Biome check everything it listed? | `files.maxSize` at any threshold |
| **3. Teeth probe** | does the linter still report a known violation there? | `overrides[].linter.enabled: false` scoped by path **or by extension**, `linter.includes`, `recommended: false` |
| *(fold-in)* | is the file suppressing every rule in itself? | `biome-ignore-all`, which lands in arm 1's ratchet |

Arm 2 is the one that is easy to miss, and it was: the first draft of this gate assumed the
baseline caught `files.maxSize`, because the issue's table records "Checked 1 file" for it.
Measured against Biome 2.4.15, an oversized file **stays in the verbose `Files processed`
list** — arm 1 reads it as covered — while `Checked 0 files` admits nothing was read. The
warning is not an error, so `npm run lint` exits 0 and every automated check is green. The
gate now compares the two tallies, which closes the case at any threshold, including one
tuned to sit above the probe file but below a real source file.

The probe is written into every **directory × language** that holds a checked file — 245
targets against 199 directories, so covering all six languages is nearly free — asked about
in one Biome invocation, and removed in a `finally`. It is padded past 80 bytes on purpose,
so a `maxSize` small enough to silence real source silences the probe too.

Both of those refinements came from the independent checker, and neither was a detail. A
`.js`-only probe let `overrides[{includes: ["**/*.ts"], linter: {enabled: false}}]` un-lint
**556 tracked files** with all three arms green — the likeliest real form of the attack,
and quieter than the file-scoped override this doc originally called the only residual. And
the probe's filename is now random per run: a fixed, published name meant
`"!**/*.tmp.js"` — which reads as ordinary tempfile hygiene — silenced the entire repo while
every probe still reported, and it also meant two concurrent gate runs deleted each other's
files and failed a push pointing at a config where nothing was wrong.

## What the gate does NOT do

**No count of what IS checked.** An earlier draft recorded `coveredCount` in the baseline
so the ratchet would read as `1240 → 1254` in a PR diff. It also moved every time anyone
added a source file, which would have made an unrelated `--bless` a condition of merging
almost every PR — a tax with no signal, since a file *entering* coverage is never the
failure. The baseline is the excluded set alone, and that set only moves when an exclusion
does.

**No glob engine.** That was the removed gate's defect surface: `matchesLintPattern` was a
hand-rolled regex builder with a directory-prefix arm and an ancestor loop, broken once
during its own review, and the only helper in a 34-gate file with no unit test. Nothing
here parses a pattern.

**Exactly one config read, and it can only widen the gate.** `WATCHED_EXTENSIONS` is
hardcoded. Deriving it from `files.includes` would make attack #4 — deleting the positive
`"**/*.ts"` line, which drops 361 files — invisible by construction, because the gate would
stop watching precisely what the config stopped checking. The one read runs the other way:
if `files.includes` asks Biome to check a language the list does not watch, the gate fails
and tells you to add it.

**The prose reasons are still not gated, and cannot be.** `vendor` is unverifiable prose.
Re-adding `"!docs/src/components/ui"` under that one word still passes everything
automated — but it no longer passes *silently*, because the files it removes show up in
arm 1. The convention survives for the half a human reads; the coverage it claims is now
measured.

## The residuals, stated

The first draft of this section named one. An independent checker measured three more
green, and the honest list is five. All five share a shape: they are things someone does
**deliberately**, with the edit visible in a diff. What the gate is *for* is the accident —
the `.gitignore` line that shipped in #1232 — and the plausible-looking config entry nobody
reads closely.

1. **A FILE-scoped `overrides[]` entry.** The probe beside it still reports. Closing it
   needs a probe per file, i.e. mutating every tracked source file on every push. Directory
   × language is where the cost curve turns.
2. **A config pattern written against `lint-teeth-probe-*`.** Randomizing the rest of the
   name stops the accidents; it does not stop someone who reads the source and targets the
   prefix.
3. **`"rules": {"recommended": false}` while hand-preserving the probe's four rules.** Three
   rules across two groups for the JS family makes this an odd thing to write by accident.
4. **The gate needs a git checkout.** It asks `git ls-files` what is tracked, so it cannot
   run in the extracted `git archive` tree this repo recommends for counting — a wrinkle
   worth knowing, since no other build step shells out to git.
5. **SIGKILL leaves probe files.** Nothing can catch it. A survivor is untracked, says in
   its own header to delete it, and fails the next `npm run lint` on its own `debugger;`.
   Do **not** gitignore the probe name to tidy that up: `useIgnoreFile` is on, so an ignored
   probe is skipped and every target then reads as silent — which is why an all-silent
   result now gets a different diagnosis from a partial one.

Also measured and worth recording, because the intuition is wrong: an **unparseable
`biome.jsonc` is not an error**. Biome 2.4.15 silently discards it and applies every
default, so coverage *widens* rather than collapsing. The gate notices — the baseline goes
stale — but it reports it as stale entries, not as a config failure. A config Biome truly
cannot start with (a missing `.gitignore` under `vcs.useIgnoreFile`) is separated out and
reported as that, so it can never read as "every file lost coverage at once."

## The escape hatch is a diff, not a `--no-verify`

The removed gate's false positive is the reason this matters. It fired on a **correct**
edit — consolidating four library-`dist` entries to one glob, byte-identical in effect —
with an error instructing the author to delete a live exclusion. `build:check` runs at
pre-push and HARD RULE #14 forbids `--no-verify`, so that would have blocked every
contributor.

Here, a deliberate exclusion is recorded with `npm run lint:coverage:bless`, which rewrites
`test/lint-coverage/baseline.json`. The diff is the record, and the error message says so
rather than telling anyone to delete anything. Both of the removed gate's false-positive
cases — a pattern quoted inside a comment, and the `dist` consolidation — are tests here
that assert the gate stays **silent**.

## The 34-gate consolidation: deliberately not done

The issue raised it as "the deeper question worth answering first": `tools/check-ownership.js`
holds 34 gates, each an enumerated list plus a reason plus an anti-rot check, reimplemented
every time. Is the right marginal move one shared implementation of that family rather than
a 35th bespoke parser?

Not here, for two reasons.

First, **this gate is not a member of that family.** The family is *sanctioned-list*
gates: a hardcoded allowlist in the source, checked against a pattern found by grepping the
tree. This one has no allowlist in source, greps nothing, and gets its facts by running two
external programs. Consolidating it in would have widened the shared abstraction to fit its
one outlier — the classic way a shared implementation becomes worse than the duplication.

Second, **it does not live in that file.** It shells out to Biome and git;
`check-ownership.js` reads the tree. Putting it there would have made a fast, pure-ish gate
depend on a 2-second subprocess.

The consolidation question is real and stays open — it is about the 34, and it should be
decided by looking at the 34, not by an unrelated gate arriving.

## Verification

`node --test test/unit/cli/check-lint-coverage.test.js` — **45 pass**. Nine attacks, each run
against the real Biome binary in a real (temporary) git repo; the must-stay-silent cases;
one case per checker finding; and the per-function predicates.

Assertions **corrected by measurement rather than assumed**: attack 8 does not shrink the
baseline (arm 2 catches it); a corrupt config does not stop Biome (it falls back to
defaults and coverage *widens*); and `.jsonc` had to leave `WATCHED_EXTENSIONS` because
Biome processes `biome.jsonc` as its own config rather than through `files.includes`, so a
`.jsonc` probe beside it is skipped and the gate failed permanently on nothing.

The new guards were **mutation-tested**: reverting the probe to `.js`-only, dropping the
worktree-existence filter, and disabling suppression detection each fail exactly the test
written for them and nothing else.

**Measured against the checker's own reproductions, after the fix:** the extension-scoped
override now fails with 31 silent `.ts`/`.tsx` targets; `"!**/*.tmp.js"` fails with 203;
`rm tools/check-fonts.js` without `git rm` is green; two concurrent gate runs are both
green; a `biome-ignore-all` comment fails as coverage loss.

`npm run lint` — 1257 files. `npm run lint:coverage` — 1257 linted, 72 excluded, teeth
confirmed in 199 directories. `npm run build:check` · engine unit suite.
