studio: +700
home: +820
playground: +40
Measured against a build of 450df6de (docs/scripts/measure-route-base.sh): studio +679, home +796, playground +14 bytes
gzipped; CI measured playground +18 on the previous head, so each line leaves about 20 bytes for gzip to shift on a rebase.
single-slide-render.ts mounts each live slide frame in a display-sized slot and fades the slot, not the frame: on a 4K
deck WebKit gave the frame's own fade a layer sized 3840x2160 times the pixel density, about 300 MB on an iPhone, and
Present reloaded the tab. It also lays a 4K deck out on HD wherever the screen shows the slide at 2,560 device px or fewer
across (lib/core/screen-canvas.mjs, +282 eager on studio and home): same reason, every layer in the frame is paid at the
frame's box. `withSize` (lib/core/sizes.js, about 960 bytes) loads lazily, only on that 4K path, so it is not in these
numbers. StudioShell hides the editor's preview while Present is open, so one 4K frame is drawn instead of two. The
playground's bytes are one more name in PlaygroundIsland's preload map: DeckConfigPanel's lazy chunk now reaches
screen-canvas through slide-size.ts.
