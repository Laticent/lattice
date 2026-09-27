# anima

Carry an [Anima](../../../docs/src/lib/anima/) scene from a ` ```anima ` fence to the `scene`
slide. The fence body is a scene spec (JSON); the plugin packs it onto the slide, and the docs
site's Anima host plays it on the HTML and present surfaces. The PDF keeps the scene's authored
poster, a still SVG.

This is a **plugin** (`engineering/decisions/2026-09-27-plugin-system.md`) with one contribution,
a fence. The `scene` slide class (`lib/components/imagery/scene/scene.docs.md`) is the layout built
around it and declares `"plugins": { "requires": ["anima"] }`; author scenes through that page.

## Authoring

````markdown
<!-- _class: scene -->

## The request path.

```anima
{ "version": 1, "shapes": [ … ] }
```
````

## What it renders

A ` ```anima ` fence becomes `<div class="anima-spec" data-scene-spec="…" hidden>`, the spec
minified and packed as base64. `scene.transform.js` lifts that attribute onto the slide and
removes the div. The spec is transport only here: the Anima host validates it (`parseScene`)
before it compiles or mounts anything.

## Failure behavior

A body that is not JSON renders an inert, hidden marker (`anima-spec-error`) and the poster stands.
With the plugin disabled the fence is an ordinary code block showing the spec. On an Export to
Marp render it is a code block too.

## What the plugin contributes

| Role file | What it holds |
|---|---|
| `anima.manifest.json` | the `anima` fence |
| `anima.render.js` | the fence renderer |
| `anima.fixtures.md` | the conformance cases |
