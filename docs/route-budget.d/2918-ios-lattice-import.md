studio: +130
The Studio's Import deck… picker now drops its file-type filter on iPhone and iPad, where iOS grayed out
every `.lattice` file, so the Studio's first paint carries a three-line iOS check (ios-like.js) and two
more `accept` entries (`.zip`, `application/zip`): +106 B gz in StudioIsland against main 2c6b59d, measured
locally; declared +130 to cover gzip variation in CI's build.
Given back first: importing the check from download.js instead put all of download.js on the first paint
(+911 B), so ios-like.js holds its own copy and ios-like.test.ts keeps the two in step.
