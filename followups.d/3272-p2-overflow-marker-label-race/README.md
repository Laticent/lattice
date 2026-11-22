# Evidence: the overflow marker's label race

What this holds: `overflow-marker-race.spec.ts`, the spec that exported the PDFs behind the item. It was a trimmed copy of
PR 3272's temporary byte-check spec, and ran against `f2a6dd7` (`main` at the time) and against PR 3272's head (`c9bfb6a`),
whose export path is the same code.

How to run it:

```
cp followups.d/3272-p2-overflow-marker-label-race/overflow-marker-race.spec.ts docs/e2e/
cd docs && BYTES_OUT=/tmp/omr npx playwright test e2e/overflow-marker-race.spec.ts --project=desktop --repeat-each=10 --workers=2 --trace off
rm e2e/overflow-marker-race.spec.ts
```

Then compare the files. A PDF with the label is larger: 331,966 B against 330,302 to 330,307 B for a blank pill, in the
runs below. To see it, pull the last slide's 2560×1440 JPEG out of the PDF (the one `/DCTDecode` image of that size) and
look at the bottom centre: a dark pill, with or without "Content clipped".

What it showed, Chromium (`desktop`), 9 exports:

| build | blank pill | labeled pill |
|---|---|---|
| `main` `f2a6dd7` | 1 | 0 |
| PR 3272, first cut | 1 | 0 |
| PR 3272 head `c9bfb6a` | 6 | 1 |

So the label was drawn in 1 export of 7 from one build, and `main` is affected: its export was blank. WebKit
(`webkit-phone`, 3 exports, one per build above) drew the pill blank every time, so WebKit is affected too and the
label may never draw there.
