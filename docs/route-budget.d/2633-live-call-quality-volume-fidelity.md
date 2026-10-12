studio: +400
playground: +16
home: +10
components: +12
getting-started: +12
The Live panel's call controls grew: the per-person quality readout (`qualityLine` and the panel rows), the Volume slider, the High fidelity switch in the microphone menu, and the one-capture-at-a-time guard in the controller; `stage.amplify` in Suono's stage is the only Web Audio addition. CI measured +272 B gz on the Studio route for these three; the later additions below brought it to +367 B, and +400 covers this head with room for gzip spread.
Given back first: nothing to give. The Trystero adapter's stats reader is the same chunk as the transport it extends, and the three features share one menu rather than adding a second.

The four small lines are one change: `PopoverContent` in the shared `components/ui/popover.tsx` gained an optional `container` prop (so the Live popovers portal into the modal sheet and scroll on a phone), and every route that ships that primitive grew by 7 to 10 B gz. CI measured playground +9, home +7, components +10, getting-started +10; the declared values leave a little room for gzip spread. Nothing to give back: it is one prop and one argument.

Later in the same PR the studio route also grew for the rest of the "Me" controls (Your audio popover with mic meter, mic level and Hearing; Your settings with what you share and your name) and for connection resilience: the Connection section (a recovery switch and Copy connection log) and the Trystero adapter's link watcher, recovery and timeline (`TrysteroOptions.recover`, `LinkEvent`). Playground went from +9 to +13 because that adapter code is shared. Nothing to give back: the controls are the feature.
