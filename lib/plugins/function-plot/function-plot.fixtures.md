# function-plot — conformance fixtures

The plugin harness (`test/unit/plugins/conformance.test.js`) runs every case below. Each `##`
heading is one case: the ` ```markdown ` fence is the input, rendered by the engine, and each
bullet is an assertion about that render (`renders`, `omits`, `detect true|false`). On every case
the harness also checks that `detect` finds every fence this plugin's table would take. The
browser half (`function-plot.hydrate.js`) is exercised by `test/unit/plugins/hydrate-host.test.js`.

## a functionplot fence becomes a pending placeholder carrying its config

````markdown
```functionplot
{ "data": [{ "fn": "x^2" }] }
```
````

- renders `<div class="functionplot" data-lattice-hydrate="function-plot"`
- renders `data-lattice-config="eyAiZGF0YSI6IFt7ICJmbiI6ICJ4XjIiIH1dIH0K"`
- renders `data-lattice-settle="pending"`
- omits `<pre`
- detect true

## the deprecated latticeplot alias renders the same placeholder

````markdown
```latticeplot
{ "data": [{ "fn": "x^2" }] }
```
````

- renders `data-lattice-hydrate="function-plot"`
- renders `data-lattice-config="eyAiZGF0YSI6IFt7ICJmbiI6ICJ4XjIiIH1dIH0K"`
- detect true

## a JSON code block is not a plot

````markdown
```json
{ "data": [{ "fn": "x^2" }] }
```
````

- omits `data-lattice-hydrate`
- renders `<pre`
- detect false

## markup in the config cannot escape the attribute

````markdown
```functionplot
{ "title": "<script>alert(1)</script>\" onload=\"x" }
```
````

- omits `<script>alert`
- omits `onload="x`
- detect true

## a plot inside a blockquote is found

````markdown
> ```functionplot
> { "data": [{ "fn": "x" }] }
> ```
````

- renders `data-lattice-hydrate="function-plot"`
- detect true
