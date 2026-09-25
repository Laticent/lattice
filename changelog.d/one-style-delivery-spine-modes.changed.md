- The engine now names its style-delivery modes. `render(markdown, theme, { styles: 'flat' })`
  returns `flatCss`, the stylesheet for a host that shows slide content outside a slide. `'scoped'` is the
  default. An unknown mode throws instead of falling back. The browser-side `baked` mode is
  one exported function, `bakeSvg`, which the Studio's diagram bake, its PDF/PPTX rasterizer
  and `check:render` now all call.
