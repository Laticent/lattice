studio: +450
The Studio grows by 402 B gz of eager JS (measured locally against main e66a0e8; declared +450
for gzip variation in CI's build). It is `openSignInWindow` (docs/src/lib/sign-in-window.js),
which must open the OpenRouter popup synchronously inside the Connect click, before any
`await`, or a popup blocker refuses it, plus `connectOpenRouter`'s one-exchange-per-code
guard in architect.ts. The rest of the seam (sign-in.js) loads on the click.
Given back first: the first cut imported sign-in.js eagerly, at +948 B.
