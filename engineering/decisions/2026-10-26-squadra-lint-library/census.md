# Lint and invariant census (2026-10-26)

Appendix to `../2026-10-26-squadra-lint-library.md`. Produced by a read-only agent pass; the class lines are its judgment calls and are stated below. About eight rules that read adjacent lines would move from C to D under a looser line, and ~70 rule ids (hub-spoke, flowchart, runtime-built ids, review-core) were not read.

Sources: lib/authoring/lint-core.js (155 literal rule ids), lib/authoring/bare-row-pill.js (1), lib/authoring/lint.js (emits none), lib/authoring/pane-lint.generated.js (data only, emits none), tools/check-ownership.js (104 check functions).

Class rule used: D = the decision reads one node (a line, a span, a directive, one front-matter key, one CSS declaration with its selector, one import, one manifest field) plus a static vocabulary; the slide's own class tokens and "outside code / in front matter" count as SCOPE, not as a second node. C = reads a second content node (another line, a count, a front-matter value from a slide rule, a measurement). R = reads other files or manifests, or checks an allowlist against the tree (stale-entry detection). Hardest class wins; "core" (ownership only) is the class of the per-item detector before allowlist/staleness.

Fix kinds: H = human-text-only (finding/message names the remedy). M:replace = structured `replace`; M:replaceLine = whole-line `replaceLine`; M:switch = `autofixable` with a transform in `fixReplacement` (lint-core.js:2646); M:suggest = `withTokenSuggestion` (lint-core.js:2629), CONDITIONAL — machine fix only when one candidate is within edit distance. All M kinds are conditional except journey-actor-shortcut, mixed-spelling (when Segno supplies a fix), spark-too-big, chart-series-name-inconsistent.

Missing from table: none; extra: none; ownership missing: none; ownership extra: none.

## Totals — deck-lint (156 = 155 lint-core + bare-row-pill)

By class: {"D":87,"C":69}

By fix kind: {"H":112,"M:switch":7,"M:replace":6,"M:suggest":29,"M:replaceLine":2} -> grouped {"human-text-only":112,"machine":44}

By language: {"yaml":43,"deck-markdown":111,"other":2}

Class x fix: {"D/human-text-only":53,"D/machine":34,"C/human-text-only":59,"C/machine":10}

## Totals — ownership checks (104)

By class (hardest): {"R":75,"D":23,"C":6}

By core detector class: {"R":36,"D":43,"C":25}

Fix kind: all 104 human-text-only (tools/check-ownership.js has no writeFileSync / --fix path; errors are strings).

Allowlist flag: {"N":8,"-":53,"S":33,"T":10} — S = a SANCTIONED_* allowlist with stale-entry detection; T = another table/ratchet that reports stale rows or an under-budget count; N = an allowlist or constant with NO stale check; - = none (a few of these still report stale VOCABULARY, e.g. checkZPlanes plane tokens, noted in the row)

By primary language: {"json":22,"css":36,"js":37,"other":9}

## D-class lint rules with NO machine fix (53)

- `autosplit-retired` — front-matter key present; severity/message branch reads deck size [findRetiredAutosplitDirective@819 (rule at L830)]
- `caption-key-retired` — fm `captions:` or comment `caption:` key; fix text is a pure rename to `say:` [findRetiredCaptionKeys@885 (rule at L889,899)]
- `say-key-case` — capitalized `Say:` comment key; fix is a case swap [findCapitalizedSayKey@917 (rule at L919)]
- `bg-ratio-unread` — one `![bg …]` line + slide-class scope (`image`) [findBgKeywordIssues@978 (rule at L995)]
- `bg-side-unread` — one `![bg …]` line + slide-class scope [findBgKeywordIssues@978 (rule at L996)]
- `paginate-unsupported-value` — fm `paginate: skip` or `hold`; fix text names the replacement value [findUnsupportedPaginateValues@1003 (rule at L1016)]
- `legacy-directive-comment` — off unless vocab.metaCut; source says the rewrite target is not readable yet [findMetaCommentIssues@1111 (rule at L1126)]
- `meta-opener-bare` — one comment's shape [findMetaCommentIssues@1111 (rule at L1135)]
- `meta-not-own-line` — one comment prefixed by list/quote marker [findMetaCommentIssues@1111 (rule at L1142)]
- `meta-block-in-container` — one comment (blank line inside, in a container) [findMetaCommentIssues@1111 (rule at L1150)]
- `unknown-map-region` — top-level bullet name vs basemap vocab (slide class picks world/us); message already computes a did-you-mean but attaches no replace [findUnknownMapRegions@3157 (rule at L3190)]
- `typed-shape-glyph` — line vs curated glyph table; grouped per slide for output only; advice varies by context [findTypedShapeGlyphs@3245 (rule at L3290)]
- `pill-shape-crowded` — one inline span + pill kernel [findCrowdedShapePills@3591 (rule at L3600)]
- `bracket-list-closed-early` — one lone span on a component slide; fix text already carries a computed repaired string [findStrayBracketAfterQuote@3647 (rule at L3657)]
- `pill-literal` — one span + pill kernel diagnose [findLiteralPills@3824 (rule at L3856)]
- `callout-spelling` — one span (`@legend` anchored) + slide class reader; fix is a swap to `@callout` [findLegendSpans@3895 (rule at L3940)]
- `spark-literal` — one span + spark kernel diagnose [findLiteralSparks@4118 (rule at L4121)]
- `tag-alias` — slide-class token `banner-tag`; fix text is a pure swap to `tag-band` [findCardTagAliases@4710 (rule at L4719)]
- `focus-spec` — one directive value vs focus grammar [lintChunksWith@4938 (rule at L5058)]
- `focus-style` — one directive value vs FOCUS_STYLES set [lintChunksWith@4938 (rule at L5070)]
- `focus-steps` — one directive value, each step vs grammar [lintChunksWith@4938 (rule at L5084)]
- `track-directive` — one directive + slide class; bare `track:` fix is a swap to `_track:` [lintChunksWith@4938 (rule at L5107,5118,5132,5141,5150)]
- `conflicting-variants` — one class line vs exclusiveAxes vocab [lintChunksWith@4938 (rule at L5306,5322)]
- `collage-bg` — per photo line (alt is `bg`), aggregated per slide [lintChunksWith@4938 (rule at L5439)]
- `collage-alt` — per photo line (empty alt) [lintChunksWith@4938 (rule at L5444)]
- `collage-tail` — per photo line tail [lintChunksWith@4938 (rule at L5455)]
- `collage-hint` — per hint word vs static vocab [lintChunksWith@4938 (rule at L5465)]
- `statement-ol-bold` — one ordered item containing `**`; fix text is a deletion of `**` [lintChunksWith@4938 (rule at L5930)]
- `block-unsupported` — class tokens + manifest blocks vocab; fix is delete the token [lintChunksWith@4938 (rule at L6076)]
- `track-list` — top-level bullet on a `topic` slide; fix deletes a list (multi-line) [lintChunksWith@4938 (rule at L6130)]
- `histogram-negative` — one row's value [findHistogramIssues@6650 (rule at L6672)]
- `histogram-dash-range` — one row pill; fix text already carries the computed `..` rewrite [findHistogramIssues@6650 (rule at L6678)]
- `ep-curve-point` — one point record; fix text carries the de-grouped number [findEpCurveIssues@6707 (rule at L6736)]
- `state-chart-v1-transition` — one line regex [findFlowchartIssues@6767 (rule at L6786)]
- `state-chart-v1-tint` — one line regex [findFlowchartIssues@6767 (rule at L6795)]
- `chart-value-malformed` — one code span in a list item/cell on a value chart [findChartMalformedValues@6997 (rule at L7020)]
- `gantt-bad-span` — one pill [findGanttIssues@7610 (rule at L7677)]
- `gantt-unknown-token` — one pill vs status vocab [findGanttIssues@7610 (rule at L7692)]
- `greeting-hardcoded-period` — one fm value regex [findBookendIssues@8171 (rule at L8188)]
- `unknown-bookend-placeholder` — placeholders in one fm value [findBookendIssues@8171 (rule at L8201)]
- `bad-render-target-value` — machine fix DELIBERATELY refused in source (polarity ambiguity) [findBadRenderTargetValues@8299 (rule at L8333)]
- `nested-render-target-key` — machine fix deliberately refused (three plausible repairs) [findNestedRenderTargetKeys@8389 (rule at L8397)]
- `unknown-fit` — same shape as the M:suggest siblings but does not call withTokenSuggestion [findFitRegister@8858 (rule at L8868)]
- `unknown-corners` — same shape as siblings, no withTokenSuggestion [findUnknownCorners@8990 (rule at L9000)]
- `retired-backdrop-key` — empty `backdrop:` map header; fix is a block rewrite [findRetiredBackdrop@9183 (rule at L9188)]
- `treatment-placement` — class tokens of one line vs PLACEMENT_REQUIRED [treatmentFindings@9405 (rule at L9430)]
- `retired-form-key` — fm `form: off`; fix is delete the line [findRetiredFormKey@9515 (rule at L9534)]
- `retired-form-token` — `no-form` token; fix is delete the token [findRetiredFormTokens@9556 (rule at L9574,9615)]
- `stray-overflow-marker` — fm key present; fix is delete the line [findStrayOverflowMarker@9648 (rule at L9654)]
- `stray-export-settings` — substring present; fix deletes a multi-line block [findStrayOverflowMarker@9648 (rule at L9662)]
- `unknown-debug-facet` — each facet word vs DEBUG_VALID (fm and _debug comments) [findBadDebugFacets@9848 (rule at L9868)]
- `lexicon-single-letter-key` — one lexicon entry key; needs the block's entry indent [findSingleLetterLexiconKeys@9899 (rule at L9932)]
- `bare-row-pill` — lib/authoring/bare-row-pill.js (not lint-core); span position on a row + site table; fix text already carries the computed `{label}` [bare-row-pill.js findBareRowPills]

## Deck-lint table

| rule | class | fix | language | detector | note |
|---|---|---|---|---|---|
| `autosplit-retired` | D | H | yaml | findRetiredAutosplitDirective@819 (rule at L830) | front-matter key present; severity/message branch reads deck size |
| `caption-key-retired` | D | H | deck-markdown | findRetiredCaptionKeys@885 (rule at L889,899) | fm `captions:` or comment `caption:` key; fix text is a pure rename to `say:` |
| `say-key-case` | D | H | deck-markdown | findCapitalizedSayKey@917 (rule at L919) | capitalized `Say:` comment key; fix is a case swap |
| `bg-ratio-unread` | D | H | deck-markdown | findBgKeywordIssues@978 (rule at L995) | one `![bg …]` line + slide-class scope (`image`) |
| `bg-side-unread` | D | H | deck-markdown | findBgKeywordIssues@978 (rule at L996) | one `![bg …]` line + slide-class scope |
| `paginate-unsupported-value` | D | H | yaml | findUnsupportedPaginateValues@1003 (rule at L1016) | fm `paginate: skip` or `hold`; fix text names the replacement value |
| `paginate-comment-retired` | D | M:switch | deck-markdown | findRetiredPaginateComments@1041 (rule at L1071) | detector D (any paginate comment); the delete-line fix is offered only after a C check (slide class vs deck `paginate:`, line occurs once) |
| `legacy-directive-comment` | D | H | deck-markdown | findMetaCommentIssues@1111 (rule at L1126) | off unless vocab.metaCut; source says the rewrite target is not readable yet |
| `meta-opener-bare` | D | H | deck-markdown | findMetaCommentIssues@1111 (rule at L1135) | one comment's shape |
| `meta-not-own-line` | D | H | deck-markdown | findMetaCommentIssues@1111 (rule at L1142) | one comment prefixed by list/quote marker |
| `meta-block-in-container` | D | H | deck-markdown | findMetaCommentIssues@1111 (rule at L1150) | one comment (blank line inside, in a container) |
| `meta-in-html-block` | C | H | deck-markdown | findMetaCommentIssues@1111 (rule at L1160) | reads the line above and two above (adjacency only) |
| `unterminated-comment` | C | H | deck-markdown | findUnterminatedComment@1230 (rule at L1248) | whole-chunk scan for last closer |
| `pane-layout` | C | H | deck-markdown | findPaneIssues@2885 (rule at L2901,2915,2934,2961,2971,2990,2997,3007,3016,3024,3032,3042) | 12 emit sites; several are D (deck `class: columns`, slash ratio, columns+rows), the rest count panes/markers |
| `pane-syntax` | C | H | deck-markdown | findPaneIssues@2885 (rule at L2948) | needs the computed pane split (scanPanes) |
| `pane-title` | C | H | deck-markdown | findPaneIssues@2885 (rule at L3056) | pane heading structure |
| `pane-insight` | C | H | deck-markdown | findPaneIssues@2885 (rule at L3069) | counts `>` across panes |
| `pane-arrange` | C | H | deck-markdown | findPaneIssues@2885 (rule at L3084) | measured fits (arrangePanes) |
| `pane-overflow` | C | H | deck-markdown | findPaneIssues@2885 (rule at L3109,3141) | capacity budgets per pane share |
| `pane-crowd` | C | H | deck-markdown | findPaneIssues@2885 (rule at L3147) | capacity budgets per pane share |
| `unknown-map-region` | D | H | deck-markdown | findUnknownMapRegions@3157 (rule at L3190) | top-level bullet name vs basemap vocab (slide class picks world/us); message already computes a did-you-mean but attaches no replace |
| `typed-shape-glyph` | D | H | deck-markdown | findTypedShapeGlyphs@3245 (rule at L3290) | line vs curated glyph table; grouped per slide for output only; advice varies by context |
| `pill-shape-crowded` | D | H | deck-markdown | findCrowdedShapePills@3591 (rule at L3600) | one inline span + pill kernel |
| `bracket-list-closed-early` | D | H | deck-markdown | findStrayBracketAfterQuote@3647 (rule at L3657) | one lone span on a component slide; fix text already carries a computed repaired string |
| `spark-too-big` | C | M:replace | other | sparkFitFindings@3743 (rule at L3753) | needs Studio browser measurements passed in (reports); not decidable from source |
| `pill-literal` | D | H | deck-markdown | findLiteralPills@3824 (rule at L3856) | one span + pill kernel diagnose |
| `legend-span` | C | H | deck-markdown | findLegendSpans@3895 (rule at L3905) | several branches cross-check the slide's table cells / mark names and a per-slide cap |
| `legend-off` | C | H | deck-markdown | findLegendSpans@3895 (rule at L3935) | span + front-matter `callout:` switch + slide class |
| `callout-spelling` | D | H | deck-markdown | findLegendSpans@3895 (rule at L3940) | one span (`@legend` anchored) + slide class reader; fix is a swap to `@callout` |
| `spark-literal` | D | H | deck-markdown | findLiteralSparks@4118 (rule at L4121) | one span + spark kernel diagnose |
| `unknown-inline-kind` | C | M:replace | deck-markdown | findUnknownInlineKinds@4146 (rule at L4166,4179) | span vs kind vocab, but the vocab includes the deck's own `plugins:` list (front matter); replace only when a near name exists |
| `mixed-spelling` | C | M:replace | deck-markdown | findMixedSpellings@4235 (rule at L4263) | deck-wide spelling frequency (segnoConsistency) |
| `trail-budget` | C | H | deck-markdown | findTrailBudgetIssues@4385 (rule at L4465) | longest word vs budget by tier count, scale, face |
| `video-not-alone` | C | H | deck-markdown | findVideoBullets@4486 (rule at L4511,4550) | adjacent-line paragraph test; inline branch is per-line |
| `video-bullet` | C | M:replace | deck-markdown | findVideoBullets@4486 (rule at L4525,4536) | slide-wide (no record anywhere) + migration; replace only for one-line clips |
| `video-slide-class` | C | H | deck-markdown | findVideoSlideClass@4567 (rule at L4581) | drawn-record test needs adjacent lines; then slide class |
| `video-extra-record` | C | H | deck-markdown | findVideoExtraRecords@4597 (rule at L4611) | count > 1 per slide |
| `tag-budget` | C | H | deck-markdown | findTagBudgetIssues@4623 (rule at L4683) | label length vs computed budget (label count, size, band) |
| `tag-alias` | D | H | deck-markdown | findCardTagAliases@4710 (rule at L4719) | slide-class token `banner-tag`; fix text is a pure swap to `tag-band` |
| `label-set-above-body` | C | H | deck-markdown | findLabelSetIssues@4767 (rule at L4849) | span position vs first body line |
| `label-set-unbound` | C | H | deck-markdown | findLabelSetIssues@4767 (rule at L4875,4897,4915) | core branches are D (span vs manifest key vocab, duplicate within span) but gated on the above-body position check |
| `focus-spec` | D | H | deck-markdown | lintChunksWith@4938 (rule at L5058) | one directive value vs focus grammar |
| `focus-style` | D | H | deck-markdown | lintChunksWith@4938 (rule at L5070) | one directive value vs FOCUS_STYLES set |
| `focus-steps` | D | H | deck-markdown | lintChunksWith@4938 (rule at L5084) | one directive value, each step vs grammar |
| `track-directive` | D | H | deck-markdown | lintChunksWith@4938 (rule at L5107,5118,5132,5141,5150) | one directive + slide class; bare `track:` fix is a swap to `_track:` |
| `code-line-clipped` | C | H | deck-markdown | lintChunksWith@4938 (rule at L5209) | measured column table per canvas/class/venue |
| `unknown-class` | D | M:suggest | deck-markdown | lintChunksWith@4938 (rule at L5271,5282) | token vs vocab; RENAMED_CLASSES branch gives the exact answer in text only, no replace |
| `conflicting-variants` | D | H | deck-markdown | lintChunksWith@4938 (rule at L5306,5322) | one class line vs exclusiveAxes vocab |
| `claim-bleed-unsafe` | C | H | deck-markdown | lintChunksWith@4938 (rule at L5347) | slide claim or deck `claim:` + manifest excludes |
| `qr-empty-payload` | C | H | deck-markdown | lintChunksWith@4938 (rule at L5385) | scans slide bullets |
| `qr-missing-payload` | C | H | deck-markdown | lintChunksWith@4938 (rule at L5388) | absence across slide |
| `qr-duplicate-payload` | C | H | deck-markdown | lintChunksWith@4938 (rule at L5391) | count across slide |
| `collage-bg` | D | H | deck-markdown | lintChunksWith@4938 (rule at L5439) | per photo line (alt is `bg`), aggregated per slide |
| `collage-alt` | D | H | deck-markdown | lintChunksWith@4938 (rule at L5444) | per photo line (empty alt) |
| `collage-count` | C | H | deck-markdown | lintChunksWith@4938 (rule at L5449) | count 4-6 |
| `collage-tail` | D | H | deck-markdown | lintChunksWith@4938 (rule at L5455) | per photo line tail |
| `collage-hero-dup` | C | H | deck-markdown | lintChunksWith@4938 (rule at L5460) | count > 1 |
| `collage-hint` | D | H | deck-markdown | lintChunksWith@4938 (rule at L5465) | per hint word vs static vocab |
| `venue-prose` | C | H | deck-markdown | lintChunksWith@4938 (rule at L5492) | word count vs venue table |
| `capacity-scale` | C | H | deck-markdown | lintChunksWith@4938 (rule at L5584,5617,5631,5656,5867) | 5 emit sites; counts/lines vs measured tables |
| `capacity-overflow` | C | H | deck-markdown | lintChunksWith@4938 (rule at L5700) | count vs capacity.hard |
| `capacity-crowd` | C | H | deck-markdown | lintChunksWith@4938 (rule at L5721) | count vs capacity.soft |
| `card-style-inline-title` | D | M:switch | deck-markdown | lintChunksWith@4938 (rule at L5894) | one bullet line shape + slide class; fixReplacement default (autofixNestedTitle) |
| `ledger-inline-title` | D | M:switch | deck-markdown | lintChunksWith@4938 (rule at L5913) | one bullet line; autofixOrderedNestedTitle |
| `statement-ol-bold` | D | H | deck-markdown | lintChunksWith@4938 (rule at L5930) | one ordered item containing `**`; fix text is a deletion of `**` |
| `split-bodyless-item` | C | M:switch | deck-markdown | lintChunksWith@4938 (rule at L5948) | item + next non-blank line (no nested child); autofixNestedTitle |
| `split-missing-headline` | C | H | deck-markdown | lintChunksWith@4938 (rule at L5965) | absence of `## ` on slide |
| `split-statement-missing-quote` | C | H | deck-markdown | lintChunksWith@4938 (rule at L5980) | absence of `> ` on slide |
| `split-compare-option-count` | C | H | deck-markdown | lintChunksWith@4938 (rule at L5995) | count must be 2 |
| `number-slot-bodyless-item` | C | H | deck-markdown | lintChunksWith@4938 (rule at L6011) | item + next line |
| `big-number-hero-heading` | C | H | deck-markdown | lintChunksWith@4938 (rule at L6029) | heading present AND zero top-level items |
| `block-unsupported` | D | H | deck-markdown | lintChunksWith@4938 (rule at L6076) | class tokens + manifest blocks vocab; fix is delete the token |
| `list-modifier-inert` | C | H | deck-markdown | lintChunksWith@4938 (rule at L6114) | two branches D (class tokens), two read the slide's top-level list kind |
| `track-list` | D | H | deck-markdown | lintChunksWith@4938 (rule at L6130) | top-level bullet on a `topic` slide; fix deletes a list (multi-line) |
| `quadrant-axis-part` | C | H | deck-markdown | findQuadrantAxisIssues@6557 (rule at L6582,6593) | first axis line before list, member parse |
| `quadrant-retired-axis` | C | M:switch | deck-markdown | findQuadrantAxisIssues@6557 (rule at L6605) | per line, but only lines before the first list item; autofixQuadrantAxis |
| `histogram-negative` | D | H | deck-markdown | findHistogramIssues@6650 (rule at L6672) | one row's value |
| `histogram-dash-range` | D | H | deck-markdown | findHistogramIssues@6650 (rule at L6678) | one row pill; fix text already carries the computed `..` rewrite |
| `histogram-bands-join` | C | H | deck-markdown | findHistogramIssues@6650 (rule at L6685) | neighboring rows |
| `histogram-log-zero` | C | H | deck-markdown | findHistogramIssues@6650 (rule at L6692) | axis + all bands |
| `ep-curve-point` | D | H | deck-markdown | findEpCurveIssues@6707 (rule at L6736) | one point record; fix text carries the de-grouped number |
| `ep-curve-duplicate` | C | H | deck-markdown | findEpCurveIssues@6707 (rule at L6745) | seen set per curve |
| `ep-curve-too-many` | C | H | deck-markdown | findEpCurveIssues@6707 (rule at L6752) | curve count |
| `state-chart-v1-transition` | D | H | deck-markdown | findFlowchartIssues@6767 (rule at L6786) | one line regex |
| `state-chart-v1-tint` | D | H | deck-markdown | findFlowchartIssues@6767 (rule at L6795) | one line regex |
| `flowchart-list-split` | C | H | deck-markdown | findFlowchartIssues@6767 (rule at L6816) | next line indent vs marker width |
| `chart-list-split-quote` | C | M:switch | deck-markdown | findChartListQuoteSplits@6887 (rule at L6914) | block sequence list/quote/list; indent fix |
| `chart-row-quote-unread` | C | H | deck-markdown | findChartRowQuotes@6937 (rule at L6970) | token tree depth |
| `chart-value-malformed` | D | H | deck-markdown | findChartMalformedValues@6997 (rule at L7020) | one code span in a list item/cell on a value chart |
| `chart-table-unescaped-pipe` | C | H | deck-markdown | findChartUnescapedPipes@7065 (rule at L7091) | row cell count vs header |
| `chart-description-unread` | C | M:replaceLine | deck-markdown | findChartDescriptionPlace@7117 (rule at L7138) | per-line for list rows; heatmap header/column forms read the table |
| `chart-series-name-inconsistent` | C | M:replace | deck-markdown | findChartSeriesNameDrift@7227 (rule at L7311) | cross-group name comparison |
| `chart-row-record-unread` | C | H | deck-markdown | findChartRowRecords@7354 (rule at L7426,7452,7479,7520) | token tree, parent rows, sibling spans |
| `journey-actor-shortcut` | D | M:replace | deck-markdown | findJourneyActorShortcuts@7575 (rule at L7589) | one span on a list row |
| `gantt-retired-delimiter` | D | M:switch | deck-markdown | findGanttIssues@7610 (rule at L7660) | one task pill; autofixGanttDelimiter |
| `gantt-bad-span` | D | H | deck-markdown | findGanttIssues@7610 (rule at L7677) | one pill |
| `gantt-unknown-token` | D | H | deck-markdown | findGanttIssues@7610 (rule at L7692) | one pill vs status vocab |
| `gantt-mixed-time` | C | H | deck-markdown | findGanttIssues@7610 (rule at L7730) | all time points on slide |
| `gantt-dangling-after` | C | H | deck-markdown | findGanttIssues@7610 (rule at L7754) | cross-task label lookup |
| `gantt-inverted-dependency` | C | H | deck-markdown | findGanttIssues@7610 (rule at L7766) | cross-task schedule math |
| `shell-fence-is-script` | C | H | deck-markdown | findShellFenceTags@7795 (rule at L7803) | whole fence body heuristics (lib/core/fence-languages.js); fix itself is a one-word tag swap |
| `code-record-orphan` | C | H | deck-markdown | findCodeRecords@7857 (rule at L7885,7896) | line above / fence below |
| `code-record` | C | H | deck-markdown | findCodeRecords@7857 (rule at L7905) | record parse is D, but reached only when a fence follows |
| `code-format-unsupported` | C | H | deck-markdown | findCodeRecords@7857 (rule at L7913) | record + following fence language |
| `code-line-range` | C | H | deck-markdown | findCodeRecords@7857 (rule at L7923,7940) | record/`_focus` vs fence line count |
| `unknown-finish` | D | M:suggest | yaml | findUnknownFinish@7957 (rule at L7967) | fm value vs injected names |
| `plugin-fence-attributes` | C | H | deck-markdown | findPluginFenceAttributes@7985 (rule at L8000) | fence info + deck `plugins:` + vocab.externalFenceOf |
| `unknown-plugin` | D | M:suggest | yaml | findUnknownPlugins@8019 (rule at L8055) | each `plugins:` name vs PLUGIN_NAMES |
| `unknown-mode` | D | M:suggest | yaml | findUnknownMode@8076 (rule at L8086) |  |
| `unknown-delivery` | D | M:suggest | yaml | findUnknownDelivery@8113 (rule at L8124) |  |
| `greeting-hardcoded-period` | D | H | yaml | findBookendIssues@8171 (rule at L8188) | one fm value regex |
| `unknown-bookend-placeholder` | D | H | yaml | findBookendIssues@8171 (rule at L8201) | placeholders in one fm value |
| `greeting-not-english` | C | H | yaml | findBookendIssues@8171 (rule at L8214) | greeting + `lang:` |
| `unknown-pace` | D | M:suggest | yaml | findUnknownPace@8230 (rule at L8254) |  |
| `bad-render-target-value` | D | H | yaml | findBadRenderTargetValues@8299 (rule at L8333) | machine fix DELIBERATELY refused in source (polarity ambiguity) |
| `nested-render-target-key` | D | H | yaml | findNestedRenderTargetKeys@8389 (rule at L8397) | machine fix deliberately refused (three plausible repairs) |
| `unknown-color-mode` | D | M:suggest | yaml | findUnknownColorMode@8433 (rule at L8450) |  |
| `deck-wide-component` | C | H | yaml | findRefusedDeckClass@8479 (rule at L8508) | component branch is D; color-mode branch reads `color-mode:` too |
| `unknown-claim` | D | M:suggest | yaml | findUnknownClaim@8528 (rule at L8538) |  |
| `unknown-stamp` | D | M:suggest | yaml | findUnknownStamp@8554 (rule at L8564) |  |
| `unknown-tone` | D | M:suggest | yaml | findUnknownToneStyle@8579 (rule at L8589) |  |
| `unknown-spectrum` | D | M:suggest | yaml | findUnknownSpectrum@8604 (rule at L8614) |  |
| `unknown-spectrum-edge` | D | M:suggest | yaml | findUnknownSpectrumEdge@8629 (rule at L8639) |  |
| `unknown-spectrum-card` | D | M:suggest | yaml | findUnknownSpectrumCard@8654 (rule at L8664) |  |
| `unknown-spectrum-card-edge` | D | M:suggest | yaml | findUnknownSpectrumCardEdge@8679 (rule at L8689) |  |
| `unknown-spectrum-trim` | D | M:suggest | yaml | findUnknownSpectrumTrim@8704 (rule at L8714) |  |
| `unknown-rule` | D | M:suggest | yaml | findUnknownRule@8729 (rule at L8739) |  |
| `unknown-inline-code` | D | M:suggest | yaml | findUnknownInlineCode@8759 (rule at L8782) |  |
| `unknown-eyebrow` | D | M:suggest | yaml | findUnknownEyebrow@8797 (rule at L8807) |  |
| `unknown-headline` | D | M:suggest | yaml | findUnknownHeadline@8822 (rule at L8832) |  |
| `unknown-fit` | D | H | yaml | findFitRegister@8858 (rule at L8868) | same shape as the M:suggest siblings but does not call withTokenSuggestion |
| `guards-renamed` | C | H | yaml | findFitRegister@8858 (rule at L8883) | reads `guards:` and `fit:` |
| `retired-logo-key` | C | M:replaceLine | yaml | findRetiredLogoKeys@8919 (rule at L8972,8981) | merges five old keys into one line |
| `unknown-corners` | D | H | yaml | findUnknownCorners@8990 (rule at L9000) | same shape as siblings, no withTokenSuggestion |
| `unknown-lift` | D | M:suggest | yaml | findUnknownLift@9015 (rule at L9025) |  |
| `spot-scale` | C | H | deck-markdown | findSpotScale@9043 (rule at L9056) | slide token vs deck `class:`/`venue:` |
| `unknown-venue` | D | M:suggest | yaml | findUnknownVenue@9076 (rule at L9087) |  |
| `unknown-chart-finish` | D | M:suggest | yaml | findUnknownChartFinish@9103 (rule at L9113) |  |
| `unknown-preset` | D | M:suggest | yaml | findUnknownPreset@9128 (rule at L9141) |  |
| `unknown-cards` | D | M:suggest | yaml | findUnknownCards@9157 (rule at L9167) |  |
| `retired-backdrop-key` | D | H | yaml | findRetiredBackdrop@9183 (rule at L9188) | empty `backdrop:` map header; fix is a block rewrite |
| `unknown-backdrop` | D | M:suggest | yaml | findUnknownBackdrop@9200 (rule at L9219,9228) | unknown-word branch suggests; second-value-on-axis branch is text only |
| `unknown-tag` | D | M:suggest | yaml | findUnknownCardTag@9247 (rule at L9265,9276) | same two branches as unknown-backdrop |
| `unknown-key` | D | M:suggest | yaml | findUnknownSettingKeys@9301 (rule at L9315) | fm key vs deck-settings table |
| `thin-card-no-ink` | C | H | deck-markdown | thinCardFindings@9372 (rule at L9379) | slide tokens + deck `image-card:` + backing math |
| `unknown-treatment` | D | M:suggest | deck-markdown | treatmentFindings@9405 (rule at L9414,9422) | `mark-at-*` branch is text-only delete |
| `treatment-placement` | D | H | deck-markdown | treatmentFindings@9405 (rule at L9430) | class tokens of one line vs PLACEMENT_REQUIRED |
| `retired-form-key` | D | H | yaml | findRetiredFormKey@9515 (rule at L9534) | fm `form: off`; fix is delete the line |
| `retired-form-token` | D | H | deck-markdown | findRetiredFormTokens@9556 (rule at L9574,9615) | `no-form` token; fix is delete the token |
| `stray-overflow-marker` | D | H | yaml | findStrayOverflowMarker@9648 (rule at L9654) | fm key present; fix is delete the line |
| `stray-export-settings` | D | H | deck-markdown | findStrayOverflowMarker@9648 (rule at L9662) | substring present; fix deletes a multi-line block |
| `author-script-defers` | C | H | other | findAuthorScriptDefers@9760 (rule at L9794) | script element extent + body API search (HTML/JS inside the deck) |
| `unknown-split` | D | M:suggest | yaml | findUnknownSplit@9815 (rule at L9825) |  |
| `unknown-debug-facet` | D | H | deck-markdown | findBadDebugFacets@9848 (rule at L9868) | each facet word vs DEBUG_VALID (fm and _debug comments) |
| `lexicon-single-letter-key` | D | H | yaml | findSingleLetterLexiconKeys@9899 (rule at L9932) | one lexicon entry key; needs the block's entry indent |
| `bare-row-pill` | D | H | deck-markdown | bare-row-pill.js findBareRowPills | lib/authoring/bare-row-pill.js (not lint-core); span position on a row + site table; fix text already carries the computed `{label}` |

## Ownership-check table

| check | class | core | flag | allowlist / stale | language | what it reads |
|---|---|---|---|---|---|---|
| `checkVariantDeclaration` | R | R | N | VARIANT_DECL_IGNORE (allowlist, no stale check) | json | manifest variants vs CSS root modifiers + transform dispatch tokens |
| `checkTagClustering` | R | R | N | SINGLETON_TAGS (no stale check; unused vocab terms ARE reported) | json | tag usage counted across all manifests |
| `checkThemeManifestCoverage` | R | R | - | none | json | themes/*.css <-> manifest bijection |
| `checkThemeManifestShape` | D | D | - | none | json | manifest vs theme.schema.json via ajv; already declarative |
| `checkThemeRoles` | R | C | - | none | json | manifest role vs the CSS's @import and token count |
| `checkThemeIdentity` | R | D | - | none | css | filename vs `@theme` directive vs manifest name |
| `checkPackageIdentity` | R | R | - | none | json | package spine vs manifest-schema sweep counts |
| `checkFinishPackages` | R | R | - | none | css | discovered finish packages vs generated region rules |
| `checkThemeRegistrationCallSites` | R | C | S | SANCTIONED_UNNAMED_THEME_REGISTRATIONS (stale: yes) | js | TypeScript AST of call sites |
| `checkThemeModes` | R | C | - | none | json | declared modes vs resolved CSS faces |
| `checkTransformerNames` | R | R | - | none | js | uniqueness across the transformer registry |
| `checkLayoutOwnership` | R | R | N | CO_OWNED_LAYOUTS (no stale check) | js | layout claimed by >1 transformer |
| `checkComponentNames` | R | R | - | none | json | duplicate names across buckets |
| `checkRelatedTargets` | R | R | - | none | json | related[] names must exist |
| `checkComponentCss` | R | R | - | none | css | top-level selector owned by >1 component |
| `checkPackedRootReach` | C | C | - | none | css | same token at :root and an over-specific root selector, within one theme file |
| `checkRetiredTokenNames` | D | D | - | none (static RETIRED_TOKEN_NAMES vocab) | css | declared token name vs retired set / -light or -dark suffix |
| `checkTypographyTokens` | D | D | - | none (static CANONICAL_FS_TOKENS) | css | declared --fs-* not canonical |
| `checkLabelVoiceFont` | R | D | S | SANCTIONED_MONO_FONTS (stale: yes, count) + LABEL_VOICE_MONO_BUDGET | css | font-family reading --font-mono |
| `checkSectionBoxOwnership` | R | D | S | SANCTIONED_SECTION_BOXES (stale: yes) | css | box declaration inside a section-owned selector (brace walker) |
| `checkSizeRegistryOwnership` | R | R | - | none | css | @size in CSS vs lib/engine/sizes.js registry |
| `checkSectionCqAnchoring` | R | D | S | SANCTIONED_SECTION_CQ (stale: yes; empty) + SECTION_CQ_BUDGET | css | cq length in a section declaration; extra arms (root-only anchor, token leaks) not read in detail |
| `checkBackgroundLayerVars` | R | D | S | SANCTIONED_BACKGROUND_LAYERS (stale: yes; empty) | css | var() in a multi-layer background shorthand |
| `checkMarginDiscipline` | R | D | S | SANCTIONED_MARGINS (stale: yes) + LAYOUT_MARGIN_BUDGET | css | nonzero margin declaration |
| `checkReadingRole` | R | C | S | SANCTIONED_READING_ROLE (stale: yes, per-file count) | css | per-file count of --fs-message/--fs-body-compact reads |
| `checkHandRolledPills` | R | C | S | SANCTIONED_PILL_READS (stale: yes, per-file count) | css | per-file count of --pill-* reads |
| `checkTypeSizeModifiers` | R | C | S | SANCTIONED_TYPE_SIZE_MODIFIERS (stale: yes, exact count) + TYPE_SIZE_MODIFIER_BUDGET | css | type-size declarations under modifier selectors (typeSizeContext not read) |
| `checkStageInsetOwnership` | R | D | S | SANCTIONED_STAGE_INSETS (stale: yes; also requires a why) | css | calc(100cqi - var(--sp-*)) shape per declaration |
| `checkZPlanes` | R | R | T | none (stale plane TOKENS are reported) | css | z-index decls vs plane tokens in base.tokens.css |
| `checkMathRendererParity` | R | D | S | SANCTIONED_KATEX_ONLY (stale: yes) | css | .katex selector without mjx-container |
| `checkCascadeLayers` | R | D | S | SANCTIONED_LAYER_BLOCKS (stale: yes; empty) + LAYER_BLOCK_BUDGET | css | @layer block / @import layer() |
| `checkHexLiterals` | R | D | S | SANCTIONED_HEX (stale: yes) + LAYOUT_HEX_BUDGET | css | hex literal outside var() fallback |
| `checkRouterBudget` | C | C | - | none (ROUTER_TOKEN_CEILING) | other | CLAUDE.md token count |
| `checkTypedGlyphs` | R | D | S | SANCTIONED_GLYPH_CHROME + SANCTIONED_GLYPH_DECKS (stale: yes) + TYPED_GLYPH_BUDGET | css | glyph in CSS content: + shipped decks (deck-markdown) |
| `checkThemeTokenParity` | R | R | - | none | css | every base palette defines REQUIRED_THEME_TOKENS |
| `checkNoSafeDefaultTokens` | R | R | S | SANCTIONED_FALLBACK_READS (stale: yes) | css | theme token vocab vs engine defaults/bare reads |
| `checkNativeRowReaders` | R | R | T | PRIVATE_ROW_READER_BUDGET (exact-count ratchet, not an allowlist) | json | manifest rows.native vs kernel calling takeRecord |
| `checkAdaptDeclarations` | R | R | - | none | json | manifest adapt.mode vs CSS/JS reflow evidence |
| `checkSolverIntentDeclared` | D | D | - | none | json | one manifest field present and well-shaped |
| `checkRenderNature` | R | R | - | none | json | manifest render vs bucket/derived family (body read in part) |
| `checkChartKernels` | R | R | - | none | json | manifest kernel block vs file exports |
| `checkChartMarks` | R | R | - | none | json | manifest mark classes written by kernel or lib |
| `checkGuideHandles` | R | R | - | none | json | handle selector classes written somewhere in lib |
| `checkMarkIdentity` | R | R | S | SANCTIONED_MARK_IDENTITY (stale: yes) | js | files writing data-label/data-value vs census |
| `checkProjectionCoverage` | D | D | - | none | json | one manifest field per bucket |
| `checkE2ESleeps` | R | C | S | SANCTIONED_E2E_SLEEPS (stale: yes) | js | TypeScript AST sleep census incl. cross-file helpers (e2e .ts) |
| `checkDiagramScopeSelectors` | R | C | - | none | css | token closure across sources, then selector check |
| `checkFrontMatterReaders` | R | D | S | SANCTIONED_FM_SCALAR_READERS (stale: yes) | js | hand-rolled front-matter reader idiom per file |
| `checkLineEndingBoundaries` | R | C | S | SANCTIONED_EOL_BOUNDARIES + SANCTIONED_EOL_NON_BOUNDARIES (stale: yes) | js | ingest idiom counts per file vs declared counts |
| `checkClassAttrReads` | R | D | S | SANCTIONED_CLASS_ATTR_READS (stale: yes; empty) | js | class-attr regex without left boundary |
| `checkPreviewHtmlSinks` | R | C | S | SANCTIONED_PREVIEW_BUILDERS + SANCTIONED_STYLE_SINK_EXEMPT (stale: yes) | js | marker present AND sanitize call present in the same file (docs/src .ts/.js) |
| `checkDocumentStyleSinks` | R | C | S | SANCTIONED_STYLE_SINK_EXEMPT (stale: yes; empty) | js | doc-assembly + style-sink markers co-occur in a file |
| `checkCssTreeRewrapSinks` | C | C | - | none | js | intra-file taint tracking prune -> <style> |
| `checkPluginMigration` | R | R | T | PLUGIN_MIGRATION_BUDGET (two-sided ratchet: under-budget is an error) | js | migration counters vs budget |
| `checkPluginPurity` | R | D | S | SANCTIONED_PURITY_HITS (stale: yes; requires justification) | js | named globals in acorn AST |
| `checkRuntimeMarkupSinks` | R | C | S | SANCTIONED_RUNTIME_MARKUP_SINKS (stale: yes) | js | sink call counts per file in lib/runtime |
| `checkSnapshotHtmlSinks` | R | C | S | SANCTIONED_SNAPSHOT_SINKS (stale: yes) | js | snapshot path files must be sanctioned + call sanitize |
| `checkMediaSourceCensus` | R | R | S | SANCTIONED_MEDIA_SOURCES (stale: yes) | js | lib/core/media-sources.js rows vs census |
| `checkPlatformSuites` | R | R | T | none (stale suite globs reported) | json | .github/platform-suites.json globs vs tree |
| `checkOpenRouterBudget` | R | D | S | SANCTIONED_OPENROUTER_SPENDERS + SANCTIONED_OPENROUTER_WORKFLOWS (stale: yes) + OPENROUTER_SCAN_EXEMPT | js | key name in docs/test/scripts/workflows (also yaml, json) |
| `checkVoiceSampleAssets` | R | R | - | none | json | voice catalog vs sample directories |
| `checkVetrinaBoundary` | D | D | N | VETRINA_SANCTIONED_DEP / adapter deps (constants, no stale) | js | each import specifier vs own folder |
| `checkStrictPackageImports` | D | D | N | allowBare param (no stale) | js | shared helper: each import specifier vs folder |
| `checkCadenzaBoundary` | D | D | N | CADENZA_SANCTIONED_DEP (no stale) | js | via checkStrictPackageImports |
| `checkTramaBoundary` | D | D | - | none | js | via checkStrictPackageImports |
| `checkMosaicoBoundary` | D | D | - | none | js | via checkStrictPackageImports |
| `checkCalcoBoundary` | D | D | - | none | js | via checkStrictPackageImports |
| `checkTavolaBoundary` | D | D | N | per-file adapter map (no stale) | js | imports + per-file adapter allowlist |
| `checkFuocoBoundary` | D | D | - | none | js | imports + triple-slash references |
| `checkVedutaBoundary` | D | D | - | none | js | imports + triple-slash references |
| `checkSuonoBoundary` | D | D | - | none | js | each import specifier vs folder |
| `checkLttBoundary` | D | D | - | none | js | via checkStrictPackageImports |
| `checkAnimaBoundary` | D | D | N | ANIMA_ADAPTER_DEPS (no stale) | js | imports vs folder + per-file adapter deps |
| `checkAjvBoundary` | D | D | - | none | js | ajv import outside tools/ |
| `checkLenteBoundary` | D | D | - | none | js | each import specifier vs folder |
| `checkSegnoBoundary` | D | D | - | none | js | each import specifier vs folder |
| `checkAudioPlaybackBoundary` | R | D | S | SANCTIONED_LEGACY_AUDIO (stale: yes; empty) | js | raw AudioContext / speak() outside Suono |
| `checkSanctionedGestures` | R | R | S | SANCTIONED_GESTURES (stale: yes, both directions) | js | TS Gesture union vs allowlist |
| `checkDensityCoverage` | R | D | S | SANCTIONED_DENSITY_EXEMPT (stale: yes) | json | manifest has density block |
| `checkCatInkDeclared` | C | C | - | none | css | theme declaring --cat-1-mark must declare 12 inks (within one file) |
| `checkCatInkFallback` | D | D | - | none | css | each var(--cat-N-ink) read carries var(--cat-N-mark) fallback (css/js/mjs) |
| `checkSyntaxContrast` | R | C | - | none | css | resolves palette inheritance, contrast math |
| `checkCodeRecede` | R | C | - | none | css | mix + contrast across themes |
| `checkCatContrast` | R | C | - | none | css | umbrella: calls four sub-checks + contrast across themes |
| `checkAgentModelPinning` | D | D | - | none | other | each .claude/agents/*.md front matter + each workflow agent() options (md, js) |
| `checkSkillFreshness` | R | R | - | none | other | design/skills/*.md counts vs source of truth |
| `checkSplitOracle` | R | R | T | none (stale oracle entries reported) | json | manifests vs blessed test/oracle/split-oracle.json |
| `checkCssSyntax` | C | C | - | none | css | full esbuild parse per file, budget 0 warnings |
| `checkUniversalTableGuard` | R | R | T | none (stale deny entries reported) | css | guard CSS deny list vs manifests |
| `checkNulBytes` | R | D | S | SANCTIONED_NUL_FILES (stale: yes; empty) | other | NUL byte in any tracked file |
| `checkCommittedPdfs` | R | R | T | PDF_OWNERSHIP rules (stale rules reported) | other | git ls-files *.pdf vs ownership rules |
| `checkFallbackContracts` | R | R | S | KNOWN_CONTRACT_DROPS + SANCTIONED_TOKEN_CONTRACTS in lib/tokens/contracts.js (stale: yes) | css | var() fallback hops in lib |
| `checkMutedTierFloors` | R | C | - | none | css | contrast floors per theme |
| `checkSyntaxSeparation` | R | C | - | none | css | CVD-simulated distance between syntax roles |
| `checkPhantomTokenReads` | R | R | T | AUTHOR_SET_ENGINE_TOKENS (stale: yes) | css | token reads vs engine declarations + runtime writers |
| `checkChangelogFragments` | D | D | - | none | other | each changelog.d file: name pattern, LF, no BOM, no headings (tools/changelog.js) |
| `checkFollowups` | R | D | - | none | other | each followups.d file shape; area must be in .github/labels.json, swimlane path must exist |
| `checkSpecParts` | R | D | - | none | other | spec/*.md spec-parts block; named paths must exist |
| `checkVerbatimDistCopies` | R | R | T | DIST_VERBATIM_COPIES table (stale entry = missing source, reported) | other | byte compare source vs dist copy (check mode only) |
| `checkLockfileOptionalPeers` | C | C | - | none | json | optional-peer annotations inside each lockfile |
| `checkFontMetricsPin` | R | R | T | GLYPH_UPPER_FONTS pin table (stale pin reported) | js | hash of font binaries vs pins in svg-label.js |
| `checkDanglingTokenReads` | R | R | S | SANCTIONED_DANGLING_TOKEN_READS (stale: yes) | css | var() reads in docs/src vs declared props in docs/lib/dist (css, ts) |
| `checkAnimaColorVocabulary` | R | R | - | none | js | SCENE_COLOR_TOKENS list vs engine-declared tokens |
| `checkSyntaxInkContrast` | R | C | - | none | js | SYNTAX_INK_TOKENS vs generated palette CSS, contrast |

## Not classified (emitted with computed rule ids, outside the 155)

- `${kind}-literal` from findLiteralPluginKinds (lint-core.js:4205) — one id per plugin inline kind (e.g. icon-literal); per-span D + kernel diagnose, H. Exact id list depends on INLINE_KINDS at runtime: UNKNOWN count.
- `unknown-${row.key}` from findUnknownSettingValues (lint-core.js:9337) — one per DECK_SETTINGS generic row (theme, size, motion, … per its docblock); D, M:suggest.
- `unknown-${key}` from findUnknownAxisRegister (lint-core.js:9442) — spark:, image-card:, logo-finish:, each plugin register; D, M:suggest.
- 31 hub-spoke-* ids from lib/core/hub-spoke-model.js lintModel (via lint-core.js:7560) and 19 flowchart-*/state-chart ids from lib/core/flowchart-grammar.js (via lint-core.js:6831): detectors live in those kernels, NOT read; class UNKNOWN.
- lib/authoring/review-core.js emits 18 more ids (label-title, wall-of-text, density-*, …): a separate review surface, not read.
