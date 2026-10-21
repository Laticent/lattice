studio: +54
playground: +10
home: +10
The Studio's plugin door carries the declared return fields of a zip plugin (owner decisions 11 and 12): the plugin library keeps `returns` on each record (`plugin-library`, +24 B gz), the shell hands it to the door (`StudioIsland`, +20 B), and the shared chunks behind every route (`theme-fetch` +6 B, `slide-boundaries` +4 B) moved by the same few bytes of the door's shape. Measured by CI against `main` at 76affdb. The check itself and the consent text sit in lazily loaded chunks, so the eager growth is the field's plumbing only.
