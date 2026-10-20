# status-card

A status badge and a detail table, drawn from a short note. The demo for host slots (`lib/packages/_demo-host-slots/host-slots.md`).

The renderer returns `{ html, data }`. Its `html` holds `${status}`, `${title}` and `${detail}` where the values should
show; the host checks each value against the fields in the manifest and fills the slots. A word, number, flag or text
value shows as escaped plain text, and a markdown value shows as the host's own HTML (bare tags, no attributes). A slot works in
visible text only, never inside an attribute such as `href` or `style`. A text value may not hold a tag: the host refuses it
and disables the plugin for the render.

## Authoring

````markdown
```status-card
status: late
title: Vendor contract

| Item | Owner |
|---|---|
| Legal review | Dana |
```
````

## Failure behavior

A value outside its declared field disables the plugin for the render. Its blocks keep their source and say why.
