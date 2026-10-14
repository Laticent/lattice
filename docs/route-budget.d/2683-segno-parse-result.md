studio: +400
playground: +16
The generated Segno parser now carries a shared result object, the default-rule shortcut and the buffer-reset repoint (about 330 B gzipped in the Studio, where lint-core and the notation parser load eagerly), and the both-paths check in schema.ts adds the `bindMode.check` flag and its compare branch. CI measured studio +320 and playground +2 against main; the declared figures leave room for gzip spread.
Given back first: nothing further. The result object replaces two per-call allocations with a reused one, so the parse itself got smaller, not larger; the growth is the new comments-free scaffolding around it.
