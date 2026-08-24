- **Fixed: four docs test files no longer depend on the order their own cases run in.**
  Each failed deterministically under `--sequence.shuffle.tests` and passed in
  declaration order, so the defect was invisible until someone enabled shuffling.
  `narration-encode.retry` let one case's successful module resolution leak into
  the next, because a hoisted `vi.mock` factory is evaluated once and cached for
  the whole file — `vi.resetModules()` does not reach the mock registry.
  `studio.controls`, `studio.refine` and `studio.fuzz` read the code-split Editor
  and Fabricate panes synchronously, so whichever case ran first saw the loading
  skeleton rather than the pane. Tightening the first of those also exposed an assertion
  that could not fail; it now can.
