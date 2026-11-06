---
status: shipped
summary: Durable tracker for the 29 polish + feature items a live mobile/landscape review of the Studio surfaced, grouped into workstreams G1–G8. All eight are closed. The last three key-gated items (theme AI, component AI, cloud voice) were verified on a live OpenRouter key on 2026-11-06 (#610); browser speechSynthesis was answered by the earlier read-aloud decision rather than built. One engine follow-up (G5 chart hues) remains, off-path.
---

# Studio polish backlog (mobile review, 2026-06-28)

A live review of the Studio (`lattice.style`) on mobile/landscape surfaced 29
polish + feature items. They are grouped into cohesive workstreams, each shipped
as its own PR with merge sign-off. This doc is the durable tracker; delete it once
the backlog is cleared.

**Order:** G1 → G2 → G6 → G3 → G4 → G7 → G5 → G8 (visible no-key polish first;
then repair the AI backbone so the AI-chat/voice features sit on a verified model
layer; library/zip after the studios settle save/share; perf last, on the finished
thing). A group may split into two PRs if a sub-item balloons.

## G1 · Shell, responsive & preview  *(no key)*
- **Distinct drawer icons** — the two panel toggles read as "a drawer" twice; give
  the Inspector and Architect toggles semantically distinct icons.
- **Delete confirms** — the slide-toolbar trash deletes with no confirmation.
- **Preview real-estate / padding** — re-evaluate after the aspect fix; check the
  landscape "bleed off the right edge".
- **Swipe nav (mobile) + verify desktop wheel/scroll** — the preview has zero
  touch/wheel handlers today.
- **Icon-only buttons at compact widths** — Present / Share / Insert / Fix all /
  Markdown carry text labels that crowd a phone row.
- **Un-squish the user avatar** — the "SA" avatar renders as an oval; hold a fixed
  circular size (`shrink-0`, `aspect-square`).
- **Slide-toolbar arrows** — they are REORDER ("Move slide left/right"), but read as
  navigation and don't change the viewed slide. Disambiguate (clear move icons) and
  give real nav (swipe + the preview-header arrows).
- **Speaker Notes → own drawer** — move it out of the Deck Inspector into a
  dedicated drawer, triggered from the Edit/Preview row.
- **Preview reflects the selected Size's aspect ratio** — the card is hardcoded
  `aspect-video` (and the status bar hardcodes "16 : 9") regardless of `size:`.
  Canonical size→dims: `docs/src/playground/deck-sizes.js` `SIZE_OPTIONS` +
  `lib/_theme.css` `@size` table.

## G2 · Theme selection & light/dark  *(no key)*
- All themes incl. the **AA / CVD colorblind-safe** palettes in the picker (today a
  curated 8 only).
- A **light/dark mode toggle** (engine already honors `<html data-mode>`; the
  footer shows the mode but there's no control).
- The theme control becomes a **grouped dropdown**: Curated / Fabricated (saved) /
  AA / the rest — everywhere (topbar menu + Inspector Look).
- **Theme naming** mirrors component creation — an explicit name field, no magic.

## G3 · Theme Studio depth  *(AI part needs key)*
- ✅ **Editable + labeled** engine-derived contract — a labeled role table (Background,
  Surface, Border, ink trio, Accent + wash, signals), each with a Light AND Dark well;
  a click pins a per-side override on top of the derivation, the WCAG audit re-checks it
  live, and a reset restores the engine value. *(#48 — shipped)*
- ✅ **Light vs dark curation** made explicit by the same two-column contract table — you
  pick light, the engine derives an AA-safe dark, override either side. *(#49 — shipped)*
- ✅ **AI "describe a look"** → generate a theme, AA-compliant via
  `deriveTheme`/`auditBoth`. *(#47 — shipped; verified on a live key 2026-11-06, Haiku and
  Sonnet: `2026-11-06-studio-byok-key-lifecycle.md` §6)*
- ✅ Theme **naming consistent with Component** — no magic default; you name it, Save is
  disabled until you do. *(#57 — shipped)*
- ✅ Save/Export as **icon buttons on the Studio header row** (theme tab). *(#58 — shipped;
  the Component-tab header equivalent rides with G4.)*
- ✅ **Editable data-viz band on a live canvas** (G3b — emerged from review: "what about the
  cat/band colours charts + Mermaid use?"). The 8 chart series + 12 categorical fill/mark
  pairs + diagram/chart-state tokens are edited on a slide·pie·Mermaid live canvas with a
  docked select-and-edit tray (light/dark wells for paired tokens, one for single), per-token
  reset, WCAG re-audit. Iteration 2 of 5 mocked directions; responsive 3-up/stacked.
- ✅ **Studio Mermaid goes local** — `single-slide-render` gains `mermaidUrl`; the Studio +
  presenter use the committed `mermaid-v11.min.js` (Export bundle), no jsdelivr CDN. Principle:
  the Studio uses local engine assets, not third-party CDNs.

## G4 · Component Studio depth  *(AI part needs key)*
- ✅ Rename **"Layout" → "Component"** everywhere user-facing (tab, headers, launcher,
  command palette). *(#50 — shipped)*
- ✅ **CodeMirror** w/ syntax highlighting for the CSS + skeleton fields — a shared
  `CodeField` (css + markdown) reusing the deck editor's theme (`editor-theme`), with a
  palette-cohesive `HighlightStyle` (light + dark) and a `<textarea>` fallback for jsdom.
  *(#51 — shipped)*
- ✅ **AI "describe a component"** → generate scoped, palette-blind CSS + skeleton,
  gated by `gateCss`/`skeletonInvokes`. *(#52 — shipped; verified on a live key 2026-11-06,
  gate-clean on Haiku and Sonnet: `2026-11-06-studio-byok-key-lifecycle.md` §6)*

## G5 · Asset library & sharing  *(no key)*
- ✅ **Unify** the save/share model across themes + components — one Library with a
  consistent apply/insert · share · delete flow. *(#54 — shipped)*
- ✅ **Zip-share contract** — the `lattice-asset/1` envelope (manifest + css +
  theme `showcase.pdf` + README; bundle = `themes/`/`components/`), reconciled with
  the `.lattice` deck format. `engineering/decisions/2026-06-29-lattice-asset-share.md`.
  *(#55 — shipped)*
- ✅ A **unified Library** drawer to browse/search/filter/apply/insert/share/delete
  all saved themes + components, with zip import/export. *(#56 — shipped)*
- ⏭️ Follow-up (engine, off-path): `serializeTheme` should emit `--chart-cat-N-hue`
  so a derived theme renders piechart/quadrant/progress coloured standalone (the
  showcase uses `journey` to sidestep it for now).

## G6 · AI models & spend  *(verify w/ live key)*  ✅ shipped — #610
- ✅ **Model picker + curated grouping** in Workspace; default to **Claude Sonnet**.
  A React port of the Drawing Board accordion (search + Featured/Value/Free/All lenses,
  vendor-grouped priced rows, `vision` badge), reusing the SAME curated lists — extracted
  to a shared `or-catalog.js` so the two surfaces can't drift (HARD RULE #1/#15).
- ✅ **Restore the local/on-device tier** — a Cloud / On-device control surfacing the
  architect ladder the Studio dropped: browser built-in (Prompt API) · WebLLM (~1GB) ·
  universal Transformers.js (~350MB), with download progress, via the adapter's
  `summon`/`loadUniversal`/`setTier`.
- ✅ **Realtime, accurate spend** — the Spend tab now shows the authoritative OpenRouter
  account balance (`$X left · $Y used` via `openRouterAccount()`) beside the live per-session
  tally, replacing the broken local "all-time" that always read $0. Also fixed the status hook
  so the account network call no longer blocks the tier/picker render.

## G7 · Real voice / TTS  ✅ closed — #610
- ⛔ **Browser TTS** — answered by an earlier decision, not built: raw `speechSynthesis` is
  banned in the product as a per-device lottery (`2026-06-14-read-aloud-kokoro.md`, which
  predates this item). The voice ladder is OpenRouter → on-device Kokoro → captions.
- ✅ **OpenRouter TTS** wired (`ai/tts-catalog.js`, `TtsSettings.tsx`) and verified on a live
  key 2026-11-06: `/audio/speech` returned a 2.1 s `audio/mpeg` clip at speech-level energy
  (`2026-11-06-studio-byok-key-lifecycle.md` §6). How it sounds to a listener, and the
  narrated-Present timing claims, stay open on #1398.

## G8 · Performance  *(no key)*  ✅ shipped — #43
- ✅ **Profiled first; the premise didn't hold.** The "3-second hang" was largely a
  Vite **dev-server** artifact (`jsxDEV` + unbundled modules, ~50× inflated); in
  production per-keystroke blocking was ~53 ms. The two paths slated for **web
  workers** — theme derivation (0.5 ms) and lint (0.006 ms) — are sub-millisecond,
  so **no worker pays**; the engine preview render's heavy slice is DOM-bound and
  can't leave the main thread.
- ✅ **Typing → preview** no longer re-renders the engine every keystroke: an opt-in
  trailing **debounce** on the shared `DeckPreview` (prod 53 ms → 0 ms median
  blocking), plus closing an active-edge effect that leaked an un-debounced render.
- ✅ **Export rasterization** (the real freeze): per-slide **progress** (the Studio
  passed `onStatus: undefined`) + a **yield between slides** so the tab paints and
  stays responsive — bytes unchanged. `2026-06-29-studio-render-debounce.md`.

## Deferred · Security decision (no build yet)
- **Transformer-JS authoring** in the Component Studio is a real RCE/XSS surface
  (reads storage, can exfiltrate the OpenRouter key, embeds in shared decks). Only
  with a real sandbox — a locked-down Worker (no DOM/network/storage) or a curated
  allowlisted DSL — and never auto-running a transformer from an imported deck.
  Needs its own threat model + decision doc before any implementation.
