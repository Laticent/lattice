---
status: in-progress
summary: A live-key red-team of the Studio Spend tab found it surfaced one weak field (this key's usage, usually $0 with no balance) of a four-layer budget system, never fetched the account wallet, and let the gauge ignore the real balance — so a user with money could see "$0.00 used · balance unavailable" and assume the tool was free. The overhaul fetches the account wallet (/api/v1/credits), shows four labeled layers (Wallet / This key / This session / Your cap) with a binding-constraint gauge, adds a pre-send cost estimate with hard-stop-on-estimate and a Studio-scoped max_tokens ceiling, and defaults to a cheaper model with the price shown. A server-enforced cap at connect proved infeasible via the browser PKCE redirect, so the key cap is display + a deep-link to the OpenRouter dashboard, with our client cap as the in-app enforcer. (Real prompt caching + a low-balance floor are deferred follow-ups.)
---

# Studio spend & budget — four honest layers + real cost control

## The problem (live-key red-team, two independent checkers)

The G6 Spend tab read only `usage`/`limit` from `/api/v1/auth/key`. The user's
OAuth-minted key has no per-key limit, so `remaining` is null → the tab showed
**"OpenRouter: $0.00 used"** with no balance. A user with real credit reads that as
*free or untracked* and spends with no ceiling visible. Worse, the Studio's gauge
called `budgetStatus` **without** the account arm, so the low-balance/exhausted
warnings were dead — the only thing it watched was a localStorage self-cap that
resets every browser tab.

## What OpenRouter exposes (live-verified)

| Layer | Endpoint | Notes |
|---|---|---|
| **Wallet** (real money) | `GET /api/v1/credits` → `total_credits`, `total_usage` → balance | docs say "management key"; a normal key read it in practice → best-effort |
| **This key** | `GET /api/v1/auth/key` → `limit`, `limit_remaining`, `usage`, `usage_monthly`, `limit_reset` | the per-key cap, only when one is set |
| **Per-request** | `usage.cost` on each completion | summed locally into the session tally |
| **Session** | — | no API; necessarily ours |

**A server-enforced cap at connect is NOT achievable** from the browser. The redirect
auth URL (`openrouter.ai/auth`) accepts only `callback_url` + `code_challenge` +
`code_challenge_method`; the code-creation endpoint that *does* accept `limit`/
`key_label` returns the web app HTML (session-bound), and a user key can't raise its
own limit. So we **display** the key's limit when set and **deep-link** the user to
`openrouter.ai/settings/keys` to set a hard cap, and make our client cap the in-app
enforcer.

## The design

**Four labeled layers** in the Spend tab, each with one home (kills the redundancy +
layer-confusion the red-team flagged):
1. **Wallet** — the `/credits` balance as the hero (`architectCredits()`).
2. **This key · Lattice Studio** — the per-key limit/remaining if set, else a "Set a
   hard cap →" deep-link.
3. **This session** — the live `usage.cost` tally + tokens.
4. **Your cap** — the client self-limit + a gauge that tracks the **binding**
   constraint (tightest of wallet / key / cap), threaded into `budgetStatus` via
   `account` + `floor`.

**Cost control:**
- **Pre-send estimate + hard-stop-on-estimate** — `estimateUsd(prompt, price)` from the
  catalog's per-million pricing; `cloudBudgetBlock()` refuses, in hard-stop mode, a call
  whose *estimate* would breach the cap, so a single large request can't overshoot.
- **`max_tokens` ceiling** (`CLOUD_MAX_TOKENS = 4096`) on every cloud completion — bounds
  worst-case cost from a runaway reply (the on-device tiers already cap separately).
- **Cheap default model** — the Studio's `defaultModel` is `anthropic/claude-3.5-haiku`,
  the first-connect *fallback* via the new `createArchitectModel({ defaultModel })`. Note:
  the model *id* lives in one shared `lattice-db-or-model` key, so an explicit pick on any
  surface is inherited by all — only the fallback differs (the Drawing Board's own fallback
  default is unchanged). The `defaultMaxTokens` ceiling, by contrast, is a true per-instance
  closure value — genuinely Studio-only, so the Drawing Board's long rewrites aren't capped.
- An On-device "free" nudge in the Spend tab.

**Deferred (own follow-ups):** a **low-balance floor** control (the gauge already reads
`readBudgetFloor()`, it's just not yet settable from the Studio), and a per-surface model-id
key if the Studio should diverge from the shared pick.

## Prompt caching — WIRED (the efficiency fix)

Profiled the real per-call cost: a component-generation call ships a **byte-identical
~7.3K-token system prompt** every time (`COMPONENT_CANON` ~4.4K + the five worked examples &
output contract ~2.8K); the user turn is ~7 tokens. A 20-prompt fan-out re-paid that prefix 20×.

`withCachedSystem(messages, modelId)` (`architect-model.js`) now marks the leading `system`
block with a `cache_control:{type:"ephemeral"}` breakpoint for the vendors that need an
explicit one (**anthropic, google** — `OR_CACHE_BREAKPOINT_VENDORS`; openai/deepseek/x-ai
auto-cache, so their messages stay plain strings). The breakpoint sits ON the system message,
so the varying user turn and any per-request dedup-neighbor `assistant` block stay OUTSIDE the
cached prefix. Within the ~5-min TTL: call 1 writes the prefix (~1.25×), calls 2..N read it at
~0.1× — **roughly 85% off input on a fan-out**, with zero quality loss (we keep the full canon
+ all five examples). Below a provider's min cacheable size the breakpoint is a silent no-op, so
marking is always safe. The pure shaping is unit-tested (`or-cache.test.ts` — the shaping moved to `ai/or-cache.js` in #1773, with the tests); the
live cache HIT is a budget-gated manual smoke (the `usage.cost` we already record reflects the
discount, so the spend tally stays authoritative).

## Knowledge file — file upload is the WRONG tool for the canon (red-team)

Re-examined OpenRouter's `/api/v1/files` ("upload a file to be referenced in future API calls,
stored under the authenticating key's workspace, ≤100 MB") as a way to host the canon cheaply.
It does **not** reduce cost: referencing a file still injects its content into context and bills
it as **input tokens every call** — there is no free server-side context in chat completions
(only prompt caching's cache-read discount, or a dedicated context-caching product, does that).
Inversion: adopting it *as a cost fix* would re-pay full tokens every call **and** add an
upload/lifecycle/cleanup surface **and** (BYOK) push our authoring IP into every user's
workspace — a false economy that hides the real fix. So: the static canon → **prompt caching**
(above); file upload stays on the roadmap for its **legitimate** job — letting a user attach
their OWN reference doc (brand guide, an existing deck, a content brief) to GROUND generation
(a feature, not a cost trick), shipped with the untrusted-input threat model (prompt-injection
surface; any doc content reaching slide HTML still crosses the `sanitizeSlideHtml` boundary,
HARD RULE #22). A distinct later slice prototypes that inline file/PDF input.

## Verification

- Live-probed `/credits` ($10 credits, $1.93 used), `/auth/key` (monthly breakdown), and
  confirmed the code-creation endpoint is session-bound (returns HTML).
- `estimateUsd` unit test; `architect-model` unchanged-default kept; the layered panel +
  the dashboard-link fallback covered in `WorkspaceSheet.test.tsx`; full docs vitest green.
