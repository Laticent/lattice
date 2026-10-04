studio: +8584
playground: +9
home: +18

Hub-spoke's live lint ships in the Studio's eager `authoring-core` bundle: the pill grammar,
the scaling rule, the crowding envelope and the hub fit in `lib/core/hub-spoke-model.js`, so
the 25 hub-spoke warnings agree with what the chart draws. Given back first: narration loads
only `lib/core/hub-spoke-grammar.js`, not the layout half (5,337 bytes gz). The playground
and home bytes are hub-spoke's names in the shared class and component lists.
