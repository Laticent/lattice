- **Changed: the committed deck goldens are re-rendered against current `main`.**
  The nightly committed-golden freshness gate (`npm run regress`, wired report-only
  in #1803) found 184 of 199 deck goldens drifted, byte-identical across three runs
  on two machine classes — genuine staleness rather than cross-runner noise. No deck
  source changed; every PDF here is the same markdown re-rendered. With `main` clean
  again, a PR's `golden-diff` shows only the pixels that PR moved, instead of
  absorbing whatever drift its components had accumulated.
