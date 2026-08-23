---
status: shipped
summary: Layers 2 and 3 of the Studio E2E strategy — multi-feature journeys and persona/scenario tests with goal-level oracles, including an AI-assisted tier that drives the Architect against a live OpenRouter model. Documents the test-only key-injection path (env var → localStorage, plus a page.route relay for proxied sandboxes), the cost guardrails, and the separate keyed nightly job.
---

# Studio E2E — journeys + persona scenarios (with live OpenRouter)

**Builds on:** the feature-level suite (#691, `docs/e2e/*.spec.ts`) and the
experience-gating strategy (`2026-06-28-experience-gating-playwright.md`).
This slice deepens the "cause and effect" dimension into **outcome oracles**:
a test passes only if the user's *goal* succeeded, not merely if a control
responded. Tracked as #694.

## The three layers

| Layer | Suite | Oracle |
|---|---|---|
| **Journeys** (deterministic) | `docs/e2e/journeys/` | the end artifact/state of a multi-feature chain: author → Present → last slide speaks its note; author → Share → a real PDF/Markdown **download** + the pipeline's "ready" toast (never a silent no-op) |
| **Personas** (deterministic) | `docs/e2e/scenarios/` | goal success: the exec's deck **scores board-ready** (READY = score ≥ 8) and exports a PDF; the consultant's palette swap re-themes **every** slide (resolved `--accent` token per slide, zero `section.overflow` flags); the presenter traverses the whole deck and the **dual-screen presenter popup** carries the speaker note; the power user's fabricated component/theme **round-trips** — saved, then inserted/selected in authoring |
| **AI-assisted** (live key) | `docs/e2e/scenarios/ai-architect.spec.ts` | a real productivity outcome from a **live model**: the deck source actually changes AND a pre-edit History checkpoint lands — per-finding Coach **Fix** → Apply diff, chat instruct → Apply diff, Refine → Shorten (undoable). (The standalone "Rewrite lead" chip this row used to name was removed; per-finding fix + chat are the deck-edit AI actions now.) |

## The live-key injection path (documented per the acceptance contract)

The in-app connect flow is OAuth (PKCE) — not automatable headlessly. But the
whole connection contract is one localStorage key: `lattice-db-or-key` holds
the raw API key, and the backend's `ready()` is literally "has a key"
(`docs/src/playground/architect-model.js`). So the harness
(`docs/e2e/openrouter-live.ts`):

1. reads the key from the **`OPEN_ROUTER_KEY` env var** (never committed, never
   echoed — the spec turns `trace` + `video` OFF so no artifact records the
   init script or request headers);
2. seeds it via `page.addInitScript` **before the island hydrates**, alongside
   the Studio's own budget keys (`lattice-db-budget-cap` = $2,
   `lattice-db-budget-mode` = `stop`) as the runaway guard;
3. relays the page's `https://openrouter.ai/**` traffic through a Node-side
   `APIRequestContext` via `page.route`. In the cloud sandbox, outbound HTTPS
   rides an agent proxy whose CONNECTs Chromium cannot complete, while Node
   fetch honors `HTTPS_PROXY` + `NODE_EXTRA_CA_CERTS`; on an unproxied runner
   the relay is a transparent pass-through, so it stays on unconditionally.

**Honesty note (why the oracles assert the change itself):** a bad or absent
key does not error — the model ladder silently floors and `runArchitect`
returns *advice*/no-op by design. "No error toast" therefore proves nothing.
Every AI oracle asserts the **source diff + checkpoint**, and the rewrite-lead
test additionally requires the live **spend tally** (`lattice-db-spend-session-tok`)
to move — usage only the real API records.

**Local-run footgun (documented deliberately):** the gate is key *presence*
(the issue's acceptance contract), so a plain `npm run test:e2e` in a keyed
environment — the provisioned cloud sandbox included — runs the paid tier too
and adds live-model nondeterminism to an otherwise deterministic run. For a
deterministic-only pass, `--grep-invert ai-architect`. Cost stays bounded
either way (see below).

## Cost design

- Model stays on the Studio default `~anthropic/claude-haiku-latest` (cheapest
  capable family; the `~*-latest` alias is server-resolved so it can't rot).
- The deck under test is two slides — the deck IS the prompt.
- Three tests ≈ one completion each, bounded by the Studio's own 4096-token
  output ceiling and the hard-stop cap → roughly a cent a run.

## The AI oracle has a DETERMINISTIC precondition — assert it (#1781)

Every AI affordance in this tier is gated by something the model-free scorer
decides, and the deck under test is the only thing that controls it. The Coach's
per-finding **Fix** chip renders only when

```
canFix = ai.ready && !!f.slide          // StudioShell.tsx
```

— so a deck whose findings are all **deck-level** can never show one, however
perfect the live connection is. That is how the per-finding Fix scenario went
permanently red: its deck scored 95/100 with a single deck-level finding ("no
opening / title slide"), the chip therefore never existed, and the spec failed
at a 30-second locator timeout that *looked* like a broken AI affordance or a
bad key. It reached no completion, so it burned no spend — it just sat red.

Two rules follow, and they generalize past this one chip:

1. **The deck must trip the finding the scenario hangs on, and the finding must
   be SLIDE-scoped.** The current deck's slide 1 carries a 10-word eyebrow
   against review-core's 8-word hard ceiling (`UNIVERSAL_PROSE_BUDGETS.eyebrow`,
   `lib/authoring/prose-budgets.js`) → `verbose-eyebrow` on slide 1. Verify a
   candidate deck against `reviewCore.reviewText` + `scorecard.scoreDeck` before
   trusting it; the Studio reads them through
   `docs/src/playground/authoring-core.generated.js`, so probe that bundle.
2. **Assert the precondition before the affordance that depends on it.** The
   spec now asserts the `verbose-eyebrow` card for slide 1 first, so a scorer
   change fails on the rule that moved — naming it — rather than as a silent
   timeout on a button.

A third, smaller trap sits next to it: the chip's own LABEL is state-dependent.
It reads `Fix ≈ $0.001` once the model catalog has priced the connected model
and `Fix · on your key` until it has (`fixCostLabel`), so the original
`/Fix ≈/` locator had a second way to hang on nothing but a slow catalog. Match
the verb inside the finding card, not the price.

**And phrase live-model instructions against the deck you actually give it.**
The chat scenario asked the model to replace "the h1/h2 heading of slide 2" —
slide 2 is a `closing`, whose only heading is an h2, and the deck has no h1
anywhere. Asked for a heading it could not find, the model answered with a
clarifying question instead of an edit and no diff card arrived (observed on a
real run). A live model is entitled to notice that the instruction does not fit
the deck; the fix is a correct instruction, not a longer timeout.

## Tiering

The deterministic journeys/personas join the existing nightly job
(`studio-e2e-nightly.yml`). The AI tier runs as a **separate `e2e-ai` job** in
the same workflow, fed by the `OPEN_ROUTER_KEY` secret: a paid-API flake can
never redden the deterministic suite, and when the secret is unset the spec
self-skips with a reason so the keyless nightly stays green.

## Verified / unverified

- All three layers ran green locally against the production-built site
  (Chromium, desktop project; the full pre-existing suite re-run alongside).
- The AI tier ran against the **real OpenRouter API** (live completions,
  spend recorded, checkpoints observed).
- The dual-screen presenter **popup** is exercised for real (Playwright popup
  page): chrome + speaker note asserted. What remains **UNVERIFIED** (HARD
  RULE #23): real iOS/touch behavior (no such surface reachable from the
  sandbox) and the popup on a physical second display.
