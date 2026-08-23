// OpenRouter prompt-cache policy — which vendors cache, and how a request marks it.
//
// Pure: no fetch, no DOM, no provider client, no import of its own. That is the
// POINT of this file existing separately from architect-model.js, which owns it
// otherwise: `WorkspaceSheet.tsx` needs `orSupportsCache` SYNCHRONOUSLY on the
// render path (the Prompt-caching switch is drawn honest-or-disabled on first
// paint), and a static import of that predicate used to drag the whole AI
// provider layer — OAuth, the model ladder, the streaming client, the catalog
// cache — into the Studio's EAGER bundle. Everything else reaches
// architect-model.js through `architect.ts`'s dynamic `import()`, so that one
// static edge was the only thing holding it eager (#1773; the finding is
// engineering/decisions/2026-08-23-studio-shell-decomposition.md §5.2).
//
// So: keep this module dependency-free. An import added here is an import added
// to the eager Studio bundle, and the seam stops paying for itself.
//
// Both halves of the policy live here together on purpose —
// OR_CACHE_BREAKPOINT_VENDORS is documented as a SUBSET of OR_CACHE_VENDORS, and
// splitting the pair across files is how that relationship rots.

// Does this OpenRouter model support prompt caching (the `cache_control` breakpoint)?
// OpenRouter applies caching automatically and silently ignores the breakpoint on
// models that don't support it, so this is a UI-honesty gate (don't offer a toggle
// that does nothing) rather than a correctness one. Keyed on the vendor prefix —
// the providers OpenRouter documents as supporting prompt caching.
const OR_CACHE_VENDORS = new Set(['anthropic', 'openai', 'deepseek', 'google', 'x-ai']);
// The vendor prefix, with OpenRouter's ALIAS marker stripped. Both Studio defaults are
// aliases (`~anthropic/claude-haiku-latest`, `~anthropic/claude-sonnet-latest`) so that the
// id can't rot as models are superseded — but `'~anthropic/…'.split('/')[0]` is
// `'~anthropic'`, which matched neither vendor set. Every caching decision below silently
// took the "not supported" branch for the models we actually ship: no breakpoint was ever
// emitted, so Anthropic (which caches ONLY what you mark) cached nothing, and the whole
// static-prefix seam was inert out of the box. Normalize once, here.
//
// Deliberately NOT or-catalog.js's `vendorOf`, which softens separators for display
// ("x-ai" → "x ai") and would miss every x-ai row against the sets above. Kept private
// so the two can't be confused at an import site.
const cacheVendorOf = (id) => String(id || '').replace(/^~/, '').split('/')[0];
export function orSupportsCache(id) {
  return OR_CACHE_VENDORS.has(cacheVendorOf(id));
}

// The vendors whose prompt caching needs an EXPLICIT `cache_control` breakpoint to
// fire. Anthropic + Google cache only the prefix you mark; OpenAI / DeepSeek / x-ai
// cache automatically (no breakpoint, so we leave their messages untouched — a plain
// string, which they prefer). Subset of OR_CACHE_VENDORS.
const OR_CACHE_BREAKPOINT_VENDORS = new Set(['anthropic', 'google']);

// Mark the static SYSTEM block for prompt caching so a repeated, byte-identical
// system prompt (our authoring canon is ~7K tokens, re-sent on EVERY call) is paid in
// full ONCE per ~5-min TTL and read at ~0.1x on calls 2..N — instead of re-billed at
// 1x each time. Only the FIRST `system` message is marked (the user turn and any
// per-request dedup-neighbor `assistant` block vary, so they stay OUTSIDE the cached
// prefix). Only for vendors that need an explicit breakpoint; below a provider's min
// cacheable size the breakpoint is a silent no-op, so marking is always safe. Pure —
// returns a new array, inputs untouched; a string `content` becomes the one-text-part
// array form OpenRouter expects the `cache_control` field on.
export function withCachedSystem(messages, modelId, ttl) {
  if (!OR_CACHE_BREAKPOINT_VENDORS.has(cacheVendorOf(modelId))) return messages;
  const mark = ttl ? { type: 'ephemeral', ttl } : { type: 'ephemeral' };
  let marked = false;
  return (messages || []).map((m) => {
    if (marked || !m || m.role !== 'system') return m;
    // Plain string system prompt: wrap it as one cached text part.
    if (typeof m.content === 'string') {
      marked = true;
      return { ...m, content: [{ type: 'text', text: m.content, cache_control: mark }] };
    }
    // A canon/voice split (withStudioVoice's cloud path emits the system as
    // [stable canon, volatile voice] text parts): put the breakpoint on the FIRST
    // part so the cached prefix ends AFTER the canon and BEFORE the voice — a deck-
    // language / standing-instructions change then re-pays only the short voice
    // tail, not the whole canon. Parts already carrying a cache_control are left as
    // authored.
    if (Array.isArray(m.content) && m.content.length && m.content[0] && typeof m.content[0].text === 'string' && !m.content.some((p) => p?.cache_control)) {
      marked = true;
      const content = m.content.map((p, i) => (i === 0 ? { ...p, cache_control: mark } : p));
      return { ...m, content };
    }
    return m;
  });
}
