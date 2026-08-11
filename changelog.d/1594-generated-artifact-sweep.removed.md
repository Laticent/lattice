- **Breaking: `dist/docs/components.json` and `dist/docs/grammar.json` no longer carry a
  top-level `count` field.** Read `components.length` — always the same number, and always
  right. The field was an aggregate over every manifest, which is the one value two concurrent
  PRs cannot both be right about: each adds a component, each writes the same N+1, git's
  three-way merge takes the identical line from both sides without a conflict, and the
  committed file lands one short — which `build:check` then rejects inside the merge queue, on
  a `main` the PR never saw, silently clearing its auto-merge. Swept the rest of the build the
  same way (replaying the merge rather than reading code) and removed four more of the same
  shape: the `**N components · M buckets.**` line in `dist/docs/components.md`, two totals in
  the §0c split-treatment footer, and the font counts in the Marp kit's `README.md` /
  `NOTICE.md`. Everything else is safe for reasons worth distinguishing — `dist/lattice.css`
  is a concatenation that merges clean *and* correct, while the esbuild bundles and
  `lattice.min.css` conflict loudly. A new gate replays the merge over the real catalog rather
  than banning a field name, so a future aggregate of any shape fails without anyone having to
  predict it. (`engineering/decisions/2026-08-11-generated-artifact-sweep.md`)
