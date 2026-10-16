studio: +19
playground: +8
home: +13

These bytes are not new code on these routes. They are the largest each route moved across this
PR's engine commits, and they moved in both directions: studio read +19, −5, +1 and +13;
playground +3, +5, +8 and +3; home +4, +13, +13 and +2. Every eager chunk that names the engine
carries the playground asset version (`/playground/v/<12 hex>/`), which hashes every synced asset,
so any change to engine bytes gives a new string that gzips a few bytes differently (followup
2718-p5, which records the fix this needs in the budget check itself). The code this PR adds (the
inline dispatcher's first-character table, Segno's refusal path and its generated plain-record
parser) lives in the engine bundle, which these routes load lazily (engineJsGz, under its soft
target).
