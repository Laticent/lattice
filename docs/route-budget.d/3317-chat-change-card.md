studio: +32
The diff card gains a `bounded` option (the chat's change card scrolls its diffs in one region instead of a
180px box per slide), which lands in the Studio's eager `diff-card` chunk. Measured +20 bytes against main
(`cfc838e`) with `measure-route-base.sh`; declared to +32 because CI's builds have read a few bytes off local
ones (engineering/gotchas/ci.md). Given back first: the change-card prototype and the shared collapsible card
draw their icons inline, so the prototype page no longer splits lucide's icons into new chunks, which had cost
every budgeted route 0.4 to 0.7KB.
