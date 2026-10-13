studio: +760
The Studio's live lint binds pills and chart points through Segno's `read` entry, which now carries a second, faster bind for plain `{…}` records (`fastRead` in schema.ts, with `flatTree`, `isName`, `bareEnd` and the built-in type mark in types.ts). CI measured +742 B gz against main; +760 covers gzip spread.
Given back first: nothing was removed. The extra bytes buy about a quarter off every pill and chart-point bind (355 to 260 ns for a pill), and the full bind stays as the only path that words an error.
