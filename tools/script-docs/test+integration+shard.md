---
group: Test & verify
---
The PR integration slice (same globs as test:integration:pr) dealt into time-balanced shards from committed per-file seconds (test/integration/shard-weights.json). SHARD=K/N runs one leg, as CI does; unset runs every file. `node tools/shard-tests.js --bless TIMES.tsv --weights …` re-blesses.
