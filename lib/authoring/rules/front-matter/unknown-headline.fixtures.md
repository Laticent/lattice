# `deck/unknown-headline`

A `headline:` value that is not one of the register's names (`headlineNames`). The deck renders as if the key were unset, so the
author's choice does nothing and nothing says so. Ported from lint-core's `unknown-headline`; the reading is
`pick: 'loose'`, `value: 'bare'` (lib/authoring/rules/front-matter/register-value.js says what each means).

A typo close to one name is fixed to it.

```md bad typo
---
title: Q3
headline: ⟦autoo⟧
---

# A slide
```

```md fixed typo
---
title: Q3
headline: auto
---

# A slide
```

A repeated key is read as its last line, as the engine reads it.

```md bad last-wins
---
headline: auto
headline: ⟦autoo⟧
---

# A slide
```

```md fixed last-wins
---
headline: auto
headline: auto
---

# A slide
```

With no column-0 line, the first indented one stands in.

```md bad nested
---
pptx:
  headline: ⟦autoo⟧
---

# A slide
```

```md fixed nested
---
pptx:
  headline: auto
---

# A slide
```

The value is read as the register reads it: quotes and a trailing comment are not part of it.

```md bad quoted
---
headline: "⟦autoo⟧"  # the deck's register
---

# A slide
```

```md fixed quoted
---
headline: "auto"  # the deck's register
---

# A slide
```

A known name, in any case, is quiet.

```md good
---
headline: AUTO
---

# A slide
```

A value that is not a bare name reads as none, as the engine reads it.

```md good not-a-name
---
headline: two words
---

# A slide
```

A block scalar's body is the author's text, not keys, so a line in it is never read.

```md good block-scalar
---
style: |
  headline: autoo
---

# A slide
```
