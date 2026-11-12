- **Fixed: the Studio's browser tests no longer pass or fail on the clock.** Every fixed sleep, stopwatch and
  unseeded random draw in `docs/e2e` outside the files other work owns now waits on a signal the product
  publishes, steps Playwright's page clock, or counts work. The Compose
  undo budget is held as work (one slide replaced, a sixteenth of the deck read) instead of 16 ms, and its
  time is recorded by `npm run bench`.
- **Fixed: Vetrina's scroll-cost test could not see the work it bounded.** Its stage layer now carries `data-vt-scroll-seats`, a count of the re-seats a viewer's
  scroll has caused, so a test can prove a scroll that moved nothing re-seated nothing.
- **Fixed: in the Playground's Explore view, a sheet opened just before the address bar updated lost
  its back-gesture entry.** The walk's URL write replaced `history.state` with `null`, which wiped the
  back controller's marker. It now keeps the state it finds.
