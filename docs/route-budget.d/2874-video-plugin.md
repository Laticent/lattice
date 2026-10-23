studio: +192
playground: +224
home: +224
The video plugin puts its own marker on the video figure, and the Studio's overlay and its in-frame tap guard now check it (`figure[data-lattice-media=video]` outside `[data-lattice-plugin]`) before they build an embed from a poster. The player also shows an "Open on {provider}" link under it, so a browser that blocks the third-party frame (Firefox, Orion) never leaves a blank player with no way out. CI measured theme-fetch +176, deck-preview +37, slide-boundaries +5 gzip bytes against main (the web-image-hint pattern gave back 34 in the studio); the link is most of the theme-fetch growth.
