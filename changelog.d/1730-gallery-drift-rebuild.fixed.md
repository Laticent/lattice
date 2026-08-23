- **Fixed: every committed component gallery PDF again matches the source it renders from.**
  A token change ships new pixels to all 61 components at once, but a PR only rebuilds the
  galleries it happens to touch — so the rest sat committed against an older render, and the
  next PR to touch one absorbed that drift into its own `golden-diff` where it read as a change
  that PR had made. All 150 galleries (122 component, 28 bucket) were re-rendered in one pass:
  6 moved, and all 6 are pixels only — identical page counts and identical `pdftotext` output,
  the residue of the card-boundary contrast work that 146 of them had already picked up.
