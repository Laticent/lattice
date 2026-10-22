studio: +96
playground: +128
home: +128
The video plugin puts its own marker on the video figure, and the Studio's overlay and its in-frame tap guard now check it (`figure[data-lattice-media=video]` outside `[data-lattice-plugin]`) before they build an embed from a poster (CI measured theme-fetch +57, deck-preview +36, slide-boundaries +5 gzip bytes against main; the web-image-hint pattern gave back 34). The extra bytes are the security check, not a feature.
