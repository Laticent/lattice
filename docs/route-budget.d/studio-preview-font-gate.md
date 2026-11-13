studio: +5
home: +5
The live preview frame's `<html>` tag gains ` data-lattice-preview` (single-slide-render.ts), so the runtime settles only the faces the slide lays out instead of force-loading all 28; that is the whole fix, and it is the attribute's own bytes.
