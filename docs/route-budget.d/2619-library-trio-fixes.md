studio: +200
components: +4
getting-started: +4
The Studio ships Segno and LTT, so the adversarial trio's fixes to them land in its eager JS
(+170 B gz against main as CI measures it; +200 covers gzip variation). Segno: the character-set
guard that refuses astral and backwards ranges, the bounded `lint()` alternation report, the
`code: 'stack'` field, and the registered-symbol brand on `SchemaError` and `GrammarError`. LTT:
`canonicalJson` following `JSON.stringify` and the version check reading any 1.x. Each closes a
defect on a published API (engineering/decisions/2026-10-08-library-trio-before-publish.md §3).
The +1 B on components and getting-started is the same shared chunk; +4 covers gzip variation.
