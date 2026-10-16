studio: +6
No eager code grew: every module this PR touches on the Studio route (player-core, player-prune, player-prune-browser) loads on demand. The 6 gzipped bytes are the eager chunk's references to those lazy chunks, whose content hashes changed with the code behind them.
