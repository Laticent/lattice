# Model policy — everything runs on Opus

**This is the canonical doc behind HARD RULE #27.** It used to answer "what is
the cheapest model that clears the bar?" It no longer asks that question.

**Every agent this repo spawns runs on Opus. There is no tier ladder, no
routing table, and no decision to make at spawn time.** The only model name
this repo accepts anywhere — `.claude/agents/*.md` frontmatter, a workflow
`agent()` option, a card label — is `opus`. The gate rejects every other value
by name.

---

## Why there is no ladder

Model tiering was tried here deliberately and it failed. The reasoning that
motivated it was sound in the abstract — lookup work billed at judgment prices
is waste — but it did not survive contact with this codebase:

- **Lattice has less genuine "lookup" work than the split assumed.** The tiering
  doc divided tasks into *judgment* and *lookup* and routed the second half down.
  In practice most questions here — "where does X live", "does this claim hold",
  "why is this gate red" — require holding the cascade, the token system, the Fit
  Spine, and a dozen HARD RULES in view at once to answer *correctly rather than
  plausibly*. Much of what was filed as lookup was judgment wearing a
  lookup-shaped prompt.

  The residue is real but small: `inventory`'s zero-interpretation sweeps (count
  the files matching a pattern, extract a field from every manifest) genuinely
  are mechanical. The problem is that *deciding* a given task belongs in that
  residue is itself the judgment call the split was supposed to eliminate — and
  getting it wrong is silent. Keeping `inventory` as a **prompt** ("no
  interpretation, exact output shape, never guess a criterion") while running it
  on Opus keeps the useful half of that distinction and drops the half that
  required a correct routing decision up front.
- **The context demand is the binding constraint, not the token price.** A
  useful sweep here pulls in the component manifests, the theme tokens, the
  layout CSS, and the docs that govern them. The saving a smaller tier offers
  is measured in cents; the cost of a confidently wrong answer that clears
  every machine gate and lands in a doc or a merge is not.
- **A downshifted agent fails in the expensive direction.** It returns
  something well-formed and wrong. The gates catch syntax, counts, and
  ownership — they do not catch a map that points at the wrong file or a
  fact-check that confirms a claim it did not actually verify. The failure is
  silent by construction, which is exactly the failure this repo is least
  equipped to absorb.

So the ladder is retired. Not narrowed, not re-tuned — retired. See
`engineering/decisions/2026-07-28-model-tiering-retirement.md` for the full
record, including what the tiering work built and why each piece came out.

---

## What "pinned" means, and why it is still gated

Omitting `model:` would also get Opus today, since an agent with no declared
model inherits the session's. That is not good enough to rely on: it makes the
policy an accident of the current session setting rather than a property of the
repo, and it goes silently wrong if that setting ever changes.

So every agent **names** `opus` explicitly, and the gate enforces it:

- Every `.claude/agents/*.md` declares `model: opus` in its frontmatter.
- Every `agent()` call in `.claude/workflows/**` passes `model: 'opus'` in its
  options.
- Any other value — `sonnet`, `haiku`, `fable`, a typo, or a computed
  expression the gate cannot read — is an error, not a silent fallback.

The gate is `checkAgentModelPinning` in `tools/check-ownership.js`, run via
`build:check`. It parses workflow sources with acorn and reads each `agent()`
call's own options object, so a `model:` appearing in a prompt string, a nested
object, or an inner call cannot impersonate a real pin.

**What the gate cannot see:** an ad-hoc `Agent()` call in a live session. It
covers committed files only. That path rides on the roster below plus the
`CLAUDE.md` dispatch line, which is loaded every session.

---

## The agent roster

Nine agents, all on Opus. The roster still earns its place — **choosing the
agent is choosing the prompt**, which is the part that was always doing the
real work:

| Agent | Use for |
|---|---|
| `scout` | Locate code, map a subsystem, answer "where/how does X work" |
| `fact-checker` | Verify load-bearing claims (paths, fields, mechanisms) against the repo |
| `ci-triage` | Read a failing job's logs, find the cause, propose or apply the fix |
| `inventory` | Enumerate, count, extract — mechanical sweeps with a fixed output shape |
| `red-team` | Trio lens 1: attack it, find the abuse path and the edge case |
| `inversion` | Trio lens 2: argue it is the wrong design entirely |
| `checker` | Trio lens 3 / maker-checker default: refute the load-bearing claims |
| `docs-auditor` | Cross-reference what ships against what the docs claim |
| `prose-checker` | Audit human-facing writing for AI tells and read-aloud failures |

`Explore`, `Plan`, and `general-purpose` are harness built-ins with no pinned
model — they inherit Opus 5 from the session, which is now the correct tier, so
nothing needs passing to them.

---

## `effort` is the remaining lever

Retiring the model ladder does **not** retire effort tiering. The two were
always separate levers, and only one of them traded away reliability:

- **`effort` cuts output tokens** without changing which model reasons about
  the problem. A mechanical stage (folding a critique in, reformatting,
  extraction) runs at `low`; the adversarial verify and judge stages run at
  `high` or above.
- **Opus 5 is unusually strong at `low` and `medium` effort**, so sweeping
  effort down is the available saving on work that must stay correct — which,
  here, is all of it.

`engineering/orchestration.md` rule 5 governs this. The savings this repo
pursues come from **spawning fewer agents and running them at the right
effort**, never from cheapening the model underneath them.

---

## The main session stays on Opus 5

Unchanged, and now trivially consistent with everything else. Do not switch the
driving session's model mid-task: caches are model-scoped, so the "saving" buys
a full re-read of the conversation, and the session model is the user's
`/model` setting rather than an agent's call to make.

---

## If a tier is ever added back

It would be a deliberate, coordinated change — not a one-line edit to an
allowlist. Update together:

1. `AGENT_MODELS` in `tools/check-ownership.js`
2. This doc, and the `CLAUDE.md` HARD RULE #27 text + dispatch line
3. The card rubric in `engineering/workflow.md`
4. `.github/labels.json` and `.github/ISSUE_TEMPLATE/work-item.yml`
5. **The two ratchet tests**, which assert the collapse and will go red:
   `test/unit/cli/check-ownership.test.js` (`assert.deepEqual([...AGENT_MODELS],
   ['opus'])`) and `test/unit/tools/sync-labels.test.js` (the `model:*` label set)

Step 5 is not optional bookkeeping — it is the ratchet doing its job, and it was
missing from this list until the trio on #1240 followed the list literally and
landed on two red assertions with no pointer.

And read the retirement decision doc first — the case for tiering is easy to
re-derive from first principles, and it was already wrong once here.
