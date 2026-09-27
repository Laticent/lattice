- **Fixed: the bracket-list "cost stays linear" test no longer fails on a busy CI runner.** It
  timed one 16k parse against one 4k parse and failed on `unit (node 22)` in #2421 with nothing
  changed. It now counts the parser's character reads, which no load can move, and times the
  fastest of 40 interleaved samples per size to catch work that reads no characters. Three input
  shapes, a brace run, a mixed list and a quote run, cover every branch of the scan. A mutant that
  rescans characters and one that rescans the quote table both still fail it; 15 of 15 runs pass
  beside 8 CPU hogs on a 4-core box.
