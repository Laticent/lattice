# `deck/unknown-venue`

A `venue:` value that is not one of the register's names (`venueNames`). The deck renders as if the key were unset, so the
author's choice does nothing and nothing says so. Ported from lint-core's `unknown-venue`; the reading is
`pick: 'loose'`, `value: 'venue'` (lib/authoring/rules/front-matter/register-value.js says what each means).

A typo close to one name is fixed to it.

```md bad typo
---
title: Q3
venue: ⟦laptopp⟧
---

# A slide
```

```md fixed typo
---
title: Q3
venue: laptop
---

# A slide
```

A repeated key is read as its last line, as the engine reads it.

```md bad last-wins
---
venue: laptop
venue: ⟦laptopp⟧
---

# A slide
```

```md fixed last-wins
---
venue: laptop
venue: laptop
---

# A slide
```

With no column-0 line, the first indented one stands in.

```md bad nested
---
pptx:
  venue: ⟦laptopp⟧
---

# A slide
```

```md fixed nested
---
pptx:
  venue: laptop
---

# A slide
```

The value is read as the register reads it: quotes and a trailing comment are not part of it.

```md bad quoted
---
venue: "⟦laptopp⟧"  # the deck's register
---

# A slide
```

```md fixed quoted
---
venue: "laptop"  # the deck's register
---

# A slide
```

A known name, in any case, is quiet.

```md good
---
venue: LAPTOP
---

# A slide
```

A block scalar's body is the author's text, not keys, so a line in it is never read.

```md good block-scalar
---
style: |
  venue: laptopp
---

# A slide
```
