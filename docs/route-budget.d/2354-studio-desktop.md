studio: +850
playground: +132
home: +64
components: +64
getting-started: +64
Lattice Studio for desktop (#2354). The Studio gains the editor header's Find button, its
command-palette item and the find store; the find bar itself loads with the editor, and
Compose's find engine loads with Compose. A window-level key handler sends Ctrl+F to the
Studio's own find bar, in Markdown or Compose, and Ctrl+P to the Print deck panel, so the
browser engine's find and print never show (StudioIsland +599 B, with the Mac Cmd-or-Ctrl
check and the dialog-in-front guard). The Architect's Connect
button handles a sign-in that RETURNS, which the desktop app's sign-in window does (+163 B;
the sign-in seam itself, `lib/sign-in.js`, loads only on the click). The Studio also loads
`lib/host.js` ("is this the desktop app?") at startup, so the backup pane stops telling
desktop users that Safari will clear their decks (+120 B, less 105 B from that pane).
Every save goes through one platform seam (`docs/src/lib/platform.js`) so the desktop app
can show the native save dialog. That seam is what the Playground pays for: its export
(`deck-export.js`) loads up front and imports it.
Measured against `main` at a4fb527: studio +773, playground +66. Studio declared with 64 B
of margin for rebuilt chunk names.
Home, components and getting-started measured +1 to +2: rebuilt chunk names, since this PR
changes no code those pages load. Each route declared with the same 64 B noise margin as 2508.
