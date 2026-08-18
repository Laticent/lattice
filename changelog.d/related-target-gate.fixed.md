- **A `related` ("see also") entry naming a component that does not exist is now a
  build failure.** `q-and-a` pointed at `faq`, which has never been a component here,
  so its `.docs.md` carried a 404 relative link, its gallery rendered a "See also" row
  for nothing, and `dist/docs/components.json` shipped the dead name into the playground
  bundle and every exported deck — only the pick surface filtered it. That relation now
  points at `list-tabular`, and `checkRelatedTargets` (in `build:check`) stops the next one.
