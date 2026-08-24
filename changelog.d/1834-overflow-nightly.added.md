- **Added: `overflow:check` runs nightly.** The 279-deck ratchet that catches a slide
  shipping cut off was wired to no workflow and no hook — it ran when somebody remembered,
  which is what let its sibling oracle sit inert for the life of its suite (#1823).
  `.github/workflows/overflow-nightly.yml` sweeps the shipped corpus at 02:41 UTC,
  report-only, and opens or appends one rolling tracking issue. Measured at 5m21 for the
  full corpus, ~0.3% of what per-PR CI spends in a day.
