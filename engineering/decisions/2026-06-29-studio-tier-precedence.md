---
status: superseded
summary: A red-team of the G6 Studio Workspace found the on-device generation ladder was dead while OpenRouter was connected — pickBackend returned the cloud before any on-device pick, so "Use/Summon/Load" changed nothing (and downloaded gigabytes for nothing) while a toast claimed "on-device, private, free." The fix decouples *connected* from *active* (Policy B): a deliberate on-device pick outranks the connected cloud, opt-in per model instance via `explicitTierWins` so the Drawing Board's cloud-always-wins behavior is untouched. The Workspace AI-model tab becomes a single Generation switch (Cloud / On-device); the vestigial Cloud tab is removed.
---

# Studio AI-tier precedence — connection ≠ active (Policy B)

> **Superseded 2026-11-07** by `2026-11-07-studio-model-spine.md`. The ladder and its `explicitTierWins` flag are gone: the chat model is one stored selection, resolved without falling back to another tier. "Connection is not active" survives in a stronger form — only the selection is active.

## The problem (red-team, 2026-06-28 → 06-29)

G6 exposed the on-device generation ladder (browser built-in · WebLLM · universal
Transformers.js) in the Studio Workspace. A two-checker red-team (redundancy +
least-astonishment lenses) found a high-severity trap:

`architect-model.js` `pickBackend()` returned the connected cloud **before** any
on-device tier preference was consulted:

```js
if (openrouter.ready()) return openrouter;   // ← short-circuits here
if (tierPref === 'webllm' && webllm.ready()) return webllm;   // unreachable while connected
```

So while OpenRouter was connected:

- **"Use" / "Summon ~1GB" / "Load ~350MB" were dead** — they set internal state (and
  Summon/Load downloaded ~1GB / ~350MB) but the active backend stayed the cloud.
- The rung still showed a green **"active"** badge and toasted **"on-device, private,
  free"** — at the moment edits still billed the cloud and shipped the deck off-device.
  A privacy/cost control doing the *opposite* of its promise, after an irreversible
  download.

The same review found a **redundancy** cluster: a separate "Cloud" tab duplicated the
AI-model tab's connection status, model name, Connect/Disconnect, and (with the Spend
tab) the credit balance — the model name printed three times on one screen.

## The axes

1. **Precedence** — when both a connected cloud and a usable on-device tier exist,
   which generates?
2. **Connection vs. activation** — is "connected to OpenRouter" the same as "using
   OpenRouter"? Today they were fused.
3. **Friction** — the user's constraint: don't make people disconnect/reconnect to
   switch (re-OAuth is real friction).

## The options

| | A — cloud always wins, honest copy | **B — switch picks the active tier** | C — hard mutual exclusion |
|---|---|---|---|
| Behavior | On-device only runs if you disconnect | Explicit pick outranks cloud; default-on-connect = cloud; connection persists | Picking one disables/disconnects the other |
| Kernel change | none (copy only) | `pickBackend` honors an explicit pick | + teardown logic |
| Friction | high (disconnect → re-OAuth to go local) | **none** (one tap each way) | returns if it disconnects |
| Honesty | truthful, but on-device is "download for later" | badge/toast/cost cues read the *true* active tier | truthful but rigid |

## Decision — B, opt-in per instance

A deliberate on-device pick outranks the connected cloud, so *connected* and *active*
are decoupled: the user runs on-device while staying connected, and one tap
(`tierPref → 'auto'`) resumes the cloud. No disconnect, no re-OAuth.

**Blast-radius containment.** `pickBackend` is shared with the Drawing Board, which has
no "back to cloud" control and relies on cloud-always-wins. So Policy B is **opt-in**
via a `createArchitectModel({ explicitTierWins })` flag — `true` for the Studio, default
`false` for the Drawing Board, which keeps the original order byte-for-byte. The new
order:

```js
const explicit = (tierPref === 'webllm' && webllm.ready() && webllm) || …;
if (explicitTierWins && explicit) return explicit;   // Studio: a pick wins
if (openrouter.ready()) return openrouter;            // otherwise cloud is the default
if (explicit) return explicit;                        // Drawing Board: pick used only off-cloud
…auto ladder…
```

## UI consequences (Workspace AI-model tab)

- A single **Generation** switch (Cloud / On-device) is the active-tier selector, not a
  config-pane toggle. Picking **Cloud** resumes the cloud (`setTier('auto')`); picking an
  on-device rung activates it.
- The **"active" badge** reads the *true* active tier (`status.generation`), never merely
  "loaded". Toasts say "now running on …" only when the tier is actually active.
- While on-device is active, the cloud shows as **connected, dormant** with a one-tap
  **Use Cloud** — no disconnect.
- Large downloads (**~1GB / ~350MB**) now **confirm first** and expose **Cancel** (the
  abort signal was already plumbed, just unused).
- The vestigial **Cloud tab is removed** (5 tabs → 4); connection lives on the AI-model
  tab, the credit balance on Spend — each datum has one home.

## Verification

- `architect-model.tier.test.ts` pins both orders (default cloud-wins; `explicitTierWins`
  on-device-pick-wins; auto resumes cloud; an unready pick can't win).
- The Drawing Board path is unchanged (flag defaults `false`); its existing suite stays
  green.
