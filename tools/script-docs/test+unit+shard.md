---
group: Test & verify
---
The unit suite dealt into two time-balanced shards from committed per-file seconds (test/unit/shard-weights.json). SHARD=K/2 runs one leg, as CI's node 22 unit job does; unset runs every file. `node tools/shard-tests.js --bless TIMES.tsv --weights test/unit/shard-weights.json` re-blesses.
