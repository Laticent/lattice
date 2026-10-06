playground: +120
The playground's growth is notify.ts's NOTIFY_ACTION_EVENT and NOTIFY_DISMISS_EVENT listeners (+100 B
gz against main 905bec2e, measured locally; declared +120 to cover gzip variation in CI's build). It lets the lazy
iOS save path (download-ios.js) raise its "Save" toast without importing notify, which splits notify
into a first-paint chunk of its own and reshuffles the shared chunks: measured with the import,
+1,239 B on the Studio and +460 B on the playground.
Given back first: the iOS share-sheet code loads only on an iPhone or iPad, so the Studio comes out
11 B under main.
