- **The ten deck-level front-matter registers now live in `lib/base/base.registers.docs.md`.**
  `mode:`, `finish:`, `split:`, `stamp:` / `tone:`, `spectrum:` / `spectrum-edge:`, `rule:`,
  `eyebrow:`, `headline:`, `lift:` and `corners:` — with a table at the top naming what each
  one selects and its default. Nine of them were nested under `base.docs.md` § `sketch`, a
  **per-slide variant**: `mode: sketch` is how you turn sketch on deck-wide, so the first
  register landed there fairly and eight more followed it one at a time. A reader looking for
  `headline:` had no reason to open a section about handwriting.
- **`lib/base/base.docs.md` drops 24,504 → 15,682 tokens**, which matters because HARD RULE #6
  makes it a mandatory read before authoring a base modifier. The move is mechanical: nine of the
  ten register bodies are byte-identical to what left, with only the heading level changed, and
  the tenth (`eyebrow:`) carries a one-line edit because it pointed at a section that stayed
  behind. The other falsified cross-reference (a `tone-*` variant pointing at the `stamp:` /
  `tone:` registers "above") now names its file too.
- **The two files together are 26,121 — about 1,600 MORE than before.** The frequent read got a
  third cheaper and the rare one became findable; a reader who needs both pays more.
- **Every per-slide token the registers resolve to is listed in `base.docs.md`**, grouped by
  register and derived from the class names in `lib/base/*.css`. HARD RULE #6 sends `_class:`
  authoring to that file, and moving the registers out had cost **38 of 48** register-family
  tokens their only hit there — so `grep spectrum-card-edge-top lib/base/base.docs.md` worked
  before this branch, stopped working, and works again.
- Routing follows the content — `CLAUDE.md`, `design/skills/finish.md` and
  `design/design-system.md` point register questions at the new file.
