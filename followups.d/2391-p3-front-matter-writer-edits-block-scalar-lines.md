---
origin: 2391
priority: P3
recorded: 2026-09-26
---

# The Studio's front-matter writer can rewrite lines inside a `style: |` block

why now   — `frontMatterKeySpan` (docs/src/components/studio/front-matter.ts) treats indented
            lines under a key that has a value on its own line (`style: |`) as flat pairs. So
            `style: |\n  lift: on\n  rule: short` loses both CSS lines to a preset Reset
            (`clearPresetOverrides`) or any `writeFrontMatterLine` of those keys. Found by the
            #2391 checker on a contrived input; real CSS rarely has a line named like a register,
            and the behavior predates #2391.
where     — front-matter.ts `frontMatterKeySpan` (and `parseFm`, which it mirrors on purpose).
done when — a write or removal of a flat key never touches lines inside a block scalar
            (`|`, `>`), with a test for both the reader and the writer.
evidence  — the contrived deck above, before and after.
verify    — tier 1: vitest on front-matter.ts.
