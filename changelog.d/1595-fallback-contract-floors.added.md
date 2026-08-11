- **Added: a `var()` fallback's target is now checked against the read's CONTRACT, not just
  recorded.** #1566 shipped the ledger — what a fallback lands on, enforced mechanically; this is
  the judgment it could not make. The contract lives in one place and it is the token's own name:
  HARD RULE #11 already makes role-based names canonical, so `-ink` is text at 4.5:1, `-mark` a
  shape at 3:1, and `-fill`/`-bg`/`-texture`/`-accent` an area with no floor. `lib/tokens/contracts.js`
  reads the floor off the name with about a dozen patterns rather than a 383-row token list that
  would go stale the first time someone adds a token — and a name that declares no role returns
  null and is counted, never defaulted to "no floor". Measured over the live tree: 299 token-hop
  fallbacks, 79 distinct chains, 23 of which drop a floor and, after three declared exceptions,
  none that fails to classify. The ledger arm is enforced at zero (and is role-strict, because
  the rows claim "same role" and a floor comparison alone would accept re-pointing a texture at a
  mark). The 23 repo-wide drops are a pinned set that fails both ways, so the population cannot
  grow and draining shows as a diff — 8 are the `--cat-N-ink → --cat-N-mark` the repo itself
  mandates, and 15 are an unaudited `→ --accent` family that nothing had measured: `--accent`
  carries no floor against anything, so a 4.5:1 text read degrading onto it is the `--cat-N-ink`
  construction in fifteen more places. (`engineering/decisions/2026-08-11-fallback-contract-floors.md`)
