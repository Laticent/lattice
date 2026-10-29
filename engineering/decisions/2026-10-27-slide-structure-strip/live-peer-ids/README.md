# Evidence: a Live viewer lands on the wrong slide after a peer's structural edit

Ran against `47d03e4` (this PR's base on main; the PR changes no code) on 2026-10-27: two separate headless Chromium
processes, the real Live transport over the public Nostr relays and real WebRTC, the docs dev server
(`cd docs && npx astro dev --port 4399`).

`peer-structural-edit.mjs` starts a Live session on a five-slide deck (Alpha, Bravo, Charlie, Delta, Echo, separated by
`---`) in a 1440px host browser, admits a 390px phone viewer that shows only the preview (no editor caret), puts the
viewer on Charlie, and has the host change the deck through the icon row. It reaches third-party relays, so like
`tools/live-session-check.mjs` it is on-demand only. Run it with `BASE=http://localhost:4399/studio/ node engineering/decisions/2026-10-27-slide-structure-strip/live-peer-ids/peer-structural-edit.mjs`
while the dev server is up.

| Host's edit | Viewer before | Viewer after | Right? |
|---|---|---|---|
| Delete Bravo | Slide 3 / 5, Charlie | Slide 2 / 4, Charlie | yes |
| Add a blank slide after Bravo | Slide 3 / 5, Charlie | Slide 3 / 6, the new blank slide ("New slide") | **no** |

The host was on slide 2 during the add, so the viewer was not following the host. The add case reproduces the id bug in
§10 of the design note; the delete case, which the Node run through the hub predicted would land on Delta, did not.

## After the fix

Re-run on 2026-10-27 against this branch with the three changes in §10 of the design note (ids carried by text in
`deck-outline`, a caret at the top of a surviving slide follows it in `hub.update`, and the editor no longer reports a
caret that a peer's change only mapped):

| Host's edit | Viewer before | Viewer after | Right? |
|---|---|---|---|
| Delete Bravo | Slide 3 / 5, Charlie | Slide 2 / 4, Charlie | yes |
| Add a blank slide after Bravo | Slide 3 / 5, Charlie | Slide 4 / 6, Charlie | **yes** |

The host, too, now lands on the slide it added (Slide 3 / 6); before, its own editor's mapped caret pulled it back to
Bravo.
