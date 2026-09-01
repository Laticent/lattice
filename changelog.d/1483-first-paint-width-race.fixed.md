- The docs e2e case that guards the Playground editor pane's width no longer dies on a TypeError
  when it loses a hydration race. It read `boundingBox()` straight after a `domcontentloaded`
  navigation, and the panel group flickers as it mounts — so the read could land on a detached node
  and fail with `Cannot read properties of null` instead of on the width it exists to assert. The
  box now comes from the same polled call that proves the pane is laid out.
