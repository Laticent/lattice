- Inline code renders faster. The dispatcher every backticked span passes through now spends less
  than half the time it did on ordinary code, measured against the retired kernel on the bench
  fixture (6.71x to 2.85-3.09x on one machine, 5.98x to 2.41x on a GitHub runner). Brace records that
  are not pills, such as a chart's `{2, 82}`, no longer pay for an error message nobody reads.
- Segno gains two experimental APIs: `restrict(spec, { rules, nodes })`, which derives a smaller
  grammar the code generator can make its own parser of, and `slot.refuses(text)`, a record slot's
  cheap "this will not bind". The notation's plain-record parser is generated with the first.
- The perf nightly now compares the inline-span tier head against base, so a per-span dispatcher
  regression past 12% files the rolling perf issue instead of waiting for someone to run
  `npm run bench:check`.
