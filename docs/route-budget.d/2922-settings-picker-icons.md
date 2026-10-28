studio: +6700
playground: +500
home: +500
components: +350
getting-started: +500

The Studio's Settings pickers gained a preview on every option: about forty lucide icons for
positions, alignments and levels, plus the drawn chips for stamp, tone, tag, logo, size and
image-card options, in one table (`option-glyphs.tsx`) that both the deck and slide panels
read. Every other route grows by the tap-away layer the shared shadcn `Select` and
`DropdownMenu` now draw, which is what closes an open list on an outside tap on iOS, and by
the shared `SelectContent`'s in-screen clamp (`useInScreen`, 197 B gzipped), which keeps a list
wider than its trigger from running off a phone screen.
Given back first: the stamp and tone defaults are two mirrored constants instead of an import
of the deck-settings table and its prose, which had added 8 KB to the Studio for two words.
Measured locally against main 34b07aa: studio +6234, playground +221, home +225, components
+78 owed, getting-started +225; the declared figures leave room for gzip spread.
The in-screen clamp adds 197 B gzipped to the shared select chunk on every route (measured
with and without it), hence about 200 B more on each figure.
