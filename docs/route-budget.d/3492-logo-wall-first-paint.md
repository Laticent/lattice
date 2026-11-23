studio: +130
home: +130
The editing preview's frame stylesheet (`single-slide-render`, shared by the studio and home routes) holds back a logo wall the runtime has not stamped yet, so a first visit never paints the unpacked grid for a frame, and releases it past the measure kit's cap if the runtime never reaches it. CI measured +61 B for the hold alone; the release adds one `@keyframes` rule and an `animation`, and +130 covers both with room for gzip drift.
