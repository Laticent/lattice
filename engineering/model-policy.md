# Model policy — everything runs on Opus

**This is the canonical doc behind HARD RULE #27.** It used to answer "what is
the cheapest model that clears the bar?" It no longer asks that question.

**Every agent this repo spawns runs on Opus. There is no tier ladder, no
routing table, and no decision to make at spawn time.** The only model name this
repo accepts — `.claude/agents/**.md` frontmatter, a workflow `agent()` option —
is `opus`. The gate rejects every other value by name.

**Why, in one line:** a downshifted agent here fails in the expensive direction —
well-formed, confident, wrong, and past every machine gate, because the gates
check syntax and counts, not whether a map points at the right file. The saving
was cents. The full record, including what was actually observed versus argued
and the withdrawn routing table, is
`engineering/decisions/2026-07-28-model-tiering-retirement.md` — it is not
repeated here.

One clarification that IS policy rather than history: `inventory` still describes
its work as having "no interpretation in it", and that residue is real. What did
not survive is *deciding up front* that a given task belongs in it — that call is
itself judgment, and getting it wrong is silent. So `inventory` keeps its
**prompt** (exact output shape, never guess a criterion) and runs on Opus like
everything else.

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
