# video — conformance fixtures

The plugin harness (`test/unit/plugins/conformance.test.js`) runs every case below. Each `##`
heading is one case: the ` ```markdown ` fence is the input, rendered by the engine, and each
bullet is an assertion about that render:

- `renders` — the HTML contains the quoted text
- `omits` — the HTML does not contain it
- `detect true` / `detect false` — what `detect(source)` must answer

## a record on its own line draws a poster figure

```markdown
<!-- _class: video -->

## Watch the tour

`@video{"https://youtu.be/dQw4w9WgXcQ", title="The 90-second tour"}`
```

- renders `data-lattice-media="video"`
- renders `href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"`
- renders `<figcaption>The 90-second tour</figcaption>`
- omits `<code>@video`
- detect true

## a record inside a sentence stays code

```markdown
<!-- _class: content -->

## Notes

See `@video{"https://youtu.be/dQw4w9WgXcQ"}` for the clip.
```

- renders `<code>@video{`
- omits `data-lattice-media`
- detect true

## an address that is not a known video host draws nothing

```markdown
<!-- _class: video -->

`@video{"https://attacker.example/?d=secret"}`
```

- renders `<code>@video{`
- omits `attacker.example/?d=secret"`
- omits `data-lattice-media`
- detect true

## a deck without the record is not a video deck

```markdown
## Plain

Nothing here.
```

- detect false
