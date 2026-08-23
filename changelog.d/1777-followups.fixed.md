- **Fixed: `lattice deck.md out.webp` no longer writes a PDF under the name you asked
  for.** The CLI's extension dispatch handled `.pptx`, `.png`, `.zip` and `.html` and fell
  through to the PDF path for **everything else**, so any unrecognized extension exited 0
  and left an artifact whose bytes `file(1)` reads as *"PDF document"* and whose name says
  something else. The table is closed now: an extension that is not `.pdf`, `.pptx`,
  `.png`, `.zip` or `.html` is a usage error that names the supported set and writes
  nothing, and an output path with no extension is refused too (nothing picks the format).
  `.webp` / `.jpeg` / `.jpg` are the ones actually asked for — they are supported formats,
  just as an image set — so their refusal prints the command that does the job:
  `lattice deck.md out.zip --image-format webp`. The refusal runs before Chromium is
  launched, so a typo costs milliseconds instead of a full render.

- **Fixed: the changelog's pointer to the pre-1.0.0 archive now resolves in the copy that
  ships.** `package.json` `files` carries `CHANGELOG.md` and not `changelog/`
  (`npm pack --dry-run` lists the one and not the other), so the relative path left behind
  by #1735 resolved on GitHub and dangled for every reader of the npm tarball or the
  release zip. Both the file and the pending fragment now carry the absolute URL, and a
  test fails on a relative pointer into `changelog/` in either the file or the assembled
  release body.

- **Fixed: a duplicated changelog entry fails the suite again.** `changelog-integrity`
  caught the conflict resolution that leaves a SEAM — a paragraph stranded between entries
  — and was blind to the one that does not: keep-both-sides on a whole entry or a whole
  section leaves a body in which every line is a heading, a bullet or a continuation, so
  duplicating the entire `## Unreleased` body passed every check. Entry lines are counted
  now, in the file AND in the assembled release body, so a fragment copied to a second
  filename fails too. The check was removed once because the pre-1.0.0 backlog carried 18
  pre-existing duplicates; that backlog is archived, the body carries 386 entries and no
  repeats, and deliberate repetition goes in a sanction list that fails when it goes stale.

- **Fixed: writing a changelog entry no longer triggers a full-deck preview render.**
  `npm run preview` listed `CHANGELOG.md` as having no visual impact but not
  `changelog/` (the 1.5 MB archive) or `changelog.d/` (the per-PR fragment every change
  writes), and an unrecognized path is conservatively treated as a full rebuild — so
  editing prose rebuilt and pixel-diffed every deck.
