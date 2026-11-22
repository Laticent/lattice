---
name: desk-stress
description: >
  Run the 📈 stress desk: find the upper limits of what still PASSES, without breaking
  anything: how big a deck, how many images or chart points, how long a session, before
  rendering, the editors, export or the Studio stop meeting the bar. The output is a limits
  table Lattice can stand behind, and a regression is a limit that drops. Model features run
  against a FAKE model; a paid call is a sanctioned, capped sample on the owner's word.
  Crashing things on purpose is the torture desk's job, not this one. Use when this session
  is told to be the stress desk, or the owner asks how far Lattice goes.
argument-hint: "[authoring | editors | library | present | live | chat | export | limits | followups]"
---

# 📈 Stress desk

Read first, by section: `engineering/workflow.md` §Desks (the verbs, the budget, and "Read
your lane first") and §Performance (HARD RULE #19), the flaky-tests note
`engineering/decisions/2026-11-06-flaky-tests.md` (HARD RULE #32: a test asserts work done,
never milliseconds), and CLAUDE.md HARD RULE #24 before going near a model feature. Tag this
session `desk:stress` and `ui:pinned`.

**The question this desk owns:** how far can a real author go before Lattice stops being
good? It climbs toward the ceiling and stops at the last size that still passes. It does not
push past failure: a crash, a hang or memory that will not come back is handed to the torture
desk.

**What "passes" means**, per area: the deck renders and fits (the fit gates and `lint:deck`
clean), the export completes, and the Studio stays usable: typing echoes, panes switch, Present
advances. Each area's bar is a count or a yes/no where it can be (slides rendered, findings,
pages exported). A time is reported as a number, never asserted in a test: `npm run bench`
for the engine and the CLI, and a Playwright measurement for the Studio (`bench` does not
drive the Studio).

## Rotation: one area per pass

| Area | Climb | Tools |
|---|---|---|
| Deck authoring | slides per deck, components per slide, words per slot, images, chart data points, Mermaid nodes | the CLI render, `npm run lint:deck`, the fit gates, the fuzz helpers (`test/helpers/web-ref-fuzz.js`) |
| Malformed input | what still passes, or fails with a clear message, on CRLF and BOM, pasted or imported junk, half-typed front matter, hostile paste | the fuzz helpers, `npm run lint:deck`, the CLI render, Playwright paste |
| Editors | document length and paste size in ProseMirror and CodeMirror before typing stops feeling instant | Playwright on the built Studio (timings reported, never asserted) |
| Settings, library, lenses | decks in the library, lenses per deck, storage used | Playwright |
| Coach, Present, Live | findings the coach shows, slides Present plays through, Live viewers (up to its cap of 4) and reconnects | Playwright; Live only through the in-process relay `docs/e2e/live-relay.ts` and two or more browser contexts, never Live's public connection servers |
| Chat and model features | reply length, conversation length, tool calls per turn, all against a FAKE model (below) | Playwright `page.route` |
| Export | the largest deck that exports in every theme and format | the CLI and the Studio export path |

## Model features: a fake model by default

- Climb against a mocked endpoint (Playwright `page.route`, as `docs/e2e/model-spine.spec.ts`
  does): long replies, long conversations, many tool calls. It costs nothing.
- **A real call is a sample, and the owner's call**, only through a route HARD RULE #24
  already sanctions: a tool in `SANCTIONED_OPENROUTER_SPENDERS` (`tools/check-ownership.js`;
  such as `tools/component-gen-eval.mjs`, run with `OPENROUTER_ALLOW_SPEND=1 --limit 1`, its
  cost printed) or a workflow in `SANCTIONED_OPENROUTER_WORKFLOWS` (`studio-e2e-nightly.yml`,
  about 1 cent a night). A feature with no sanctioned route gets none until the owner
  sanctions one in a PR. The desk proposes the run with its cost; it never starts one.
- Users pay for their own chat (the Studio runs on their key), so stress the UI around the
  model, not the model.

## The pass

1. **Read your lane first.** `npm run followups` and keep the items about limits, size and
   scale; the open issues that mention them; `claim:` tags on live sessions; the gotcha file
   for the area; and the last limits table (below).
2. **Climb one area** on a local build of `main`, `cd docs && npm run build:e2e` for the Studio
   (never a published build, CLAUDE.md). Double the size until it stops passing, then bisect
   to the last size that passes. Record the steps, the build and each number.
3. **Compare** with the last recorded limit. A limit that dropped is a regression: find the
   commit range and route it. A crash, a hang or unrecovered memory on the way up goes to the
   torture desk with its steps.
4. **Route each finding:** a limit too low for a real deck goes to the owning lane or a fix
   session from `main` (tags `desk:stress`, `origin:desk-stress`, a `claim:`); slowness goes to
   the optimize desk with the `bench` numbers; layout motion goes to jank; a red test goes to
   flake. A limit worth guarding becomes a test that counts work (HARD RULES #32, #34) or a
   bench scenario (#19), in the fix PR.
5. **Write back** (through a session you start, counted in the budget): the limits table in a
   decision note (one row per area: the limit, the bar, the build, the date), a new trap as a
   gotcha entry, and a finding not routed this pass as a `followups.d/` file. The docs desk
   decides which limits users see.
6. **Report** to the command center: the area climbed, the limits and any that dropped, where
   each finding went, any proposed paid sample with its cost, and `budget: N/10 today`.

## Lane

Yours: the passable ceiling and its regressions. Not yours: crashes, leaks and memory
failure (the torture desk), fixing what you find (its lane), raising a budget or threshold.
Never: spend our OpenRouter key without the owner's word, put a timing assertion in a test
(#32), or run stress against a shared or deployed service other people use.
