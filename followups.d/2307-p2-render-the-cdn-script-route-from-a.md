---
origin: 2307
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2307#issuecomment-5777628875
backfill: true
---

# Render the CDN script route from a machine with UNPROXIED egress

Backfilled verbatim from the continuation brief on #2307 (merged 2026-09-22).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P2 · [no ticket] Render the CDN script route from a machine with UNPROXIED egress
       why now   — #2307 verified the route (10 slides → 10 pages, kpi composed, 0-pixel
                   match vs a local-script control), but this sandbox has no direct route
                   to jsDelivr, so Chrome reached the CDN through the egress proxy and
                   was made to trust its CA. What stays unproven is narrow: whether a
                   browser accepts jsDelivr's OWN TLS chain.
       where     — dist/agent-kit/examples/lattice-example-starter.md with its three
                   script srcs swapped to
                   cdn.jsdelivr.net/gh/Laticent/lattice@dist-kits/marp/<name>;
                   dist/agent-kit/render/lattice-render-a-deck.md § "Skipping the
                   download for the scripts" is the page making the claim.
       done when — that deck renders 10 slides to 10 pages with the kpi slide composed
                   into hero-plus-rail, through real marp-cli, on a default browser
                   launch, with NO proxy CA installed and HTTPS_PROXY unset.
       evidence  — the rendered PDF via SendUserFile plus page 5 rasterized.
       verify    — tier 0, because it confirms an existing documented claim rather than
                   changing behavior.
```
