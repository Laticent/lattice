studio: +364
playground: +101
home: +250
Two security guards ride in the eager preview path. The preview frame's nonce `script-src`: `single-slide-render.ts` makes the nonce and stamps it on every script it writes, and the shared policy kernel (`subresource-csp.mjs`, reached through `deck-preview.js`) gains the opt-in directive. And `architect.ts` gains the fail-closed budget check for a direct provider key with no price, plus the opening of the direct keys' sealed slots at boot.
Given back first: the four key-list helpers (remove, remove-all, list, switch) moved from the eager `architect.ts` to the lazy `api-key.ts`, which only the Workspace sheet loads (CI measured +367 / +89 / +225 before the move).
