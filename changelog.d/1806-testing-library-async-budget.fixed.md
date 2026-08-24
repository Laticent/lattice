- **Fixed: the docs jsdom suite's inner waits ran on a 1000ms budget nobody chose.** A bare
  Testing Library `waitFor` / `findBy*` expires on its own clock, which the suite left at the
  library default — and the Studio's Fabricate wait measured 996ms of that 1000ms under CPU
  contention, failing 2 of 3 full runs. `docs/vitest.setup.ts` now sets a considered
  `asyncUtilTimeout` of 3s: the smallest per-call budget already written in this suite, so no
  author's deliberate widening becomes tighter than the default, and still well inside the 20s
  test budget so an expired wait names what it was waiting for.
