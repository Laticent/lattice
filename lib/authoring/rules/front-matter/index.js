// The front-matter register family (engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §7 step 4, the first
// family): every deck register that takes one value from a closed list, as a `deck/` rule on `lattice-deck`'s `fm-key`
// nodes. One row per rule; ./register-value.js is the reading they share, and its header says what `pick` and `value`
// mean. Each row's message and hint are lint-core's, word for word, because the reference diff compares the message.
//
// The rest of the front-matter rules (the bookends, render targets, the deck `class:`, `fit:`, `marks:`, `backdrop:`,
// the axis registers, setting keys and values, `duplicate-key`, the typography override, `fonts:`/`images:`) read more
// than one value or more than one line, and move in the family's next commit
// (followups.d/3042-p1-squadra-front-matter-register-family.md).
//
// Pure and fs-free: the Studio bundles the ruleset.

const { registerValueRule } = require('./register-value');

const useOneOf = (names) => `Use one of: ${names.join(', ')}.`;
const setTo = (key) => (names) => `Set front-matter \`${key}:\` to one of: ${names.join(', ')}.`;
const MOVED_TO_MODE = /^(sketch|sketch-clean|boardroom)$/i;

const BARE = { pick: 'loose', value: 'bare' };

const ROWS = [
  {
    ...BARE, name: 'unknown-finish', key: 'finish', vocab: 'finishNames',
    message: (v) => `'${v}' isn't a valid \`finish:\` value — the deck ignores it and draws no backdrop.` + (MOVED_TO_MODE.test(v) ? ` '${v}' moved to \`mode:\`.` : ''),
    hint: (names, v) => (MOVED_TO_MODE.test(v) ? `Write \`mode: ${v.toLowerCase()}\` instead.` : useOneOf(names)),
  },
  { ...BARE, name: 'unknown-mode', key: 'mode', vocab: 'modeNames', message: (v) => `'${v}' isn't a valid \`mode:\` value — the deck ignores it and uses the \`boardroom\` mode.`, hint: useOneOf },
  { ...BARE, name: 'unknown-claim', key: 'claim', vocab: 'claimNames', message: (v) => `'${v}' isn't a valid \`claim:\` value — the deck ignores it and uses \`framed\`, the default.`, hint: useOneOf },
  { ...BARE, name: 'unknown-stamp', key: 'stamp', vocab: 'stampStyleNames', message: (v) => `'${v}' isn't a valid \`stamp:\` value — the deck ignores it and uses the default \`tab\` shape.`, hint: useOneOf },
  { ...BARE, name: 'unknown-tone', key: 'tone', vocab: 'toneStyleNames', message: (v) => `'${v}' isn't a valid \`tone:\` value — the deck ignores it and uses the default \`rail\` shape.`, hint: useOneOf },
  { ...BARE, name: 'unknown-spectrum', key: 'spectrum', vocab: 'spectrumNames', message: (v) => `'${v}' isn't a valid \`spectrum:\` value — the deck ignores it and uses the default rainbow.`, hint: useOneOf },
  { ...BARE, name: 'unknown-spectrum-edge', key: 'spectrum-edge', vocab: 'spectrumEdgeNames', message: (v) => `'${v}' isn't a valid \`spectrum-edge:\` value — the deck ignores it and uses the default \`top\` bar.`, hint: useOneOf },
  { ...BARE, name: 'unknown-spectrum-card', key: 'spectrum-card', vocab: 'spectrumCardNames', message: (v) => `'${v}' isn't a valid \`spectrum-card:\` value — the deck ignores it and draws no card rail.`, hint: useOneOf },
  { ...BARE, name: 'unknown-spectrum-card-edge', key: 'spectrum-card-edge', vocab: 'spectrumCardEdgeNames', message: (v) => `'${v}' isn't a valid \`spectrum-card-edge:\` value — the deck ignores it and uses the default \`left\` rail.`, hint: useOneOf },
  { ...BARE, name: 'unknown-spectrum-trim', key: 'spectrum-trim', vocab: 'spectrumTrimNames', message: (v) => `'${v}' isn't a valid \`spectrum-trim:\` value — the deck ignores it and leaves the structural accents plain.`, hint: useOneOf },
  { ...BARE, name: 'unknown-rule', key: 'rule', vocab: 'ruleNames', message: (v) => `'${v}' isn't a valid \`rule:\` value — the deck ignores it and uses the default heading underline.`, hint: useOneOf },
  { ...BARE, name: 'unknown-eyebrow', key: 'eyebrow', vocab: 'eyebrowNames', message: (v) => `'${v}' is not a known eyebrow value — the deck would silently render the bare label`, hint: setTo('eyebrow') },
  { ...BARE, name: 'unknown-headline', key: 'headline', vocab: 'headlineNames', message: (v) => `'${v}' isn't a valid \`headline:\` value — the deck ignores it, and each layout keeps its own heading alignment.`, hint: useOneOf },
  // lint-core never attached a suggestion to `corners:` (`corners: round` is two edits from `rounded`, past the bound
  // for a five-letter word, so it would rarely fire); the row keeps it without one rather than invent a fix.
  { ...BARE, name: 'unknown-corners', key: 'corners', vocab: 'cornersNames', suggest: false, message: (v) => `'${v}' is not a known corners value — the deck would silently render square`, hint: setTo('corners') },
  { ...BARE, name: 'unknown-lift', key: 'lift', vocab: 'liftNames', message: (v) => `'${v}' is not a known lift value — the deck would silently render flat`, hint: setTo('lift') },
  { ...BARE, name: 'unknown-split', key: 'split', vocab: 'splitNames', message: (v) => `'${v}' isn't a valid \`split:\` value — the deck ignores it and uses \`headings\`, which also starts a slide at each extra \`#\` or \`##\`.`, hint: useOneOf },
  { pick: 'loose', value: 'scalar', name: 'unknown-inline-code', key: 'inline-code', vocab: 'inlineCodeNames', message: (v) => `'${v}' is not a known inline-code value — the deck would keep rendering pills and marks`, hint: setTo('inline-code') },
  {
    pick: 'loose', value: 'venue', name: 'unknown-venue', key: 'venue', vocab: 'venueNames',
    message: (v) => `'${v}' is not a known venue — the deck would silently render at its default size`,
    hint: (names) => `Set front-matter \`venue:\` to one of: ${names.join(', ')} (4–6 people is huddle, 10–30 is conference, 50 or more is hall).`,
  },
  { pick: 'top', value: 'scalar', name: 'unknown-preset', key: 'preset', vocab: 'presetNames', message: (v) => `'${v}' isn't a valid \`preset:\` value — the deck ignores it, and no preset is applied.`, hint: useOneOf },
  { pick: 'loose', value: 'scalar', name: 'unknown-pace', key: 'pace', vocab: 'paceNames', message: (v) => `'${v}' isn't a valid \`pace:\` value — the deck ignores it, and playback uses each viewer's own setting.`, hint: useOneOf },
  { pick: 'loose', value: 'scalar', name: 'unknown-delivery', key: 'delivery', vocab: 'deliveryNames', message: (v) => `'${v}' isn't a valid \`delivery:\` value — the deck ignores it and uses \`restrained\`, the default.`, hint: useOneOf },
  { pick: 'top', value: 'scalar', name: 'unknown-color-mode', key: 'color-mode', vocab: 'colorModeNames', message: (v) => `'${v}' isn't a valid \`color-mode:\` value — the deck ignores it and uses the theme's default colors.`, hint: useOneOf },
];

const rules = ROWS.map(registerValueRule);

module.exports = { rules, ROWS };
