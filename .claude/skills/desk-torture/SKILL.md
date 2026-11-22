---
name: desk-torture
description: >
  Run the 🔥 torture desk: drive the Studio and the engine to failure on purpose and make
  them confess: repeat an action until memory climbs, push toward a crash or an out-of-memory
  kill, and walk the heap with `perf-torture` to NAME what holds the leaked object and who
  added the listener that never left. Every confession goes to the lane that owns the code.
  Model features run against a FAKE model. Use when this session is told to be the torture
  desk, or the owner asks what makes the Studio crash, leak or slow down over time.
argument-hint: "[compose | typing | palette | present | deckswitch2 | readaloud | mixed | followups]"
---

# 🔥 Torture desk

Read first, by section: `engineering/workflow.md` §Desks (the verbs, the budget, and "Read
your lane first"), `tools/perf-torture/README.md` (Run it, `--listeners`, `--snapshot`,
`--retainers`, Limits), `engineering/gotchas/memory-profiling.md` (a rise that recovers on
idle is JIT warmup, not a leak), and the Studio degradation audit
`engineering/decisions/2026-07-20-studio-degradation-audit.md`. Tag this session
`desk:torture` and `ui:pinned`.

**The question this desk owns:** what makes Lattice crash, leak or rot, and what exactly is
holding on? The stress desk finds how far Lattice goes while still passing; this desk goes
past that on purpose. A finding here is a confession: the action that leaks, the measured rise
per cycle, and the retainer chain or the listener's add-site that names the culprit.

## The pass

1. **Read your lane first.** `npm run followups` and keep the items about memory, leaks,
   crashes and degradation; the open issues that mention them; `claim:` tags on live
   sessions; the memory-profiling gotchas; and anything the stress desk handed over.
2. **Torture one cycle** on a local build of `main` (`cd docs && npm run build`, never a
   published build): `npm run torture -- --scenario studio --cycle <actions> --k 40 --cpu 4`.
   Use only cycles `tools/perf-torture/scenarios/studio.mjs` defines (an unknown name throws):
   start with what an author repeats all day: `typing`, `compose`, `palette`, `present`,
   `deckswitch2`, `insert`, `mixed`. Live, export and chat have no cycle yet: adding one is
   a new scenario cycle in a fix session, written against a local stand-in (the Live e2e
   harness, `docs/e2e/live-panel-harness/`, and a fake model), before it can be tortured.
   `--cpu 4` approximates a slow device; a crash that only a real iPhone shows goes to the
   devices desk.
3. **Make it confess.** A metric that rises: re-run with `--snapshot` for the constructor that
   grows, `--retainers` for its path to the garbage-collection root, `--listeners` for a
   listener that stays with its add-site stack. Then `--confirm-realm` / the idle check, so JIT
   warmup is never reported as a leak.
4. **Route each confession** with the command line, the numbers and the retainer chain: to the
   lane that owns the code, or a fix session from `main` (tags `desk:torture`,
   `origin:desk-torture`, a `claim:`). The fix PR ships the same torture run before and after,
   and a guard that counts the leak (a listener count, retained objects) rather than timing it
   (HARD RULES #32, #34). A new cycle worth keeping becomes a `perf-torture` scenario.
5. **Write back** (through a session you start, counted in the budget): a new trap in
   `memory-profiling.md`, a confession not routed this pass as a `followups.d/` file with its
   command line.
6. **Report** to the command center: the cycle tortured, each confession and where it went,
   what recovered on idle and was dismissed, and `budget: N/10 today`.

## Lane

Yours: crashes, leaks, memory that will not come back, and degradation over time. Not yours:
the passable ceiling (the stress desk), fixing what you find (its lane), device-only crashes
(the devices desk), a red test (the flake desk). Never: spend our OpenRouter key (`--tts` needs
`TORTURE_TTS_KEY` and is the owner's call; model features run against a fake model), call a rise
a leak before the idle check, or torture a shared or deployed service other people use.
