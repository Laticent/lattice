studio: +160
home: +150
CI measured studio +138 and home +132 bytes gzipped; the declaration leaves about 20 bytes for gzip to shift on a rebase.
single-slide-render.ts (+132 on both routes) mounts each live slide frame in a display-sized slot and fades the slot, not the
frame: on a 4K deck WebKit gave the frame's own fade a layer sized 3840x2160 times the pixel density, about 300 MB on an
iPhone, and Present reloaded the tab. StudioShell (+6, studio only) hides the editor's preview while Present is open, so one
4K frame is drawn instead of two.
