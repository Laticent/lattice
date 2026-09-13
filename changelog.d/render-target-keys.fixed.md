- `fluid:`, `player:` and `present:` no longer fall silent on a trailing YAML comment.
  The export matched these three keys with a `$`-anchored regex, so `fluid: true  # for the
  web` enabled nothing while every other key in the same block stripped the comment and read
  normally. A quoted value (`fluid: "true"`) now works for the same reason. Both are
  widenings — a deck that was off becomes on — and no deck that already enabled a target
  loses it: the reader is the union of the old matcher and the shared front-matter scalar
  rule (`lib/core/render-target-keys.js`), pinned by a parity sweep over whole front-matter
  blocks.
- The deck linter reports a `fluid:` / `player:` / `present:` value that is neither on
  (`true` / `yes` / `on`) nor off (`false` / `no` / `off`) — new rule
  `bad-render-target-value`. A typo like `fluid: ture` reads as off, writes the ordinary
  artifact without complaint, and looks correct on every surface the author can check. The
  rule carries no autofix on purpose: a typo's polarity is ambiguous (`of` is one edit from
  both `off` and `on`), so guessing would risk enabling a target the author opted out of.
- The Studio editor's front-matter autocomplete offers `fluid:` and `player:` alongside
  `present:`, and all three now name the full six-word vocabulary rather than `true / false`.
  Only `present:` was listed, so the other two were reachable only by already knowing they
  exist. None of the three gets a settings-panel control — they name the artifact a render
  emits, not a property of the deck, and the Studio sets them at export time.
