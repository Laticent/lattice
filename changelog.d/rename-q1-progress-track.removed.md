- **Breaking:** `progress-rail:` is now `progress-track:`, and the `tone:` shape `rail` is now `stripe`, and `lint:deck --fix` rewrites an old deck.
- The engine no longer reads `progress-rail:` or `tone: rail`. A deck that still writes one renders that setting's
  default until `lint:deck --fix` rewrites it: `progress-rail: edge bar` becomes `progress-track: edge bar`, and
  `tone: rail` becomes `tone: stripe`. Both are `key-renamed` errors.
- The slide classes follow: `progress-rail-*` is `progress-track-*`, and `tone-rail` is `tone-stripe`. Each old class is
  an `unknown-class` error whose fix writes the new one. The class names inside an exported HTML deck change with
  them; the rendered pixels do not.
- The lint rule `unknown-progress-rail` is `unknown-progress-track`.
