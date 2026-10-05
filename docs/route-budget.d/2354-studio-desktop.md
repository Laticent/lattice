studio: +210
playground: +132
home: +64
components: +64
getting-started: +64
Lattice Studio for desktop (#2354). The Studio gains the editor header's Find button, its
command-palette item and the find store; the find bar itself loads with the editor. Every save
now goes through one platform seam (`docs/src/lib/platform.js`) so the desktop app can show the
native save dialog. That seam is what the Playground pays for: its export (`deck-export.js`)
loads up front and imports it. Measured against `main` at 2b2c265: studio +145, playground +68.
Home, components and getting-started measured +1 to +2: rebuilt chunk names, since this PR
changes no code those pages load. Each route declared with the same 64 B noise margin as 2508.
