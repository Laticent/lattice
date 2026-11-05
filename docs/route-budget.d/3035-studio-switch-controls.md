studio: +440
The Studio's new Content tab (Deck and Slide Settings) ships its five switch rows, their help text and the Auto / On / Off writers, so every switch in lib/core/switches.mjs has a control. Given back first: the where-each-switch-lives table (`SWITCH_HOMES`) moved to switch-homes.ts, which only its test imports, taking the growth from 1586 to 440 bytes.
