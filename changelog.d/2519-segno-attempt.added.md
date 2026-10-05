- **Segno: `attempt(x, { max, next })`, a bounded ordered choice.** It reads `x` on at most `max`
  characters and keeps it only if a `next` character or the end of the input follows; otherwise
  it rewinds, and as an `alt` branch it hands the character to the branches after it. The checker
  accepts that overlap and no other, and refuses nested attempts, `until()` inside one and an
  attempt that can match nothing, so every grammar that compiles still parses in linear time.
  Both runtimes (`compile()` and `generate()`) support it, and a grammar without one generates
  byte-identical code. A flowchart-row grammar built on it reads all 442 corpus rows and
  200,096 fuzzed rows exactly as `splitRow` does (`npm run parser:bakeoff:flow`).
