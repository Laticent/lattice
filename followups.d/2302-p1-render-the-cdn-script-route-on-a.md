---
origin: 2302
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2302#issuecomment-5775735942
backfill: true
---

# Render the CDN-script route on a machine with direct egress

Backfilled verbatim from the continuation brief on #2302 (merged 2026-09-22).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P1 · [no ticket] Render the CDN-script route on a machine with direct egress
       why now   — it is the single named raise-path on #2302's pre-merge card;
                   the page tells readers jsDelivr <script src> works, and that
                   claim was only verified through a proxy injected into Chrome.
       where     — dist/agent-kit/render/lattice-render-a-deck.md § "Skipping the
                   download for the scripts"; the deck to use is
                   dist/agent-kit/examples/lattice-example-starter.md with its
                   three script srcs swapped to
                   cdn.jsdelivr.net/gh/Laticent/lattice@dist-kits/marp/<name>.
       done when — that deck renders 10 slides to 10 pages through real marp-cli
                   with the kpi slide composed into its hero-plus-rail layout,
                   on a default browser launch with no --browser-path wrapper.
       evidence  — the rendered PDF via SendUserFile, plus page 5 rasterized.
       verify    — tier 0 gates, because it confirms an existing documented claim
                   rather than changing behavior.
```
