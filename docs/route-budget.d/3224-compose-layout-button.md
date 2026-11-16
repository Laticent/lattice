studio: +1546
Compose's layout button and menu, the edit bar's Find and replace and its More menu (PR 3224). The layout menu, the find bar
and both editors' search code load lazily (`LayoutMenu.tsx`, `FindBar.tsx`, Compose's and Source's own chunks); the first
build put the layout menu's logic in StudioShell and added 1,179 bytes, given back by moving it into the lazy chunk. What
remains at startup: `slide-variants` splitting into a chunk of its own now that Reshape and the lazy menu share it (+656),
the edit bar's Find button, More menu and ⌘F wiring in the shell (+531), and the two icons the pre-paint shell and the app
both draw, each split into a shared chunk (+359). The page's HTML stays under its ceiling: the edit bar's steps are a short
`data-out` attribute per control and three rules in styles/tailwind.css, not a utility class per step per control (which
cost about 0.7KB of HTML and put the page 0.4KB past its ceiling).
