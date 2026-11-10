studio: +275
The new `/gift` page stores a gift link's key through the one key writer, `docs/src/lib/openrouter-key.js`, so that module now has two entry points and the bundler moves it out of the `model-selection` chunk into its own: `openrouter-key` grew by 2,654 gzip bytes and `model-selection` shrank by 2,426. The net 266 bytes are the cost of the extra chunk boundary. The code itself is unchanged, and `/gift` must not carry its own copy of the key writer (HARD RULE #1; `check-key-chunk` requires every key name to sit in one chunk).

The other 9 bytes are the capped-key fix (`model-error.ts`'s used-up branch, the `[key-limit]` tag check in `architect-model.js`, and the chat notice's wrap classes), all in chunks the Studio loads first.
