studio: +40
playground: +40
home: +40
CI measured, on e6b6231 against main: Studio +4 B of eager JS, gzipped, Playground +2 B and Home +14 B; the declaration leaves room for review nits.
- **The number reader.** Segno's `readNumber` now reads money as global clients write it (`EUR 4,2 Mio.`, `USD 15mn`, `4,2 Mio. €`): the currency layer, the ISO 4217 list and the magnitude words `Mio`, `Mrd`, `mn`, `Md` and `Cr`.
- **The narrator.** Cadenza says a decimal-comma amount as the number it shows and speaks `Mio.`, `Mrd.` and a currency sign after a number.
Given back first: nothing was cheaper to move. The reader is the one lint-core and the chart kernel share (HARD RULE #1), and Cadenza's normalizer is the one every read-along path uses.
