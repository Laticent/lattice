studio: +7
playground: +40
Two load fixes, both real code. Playground (+40): `playground-sync.ts` holds a slide-map pick while the preview is still between where the pick started and its target, so a frame stall no longer reads as the pick stopping. Studio (+7): the editor takes the shell's newest text as `latestValue`, so a view rebuilt by a layout switch never starts from a trailing render.
