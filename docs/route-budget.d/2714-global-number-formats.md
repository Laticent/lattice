studio: +40
playground: +40
home: +64
CI measured, on e6b6231 against main: Studio +4 B of eager JS, gzipped, Playground +2 B and Home +14 B; the declaration leaves room for review nits. On 1b0e82c, after the tower and risk-matrix charts joined, CI measured Studio +25 B, Playground +18 B and Home +41 B; Home is declared at +64 for the same headroom.
- **The two new charts.** `tower` and `risk-matrix` each add a row to the docs site's chart family and to the Studio's component lists (`families.mjs`, `registers.ts`, `chart-interact.js`).
- **The number reader.** Segno's `readNumber` now reads money as global clients write it (`EUR 4,2 Mio.`, `USD 15mn`, `4,2 Mio. €`): the currency layer, the ISO 4217 list and the magnitude words `Mio`, `Mrd`, `mn`, `Md` and `Cr`.
- **The narrator.** Cadenza says a decimal-comma amount as the number it shows and speaks `Mio.`, `Mrd.` and a currency sign after a number.
Given back first: nothing was cheaper to move. The reader is the one lint-core and the chart kernel share (HARD RULE #1), and Cadenza's normalizer is the one every read-along path uses.
