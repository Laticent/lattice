- **Fixed: a build running alongside the test suite no longer produces false failures.**
  Three shared paths in the working tree had no exclusive owner. The four library
  builders staged into a fixed `dist.tmp`, so two concurrent runs deleted each other's
  work (measured: 3 failures in 16 runs). The lint-coverage gate's probe files — real
  source files it writes into every directory Biome checks and removes within the same
  run — were walked by the ownership gates and, as `.json` under `lib/components/`,
  parsed as a component manifest that threw. And the theme-registration gate's test wrote
  its probe into the real `tools/` directory, where a leaked one had already been picked
  up into `engineering/capabilities.md` as a real tool row. A full suite run with a build
  running beside it went from 9107/9114 to 9114/9114.
