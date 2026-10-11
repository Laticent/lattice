studio: +1932
playground: +35
home: +41
The avatars plugin's inline kind ships wherever the inline-code dispatcher does, as the icons plugin's does: its kernel reads, lints and resolves `!{…}` (the Segno slot, the name hash, the trait vocabulary of about 2KB raw), so a span lints the same in the Studio's editor as in the engine. The `!` tag adds a character to Segno's generated parser on every route.
Given back first: the drawings and colors (13KB raw) never ship eagerly; they load through plugin-data only for a deck that writes `!{`, as the icon drawings do.
