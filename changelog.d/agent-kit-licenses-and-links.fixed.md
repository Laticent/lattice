- The agent kit now ships `LICENSE`, `LICENSE-EXCEPTIONS`, `NOTICE.md` and
  `THIRD-PARTY-LICENSES.txt`. `review/check.mjs` is an esbuild bundle that inlines
  `markdown-it` and five transitive dependencies (MIT, and BSD-2-Clause for
  `entities`); esbuild strips their copyright notices, and both license families
  require the notice to travel with the code. The package list is derived from the
  bundle's own module banners rather than hand-kept, and the build fails rather
  than publishing a package whose license text it cannot find.
- Rewrote 428 references that resolved only inside a clone — 305 sibling
  `../../<bucket>/<name>/<name>.docs.md` links, 62 pointers at
  `design/design-system.md §6.5` (whose anchor was stale besides) and 61 links to
  gallery PDFs the kit does not carry. A test now resolves every link in the kit
  and fails on any that dangles, and on any file that tells its reader to open a
  repo path or obey a HARD RULE number.
- Added `authoring/modifiers.md`. The kit told authors to compose `tint-*`,
  `mark-*`, `tone-*` and `insight-*` onto the class and then pointed outside itself
  for the list, so the vocabulary was mandatory to use and impossible to read. It
  is generated from `UNIVERSAL_GROUPS`, so it cannot drift from what renders.
