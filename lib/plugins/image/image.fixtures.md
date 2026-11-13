# image — conformance fixtures

The plugin harness (`test/unit/plugins/conformance.test.js`) runs every case below. Each `##` heading is one case: the
` ```markdown ` fence is the input, rendered by the engine, and each bullet is an assertion about that render:

- `renders` — the HTML contains the quoted text
- `omits` — the HTML does not contain it
- `detect true` / `detect false` — what `detect(source)` must answer

## a record on an ordinary slide is a figure in its flow

```markdown
<!-- _class: content -->

## The team

`@image{photo.jpg, title="Q3 offsite"}`
```

- renders `<figure class="lat-media" data-lattice-media="image" data-size="md" data-show="none" data-lattice-title="Q3 offsite">`
- renders `<img src="photo.jpg" alt="Q3 offsite">`
- omits `<code>@image`
- omits `lat-media-caption`
- detect true

## a record on an image slide is the layout's photo panel

```markdown
<!-- _class: image -->

## The team

`@image{photo.jpg, title="Q3 offsite"}`
```

- renders `<div class="lattice-bg lattice-bg-full" data-lattice-media="image"`
- renders `role="img" aria-label="Q3 offsite"`
- renders `background-image:url('photo.jpg')`
- omits `<figure class="lat-media"`

## mirror puts the panel on the left

```markdown
<!-- _class: image mirror -->

`@image{photo.jpg}`
```

- renders `<div class="lattice-bg lattice-bg-left"`
- renders `aria-hidden="true"`

## bleed makes the picture the slide's background

```markdown
<!-- _class: content dark bleed -->

## Over the photo

`@image{photo.jpg, description="The lake at dawn"}`
```

- renders `<div class="lattice-bg lattice-bg-full" data-lattice-media="image"`
- renders `data-lattice-description="The lake at dawn"`

## the display words reach the figure

```markdown
`@image{photo.jpg, title="T", lg, frame=mat, meridian=20, grayscale, show=title, focus=top}`
```

- renders `data-size="lg" data-show="title" data-frame="mat" data-finish="meridian" data-finish-strength="20" data-tone="grayscale" data-tone-strength="full" data-focus="top"`
- renders `<figcaption class="lat-media-caption"><span class="lat-media-title" aria-hidden="true">T</span></figcaption>`
- renders `<span class="lat-media-tone" aria-hidden="true"></span><span class="lat-media-finish" aria-hidden="true"></span>`

## a deck register sets the look for every picture

```markdown
---
image: keyline nimbus=40
---

`@image{photo.jpg}`
```

- renders `data-frame="keyline" data-finish="nimbus" data-finish-strength="40"`

## a record in running text stays code

```markdown
See `@image{photo.jpg}` here.
```

- renders `<code`
- omits `data-lattice-media="image"`

## a refused address draws nothing

```markdown
`@image{"javascript:alert(1)"}`
```

- omits `data-lattice-media="image"`

## two finishes stay code

```markdown
`@image{photo.jpg, nimbus, halo}`
```

- omits `data-lattice-media="image"`

## Markdown's image is the alias, and stays an image

```markdown
![Q3 offsite](photo.jpg "The field team")
```

- renders `<img src="photo.jpg" alt="Q3 offsite" title="The field team"`
- detect false
