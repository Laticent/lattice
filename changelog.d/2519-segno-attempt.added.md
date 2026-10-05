- **Segno: `attempt(x, { max, next })`, a bounded ordered choice.** It reads `x` on at most `max`
  characters and keeps it only if a `next` character or the end of the input follows; otherwise
  it rewinds, and as an `alt` branch it hands the character to the branches after it. The checker
  accepts that overlap and no other, and refuses nested attempts, `until()` inside one and an
  attempt that can match nothing, so every grammar that compiles still parses in linear time.
  Both runtimes (`compile()` and `generate()`) support it, and a grammar without one generates
  byte-identical code. A flowchart-row grammar built on it reads all 442 corpus rows and
  200,096 fuzzed rows exactly as `splitRow` does (`npm run parser:bakeoff:flow`).
- **Fixed: Segno lints a grammar of thousands of rules in linear time.** A chain of 2,000 rules
  whose choices grow took 6.5 s to lint and 4,000 overflowed the stack; 8,000 now take about
  150 ms. The "expected …" text in a parse error is built only when a parse records an error,
  `lint()` no longer builds a parser, and the checker's walks no longer recurse, so `lint()` reads
  10,000 levels of nesting (`compile()` still overflows building one rule nested about 3,000
  deep, as before). Every error message reads as before.
- **Fixed: `lint:deck` warns when a pill label needs quoting.** Since pills moved onto Segno, a
  label holding `|` `=` `[` `]` or `{` (`{A|B, tag}`) leaves the span as plain code, and nothing
  said why. The new `pill-literal` warning names the reserved character and the quoted spelling
  that renders (`{"A|B", tag}`). It stays silent on chart points, journey steps and the other
  brace records a component reads; across the shipped decks it fires 0 times.
- **Fixed: on a slow phone, the Playground's Explore walk bar no longer paints under the toolbar
  and then jumps to the foot.** The page is parsed and painted in chunks, and a chunk that ended
  inside the bar painted it before the deck pane below it existed. The bar now takes no space
  until the pane is parsed.
