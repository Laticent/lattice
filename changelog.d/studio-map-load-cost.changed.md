- **The Studio loads faster for a returning reader with the slide map open.** The map keeps its slide pictures
  between visits and shows them instead of starting a live preview for every tile, so an unchanged deck's map loads
  no preview documents at all. A tile goes live only to draw a new picture: on a first visit, or after an edit, a
  theme change or an update. Measured at 4x CPU against the previous build, the load's Total Blocking Time fell by 39%
  (5.2 s to 3.2 s), its Speed Index by 36% (4.0 s to 2.5 s), and time to interactive by 39% (9.7 s to 5.9 s).
- **The map's pictures now use the slide's own fonts, icons and emoji,** so they match the slide instead of re-wrapping
  in a fallback face. A slide that shows a library photo keeps its live preview, so a replaced photo shows at once.
- **Typing with the map open is smoother.** The map draws a new picture of an edited slide only once you pause, and draws
  it with less work, so keystrokes wait less (at 4x CPU the slowest keystroke went from 240 ms to 104 ms, and blocking while typing fell by half).
- **`npm run perf:load`** (in `docs/`) measures a page's load with Lighthouse's desktop settings: median Total Blocking
  Time, Speed Index and time to interactive, for a first visit, a returning reader (`RETURN=1`) or with the map open
  (`MAP=1`), at any CPU slowdown (`CPU=4`).
