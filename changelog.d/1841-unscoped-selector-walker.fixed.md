- **The component gate's selector walker stopped reporting after a `;`-terminated
  at-rule.** `eachRule` only ever reset its selector chunk at a `}`, so
  `@import 'x';` (or `@charset`, `@layer a;`, `@namespace`) stayed glued to the
  rule that followed: the pair read as one head starting with `@`, and the
  at-rule branch discarded it — selector and all. Exactly one rule after every
  such at-rule was invisible to `findUnscopedSelectors`, which meant **zero
  findings** for a file whose first rule sat there. The walker is now
  statement-aware and quote-aware.
- **A `.name` spelled inside a quoted attribute value no longer counts as
  scoping.** `ul[data-state="} section.x "]` scopes nothing and claimed to scope
  to `.x`. `partScoped` masks quoted runs before looking for the class token — a
  class token can never live inside one. (Only reachable once the walker above
  became string-aware; fixing one without the other would have traded one
  blindness for another.)
- **An escaped quote in a class name no longer blinds the walker either.** `.a\'b`
  is a legal class name; read as a string opener it started a string that never
  closed, so the walk ran to end of input and every rule after it was invisible —
  `findUnscopedSelectors` returned nothing and `gateCss` returned `ok: true` while
  real Chromium applied the unscoped rule to the page. Escapes are honored
  everywhere now, inside a string and out, exactly as CSS honors them.
