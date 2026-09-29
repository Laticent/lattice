---
origin: 2477
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2477
---

# Rename the internal identifiers that still say "caption" for the spoken line

why now   — #2477 renamed the author-facing key to `say:` so that "caption" means only
            visible text. The code underneath still calls the spoken line a caption, so a
            reader of `lib/` meets the same overload the rename removed from the docs.
            Code-only: no author types these names.
where     — `lib/authoring/notes-core.js` (`CAPTION_MATCHER`, `isCaptionComment`,
            `captionFromHtml`, `extractSlideCaptions`, `stripCaptionsFromSource`,
            `stripCaptionsFrontMatter`), `lib/core/resolve-captions.mjs` (`parseCaptions`,
            `frontMatterCaptions`, the `.captions` field) and its `docs/src/lib` re-export,
            `docs/src/components/studio/slide-caption.ts` (`getCaption` / `setCaption`),
            `slide-directives.ts` `isCaptionBody`, `narration-resolve.ts` (`caption` /
            `fmCaption`), `lattice-emulator.js` `STRIP_CAPTIONS` / `slideCaptions`, and the
            `test/fixtures/strip-captions-deck*.md` names. Leave every name that means the
            VISIBLE band or the `.vtt` (`--captions`, `captionsOn`, the player's caption
            styles, `writeCaptionsSidecar`) as it is.
done when — no identifier that means the author's spoken line contains "caption", and
            `grep -rn "caption" lib docs/src` hits only visible-text meanings.
evidence  — the full unit suite, the Studio vitest suite and `build:check` green; a
            byte-identical `--captions --strip-say` render of `examples/read-along-captions.md`
            before and after.
verify    — self-review with the gates: a rename with no behavior change.
