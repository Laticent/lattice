- Inline code spends less time deciding what each backticked span is, most of all on brace text
  that is not a pill, such as a chart's `{2, 82}`, which no longer builds an error message nobody
  reads. Against the retired kernel on the bench fixture: 6.71x to 2.79-2.87x on one machine, and
  about half on GitHub runners (three runs, −48% to −53%). The gain depends on how many such spans a
  deck has; a deck with none gains a few nanoseconds a span.
- Segno gains three experimental APIs: `restrict(spec, { rules, nodes })`, which derives a smaller
  grammar the code generator can make its own parser of (it refuses to prune inside `greedy()` or
  `attempt()`); `kindsOf(spec)`, the node-kind order to seed such a parser with
  (`generate(small, { kinds: kindsOf(full) })`); and `slot.tryRead(text)`, `read`'s value or null,
  with no message built for a span that will not bind. The notation's plain-record parser is
  generated with the first two.
- The perf nightly now compares the inline-span tier head against base, so a per-span dispatcher
  regression past 12% files the rolling perf issue instead of waiting for someone to run
  `npm run bench:check`.
