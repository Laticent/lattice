---
name: desk-stress
description: >
  Run the 🔥 stress desk: break Lattice on purpose before a user does: deck authoring at
  its limits (huge decks, hostile input), the Studio's features under load (ProseMirror,
  CodeMirror, settings, library, coach, lenses, Present, Live, chat), and long sessions on
  slow devices. Model features are stressed against a FAKE model by default; a real,
  paid call is a tiny capped sample the owner approves. Every break goes to the lane that
  owns it. Use when this session is told to be the stress desk, or the owner asks what
  breaks under load.
argument-hint: "[authoring | editors | library | present | live | chat | export | followups]"
---

# 🔥 Stress desk

Read first, by section: `engineering/workflow.md` §Desks (the verbs, the budget, and "Read
your lane first"), `tools/perf-torture/README.md`, `engineering/gotchas/memory-profiling.md`,
the flaky-tests note `engineering/decisions/2026-11-06-flaky-tests.md` (a stress test still
passes or fails on the code alone, HARD RULE #32), and CLAUDE.md HARD RULE #24 before going
near a model feature. Tag this session `desk:stress` and `ui:pinned`.

**The question this desk owns:** what breaks when a real person pushes hard, for a long
time, on a slow device? This desk FINDS breaks and hands each to its owner; it is not the
lane that fixes them.

## Rotation: one area per pass

| Area | Stress means | Tools |
|---|---|---|
| Deck authoring | 500+ slide decks, every component at its limits, pasted and imported junk, CRLF and BOM, half-typed front matter | the fuzz helpers (`test/helpers/web-ref-fuzz.js`), `npm run lint:deck`, the CLI render |
| Editors | long typing runs, undo and redo storms, huge or hostile paste, switching panes mid-edit (ProseMirror, CodeMirror) | Playwright on the built Studio, `tools/perf-torture/` |
| Settings, library, lenses | many decks and lenses, rapid switching, a full storage quota, reload mid-save | Playwright, `tools/perf-torture/` |
| Coach, Present, Live | the coach on a deck full of findings, a long Present session (memory over time), a Live session that drops and returns | `tools/perf-torture/` (`--snapshot`, `--retainers`) |
| Chat and model features | slow replies, a stream cut halfway, garbage or huge replies, a 429, an expired or empty user key, cancel mid-stream | a FAKE model only (below) |
| Export | the biggest deck in every theme, low-memory devices | the Studio export path, `docs/e2e/studio-export-shot-weight.spec.ts`, the iOS suites via the devices desk |

## Model features: test the plumbing, never pay for volume

- **Default: a fake model.** Stress every model feature against a mocked endpoint
  (Playwright `page.route`, as `docs/e2e/model-spine.spec.ts` does). The fake can be slow,
  fail halfway, stream garbage, return 429 or send a huge reply. That covers what we own:
  the UI, retries, cancel, streaming, the cost display. It costs nothing.
- **A real call is a sample, and the owner's call.** At most one prompt per feature, run on
  demand with `OPENROUTER_ALLOW_SPEND=1` and `--limit 1`, its cost printed, under the per-key
  cap set at OpenRouter. The desk proposes it to the owner as a numbered action with the
  expected cost; it never starts it (HARD RULE #24: our key stays off the site and out of
  tests).
- **Users pay for their own chat.** The Studio runs on the user's own key, so what matters is
  how the UI behaves when their key fails, runs out or is slow, and the fake model covers it.

## The pass

1. **Read your lane first.** `npm run followups` and keep the items about load, memory,
   long sessions and limits; the open issues that mention them; `claim:` tags on live
   sessions; and the gotcha file for the area.
2. **Stress one area** from the rotation, on a local `build:e2e` of `main` (never a published
   build, CLAUDE.md). Record each break with its steps, its numbers and the build it ran on.
3. **Confirm before routing:** a break must reproduce from its steps, and a memory rise must
   survive `memory-profiling.md`'s idle check (JIT warmup is not a leak).
4. **Route each break to its owner**, with the reproduction: a crash or wrong behavior to the
   feature's lane or a fix session from `main` (tags `desk:stress`, `origin:desk-stress`,
   a `claim:`); slowness or memory to the optimize desk; layout motion to jank; a red test to
   flake; a device-only break to devices. A stress scenario worth keeping becomes a test or a
   `perf-torture` scenario in the fix PR, written to HARD RULES #32 and #34 (counts, not
   milliseconds; a failing arm).
5. **Write back.** A new trap becomes a gotcha entry; a break not routed this pass becomes a
   `followups.d/` file with its steps.
6. **Report** to the command center: the area stressed, each break and where it went, any
   proposed paid sample with its cost, and `budget: N/10 today`.

## Lane

Yours: finding and confirming breaks under load. Not yours: fixing them (each goes to its
lane), raising a budget or a threshold, model choice. Never: spend our OpenRouter key without
the owner's word, put a timing assertion in a test (#32), or run stress against a shared or
deployed service other people use.
