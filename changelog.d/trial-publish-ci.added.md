- **Added: a trial-publish CI job.** `.github/workflows/trial-publish.yml` runs `tools/trial-publish.js`,
  which publishes the engine and every publishable `@laticent` library to a throwaway local registry
  (Verdaccio), installs `@laticent/lattice` into an empty folder from it, and renders a 4-slide deck
  with the installed CLI. It fails first, in plain words, on any `@laticent` package the engine needs
  that npm would refuse to publish. It runs on PRs that touch a package manifest or the release
  tooling, nightly, and as a gate in `release.yml` before the release PR opens. About 47 s, after the
  build.
