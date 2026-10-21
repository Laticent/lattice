# meta — conformance fixtures

The plugin harness (`test/unit/plugins/conformance.test.js`) runs every case below. Each `##`
heading is one case: the ` ```markdown ` fence is the input, rendered by the engine, and each
bullet is an assertion about that render:

- `renders` — the HTML contains the quoted text
- `omits` — the HTML does not contain it

## a spot footer reaches the slide

```markdown
<!-- _footer: Q3 review -->

# Results
```

- renders `data-footer="Q3 review"`
- omits `_footer`

## a spot class reaches the slide

```markdown
<!-- _class: statement -->

# One idea
```

- renders `statement`
- omits `_class`
