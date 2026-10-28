studio: +600
playground: +20
home: +20
components: +20
getting-started: +20
Filo slice 5 (undo survives a reload). The Studio's eager share is the glue that stays at startup: the sidecar hash written beside each saved source (`saveSourceSum`, `hashText`), the lazy loader for the persistence module and its pagehide flush, and `History`'s revision counter. The store, the line diff, the snapshot code and the worker load after the first paint; the first cut kept them eager (4,221 bytes) and was cut back to this. The 13 bytes on every route are the storage overlay counting the sidecar key with deck sources. CI measured +538 B on the Studio and +13 B on each other route; the figures above cover gzip variation.
