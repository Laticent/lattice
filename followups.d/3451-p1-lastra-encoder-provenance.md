---
origin: 3451
priority: P1
recorded: 2026-11-23
area: engine
severity: low
swimlane: engineering/decisions/2026-11-13-image-library.md
deferred: blocked — needs the encoder author's knowledge of where the code came from; blocks the 1.0.0 publish of @laticent/lastra (#3451 rewrote the notice this gap lives in)
source: https://github.com/Laticent/lattice/pull/3451
---

# Record where lastra's JPEG encoder came from

why now   — @laticent/lastra publishes with 1.0.0; its IJG notice (decode/README.md) covers the decoder only.
where     — docs/src/lib/lastra/jpeg.ts (header says: AAN float DCT, Annex K tables with libjpeg's quality scaling, Huffman tables as libjpeg's optimize_coding).
done when — the header states the encoder is written from the published algorithms (AAN paper, ITU T.81 Annex K), or, if it was translated from libjpeg source, the IJG notice names the encoder too.
evidence  — the #3451 checker: jpeg.ts:10-11,57,72,189,196 re-express jfdctflt.c constants, jpeg_quality_scaling and jpeg_gen_optimal_table; nothing records the origin.
verify    — read the header and decode/README.md's notice; they agree on what is derived from IJG code.
