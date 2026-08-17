---
status: blocked
summary: >
  CodeQL is NOT a required status check on this repo — the "Main Merge Queue"
  ruleset requires exactly one context, `ci`, so a red CodeQL cannot block a
  merge and the only thing between a high-severity alert and `main` is a human
  noticing. #1699 made the CI beacon stop overclaiming, which is the mitigation,
  not the fix; the fix is an admin settings change only the repo owner can make,
  and it carries a merge-queue interaction that has to be proven on one PR
  before it is trusted.
---

# Does CodeQL gate the merge queue? No — and the fix is not ours to apply

## Symptom

PR #1699 fixed one half of a two-half problem. The `ci` job's CI-green beacon
used to post "✅ **CI green** for `<sha>`", which reads as *everything on this PR
is green*. It never meant that: the Verify gate above it decides exactly four
tiers of one workflow — lint, unit, integration, docs-build — and knows nothing
about CodeQL. The beacon now names the four tiers it covers, says in its body
that it is not a merge signal, and carries a snapshot of every other check run on
the head SHA (`.github/workflows/ci.yml`, the `CI-green beacon` step).

That is a **reporting** fix. It makes a human less likely to be misled. It does
nothing about the **enforcement** question underneath it, which is the one that
matters:

> If CodeQL is red, can the PR still merge?

The answer, measured rather than assumed, is **yes**.

## Finding — the observed ruleset state

Two rulesets exist on the repository. One is disabled; one is active and governs
`refs/heads/main`:

```
GET /repos/SlideWright/lattice/rulesets   → HTTP 200
  19400032  "Code Quality Copilot review for default branch"  enforcement: disabled
  18317422  "Main Merge Queue"                                enforcement: active
```

The active one, in full — `GET /repos/SlideWright/lattice/rulesets/18317422`,
HTTP 200, `"current_user_can_bypass": "never"` — carries five rules: `deletion`,
`non_fast_forward`, `merge_queue`, `pull_request`, and `required_status_checks`.
The last is the whole finding:

```json
{
  "type": "required_status_checks",
  "parameters": {
    "strict_required_status_checks_policy": true,
    "do_not_enforce_on_create": false,
    "required_status_checks": [
      { "context": "ci", "integration_id": 15368 }
    ]
  }
}
```

**One context. `ci`. Integration 15368 is GitHub Actions.** CodeQL posts its
check run as `CodeQL` from integration **57789**, GitHub Advanced Security — a
different app, and not in the list. Nothing else in the ruleset references code
scanning.

So a merge is gated on the aggregate `ci` job and on nothing else. A red CodeQL
is advisory. `required_approving_review_count` is `0` and
`required_review_thread_resolution` is `false`, so there is no human-review rule
standing in for it either: the only thing between a high-severity alert and
`main` is somebody happening to look at the checks tab.

### Why there is no committed workflow to point at

CodeQL runs from GitHub's **default code-scanning setup**, not from a file in
this repo. `git ls-files .github/workflows` lists eighteen workflows and none of
them is `codeql.yml`. The API agrees — the workflow is dynamic, with no path in
the tree:

```
GET /repos/SlideWright/lattice/actions/workflows
  id=304927975  "CodeQL"  path=dynamic/github-code-scanning/codeql  state=active
```

That is why it has no `needs` edge to `ci.yml` and why #1699 could not fold it
into the beacon's condition: there is no committed job to depend on, and gating
across workflows would either race (code scanning can conclude after `ci` does)
or need the polling this repo refuses (HARD RULE #16).

## Evidence — a red CodeQL already rode under a green beacon

On PR #1689 the old beacon posted green twice while CodeQL was failing. Both
posts are reproducible from the check-run API:

| head SHA | `ci` | `CodeQL` (GHAS) | CodeQL check-run title |
|---|---|---|---|
| `c7f4a51` | success | **failure** | `4 new alerts including 4 high severity security vulnerabilities` |
| `ef0248f` | success | **failure** | (2 still open) |
| `e9303d3` | success | success | `No new alerts in code changed by this pull request` |

`GET /repos/SlideWright/lattice/commits/c7f4a51/check-runs` returns the `CodeQL`
run with `"conclusion": "failure"` and `annotations_count: 4`; its `app.slug` is
`github-advanced-security`, `app.id` 57789. The findings were real —
polynomial-regex (ReDoS) alerts in new test helpers — and were caught only
because a human was watching the individual check runs rather than the beacon.

**State the limit of this evidence honestly.** #1689 did *not* merge red. Its
final head `e9303d3` shows `CodeQL: success`, and the PR merged at
2026-08-17T00:41Z. The alerts were fixed before the merge because someone
noticed. That is exactly the point, and the reason this note is worth writing:
the enforcement did not catch it, a person did. Nothing observed here says a red
CodeQL has ever reached `main` — what the ruleset says is that nothing would have
stopped it.

One more distinction worth keeping straight, because it misled an earlier
session on #1699: the five `Analyze (…)` check runs (javascript-typescript,
python, actions) are the analysis **jobs**, and they report `success` whenever
the analysis itself completed. On both red SHAs above, all five were green while
the aggregating `CodeQL` run was red. **`Analyze (…)` green does not mean "no
alerts."** Only the `CodeQL` run from GitHub Advanced Security carries the alert
verdict, and it is the only one worth requiring.

## Remediation — for the repo owner, because it is not ours to apply

This is a repository settings change. It cannot be made from the tree, it is not
something an agent should be granted, and it must **not** be worked around by
converting code scanning to an advanced setup with a committed `codeql.yml`
merely to get a `needs` edge — that is a separate architectural decision about
who owns the query suite and its upgrade cadence, and it should be taken on its
own merits, not as a side effect of wanting a required check.

**Click-path.** Repository **Settings → Rules → Rulesets → "Main Merge Queue"**
→ the **Require status checks to pass** rule → **Add checks** → search `CodeQL`
→ pick the entry whose source is **GitHub Advanced Security** (*not* the
`Analyze (…)` entries from GitHub Actions) → **Save changes**.

**API equivalent.** Rulesets are replaced wholesale on `PUT`, so send the rule
array with `CodeQL` appended to the existing `ci` entry — sending only the new
rule drops the other four rules:

```bash
# 1. Read the current ruleset and keep it, so the PUT is a superset.
curl -sS -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Accept: application/vnd.github+json" \
     https://api.github.com/repos/SlideWright/lattice/rulesets/18317422 > mmq.json

# 2. PUT it back with one added context. Only the required_status_checks rule
#    changes; deletion / non_fast_forward / merge_queue / pull_request are
#    carried through verbatim from mmq.json.
#    "integration_id": 57789 = GitHub Advanced Security (NOT 15368, Actions).
curl -sS -X PUT -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Accept: application/vnd.github+json" \
     -H "X-GitHub-Api-Version: 2022-11-28" \
     https://api.github.com/repos/SlideWright/lattice/rulesets/18317422 \
     -d @- <<'JSON'
{
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "merge_queue", "parameters": { … unchanged … } },
    { "type": "pull_request", "parameters": { … unchanged … } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": true,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "ci",     "integration_id": 15368 },
          { "context": "CodeQL", "integration_id": 57789 }
        ]
    } }
  ]
}
JSON
```

The token needs repository **admin**; the session token that produced every
reading in this note can `GET /rulesets` but is refused on
`/branches/main/protection` and on `/code-scanning/*` (both HTTP 403,
`Resource not accessible by integration`), so it could not have made this change
and could not read the alert list directly either.

### Prove it on one low-stakes PR first — the merge-queue interaction is unresolved

Do not roll this out and walk away. A required status check must report on the
**merge group** ref as well as on the PR, and there is reason to think default
setup does not run there. Sampling the 100 most recent `merge_group`-event
workflow runs on this repository returns **CI, 100 times out of 100** — no
CodeQL run among them (`GET /actions/runs?event=merge_group&per_page=100`,
`total_count` 702). Every CodeQL run instead carries the internal `dynamic`
event (100/100 of the last 100 on workflow 304927975).

That is an observation about what has run, not proof of what *would* run against
a `gh-readonly-queue/…` ref, and this note does not claim more than it measured.
But the failure mode if it holds is concrete and expensive: a required check that
never reports on the merge group leaves every entry parked until the ruleset's
`check_response_timeout_minutes: 60` expires, then ejects it — the queue stops
merging anything at all. So: make the change, put **one** small PR through the
full path, and watch it reach `main`. If it stalls, revert the ruleset edit
first and treat "how does code scanning report into a merge queue" as its own
question — most likely the advanced-setup decision deliberately deferred above.

## If the owner declines — what stays true

The beacon's honest scope is a **mitigation, not a fix**, and it should not be
read as one.

- What is fixed: a reader of the beacon comment is told what the beacon covers,
  is shown a snapshot of every other check run on the SHA, gets a ⚠️ instead of a
  ✅ when one of them has failed, and is told explicitly that CodeQL is not
  gated. The `UNKNOWN` arm means an API hiccup cannot turn into a false all-clear.
- What is **not** fixed: nothing blocks the merge. The snapshot is a reading
  taken at beacon time, deliberately not a gate — CodeQL may still be running
  when it is taken, and a failure that lands afterward is invisible to it. A red
  CodeQL on a PR that is otherwise green will merge the moment a human authorizes
  it, and the merge queue will not object.
- So the residual control is entirely procedural: **the human who authorizes the
  merge is the gate.** Before giving that authorization, look at the `CodeQL`
  check run on the head SHA — the one from GitHub Advanced Security, not the
  `Analyze (…)` jobs — and read its title, not just its color on a list.

That is a real control and it has worked at least once (#1689). It is also
exactly the control that #1699 found had already been undermined once by a
misleading green tick, which is why leaving it as the only one is a standing
risk rather than a settled position. Hence `status: blocked`: the record is
complete, the remediation is written, and it needs an owner decision to close.

## See also

- `.github/workflows/ci.yml` — the `ci` job's Verify gate and CI-green beacon,
  and the comment block explaining what the beacon does and does not claim.
- `engineering/workflow.md` § Merging — the merge-queue procedure and the human
  authorization gate.
- HARD RULE #16 — why this note prescribes no polling and no background watch.
- HARD RULE #23 — every state above is a reading from the GitHub REST API,
  quoted with the endpoint that produced it. No claim here rests on inference
  except the merge-group interaction, which is labeled as unresolved.
