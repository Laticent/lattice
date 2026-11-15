studio: +276
Compose's layout button and its menu (PR 3224). The menu and everything that builds it load lazily (`LayoutMenu.tsx`); the
first build put that logic in StudioShell and added 1,179 bytes, given back by moving it into the lazy chunk. The 276 left
are the bundler splitting `slide-variants` into a chunk of its own, now that the startup script (Reshape) and the lazy menu
both import it.
