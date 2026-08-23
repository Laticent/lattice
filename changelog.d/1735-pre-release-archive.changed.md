- **Changed: `CHANGELOG.md` is now the release record it claims to be, and everything
  written before the first release moved to `changelog/pre-release-archive.md`.** Lattice
  reached its first version with no prior release — no tag, nothing published — so the
  18,382 lines that had piled up under `## Unreleased` were a development log rather than a
  version history, and the file was 382,512 tokens with no way to read part of it. The
  archive keeps every entry verbatim, in the order written, together with the 106 per-PR
  fragments still pending at the cut; `CHANGELOG.md` keeps the 1.0.0 announcement and, from
  then on, the ordinary running record. **The package version is re-baselined `1.0.0` →
  `0.9.0`** so the first release computes to 1.0.0 instead of skipping it — nothing was ever
  published under 1.0.0, so no consumer is affected.

- **Fixed: every committed component gallery PDF again matches the source it renders from.**
  A token change ships new pixels to all 61 components at once, but a PR only rebuilds the
  galleries it happens to touch — so the rest sat committed against an older render, and the
  next PR to touch one absorbed that drift into its own `golden-diff` where it read as a
  change that PR had made. All 150 galleries (122 component, 28 bucket) were re-rendered in
  one pass: 6 moved, and all 6 are pixels only — identical page counts and identical
  `pdftotext` output.
