---
status: shipped
summary: >
  The bounded-wait discipline stays a CLAUDE.md index row and does NOT become HARD RULE #31.
  Asked and answered by the owner at the #2021 merge gate. The rules split into invariants and
  conventions by where enforcement lives, and this discipline has no gate at either tier that
  could ever exist: tools/check-ownership.js walks the filesystem, and the waits that caused
  the incident were ad-hoc Bash tool calls that never become files. What enforces it instead is
  the tool itself (tools/wait-for.sh, which is bounded by construction) plus a warn-only
  PreToolUse hook — the "we warn, we coach" posture #29 states outright. A number would buy a
  stable identifier to cite and cost a rule the tree cannot verify, next to 29 that mostly can.
  Also recorded: no macOS CI runner is added, so the helper's macOS support stays UNVERIFIED
  and the four checks that would close it live in engineering/development.md.
---

# The bounded-wait discipline stays an index row, not HARD RULE #31

**The question.** #1978 shipped `tools/wait-for.sh`, a warn-only PreToolUse hook, and a
row in CLAUDE.md's "Read the canonical doc" table pointing at
`engineering/development.md` §Waiting for a slow job. It deliberately did *not* mint a
numbered HARD RULE. #2021 put the choice to the owner at the merge gate: mint #31, or
leave the index row. **The answer was to leave it.**

**Why the row is enough.** The HARD RULES split into *invariants* (architectural,
merge-gating) and *conventions* (style rules a lint or test catches), and CLAUDE.md says
the split exists to tell you **where the enforcement lives**. This discipline has no
enforcement to point at, at either tier, and cannot get one:

| Candidate enforcement | Can it see a hand-rolled wait? |
|---|---|
| `tools/check-ownership.js` (the `build:check` gate) | **No.** It walks the repo filesystem. The fifteen orphaned waiters were ad-hoc Bash tool calls — they never became files. |
| A unit test | **No.** Same reason: there is nothing committed to assert against. |
| `.claude/hooks/warn-unbounded-wait.sh` | **Partly** — it sees the tool call, and by design it warns and exits 0. It can never block. |
| `tools/wait-for.sh` itself | **Yes, but only once you use it.** A wait that goes through the helper is bounded by construction; one that does not is invisible to it. |

So a #31 would be a rule whose tag reads *(discipline — no automated gate)* for a
discipline that is *structurally* ungateable, sitting beside 29 rules where the tag
usually names a real check. The row already points at the contract, and the contract is
where the four properties, the failure that produced them and the macOS caveat live.

**What the number would have bought.** A stable identifier to cite in a review or a
decision note — the thing rule numbers are actually for, since CLAUDE.md pins them as
permanent IDs. That is real but small here: the discipline has one tool, one hook and one
doc section, all named, and "see `development.md` §Waiting for a slow job" cites it just
as precisely.

**Reversible.** Minting #31 later costs one edit and takes the next free number; nothing
in this decision forecloses it. What would argue for it is evidence the coaching is not
working — another session with orphaned waiters after #1978 — which is exactly the kind of
observation that should reopen the question.

**Recorded alongside it: no macOS CI runner.** The same round asked whether to add a
`macos-latest` job to close the helper's UNVERIFIED macOS support. The answer was no —
GitHub bills macOS runners at 10x Linux minutes, and this would be a permanent CI-contract
cost carried by every PR (or a nightly to maintain) to guard one helper script. macOS
therefore stays UNVERIFIED under HARD RULE #23, and `engineering/development.md` names the
four checks whoever next opens this repo on a Mac should run:
`--job x -- true` exits 0; a second waiter on a live job exits 2; a SIGKILLed holder frees
the job; and without coreutils it exits 69 naming `gtimeout`.
