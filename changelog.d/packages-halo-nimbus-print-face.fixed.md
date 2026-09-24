- **Fixed: the `halo` and `nimbus` finishes print their accent again.** On the
  export face (PDF and the Studio's image exports), halo's vignette and three of
  nimbus's four blooms ended on the solid slide color, so each painted the canvas
  over the layers beneath it and the slide printed blank white with a gray rim. Only
  the bottom layer now ends on the solid canvas; every layer above it ends on the
  canvas color at zero opacity. Finishes made in the Studio's Finish faculty had the
  same defect in their mesh and vignette layers and get the same fix.
