---
origin: 2298
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2298#issuecomment-5769382037
backfill: true
---

# Measure the thinking-token share, then recommend a MAX_THINKING_TOKENS default (or recommend against one).

Backfilled verbatim from the continuation brief on #2298 (merged 2026-09-22).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P2 · [no ticket] Measure the thinking-token share, then recommend a
                   MAX_THINKING_TOKENS default (or recommend against one).
       why now   — thinking bills as output at roughly the same weight as new
                   context, and #2298 documented the lever without sizing it. The
                   owner asked for a cap and got a documented per-session lever
                   plus the reason; the number is still unmade.
       where     — engineering/development.md §Context cost (the "Cap thinking on
                   routine turns" bullet) and §Re-measuring for the method.
       done when — a measured share of output tokens attributable to thinking
                   across several real sessions, and either a proposed default
                   with the routine-vs-hard-reasoning tradeoff priced, or a
                   written recommendation against a repo-wide number.
       evidence  — per-turn usage records from ~/.claude/projects/**/*.jsonl,
                   with the o200k counts, quoting the commit.
       verify    — tier 0 gates, because the deliverable is a measurement and a
                   doc line; nothing in the render path moves.
       NOTE      — setting a repo-wide default is the owner's call (CLAUDE.md
                   second filter, row 3 — a number they gave you). Bring the
                   options, do not pick one silently.
```
