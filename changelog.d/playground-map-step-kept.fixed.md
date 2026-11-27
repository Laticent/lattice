- **Fixed: a step on the Playground's slide map is no longer lost on a busy page.** With the map open in Explore, a
  jump to the last slide followed by "previous" could leave the walk bar on the last slide, or on a slide the reader
  never picked, and "first" then "next" could stay on slide 1. On a loaded page the first jump's smooth scroll ran past
  the time the walk waited for it, so the walk renamed itself from wherever the scroll was passing, the next step
  started from that slide, and the scroll then landed somewhere else. The walk now waits for its own scroll while that
  scroll is still moving toward its slide, up to four times the usual wait.
