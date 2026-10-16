studio: +850
playground: +132
home: +64
components: +64
getting-started: +64
Lattice Studio for desktop (#2354). The Studio gains the editor header's Find button, its
command-palette item and the find store; the find bar itself loads with the editor, and
Compose's find engine loads with Compose. A window-level key handler sends Ctrl+F to the
Studio's own find bar, in Markdown or Compose, and Ctrl+P to the Print deck panel, so the
browser engine's find and print never show (StudioIsland about +560 B, with the Mac
Cmd-or-Ctrl check and the dialog-in-front guard). The Architect's Connect button handles a
sign-in that RETURNS, which the desktop app's sign-in window does (about +160 B; the sign-in
seam itself, `lib/sign-in.js`, loads only on the click).
Saves: every save goes through `components/studio/download.js`, which in the desktop app
hands the file to the platform seam (`lib/platform.js`, the native save dialog). Neither adds
first-paint JS: download.js imports the seam statically, the seam has no load-time side
effects, and the backup pane checks for the app with the global rather than importing
`lib/host.js`. Each of those three was measured to put 1.2 to 2.1KB back on this route.
Measured against `main` at 6e7c738: studio +750, playground -13. Studio declared with about
100 B of margin for rebuilt chunk names; playground keeps its earlier declaration.
Home, components and getting-started measured -1 to -2: rebuilt chunk names, since this PR
changes no code those pages load. Each route declared with the same 64 B noise margin as 2508.
