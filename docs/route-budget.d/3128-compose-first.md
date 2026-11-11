studio: +2300
playground: +100

Compose becomes the Studio's default way to write (PR #3128,
engineering/decisions/2026-11-10-compose-first.md). The eager Studio bundle carries the new
pieces that must be ready before the editor pane paints:
- the stored writing mode;
- the shared `EditModeToggle`;
- the header row's measured fit, which keeps the Compose and Source words until the pane
  cannot hold them;
- Compose's Fix all and Refine wiring;
- the Compose-first tour and lesson lines.

At `ff7b9f4` CI measured +1221 gzip bytes on studio (StudioIsland +911, tours +270,
studio-store +40). It also measured +85 on playground, because the Playground shares the tour
lines table. After the checker's fixes, CI measured +1523 at `7b5db56` (StudioIsland +1213). Compose's AA-safe accent
(`--lx-compose`) and the toolbar fixes brought it to +1610 at `a6cd1d7` (StudioIsland +1301).

The slide and caret surviving a pane switch and a reload (decision note §4) added the rest: the boot read of the
saved caret, the arrive-focus rule, and carrying the caret's column. CI measured +2384 at `c14b12f` (StudioIsland
+1904, tours +270, studio-store +210). Before declaring it, this PR gave back what it could move off the startup
path: Compose's lint pass and Fix all now live in the lazy `deck-lint.ts`, each editor reports its own caret
column, and the two boot loaders became one. That cut 254 bytes locally (studio eagerJsGz 613289 to 613035).
+2200 covered the rest at `f8673c0`. The adversarial trio's fixes then added the Live-session and restore-focus
guards to the shell (`inLiveSession`, `nothingFocused`, the carried column spent once): CI measured +2300 at `a3094d9`
(StudioIsland +1819, tours +270, studio-store +211). The faithful write-back after it lives in the lazy Compose chunk. The heavy parts stay lazy: the column mapping (`caret-line.ts`) and the lint core load
with the editors.
