---
status: shipped
summary: Durable, cited source-of-truth backing the public comparison page — Lattice versus AI deck generators and the field
---

# Competitive analysis — Lattice vs. the field (2026-06-14)

Durable source-of-truth for the public comparison page (`docs/src/pages/comparison.astro`).
Research conducted 2026-06-14 via fan-out web search (18 tools, 4 buckets, plus a
cross-cutting evidence sweep). Every load-bearing claim on the page traces back to a
citation here. **Tone contract: honest, fair, opinionated.** We credit each rival's real
strengths, make Lattice's deterministic/boardroom case with evidence, and concede our own
warts. If a claim isn't sourced or is contested, it is flagged — do not harden it on the page.

> Caveat that colours the whole file: many of the sharpest critiques live on
> competitor/affiliate review blogs (Alai, Plus AI, SlideGMM, Deckary, SlidePeak, eesel).
> They are credible on *the problem statement* and on *self-conceded trade-offs*; their
> superlatives are marketing. Where possible we lean on first-party docs, primary
> journalism, and hands-on tests. Verbatim Reddit/G2/Trustpilot bodies were largely
> 403-blocked; "Reddit quotes" are paraphrases relayed through aggregators unless noted.

---

## 1. The thesis (the editorial spine)

**Speed and control are the same coin.** The design choices that make AI generators fast —
auto-layout, web-first rendering that flattens on export, and stochastic whole-artifact
generation — are *the same choices* that produce their weaknesses: broken exports, brand
drift, sameness, and unreproducibility. You cannot have one without the other.

The clean resolution (literature-backed, not marketing): **decouple the layers.** Let a
probabilistic model draft the *content*; make the *rendering* deterministic. "AI writes the
words; a deterministic engine renders them." This is the regulated-AI distinction between a
probabilistic reasoning layer and a deterministic decision/rendering layer ("functional
determinism", MightyBot). It is exactly what AI generators *don't* do — they couple content,
facts, and design and get each only *mostly* right, which is the worst failure profile for a
deck where one invented number poisons trust in the rest.

Anchor quotes (both strong, both quotable on the page):
- *"A beautiful slide with a confident-looking statistic and no citation is just an opinion
  with good typography."* — Medium fact-check, Feb 2026.
- *"When a model produces a different output for the same input on consecutive runs, that is
  not a feature — it is a compliance violation."* — MightyBot, *What is Deterministic AI*.

Reproducible-builds framing to borrow: a reproducible build re-run with the same inputs
yields bit-for-bit identical output "regardless of who runs the build or where and when",
forming "a chain of trust" (reproducible-builds.org). Map: `same Markdown + same theme
tokens → identical PDF`.

**Honesty guardrail (from the research):** the determinism/version-control critique is
*weak as a voiced end-user complaint* — real users don't say "it's not diffable", they
"regenerate roulette" and complain it "ignores my uploaded template". So on the page we make
the engineering argument *ourselves*, supported by those user-voiced proxies; we do **not**
claim "users widely demand git-diffable decks".

---

## 2. What Lattice actually is (grounding — be honest about warts)

Sourced from the repo (README.md, CLAUDE.md, AGENTS.md, design/, engineering/,
CHANGELOG.md, dist/docs/components.json, themes/).

- **Input/output:** Marp-flavored Markdown → PDF (vector, selectable text), PPTX, PNG (2×),
  HTML. README claims every format is **pixel-identical** to the others (README.md:201).
- **Component system:** **53 components / 12 buckets** (anchor, statement, inventory,
  comparison, progression, evidence, imagery, chart, diagram, math, code, legal). Source:
  `dist/docs/components.json`, `lib/components/`.
- **Themes:** **14 palettes** (each with a dark variant): indaco, cuoio, ardesia, atelier,
  brina, burgundy, carbone, carta, concrete, crepuscolo, laguna, magnolia, mustard, onyx.
- **Token system:** every colour via `var(--token)`; palette-blind layouts; WCAG-AA verified
  across every text-bearing surface in every palette (README.md:15-16).
- **Determinism:** owned engine (`lib/engine/`), **Marp dependency dropped at v1.0.0**
  (CHANGELOG `## Removed`, `-42M` install, zero `@marp-team` imports); semantic-invariant
  suite covers 53/53 components (engineering/marp-independence.md §6); reported 3–5× faster
  render than marp-core (§3).
- **Agent-authorable:** machine catalog (`dist/docs/components.json`), shared deterministic
  linter (`lib/authoring/lint-core.js`), `AGENTS.md` authoring contract.
- **License:** MIT. Runs offline/on-device. Can export a Marp-compatible bundle.

**Honest weaknesses (must appear on the page — this is the credibility tax):**
- **No WYSIWYG.** The Drawing Board is text + live preview, *explicitly "NOT an evolution"*
  of a visual editor (drawing-board.astro). No drag-and-drop composition.
- **Learning curve.** Markdown + CLI default path; 53 components to choose among; strict
  authoring rules (e.g. nested card bullets). gotchas.md is ~1,900 lines — real complexity.
- **Setup friction.** Node 22+, Chromium/`CHROME_PATH`, `mmdc` for Mermaid.
- **No real-time collaboration.** Single-author text file; collaboration is git, not live
  co-editing.
- **Font/Chromium edge cases.** Emoji needs an installed font; `mask-image` quirks in PDF;
  custom logo invisible in marp-vscode preview.
- **Young ecosystem.** v1.0.0; SlideWright desktop app still under development.
- **Not for stage performance.** No animations/transitions/timers (by design — README says
  use Keynote/Slides for that).

**"Isn't this just Marp?" — the honest answer (technical-reader credibility):**
Vanilla Marp has **no component system, no design tokens, no slots, no layout
primitives** — theming is raw CSS per marpit's theme-css.md (CORRECTION 2026-07-07: this is
a true characterization but NOT a verbatim quote; marpit's docs never say that sentence, and
an earlier revision of this doc — and the live comparison page built from it — wrongly
presented it inside quotation marks. Never quote it.) It ships **three generic themes**
(default/gaia/uncover) and produces **environment-dependent** PDF (Chromium-version-coupled,
font-substitution-prone). So:
- **Genuinely above Marp:** the 53-component/12-bucket system, the token system, the 14
  palettes, palette-blind layouts, boardroom-grade defaults, agent-authorability, and the
  *owned* pinned render engine that closes Marp's reproducibility gap — including a
  divergence from Marp's render DOM: Lattice renders plain `<section>` HTML
  (`inlineSVG:false`), not Marp's default `<svg><foreignObject>` slide wrapper, so
  container queries / CSS counters / `mask` work natively, no Safari `marpit-svg-polyfill`
  is needed, and layout stops breaking browser-to-browser (see `engineering/gotchas.md`).
- **Concede the Markdown lineage, not the engine:** the Markdown authoring model and the
  Markdown→HTML→headless-Chromium→PDF *idea* came from Marp, and determinism + git-diffability
  of plain text are inherited Markdown properties true of every code engine. But Lattice dropped
  the Marp dependency at v1.0.0 and runs its own engine now; marp-cli is a supported BYO export
  path out of Lattice, not the foundation under it.
- Honest line: *"Lattice took Marp's Markdown-to-PDF idea, then replaced the engine with its own
  and added the entire design-system layer Marp leaves to you — components, tokens, palettes,
  polished defaults — plus agent-authorability. Marp is an export path out of Lattice now, not
  the engine inside it."*

---

## 3. Bucket A — AI-native generators (the core contrast)

Pattern across the bucket: prompt → designed deck in ~1 min; **stochastic** (regenerate =
different deck); web-first or proprietary canvas; **export fidelity is the #1 complaint**;
"generic AI look"; brand control is shallow/paywalled; recurring billing/refund complaints.
Genuine shared strengths: **speed, low barrier for non-designers, blank-page relief, decent
first drafts.** The honest boundary: great for fast/internal/low-stakes drafts; weak where
output is durable, high-stakes, brand-bound, or fact-bearing.

### Gamma (gamma.app) — the flagship
- ~50M users; card/Notion-style web model; "Gamma Agent" conversational edits (3.0, 2026).
- **Export:** PDF fidelity *good*; **PPTX commonly broken** — fonts fall back to
  Calibri/Arial, complex slides flatten to uneditable images, animations dropped. Root cause
  is architectural (web-first → flatten), *not* a paywall; affects paid tiers too
  (slidegmm export guide). "38% of Gamma threads" cite PPTX quality as the top frustration
  (slidegmm Reddit analysis — paraphrased aggregate).
- **Determinism:** stochastic; "version control" = live-link single-source-of-truth, not
  git diff. *Counter-evidence (be accurate):* Gamma **does** have version history + undo
  (help.gamma.app) — so don't say "no versioning"; the real gap is no protection against
  *generation* variance and no diff between generations.
- **Brand:** Brand Kit matured (colors/logo/fonts; font-file upload + headers/footers are
  Pro). But "every Gamma deck looks the same" is the best-corroborated sameness critique; AI
  overrides intended brand colours for contrast ("ugly brown graphs", colleagueinterrupted).
- **Pricing:** Free→Enterprise; credit-metered; live page 403s to fetch — **figures
  contested across trackers, verify before quoting.** ~4.2/5 G2; Trustpilot ~1.9 (skews
  grievance).
- Strengths to concede: fast, modern default polish, web-native sharing + analytics, API.

### Beautiful.ai
- Auto-layout "Smart Slides"; DesignerBot. **Best-in-class brand guardrails** of the AI
  tools (Brand Kit, locked elements, master themes, admin lock) — concede this.
- But the rigidity → "template-rigid and visually homogeneous"; **no API**; fixed slots
  ("can't combine a diagram with a metrics panel"); Beautiful.ai's **own blog tells users
  not to export to PPTX** (animations/audio lost, "design and present in Beautiful.ai").
- Pricing: Pro $12/mo annual; **steep jump to Team $40/user/mo**; no free plan; CC-required
  trial. G2 ~4.7/5 (~180+ reviews) — genuinely well-liked.

### Decktopus
- Prompt-to-deck for SMB/non-designers; differentiators: lead-gen forms, voice-over,
  analytics. **Image-based, non-editable PPTX/PDF exports** (OCR needed to recover text);
  no animations; no consulting charts. Stochastic; **no version history**. Full corporate
  branding paywalled to Enterprise. G2 ~4.4 vs **Trustpilot ~1.9** (billing/cancellation
  complaints, no-refund policy).

### Presentations.ai
- "ChatGPT for presentations"; **$3M Accel seed (Jan 2025)** + marquee angels. Signature
  "anti-fragile templates" (responsive layout that won't break) — a real idea that **doubles
  as a customization cage** (errors when a slide is "full"; reportedly can't upload brand
  colours/fonts despite "Brand Sync"; **AI can't add slides to an existing deck**).
- **Marketing vs. reality gap is wide:** "world's first" (false), "full-fidelity editable
  export" + "version history" claimed on the features page but contradicted by the FAQ and
  by Trustpilot (**2.0/5**; "export simply doesn't work"; charged after cancellation;
  chargebacks recommended). "1M users in 84 days" is self-reported/unverified.
- Pricing volatile (tokens→credits; Plus→Pro→Gold): Pro $20/mo, Gold $100/mo, custom
  templates historically $999. **Verify live.**

### Plus AI (formerly Plusdocs)
- **The thoughtful one:** an add-in *inside* Google Slides / PowerPoint / Docs → **native,
  editable output, no proprietary lock-in**; collaboration + version history inherited from
  Google/Microsoft. 1M+ Workspace installs. Concede this is a genuinely different, lower-risk
  model.
- Still **stochastic** ("Remix generates variants"; regenerate = restart, no refine-in-
  place); **no native versioning/diff**; first-pass output skews generic; **weak charting**
  (no waterfall/Mekko/Gantt — not consulting-grade); strict brand controls gated to $30/seat
  Team tier (beta, rigid). G2 ~3.2/5; support/refund complaints.

### MagicSlides / SlidesAI — Google-Slides-first add-ons
- Both generate **native editable Google Slides** (real strength, no lock-in), inherit
  Google collaboration, fast, broad inputs (MagicSlides: topic/PDF/DOCX/YouTube/URL).
- Both: **non-deterministic, no diff/version control of their own**, generic look
  (SlidesAI's repetitive "Four Bullets with Image" formula; brand/colour choices
  *demonstrably ignored* in hands-on tests), reliability glitches, **billing/cancellation
  complaints** (Trustpilot ~2.2–2.6; marketplace 4.7 vs Trustpilot gap is itself a signal;
  some review-authenticity concerns). PowerPoint support weaker than the Slides path.
  MagicSlides entry to no-watermark use is now ~$29/mo (restructured; older $8–12 figures
  stale). SlidesAI: Free 12/yr, Pro $120/yr, Premium $250/yr.

### Tome — the cautionary tale (NOT a live rival)
- Founders **killed the AI deck product April 30, 2025** ("We killed a product used by 25M
  people"). ~20–25M users but **<2% conversion, <$4M ARR vs $81M raised at ~$300M val**.
  PDF-only lock-in, stochastic, weak brand control. **Decks users hadn't exported were
  permanently deleted.** Team pivoted to a CRM (Lightfield); brand sold to AngelList (legal
  AI). *Page use:* proof that virality ≠ boardroom value, and that a closed AI deck tool can
  be switched off under you — a plain-text deck in your git repo cannot. (Verify dates via
  VentureBeat / founder LinkedIn / Sacra before publishing.)

---

## 4. Bucket B — Incumbent office suites (they own the boardroom today)

Concede honestly: **ubiquity (`.pptx` is the lingua franca), real-time co-editing, WYSIWYG
immediacy** are real, large moats. The clean distinction: WYSIWYG placement is
deterministic-*in-the-moment* but **not reproducible, diffable, or enforceable**; the AI
generation layers are **stochastic**. Lattice offers a third thing: deterministic,
version-controlled, brand-enforced rendering from text.

### PowerPoint + Copilot
- Dominant; `.pptx` is the universal interchange format; real-time co-edit via
  OneDrive/SharePoint. **But:** binary-in-practice zipped XML → git can't meaningfully
  diff/merge ("final_v3_FINAL.pptx" chaos); cross-machine font fallback/reflow ("looks right
  on my machine" ≠ elsewhere); brand compliance is manual discipline (think-cell exists
  *because* PowerPoint doesn't enforce brand).
- Copilot critiques are pointed: "technically correct but visually mediocre"; one European
  bank rolled it to 42 staff → **8% adoption in 6 weeks, quality *dropped*, brand-compliance
  violations *tripled***; a hallucinated "43% funding increase" stat (actual 12%); Microsoft
  reportedly added a second-model hallucination checker by Mar 2026. Microsoft's own docs:
  output "should be human-reviewed". (Octigen — competitor blog, specific but uncorroborated;
  cite carefully. MS support disclaimer is first-party/strong.)
- Pricing: M365 base + Copilot add-on (Business dropped to **$21/user/mo** Dec 2025; E-tier
  $30).

### Google Slides + Gemini
- #2; **best-in-class real-time collaboration** (the model PowerPoint chased). Built-in
  cloud version history (better than `.pptx`, but not text diff/merge). Gemini = slide-by-
  slide assist; **notably can't generate a full deck from one prompt** (Copilot can).
- Cloud object, not diffable plain text; PPTX interop fidelity loss. Gemini bundled into
  Workspace since Mar 2025 (Business Standard ~$16.80/user/mo for full Gemini-in-Slides).

### Apple Keynote
- Free; best built-in design polish + cinematic transitions; iCloud co-editing. **But**
  Apple-only (no Windows desktop), weakest corporate interop, `.key`↔`.pptx` round-trip
  loss, no generative deck AI (Apple Intelligence = Writing Tools only), same binary-bundle
  no-diff limitation.

---

## 5. Bucket C — Code/developer engines (our closest technical peers)

All free/open-source, git-diffable, deterministic *source*. **None ships a curated,
branded component + token + palette design system** — they bottom out at "themes + raw
CSS/SCSS/JS, build your own layouts." That gap is Lattice's genuine differentiator, not a
reskin. Shared honest weakness vs. SaaS: learning curve, no real-time co-edit, no WYSIWYG,
build step, default aesthetics need design work to reach boardroom grade.

- **Marp** — what Lattice is built on. See §2 "Isn't this just Marp?" for the precise
  delineation. 3 generic themes; no components/tokens/slots; Chromium-dependent,
  environment-variant PDF.
- **reveal.js** — HTML-first (Markdown is a plugin layer); 13 SCSS themes; **no
  component/layout system**; brittle browser-print PDF (Chromium-only). Maximum low-level
  control, all polish DIY. MIT.
- **Slidev** — **our closest philosophical peer**: Markdown + Vue components + npm-theme
  layout system + proper Playwright headless-Chromium export (PDF/PPTX/PNG/MD). But Vue/
  Vite/Node-heavy, developer-aimed (not boardroom), PPTX rasterizes to images, heaviest
  runtime. MIT.
- **Beamer/LaTeX** — strongest reproducibility story (deterministic compile, identical PDF
  across machines) **but only with discipline** (`SOURCE_DATE_EPOCH`, no `\today`); dated
  academic aesthetics; steep curve; slow compile; PDF-only (no native HTML/PPTX). Free/LPPL.
- **Quarto** — MIT, git-native, reproducible; multi-target (reveal.js/Beamer/PPTX from one
  `.qmd`); executable code cells. PDF is browser-print-fragile (reveal) or LaTeX-heavy
  (Beamer); `_brand.yml` only reaches reveal.js/HTML/Typst, not Beamer/PPTX; data-science
  aimed.
- **Spectacle** — React/JSX decks; componentized but you assemble the design system
  yourself; weakest PDF export (print-mode hack, B/W). Highest code barrier. Free/MIT.

---

## 6. Bucket D — Design/collaborative tools

Genuinely strong on **design polish and real-time collaboration** — concede it. They lose
only on determinism, diffability, brand-as-code, and pipeline automation. None stores the
deck as diffable plain text; the cloud canvas is the source of truth (lives in someone
else's cloud); AI features are stochastic.

- **Pitch** — **material business context:** Jan 2024 cut **~78% of staff** (≈180→~40),
  returned most VC, pivoted from design-forward presentations toward **sales enablement**
  ("Pitch Rooms"). Survived/profitable (~$10M ARR Feb 2025) but a different bet now. Strong
  templates + best-in-class real-time collab. PPTX export mixed/basic (fonts → Calibri).
  Free / Pro $20/mo / Business $80/mo. (Verify via Sacra / Sunset HQ.)
- **Canva** — mass-market; huge template library + Magic Studio AI (Magic Design/Switch/
  Write/Media); Brand Kits (Teams+). ~95% PPTX fidelity but lossy (font/layout/transparency
  shifts). Well-documented **"looks like a Canva template" genericness**; Magic Design
  produces off-brand colours/fonts (Canva's own docs concede the gap). Free / Pro ~$13–15 /
  Teams ~$10/user/mo (raised 300%+ for small teams in 2024).
- **Figma Slides** — Figma's design power + mature multiplayer; strongest *design* control
  for Figma-literate teams. **Least mature** as a deck tool: documented PPTX export bugs
  (font fallback, interactions/code → static images, gradients flattened), color shifts, no
  bulk export. Bundled in paid Figma seats (Prof ~$16, Org ~$55, Ent ~$90); 2025 prices up
  to ~33%.

---

## 7. The comparison matrix (axes + honest Lattice marks)

Columns are the axes that actually matter for high-stakes decks. **Lattice does NOT win
every row** — that's the point of an honest table.

| Axis | Lattice | AI generators | Office + AI | Code engines | Design/collab |
|---|---|---|---|---|---|
| Deterministic / reproducible output | ✅ pixel-identical | ❌ stochastic | ⚠️ manual det., AI stochastic | ✅ (source) | ❌ |
| Plain-text, git-diffable source | ✅ | ❌ | ❌ binary/cloud | ✅ | ❌ |
| Brand enforced as tokens (not promises) | ✅ palette-blind tokens | ⚠️ shallow/paywalled | ⚠️ manual discipline | ⚠️ raw CSS, DIY | ⚠️ GUI brand kits |
| Boardroom polish out of the box | ✅ 53 components / 14 palettes | ⚠️ generic look | ⚠️ DIY | ❌ DIY design | ✅ (design-strong) |
| Export fidelity (looks the same everywhere) | ✅ one engine, all formats | ❌ #1 complaint | ⚠️ font/version drift | ⚠️ varies | ⚠️ lossy PPTX |
| Real-time co-editing | ❌ (git) | ✅ | ✅ | ❌ (git) | ✅ |
| WYSIWYG / no learning curve | ❌ text + preview | ✅ | ✅ | ❌ | ✅ |
| Agent / AI-authorable (reliably) | ✅ catalog + linter | ⚠️ prompt only | ⚠️ | ⚠️ | ⚠️ |
| No vendor lock-in (your file, offline, MIT) | ✅ | ❌ | ❌ | ✅ | ❌ |
| Cost | free/MIT | $$ subscription | $$ subscription | free | $$ subscription |

Legend on page: ✅ strong · ⚠️ partial/conditional · ❌ no. Keep the ❌s on Lattice's row —
they earn the ✅s.

---

## 8. The receipts (evidence section — cite, don't assert)

- **Hallucination fact-check (Medium, Feb 2026)** — identical 10-slide prompt to 6 tools,
  every claim verified against primary sources. Factual accuracy: **Kimi 44%, LayerProof
  43%, Gamma 20%, Beautiful.ai 17%, Canva 17%, Tome 0%.** Canva attached invented stats to a
  **real named school**; only 1 of 6 gave any source URLs. *Caveat: n=1 deck/tool, single
  topic, author in the space — cite as directional, not a definitive ranking.*
- **Professional fallout (strongest, hardest to dispute):** Deloitte refunded an AU$439k
  government report with fabricated references + a made-up court quote (Oct 2025); KPMG
  pulled a report after GPTZero found **40 of 45 citations fabricated**. (Mainstream + AI
  Incident DB.)
- **Copilot bank rollout:** 42 staff → 8% adoption in 6 weeks, quality dropped, brand
  violations tripled; hallucinated "43% funding increase" (actual 12%). (Octigen — flag as
  competitor blog, specific but uncorroborated.)
- **"Regeneration roulette":** scoped edits re-roll whole slides / unrelated slides ("made
  the title bigger… also changed the colour scheme on slides 7,8,9 without warning"); the
  industry is *patching* this (NotebookLM per-slide edits Feb 2026; Beautiful.ai Slide AI) —
  which corroborates the pain was real. (Variant, NotebookLM/Medium, getalai — motivated
  witnesses; sound architectural argument.)
- **Tome shutdown + data deletion** (see §3) — the cleanest "your closed deck can be
  switched off under you" evidence.
- **General LLM citation studies (label as general, not slide-measured):** GPT-4o ~64% of
  citations fabricated-or-erroneous (peer-reviewed); ~146,900 hallucinated citations
  estimated across preprint servers; 100+ fake citations through NeurIPS 2025 review.

---

## 9. Where Lattice is going (forward-looking — leave the slot)

The page ends on roadmap, not triumphalism. Keep a clearly-marked forward section with room
to drop in the owner's unannounced "killer feature" later **without a redesign**. Known
in-flight items from the repo: SlideWright desktop app (under dev), Drawing Board phases,
plugin/extension system, presentation import, universal chart export (see sibling decision
docs dated 2026-06-14). Do **not** invent or pre-announce the killer feature.

---

## 10. Source ledger (representative — full URLs in the task transcripts)

Primary/strong: marpit theme-css.md & marp-cli README (Marp's own limits); reproducible-
builds.org; arXiv 2503.11069 (API vs GUI agents); MS/Google/Apple official docs; vendor
pricing pages; TechCrunch (Presentations.ai funding); VentureBeat + founder LinkedIn (Tome
shutdown); Sacra (Tome/Pitch metrics); peer-reviewed GPT-4o citation study; Quarto/Slidev/
reveal.js/Beamer official docs.

Motivated/secondary (corroborate, discount superlatives): Alai, Plus AI, SlideGMM, Deckary,
SlidePeak, eesel, Prezent, Skywork, Dokie; Medium fact-check; Octigen; G2/Trustpilot
aggregates (raw bodies 403-blocked).

Contested / verify-before-publishing: all Gamma/Decktopus/Presentations.ai/MagicSlides
pricing & credit figures (trackers disagree; live pages 403); self-reported growth
superlatives ("1M in 84 days", "fastest to 1M"); the Charles Hudson VC quote; the Octigen
bank-rollout numbers; exact Tome dates.
