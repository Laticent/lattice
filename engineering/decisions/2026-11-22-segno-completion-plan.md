---
status: proposed
summary: >
  The Segno desk's plan to finish the deck pipeline for release: eight PRs in an order that stacks (P4, P5a, #3278,
  P4b, P5a' with P5b, P5c, then P7 in two steps), the proof each slice owes, and measurable exit criteria for
  "complete for release". It also records the owner decisions from 2026-11-16 to 2026-11-22 that lived only in
  chat. Scope is through P7, with Djot (P6) out.
---

# Segno: the completion plan (2026-11-22)

The owner, 2026-11-22: "we need to bring the segno work to completion as it is critical to release. we need to be
efficient and effective in completing the work." The Segno desk (session_01DPMMjEWq7TK48eTYCYYdrq) coordinates from
that date. The owner confirmed it in the old coordinator's session, which stood down. This note extends
`2026-10-22-segno-deck-pipeline.md` §Plan. It is a separate file so that it does not conflict with the two open PRs,
both of which edit the pipeline doc.

## Where it stands

| Phase | State on 2026-11-22 |
|---|---|
| P0 to P3 | On `main`. The last P3 islands, math splicing and the front-matter grammar landed in #3263 |
| Reports R0 to R4 (`2026-10-27-segno-reports-facts-callers-decide.md`) | On `main`. One gap is logged: `followups.d/3025-p1-image-set-var-gap-reported-as-gone.md` |
| P4, S2 and the token adapter | **#3256**, open. It conflicts with `main` in 4 files (`segno-markdown/block.ts`, `deck.ts`, the pipeline doc, `shard-weights.json`). Worker B owns it |
| P5a, the CSS tokenizer and Families C and D | **#3294**, open. It conflicts in 3 files (`pdf-compose/read-slide.mjs`, the speech-projection bundle, `regex-census.json`). Worker A owns it |
| P4b, P5a', P5b, P5c, P7 | Not started |
| P6, Djot | **Out**, by the owner's decision (below) |

## Owner decisions that lived only in chat (2026-11-16 to 2026-11-17)

The old coordinator relayed these on 2026-11-22. They are recorded here so that no session has to read a transcript
to find them.

- **Scope:** through P7. Djot is out.
- **Front matter:** the Segno grammar, plus a small driver for the extent of a block-scalar body. Shipped in #3263.
- **P4 speed targets:** the block pass (S1) at least 3x markdown-it's block parse; the inline parse alone at least 4x
  markdown-it's inline parse; S0 to S2 tracked as a metric. #3256's doc commit carries this.
- **P4b** splits out of P4 as two PRs: CodeMirror first, then Compose.
- **Route ceilings:** one combined raise, #3300 (home 328,192 B, studio 636,636 B), sized for #3294, #3256 and #3278
  with about 1 KB to spare. `main` has grown since, so each PR measures again; nothing is raised silently.
- **P5** splits into P5a, P5a', P5b and P5c, with one generated CSS parser (`css-ref.generated.js` deleted). css-tree
  and `theme/parse.js` stay until P5c lands. Then they are measured against the P5 reader and the owner decides.
- **Export sign-off is not narrowed.** Every P5 PR whose embedded runtime changes sends dark and light renders for
  sign-off. calco's PPTX gets the same dark and light byte check.
- **A new published package, `@laticent/segno-languages`**, named for future languages (formulas, Djot). It holds
  standard languages only, with subpath exports `/css`, `/html` and `/front-matter`. `flowchart-row` and `list-text`
  stay in `lib/core`. Readers stay in `lib/core` and import the package. Its first release needs the owner.
- **`TEXTURE_REF_RE` is kept on purpose,** because over-matching is the safe side. Four markup `url()` readers go to
  the plan's "Later: HTML islands" row.
- **The owner's bar:** "no jank, no tech debt, no settling, no broken windows".
- **Set on 2026-11-22:** P7 is in the release gate. The lane's budget is 15 to 20 agents in total, counted fresh from
  2026-11-22 ("be efficient and effective"). The owner types `merge #N` for every merge; this replaces the old rule
  that the coordinator merges at VERY HIGH. #3278 is finished, not closed: its two product fixes are not on `main`.
  The Segno desk coordinates every session on Segno or related work, as partners who own their own work.

## The slices, in the order they stack

Each slice is its own branch from `main` and its own PR (HARD RULE #17). Each lands alone and is worth having if the
next never comes. Two tracks run side by side; P7 starts once P4 has merged.

| # | Slice | Track | Waits on | Agents | Proof it owes |
|---|---|---|---|---|---|
| 1 | **P4: S2 and the token adapter** (#3256): resolve the 4 conflicts, then verify again | B | nothing | 1 | `identity:check --strict` at 0 against `main`; the 603-deck token and engine identity tests; the CommonMark metric (649/652, the same as markdown-it); speed against the restated targets; route bytes measured again. Maker-checker ran; the card is regraded |
| 2 | **P5a: the CSS tokenizer** (#3294): resolve the 3 conflicts, merge `read-slide.mjs` with #3336's finish backdrop, check against #3344's `url()` fix | A | nothing | 1-2 | identity at 0; the PDF and player byte checks, with dark and light sign-off renders if any embedded runtime changed; route bytes measured again against the #3300 room |
| 3 | **#3278, finished**, with the met-reds fixes and the gallery srcdoc leak folded in | B | nothing | 2 | Each fix with a failing arm, repeat green and green under load (#34); route bytes measured again against the #3300 room |
| 4 | **P4b: CodeMirror's tree from the tape, then Compose built from the model and serialized losslessly**, one PR with two commits | B | 1 | 2 | Lezer tree against the model on the corpus; the Studio editor suites; e2e on the editor at three widths; keystroke cost counted, not timed (#32); round trip: source to Compose to source, byte-identical on the corpus; the Compose e2e suites; Compose's own markdown-it removed |
| 5 | **P5a' + P5b: `@laticent/segno-languages`** (`/css`, `/html`, `/front-matter`), with the Mermaid shim and calco moved onto it, **then Family B, the export and print readers**, one PR | A | 2 | 2 | Byte identity for everything that re-exports; calco's PPTX byte check in dark and light; the release manifest names the package (RELEASE.md), and its first publish waits for the owner; identity, captions, the Marp bundle and PDF fonts all byte-identical. If any byte moves, stop and send dark and light renders |
| 6 | **P5c: Family A, the #22 readers**, in the census order | A | 5 | 4 (trio + grader) | Per reader: a seeded differential against the scan it replaces, the inliner and rehost browser oracles, and one checker. **The adversarial trio** (red team, inversion, checker) on the slice, because it decides what CSS may reach a document. No sanitizer behavior changes; if one must, report first. Then the owner decides about css-tree and `theme/parse.js` |
| 7 | **P7a+b: the engine parses through the model, behind one switch that stays off.** `parseFromModel` (from #3256) becomes the engine's parse; the strings markdown-it derives (`normalizeLink`, `unescapeAll`, entity decoding) get Segno's own versions; `pluginFences` and each plugin's facade read the model; Segno's own renderer draws HTML from the model | C | 1 | 2 | identity at 0 on the corpus with the switch on; the engine bench (#19) with a scenario on the model path; every plugin fixture and gallery byte-identical; the plugin-contract tests; HTML byte-identical to markdown-it's renderer on the corpus, before any switch; hostile ladders for the renderer |
| 8 | **P7c: flip the switch and remove markdown-it** from `package.json`, the engine and every shipped bundle | C | 4 and 7 | 4 (trio + grader) | identity at 0; goldens unchanged; route and engine bytes measured (they should fall); **the adversarial trio** on the switch |

The eight PRs use 19 agents in total, inside the lane's budget of 15 to 20. That count includes each PR's card grader.

P4b and P5 run side by side because they touch different code (the editors and the CSS readers). P7a+b follows
P4 rather than P4b because the engine path does not read the editors. P4b removes Compose's markdown-it, which P7c
also needs, so P7c waits on both.

## What "complete for release" means

Segno is complete for release when every line below holds on `main`, each measured by the command named.

1. **PRs 1 to 8 have merged.**
2. **markdown-it is gone.** `npm ls markdown-it` is empty for the engine package. No file in `dist/` or the docs
   build contains markdown-it's code (checked by grepping for its exported names). The CodeMirror and Compose layers
   read the model.
3. **Output did not move.** `npm run identity:check -- --strict` against the last pre-P7 `main` reports 0 decks
   differing and 0 stylesheets differing. The nightly goldens need no re-bless caused by Segno.
4. **Parity holds.** The 603-deck token test and the bake-off corpus show 0 differences. The CommonMark metric stays
   at 649/652 or better, and every divergence is named.
5. **The CSS census is empty.** Every reader in Families A to D has moved or is listed as kept, with its reason. The
   naive comment strip `/\/\*[\s\S]*?\*\//` appears 0 times in `lib/`.
6. **Speed meets the owner's targets.** S1 at least 3x markdown-it's block parse and the inline parse at least 4x
   markdown-it's inline parse, both on the gallery deck (`npm run parser:bakeoff:deck -- --inline`, a flag #3256 adds). The edit tier's
   `deck parses/key` is 0. `npm run bench:check` shows no regression.
7. **Every stage is linear.** Each stage's hostile ladder grows about 10x for 10x input, counted in work done, not
   time (#32). `npm run mutate:segno` is green.
8. **Bytes were budgeted, never raised silently.** Every route or engine ceiling change carries the owner's yes.
9. **Every export byte change was signed off** by the owner in dark and light.

## Running it

- **Workers:** A and B continue on their own branches (#31). A new worker C starts P7 once #3256 has merged. At most
  three sessions run at once.
- **Verification:** the adversarial trio (HARD RULE #25) runs on slices 6 and 8 only, because those two change what
  CSS may reach a document and how every deck parses. Every other slice gets one checker (CLAUDE.md MAKER-CHECKER)
  and one card grader.
- **Merges:** the owner types `merge #N`. The desk never merges.
- **Lanes the desk coordinates with:** Squadra (the S3 inline islands its tree waits on read S2 from slice 1; see
  `2026-11-13-squadra-replaces-lint-core.md` §7); the meta desk (the `@meta` comment grammar touches the directive
  island); the fit desk.
