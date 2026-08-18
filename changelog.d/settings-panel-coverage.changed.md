- **The Studio settings panels are regrouped, and both scopes now use one vocabulary.**
  The deck tab strip is ordered by reach — Look · Chrome · General · Accent · Motion ·
  Speech — with a new **General** tab for the deck's name, language and structure, which
  also absorbs the Developer aids. The deck's **Marks** tab is renamed **Chrome**, matching
  what the slide panel has always called the same four controls; the slide panel's
  **Status** and **Decoration** tabs merge into **Marks**, split by whether a mark carries
  meaning. Low-traffic rows in each tab move behind a **More** disclosure.
- **Row descriptions are one clause.** The paragraph each row used to carry moved behind
  its ⓘ — nothing was deleted.
- **Every settings control is the same width, aligned in one column.** Each row is now
  `label | control` at an even split with the help line beneath, so dropdowns, text fields
  and segmented controls all start at the same point and share one right edge instead of
  each sizing to its own content. Switches stay right-aligned; a control too wide for its
  half drops to its own line rather than overflowing a narrow panel.
- **"Auto" always names what it resolves to** — `Auto — Cuoio`, `Auto — English`,
  `Auto — hairline`. Three different shapes were in play (a bare `Auto`, `Auto — value`,
  and a bare value), picked by a rule no reader could see.
- **Narrow settings panels stack.** Below ~320px of panel width the label, control and help
  line become three rows so the control keeps its full width instead of truncating its own
  value. It measures the panel, not the window — the docked Inspector is resizable at any
  screen size.
- **The settings panels say "Configure", not "Editing", and speak to you directly.** You edit
  a deck's content in the editor; the panel configures it, and calling both "editing" made
  them read as the same act. The scope banners now read *Configure the whole deck* / *Configure
  slide N*, with active lines beneath, and the passive descriptions across both scopes ("is
  inherited from the deck", "the export is unchanged") now name who does what.
- **"Auto" values are capitalized**, so they read as the value the control is set to rather than
  a stray sentence fragment beside "Rainbow" and "Theme default".
