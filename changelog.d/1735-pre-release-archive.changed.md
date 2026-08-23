- **Changed: `CHANGELOG.md` is the record of releases again — the pre-1.0.0 development log
  moved to [`changelog/pre-release-archive.md`](https://github.com/slidewright/lattice/blob/main/changelog/pre-release-archive.md).**
  1.0.0 shipped without rolling
  `## Unreleased` into it, so that section kept accumulating until it was 18,382 lines and
  99.7% of the file: 382,512 tokens down to 1,373. The archive keeps every entry verbatim, in
  the order written. **Pending `changelog.d/` fragments are untouched and the version is
  unchanged** — the fragments still carry the `### Removed` entries and the `**Breaking:**`
  marker, so the computed bump stays `major`, measured on both sides. The cost, stated
  plainly: the archived entries will not appear in the next release's notes, which is
  deliberate — 92.7% of them were already being discarded at GitHub's 125,000-character
  Release-body limit.

- **Fixed: every committed component gallery PDF again matches the source it renders from.**
  A token change ships new pixels to all 61 components at once, but a PR only rebuilds the
  galleries it happens to touch — so the rest sat committed against an older render, and the
  next PR to touch one absorbed that drift into its own `golden-diff` where it read as a
  change that PR had made. All 150 galleries (122 component, 28 bucket) were re-rendered in
  one pass: 6 moved, and all 6 are pixels only — identical page counts and identical
  `pdftotext` output.

- **Fixed: a changelog fragment that opens with prose is now rejected.** The gate asked
  whether a bullet appeared *somewhere* in the body, so a fragment could lead with a
  paragraph — and the release assembler splices that paragraph into the notes above the
  section's first entry, where nothing can distinguish it from the merge damage
  `changelog-integrity` exists to catch. The first non-blank line must now be a bullet.
