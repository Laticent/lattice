# anima — conformance fixtures

The plugin harness (`test/unit/plugins/conformance.test.js`) runs every case below: the
` ```markdown ` fence is the input, rendered by the engine, and each bullet an assertion about the
render (`renders`, `omits`, `detect true|false`).

## an anima fence carries its spec, minified and packed

````markdown
```anima
{ "version": 1, "shapes": [] }
```
````

- renders `<div class="anima-spec" data-scene-spec="eyJ2ZXJzaW9uIjoxLCJzaGFwZXMiOltdfQ==" hidden></div>`
- omits `<pre`
- detect true

## a spec that is not JSON becomes an inert marker

````markdown
```anima
{ "version": 1,
```
````

- renders `<div class="anima-spec anima-spec-error" hidden></div>`
- omits `data-scene-spec`
- detect true
