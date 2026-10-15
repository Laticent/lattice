# code-format — conformance fixtures

The plugin harness (`test/unit/plugins/conformance.test.js`) runs every case below through the
engine. Formatting itself happens before the engine (the bake on the CLI, `ensure-code-format.ts` in
the docs site), so these cases pin `detect`, which decides whether that pass runs, and that the
engine renders a formatting deck unchanged; `test/unit/plugins/code-format.test.js` pins the output.

## a record that asks for formatting is detected

````markdown
`@code{format}`

```ts
const a={b:1}
```
````

- renders `language-ts`
- detect true

## a deck default that asks for formatting is detected

````markdown
---
code: numbers, format
---

```ts
const a={b:1}
```
````

- detect true

## a deck that formats nothing is not

````markdown
`@code{numbers}`

```ts
const a = 1;
```
````

- detect false
