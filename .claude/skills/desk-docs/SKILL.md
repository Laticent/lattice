---
name: desk-docs
description: >
  Run the 📚 docs desk: keep every doc saying what the engine actually does: README,
  design/, engineering/, the component docs, AGENTS.md, CLAUDE.md's pointers and the docs
  site. Hunt stale counts, features that no longer exist, features no doc mentions, and two
  docs that disagree; then drive each fix. Use when this session is told to be the docs
  desk, when a rename or release is near, or when the owner says the docs feel behind.
argument-hint: "[audit | renames | site | followups]"
---

# 📚 Docs desk

Read first, by section: `engineering/workflow.md` §Desks (the verbs, the budget, and "Read
your lane first"), `engineering/house-style.md` (HARD RULES #21 and #30), and
`design/editorial.md` for words on a slide. Tag this session `desk:docs` and `ui:pinned`.

**The question this desk owns:** does every doc say what ships today? A doc that is wrong
costs more than a missing one, because an agent reads it and acts on it.

## The pass

1. **Read your lane first.** `npm run followups` and keep the items about docs, the open
   issues that mention them, `claim:` tags on live sessions, and the decision notes merged
   since the last pass (`git log --since=<last pass> -- engineering/decisions/`): each one
   can make a doc stale.
2. **Audit.** Spawn one `docs-auditor` agent (Opus, HARD RULE #27) on the surface for this
   pass. With a rename sweep live, audit the renamed keys first
   (`engineering/decisions/2026-11-21-plain-english-key-renames.md`): every doc that names an
   old key. Run `npm run decisions:index:check` and `npm run build:check`, which hold the
   generated docs.
3. **Check each finding** against the code before acting on it: the auditor's word is a
   lead, not a fact. Rank by who reads the doc first: CLAUDE.md, AGENTS.md, the docs site
   and the component docs (`.docs.md`, which HARD RULE #6 makes every author read) before a
   decision note. Keep the top three.
4. **Act inside the lane:** start one fix session per item from `main` (tags `desk:docs`,
   `origin:desk-docs`, a `claim:`), or batch small fixes into one session. A doc fix that
   changes the MEANING of a canonical doc (CLAUDE.md, a HARD RULE, a `workflow.md` contract)
   goes to the owner as a ❓ item instead (CLAUDE.md's SECOND FILTER). The `prose-checker`
   agent reads a rewritten page before its PR.
5. **Write back** (through a session you start, counted in the budget). A finding you will not fix this pass becomes a `followups.d/` file. A doc
   that keeps drifting the same way is a sign a generated doc or a gate is missing: propose
   one to the optimize desk.
6. **Report** to the command center: the surface audited, the top items, and
   `budget: N/10 today`, with its `meter:` ledger.

## Lane

Yours: whether docs match what ships. Not yours: words ON a slide in a deck an author wrote,
a rename itself (the naming sweep), engine behavior a doc reveals is wrong (that is a bug for
its lane). Never: edit `dist/` (HARD RULE #2), change a canonical doc's meaning alone, or
"fix" an external string (#21).
