# `deck/unknown-tone`

A `tone:` value that is not one of the register's names (`toneStyleNames`). The deck renders as if the key were unset, so the
author's choice does nothing and nothing says so. Ported from lint-core's `unknown-tone`; the reading is
`pick: 'loose'`, `value: 'bare'` (lib/authoring/rules/front-matter/register-value.js says what each means).

A typo close to one name is fixed to it.

```md bad typo
---
title: Q3
tone: ⟦stripee⟧
---

# A slide
```

```md fixed typo
---
title: Q3
tone: stripe
---

# A slide
```

A repeated key is read as its last line, as the engine reads it.

```md bad last-wins
---
tone: stripe
tone: ⟦stripee⟧
---

# A slide
```

```md fixed last-wins
---
tone: stripe
tone: stripe
---

# A slide
```

With no column-0 line, the first indented one stands in.

```md bad nested
---
pptx:
  tone: ⟦stripee⟧
---

# A slide
```

```md fixed nested
---
pptx:
  tone: stripe
---

# A slide
```

The old `rail` is a `key-renamed` error at column 0, which reports it there. Indented, where that rule does not look, it
stays this rule's warning, so it is never quiet.

```md bad nested-rail
---
pptx:
  tone: ⟦rail⟧
---

# A slide
```

```md fixed nested-rail
---
pptx:
  tone: stripe
---

# A slide
```

The value is read as the register reads it: quotes and a trailing comment are not part of it.

```md bad quoted
---
tone: "⟦stripee⟧"  # the deck's register
---

# A slide
```

```md fixed quoted
---
tone: "stripe"  # the deck's register
---

# A slide
```

A known name, in any case, is quiet.

```md good
---
tone: STRIPE
---

# A slide
```

A value that is not a bare name reads as none, as the engine reads it.

```md good not-a-name
---
tone: two words
---

# A slide
```

A block scalar's body is the author's text, not keys, so a line in it is never read.

```md good block-scalar
---
style: |
  tone: stripee
---

# A slide
```
