---
name: desk-a11y
description: >
  Run the ♿ accessibility desk: make sure a screen-reader user, a keyboard user and a
  color-blind viewer get the same deck and the same Studio as everyone else: contrast,
  alt text and @alt notes, reading order, color as the only signal, type size, focus and
  keyboard paths. Start from the accessibility follow-ups and issues, check one surface
  per pass, and drive each gap to a fix with evidence from the real surface. Use when this
  session is told to be the accessibility desk, or the owner asks who a deck or the
  Studio leaves out.
argument-hint: "[decks | themes | studio | site | followups]"
---

# ♿ Accessibility desk

Read first, by section: `engineering/workflow.md` §Desks (the verbs, the budget, and "Read
your lane first"), the `lattice-accessibility-review` skill, `engineering/textures.md` (the
categorical texture channel, so color is never the only signal), and
`engineering/decisions/2026-07-03-semantic-html-accessibility.md`. Tag this session
`desk:a11y` and `ui:pinned`.

**The question this desk owns:** who does this leave out? A pass checks what the author
ships (decks, themes, charts) and what the author uses (the Studio, the docs site).

## The pass

1. **Read your lane first.** `npm run followups` and keep the items about accessibility
   (`grep -liE 'a11y|accessib|contrast|alt text|screen reader|keyboard|focus' followups.d/*.md`
   is the start; read each), the open issues that mention them, `claim:` tags on live
   sessions, and `grep -rn -iE 'a11y|contrast|focus' engineering/gotchas/`.
2. **Check one surface per pass**, in this order unless the owner names one: the themes in
   both modes (`npm run contrast:player`, `npm run contrast:palette-native`), the gallery and
   example decks against the `lattice-accessibility-review` checklist, the Studio by keyboard
   and screen reader, the docs site. Keyboard, focus and screen-reader claims come from the
   real surface (HARD RULE #23): drive it in Playwright Chromium and WebKit, and mark what no
   runner here can reach, such as VoiceOver on a real iPhone, UNVERIFIED.
3. **Rank** by who is blocked, then by reach: a deck that cannot be read at all before one
   that is harder to read; the default theme and the gallery before an edge modifier.
   Keep the top three.
4. **Act inside the lane:** start one fix session per item from `main` (tags `desk:a11y`,
   `origin:desk-a11y`, a `claim:`). Its brief carries the failing check as the baseline and
   says: the fix ships with that check passing and a failing arm (HARD RULE #34), a demo
   deck if a slide changes (#9), and the PR deletes the follow-up file it fixes.
5. **Write back** (through a session you start, counted in the budget). A new trap becomes a gotcha entry; a gap you will not fix this pass
   becomes a `followups.d/` file (`deferred: large|blocked|off-path`).
6. **Report** to the command center: the surface checked, the top items as fleet rows, what
   stayed UNVERIFIED and why, and `budget: N/10 today`.

## Lane

Yours: whether people with a disability can read a deck and use the Studio. Not yours: how
it looks to a sighted viewer (the polish desk), layout motion (the jank desk), a red test
(the flake desk). Never: lower a contrast baseline or re-bless one to make a check pass
(`contrast:player:bless` is a proposal to the owner), or call a screen-reader path verified
from a unit test.
