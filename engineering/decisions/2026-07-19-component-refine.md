---
date: 2026-07-19
status: shipped
area: studio / component generation
summary: A manual "refine" affordance on the component generator — the Motion faculty's
  shape, ported. Quick semantic chips (Simpler / Bolder / Tighter copy / More
  whitespace) + a freeform nudge, both re-prompt the model with the CURRENT editor
  draft to apply THAT change, then gate-repair the result. Distinct from the effort
  dial's self-refine (model self-directs) — here the AUTHOR directs.
---

# Manual component refine (the author's directed nudge)

## Context

This session built three layers of component-generation quality: gate-repair
(#1113, fix violations), the effort dial (#1115, self-refine for quality). The last
piece the user asked for — "refine the output like we do with motion fabrication" —
is the MANUAL one: the author points at the current draft and says "simpler",
"make the cards bigger", and the model applies that specific change.

## Design — mirror the Motion faculty

Motion's Director mode already has exactly this shape (`generateScene(prompt,
current?)`, one `runDescribe(text, refine)` handler, a "Refine" panel of semantic
chips + a freeform nudge). Ported verbatim in spirit to components:

- **`refineComponent(instruction, current)`** (architect.ts) — a dedicated bridge
  (not a branch of `generateComponent`, whose dedup + effort loop don't fit an edit):
  it runs `askComponentRefineMessages(current, instruction)`, coerces the reply, and
  gate-repairs it through the SAME `repairToClean` — so a nudge can never smuggle a
  hex/margin past the gate. No dedup (we're editing, not creating), no effort
  self-refine loop (the nudge IS the direction). `improved` is always 0, `similar` [].
- **`askComponentRefineMessages` + `REFINE_NUDGE_SYSTEM`** (lib/layout/ai.js) — "apply
  ONLY the change they ask for, keep EVERYTHING else, preserve the gate invariants,
  return the full component." Pure + testable.
- **UI** (Fabricate.tsx) — a "Refine" row (shown once a model is connected): four
  semantic chips (Simpler / Bolder / Tighter copy / More whitespace) + a freeform
  nudge input, both calling `runDescribeComponent(text, refine=true)`. One handler
  serves describe (fresh) and refine (nudge the current draft) — exactly Motion's
  `runDescribe(text, refine)`. On success the refined draft loads into the editors
  where the live gate re-checks it; the toast reads "Refined …".

### Why a separate bridge, not `generateComponent(current)`

Motion has ONE function because a scene generate and refine share all their
machinery. A component generate carries dedup (near-neighbor reuse) and the effort
self-refine loop — neither of which applies to an author editing an existing draft.
Folding a `current` branch into `generateComponent` would thread `if (refine)` guards
through both; a dedicated `refineComponent` that REUSES `repairToClean`/`gateDraft` is
cleaner and keeps the two intents legible. The UI still unifies them behind one
`runDescribeComponent(text, refine)` handler, so the author-facing shape matches Motion.

## Verification

Real built Studio (Chromium, seeded OpenRouter, a mock returning a "bolder" draft):
the Component tab showed the Refine chips + freeform input; clicking **Bolder** issued
ONE completion whose system turn was the **refine** prompt (`You are REFINING …`), and
the editor updated to the refined CSS (`var(--fs-hero)`), 0 page errors. The freeform
nudge fired a second refine. Unit: `component-ai.test.js` (48 — the refine prompt
carries the draft + instruction + gate rules, empty→generic nudge, junk-safe) +
`architect.test.ts` (37 — empty→nochange, no-model→offline, and a nudge that lands +
gate-repairs with `improved:0`/`similar:[]`/one call). Full suite + biome + typecheck +
build:check green. An independent checker reviewed the diff.

UNVERIFIED: whether the model reliably makes the SMALLEST change (vs. rebuilding) on
real traffic — the prompt asks for it and the gate-repair guarantees compliance, but
"minimal edit" is a model-behavior property. The keep-current-on-failure contract
(`nochange` → your draft stands) bounds the downside.

## The component-quality set is now complete

describe (fresh) · effort dial (self-refine for quality, #1115) · gate-repair
(compliance, #1113) · **refine (author-directed nudge, this PR)** — plus prevention
in the prompt. The remaining generalization (extend the dial + refine to
theme/finish/motion) is written to be portable but out of scope here.
