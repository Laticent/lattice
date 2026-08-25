---
status: shipped
summary: >
  We spent real effort on SVG mask tokens so a status mark renders identically regardless of
  font or OS, and then went on typing `✓`, `→` and `❯` straight into stylesheets and decks —
  which throws that away, because the deck's type family carries none of them and each machine
  substitutes a different font, a color emoji, or a hollow box. HARD RULE #29 closes it, and
  the split is the point: engine CSS is gated at zero, while author decks are COACHED, never
  blocked ("we warn, we coach"). Fourteen `--icon-*` mask tokens ship, every one with a live
  consumer; sixteen engine `content:` sites across ten stylesheets now paint a mask. Two
  findings changed the shape of the rule. First, the a11y/print grayscale shape channel is NOT
  a naive re-implementation of `--mark-check`: `content: <string> / <alt>` with an empty alt is
  the only mechanism measured to keep the shape out of the accessibility tree, the glyph keeps
  sized with the type, and each declaration is deliberately DOUBLED as a cross-engine pair — so
  it is exempted with that measurement rather than converted, and the rule's text says so.
  Second, the claim that every engine-JS hit was terminal text is false: two chart transforms
  write a shape into rendered markup. They are recorded, pinned by content in a unit test, and
  left for a follow-up, because drawing them needs a markup change to a shared transform rather
  than a CSS swap. Engine JS stays ungated on purpose — the heuristic that tried flagged a
  `Symbol()` sentinel's trailing comment, and a gate that cries wolf gets switched off.
---

# Typed glyphs, and the three ways one deck renders

## 0. The ask

> "bare stuff like ✓ have no place in any of our decks. we spent significant energy on our
> svgs to have a consistent output regardless of fonts and os. i want bare typed stuff them
> purged to never see them again anywhere… our css should use only curated base tokens for
> these chrome/tag/arrow/chevron."

And, on author input, a deliberately different posture:

> "authors can do whatever they want, they can write ✓ but when there is better alternatives
> we should present a warning and suggest fixes and help them fix it. even better we should
> give them more modifiers to allow them to have more styles. we warn, we coach. consistency
> is king but flexibility is necessary evil."

Those two paragraphs are not in tension; they name two different surfaces. The rule's whole
shape follows from taking both literally.

## 1. What actually goes wrong

A "shape glyph" is a character doing the job of a drawing: `✓` `✗` `→` `❯` `●` `⚠`. The harm
is not aesthetic, and it is not hypothetical:

- **The type family has no glyph for it.** Inter, Source Serif, Helvetica and Arial carry no
  U+2713. The renderer falls back to whatever font on THAT machine does — a different weight,
  a different baseline, a different optical size than the type sitting beside it.
- **Or it arrives as a color emoji.** On a machine whose emoji font wins the fallback chain,
  the same character comes back in full color, and Marp Core rewrites emoji into
  `<img class="emoji">` (`engineering/gotchas.md`). It then takes no color from the element at
  all, which is exactly what a palette-blind layout cannot survive.
- **Or it renders as `.notdef`** — a hollow box.

One deck reaches at least three surfaces: the CLI's headless Chromium, a shared `.html` export
opened on someone else's laptop, and PowerPoint on Windows. A typed glyph can render three
different ways across them. The `--mark-*` tokens already existed to prevent precisely this for
status marks; nothing extended the idea to chrome.

## 2. The rule's split

**Engine CSS — budget 0.** We own the declaration and the token is right there.

**Decks — an exceed-only ratchet on OUR decks, coaching for everyone else's.** The gate holds
the line on the examples, exemplars, galleries and fixtures we ship, because those are the
reference for how to write a deck. Every other deck gets `lint:deck`, which warns and never
errors. Enforcing on an author's own file would buy consistency by spending the flexibility
the ask explicitly protects.

Two scope lines are worth stating because both were judgment calls:

- **A glyph inside a ``` fence is quoted material.** `examples/content-capacity.md` and
  `examples/deck-class-register.md` quote the CLI's overflow warning verbatim —
  `⚠ deck.md · slide 4 · capacity-overflow [cards-grid]` — and `tools/` really does print
  that. Terminal text is not a rendered surface, so "fixing" those would make the deck lie
  about what the tool prints. **Inline code stays in scope**: a backticked eyebrow is set on
  the slide.
- **`*.docs.md` is out of scope**, being prose about a component rather than a projected
  slide; so is `engineering/decisions/**`, a dated archive.

## 3. What NOT_SHAPES is for

The table carries a second list of characters considered and deliberately excluded. The
discriminator: *would a typographer set this in the running face?* An em dash, a curly quote
and a multiplication sign are glyphs every text font carries and draws in its own voice on
purpose — that is typography, and it is what the engine's own `content:'\201C'` sites are
doing. A check mark is not typography; it is an icon someone typed.

`›` (U+203A) is the interesting boundary case, and it is on the exclusion list: it is genuine
punctuation, and flagging it in an author's prose would be wrong. But two engine sites were
using it to do a CHEVRON's job — the `cycle` connector and the `eyebrow-arrow` finish — and
those were converted anyway, un-gated, because the ask names chevrons directly and because
three connectors inheriting three different faces' idea of an angle quote is the same problem
wearing punctuation's clothes.

## 4. The a11y finding — why two files are exempt, not converted

`themes/a11y-base.css` and `lib/base/base.print-textures.css` set status glyphs through
`content:`. The obvious reading is that they re-implement `--mark-check` by hand. That reading
is wrong, and the docblock above those rules already carried the measurements:

1. **They are the grayscale-safe SHAPE channel.** A CVD reader distinguishes roughly one or two
   categories by color; the glyph restates the status in shape. A print page has no color to
   fall back on at all.
2. **`content: <string> / <alt>` with an EMPTY alt is what keeps them out of the accessibility
   tree.** Measured over CDP `Accessibility.getFullAXTree` — which exposes generated content as
   its own node, so a name-only probe reports a false pass:

   | declaration | accessibility tree |
   |---|---|
   | `content: "\2713\00a0"; speak: never` | `StaticText:"✓ "` \| `StaticText:"on-track"` |
   | `content: "\2713\00a0"; speak: none` | `StaticText:"✓ "` \| `StaticText:"on-track"` |
   | `content: "\2713\00a0" / ""` | `StaticText:"on-track"` |

   `speak` has no effect on the accessibility tree in any current engine. Alt text is the
   mechanism that works, and a `background-image` has no alt at all.
3. **The glyph keeps sized with the type.** A fixed mask box does not.
4. **Each declaration is DOUBLED on purpose.** `content: <string> / <alt>` is far younger than
   a bare `content: <string>` (Chromium ~77, WebKit only in Safari 17.4), and an engine that
   cannot parse the alt form does not ignore the alt — the value is outside the property's
   grammar, so the WHOLE declaration is dropped and the shape vanishes for exactly the readers
   it exists for. The plain form first, the alt form second, is the cross-engine pair idiom the
   repo already sanctions.

Converting these would have to reproduce all four, and (2) and (4) are not reproducible with a
mask. They are exempted in `SANCTIONED_GLYPH_CHROME` with that measurement attached, the gate
fails on a stale entry, and **HARD RULE #29's own text says so** rather than asserting the
convenient thing. Under HARD RULE #18 the alternative — converting them and regressing the
shape channel for CVD and print readers — was never available.

## 5. What is still typed, and why

The brief this work started from stated that every engine-JS hit was terminal text
(`console.warn`, `--help`). **That is false.** Two chart transforms write a shape straight into
rendered markup:

| site | what it emits | why a CSS swap does not reach it |
|---|---|---|
| `chart-family.js` `AXIS_ARROW = { col: '▶', row: '▼' }` | matrix-grid axis direction marks | The label is `content: attr(data-col-axis)` on an absolutely-positioned pseudo. Both pseudos on `.matrix-grid-figure` are taken, and a mask applies to the element's whole rendering — it would clip the label text. Drawing it needs a real element in the markup. |
| `state-chart.transform.js` `` t.isSelf ? '↺' : `→ ${t.to}` `` | transition chips | Same shape: the glyph shares a text node with the destination index, so it needs its own nested element, and the DOM text change has to be weighed against read-aloud projection. |

Both are **pre-existing**, both are off the path of a CSS-and-decks change, and both need a
markup change to a transform shared by three render paths (CLI, emulator, and the runtime an
Export-to-Marp bundle takes) with parity kept across all three. Under HARD RULE #18 that is the
"found, not caused, and off-path" case: recorded here rather than pulled into this diff, and
pinned by content in `test/unit/core/shape-glyphs.test.js` so a THIRD one cannot appear quietly.

## 6. Why engine JS is not gated

The first draft of the gate had a JS arm that looked for glyphs in lines that also looked like
they touched markup. It flagged four files, and every one was a false positive: a `Symbol()`
sentinel's trailing comment in `chart-narration.js`, a prompt string in `layout/ai.js`, and two
CSS docblocks that happened to contain the word `content:`. Distinguishing a DOM string from a
log line, a `--help` banner or an AI prompt needs to parse the module. A gate that cries wolf is
a gate somebody switches off, which is worse than no gate — so the JS arm was cut and replaced
with the content pin above, which is precise because its two files are known and read.

The same reasoning cut a path-based deck scope. A folder list swept in `design/design-system.md`
and `design/forms.md` — 79 glyphs of reference PROSE, not slides. The scope is now the front
matter: a rendered surface is a file the engine will paginate.

## 7. Ratchet, honestly

`TYPED_GLYPH_BUDGET` is pinned to the MEASURED count, never above it. #1852 is the reason the
comment says so twice: a ratchet sitting 29 units above the real number let five new British
spellings walk through the US-English gate. A budget with slack is not a ratchet, it is a hole.
