- **Breaking:** the journey chart reads standard Segno only, so the `` `@sales` `` actor shortcut is
  gone. Write a task's second actor as a second step record, `` `{who=sales}` ``. A leftover `@name`
  span renders as code and drops the actor, so `lint:deck` warns on it (`journey-actor-shortcut`)
  and `lint:deck --fix` rewrites it. Every shipped deck moved and renders byte-identically.
