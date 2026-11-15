- **The Studio loads faster for a returning reader with the slide map open.** The map keeps its slide pictures
  between visits and shows them instead of starting a live preview for every tile, so an unchanged deck's map loads
  no preview documents at all. A tile goes live only to draw a new picture: on a first visit, or after an edit, a
  theme change or an update. Measured at 4x CPU, the load's Total Blocking Time fell from 4.8 s to 3.1 s, its Speed
  Index from 4.1 s to 2.9 s, and time to interactive from 9.4 s to 6.4 s.
- **The map's pictures now use the slide's own fonts, icons and emoji,** so they match the slide instead of re-wrapping
  in a fallback face. A slide that shows a library photo keeps its live preview, so a replaced photo shows at once.
- **Typing with the map open is smoother.** The map draws a new picture of an edited slide only once you pause, and draws
  it with less work, so keystrokes wait less (at 4x CPU the slowest keystrokes went from 256 ms to 176 ms).
- **`npm run perf:load`** (in `docs/`) measures a page's load with Lighthouse's desktop settings: median Total Blocking
  Time, Speed Index and time to interactive, for a first visit, a returning reader (`RETURN=1`) or with the map open
  (`MAP=1`), at any CPU slowdown (`CPU=4`).
