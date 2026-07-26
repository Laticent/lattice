#!/usr/bin/env node
/**
 * Generate per-component documentation + gallery decks from manifests.
 *
 * For each component in lib/components/<name>/manifest.json, emits two
 * sibling files in the same folder:
 *
 *   <name>.docs.md      — prose reference: when/why, slots, variants,
 *                         anti-patterns, related components.
 *   <name>.gallery.md   — Marp deck: title + default-appearance +
 *                         one slide per variant + anti-patterns +
 *                         closing. Rendered to <name>.gallery.pdf by
 *                         the standard build path.
 *
 * The manifest is the single source of truth. The generator is
 * idempotent and deterministic: re-running with no manifest change
 * produces byte-identical output.
 *
 * A manifest qualifies as "enriched" for the docs/gallery pipeline
 * when it carries at least one of: sample, whenToUse, antiPatterns,
 * related, variantDocs. Components without any enriched fields are
 * skipped (so the script can run cleanly during the Phase 2 migration
 * before every component is migrated).
 *
 * Usage:
 *   node tools/build-component-docs.js                    # build all
 *   node tools/build-component-docs.js --only cards-grid  # one component
 *   node tools/build-component-docs.js --check            # CI gate
 *   node tools/build-component-docs.js --list             # list enriched
 *
 * Exit codes:
 *   0  success
 *   1  invalid manifest, missing required prose, or (--check) stale output
 *   2  --only target not found
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadAll, manifestBucket } = require('../lib/components');
const { axisNoun } = require('../lib/authoring/lint-core');
const { resolveAnatomy } = require('./anatomy-catalog');

const ROOT = path.join(__dirname, '..');
const COMPONENTS_DIR = path.join(ROOT, 'lib', 'components');

// component name → bucket, for resolving cross-bucket related-component
// links. Components are bucket-nested (lib/components/<bucket>/<name>/), so a
// related link from one component to another in a different bucket must route
// up to lib/components/ and back down. Memoized; the portal's rewriteLinks
// collapses these back to in-page anchors.
let _nameToBucket = null;
function bucketOf(name) {
  if (!_nameToBucket) {
    _nameToBucket = new Map(loadAll().map((m) => [m.name, manifestBucket(m)]));
  }
  return _nameToBucket.get(name);
}

// Anatomy ASCII blocks are resolved from the canonical catalog
// (tools/ascii-preview.py) via the shared loader in tools/anatomy-catalog.js,
// so the .docs.md reference, the aggregate components.md, and the docs-site
// component pages all render the same block from one source.

/**
 * True when the manifest has any of the prose fields the generator
 * needs. Lets the script tolerate not-yet-migrated components without
 * failing the bulk run.
 */
function isEnriched(m) {
  return Boolean(
    m.sample ||
      (Array.isArray(m.whenToUse) && m.whenToUse.length) ||
      (Array.isArray(m.antiPatterns) && m.antiPatterns.length) ||
      (Array.isArray(m.related) && m.related.length) ||
      (m.variantDocs && Object.keys(m.variantDocs).length)
  );
}

/**
 * Title-case for the function/form/substance triplet in the title slide.
 */
function tc(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Markdown-escape a string for use inside a table cell. Newlines and
 * pipe characters break table rendering.
 */
// Matches any line-ending sequence — CRLF, bare CR, or bare LF. CommonMark
// treats a bare \r as a line ending same as \n (spec §2.3), so a collapse
// that only matches `\n+` leaves `\r\r## Heading` able to inject a real
// heading; both tableCell() and bulletLine() must fold all three forms.
const LINE_ENDINGS = /(?:\r\n|\r|\n)+/g;

function tableCell(s) {
  // Escape backslashes FIRST, then pipes. Otherwise a pre-existing backslash
  // immediately before a pipe in the source (e.g. a slot description quoting
  // a regex alternation like `a\|b`) shifts the escaping parity: `\|`
  // becomes `\\|`, which a markdown renderer reads as an escaped backslash
  // followed by an UNescaped pipe — the exact table-breaking pipe this
  // function exists to prevent (CodeQL: incomplete string escaping).
  return String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(LINE_ENDINGS, ' ');
}

/**
 * Collapse newlines in a string destined for a single markdown bullet line
 * (Agent contract prose: commonMistakes/variantDecisionRule/dataShapeGuidance).
 * Without this, a manifest string containing `\n\n## Heading` would inject a
 * real heading into the middle of the generated doc — flattening to a single
 * line keeps every entry exactly one bullet, regardless of manifest content.
 */
function bulletLine(s) {
  return String(s).replace(new RegExp(`\\s*${LINE_ENDINGS.source}\\s*`, 'g'), ' ').trim();
}

/**
 * Build <name>.docs.md content from a manifest.
 *
 * Sections, in order:
 *   1. Heading + one-line description
 *   2. Function/Form/Substance line + tags (a single inline line each,
 *      not a table)
 *   3. Purpose paragraph (from purpose) — kept as plain top-matter, same as
 *      before this contract split, so it never dangles unheaded under the
 *      LAST subsection of the block that follows.
 *   4. Agent contract: capacity/density budgets, slots (from slots{}),
 *      variant decision rule (from variantDecisionRule[]), common mistakes
 *      (from commonMistakes[]), data shape guidance (from
 *      dataShapeGuidance[]) — the machine-actionable block, front-loaded so
 *      an agent authoring a slide of this component doesn't have to wade
 *      through narrative prose to find it. Whole section omitted when the
 *      manifest carries none of its inputs.
 *   5. When to use (from whenToUse[])
 *   6. When NOT to use (from antiPatterns[])
 *   7. Authoring skeleton (from skeleton)
 *   8. Anatomy (from anatomy, if present)
 *   9. Variants (from variantDocs{}, layout-specific only)
 *   10. Universal modifiers pointer (always)
 *   11. Related components (from related[])
 *   12. Demo pointer (always)
 */
// ── renderDocs sections ──────────────────────────────────────────────────
// One emitter per numbered section of the doc (see the contract above);
// each appends its lines (with the trailing blank) or nothing when the
// manifest lacks that block. renderDocs() runs them in the documented order.

function emitDocsHeader(m, lines) {
  lines.push(`# ${m.name}`);
  lines.push('');
  lines.push(`> ${m.description}`);
  lines.push('');
  lines.push(`**Function** ${m.function} · **Form** ${m.form} · **Substance** ${m.substance}`);
  lines.push('');
  if (Array.isArray(m.tags) && m.tags.length) {
    lines.push(`**Tags** ${m.tags.map((t) => `\`${t}\``).join(' · ')}`);
    lines.push('');
  }
}

/**
 * The machine-actionable contract: budgets, slots, and (where declared)
 * the three agent-contract fields (variantDecisionRule, commonMistakes,
 * dataShapeGuidance — manifest.schema.json). Almost every component
 * declares `slots`, so this section appears for nearly all of them —
 * it only emits nothing on the rare manifest with none of capacity,
 * density, slots, or the three new fields. For the 54 components not
 * yet backfilled with the new fields, the section still appears (with
 * just budgets/slots); their docs.md changes only in WHERE that content
 * sits, not what it says — the three-subsection difference is limited
 * to the pilot components that declare the new fields.
 */
function emitAgentContract(m, lines) {
  const hasCapacity = Boolean(m.capacity);
  const hasDensity = Boolean(m.density);
  const hasSlots = Boolean(m.slots && Object.keys(m.slots).length);
  const hasVariantRule = Array.isArray(m.variantDecisionRule) && m.variantDecisionRule.length > 0;
  const hasMistakes = Array.isArray(m.commonMistakes) && m.commonMistakes.length > 0;
  const hasDataShape = Array.isArray(m.dataShapeGuidance) && m.dataShapeGuidance.length > 0;
  if (!hasCapacity && !hasDensity && !hasSlots && !hasVariantRule && !hasMistakes && !hasDataShape) return;

  lines.push('## Agent contract');
  lines.push('');

  if (hasCapacity) {
    const c = m.capacity;
    const sweet = c.sweet != null ? c.sweet : c.soft;
    const esc = Array.isArray(c.escalateTo) && c.escalateTo.length ? ` — past that, ${c.escalateTo.join(' / ')}` : '';
    lines.push(`**Capacity** ~${sweet} ${axisNoun(c.axis, sweet)} (crowds past ${c.soft}, overflows past ${c.hard})${esc}.`);
    lines.push('');
  }
  if (hasDensity) {
    const d = m.density;
    const axis = d.axis || m.capacity?.axis || 'item';
    const note = d.note ? ` — ${d.note}` : '';
    lines.push(`**Density** aim ~${d.soft} words per ${axisNoun(axis, 1)}; past ~${d.hard} it reads as a wall of text${note}.`);
    lines.push('');
  }

  if (hasSlots) {
    lines.push('### Slots');
    lines.push('');
    lines.push('| Slot | Selector | Required | Description |');
    lines.push('|---|---|---|---|');
    for (const [slotName, slot] of Object.entries(m.slots)) {
      const req = slot.required ? 'yes' : 'no';
      lines.push(`| \`${slotName}\` | \`${slot.selector}\` | ${req} | ${tableCell(slot.description)} |`);
    }
    lines.push('');
  }

  if (hasVariantRule) {
    lines.push('### Variant decision rule');
    lines.push('');
    for (const entry of m.variantDecisionRule) {
      // "default" is the no-modifier sentinel, not a class token — render it
      // distinctly from a real variant (backtick-wrapped) so an agent can't
      // mistake it for a literal `_class:` modifier to copy.
      const label = entry.variant === 'default' ? 'default (no modifier)' : `\`${entry.variant}\``;
      lines.push(`- **${label}.** ${bulletLine(entry.useWhen)}`);
    }
    lines.push('');
  }

  if (hasMistakes) {
    lines.push('### Common mistakes');
    lines.push('');
    for (const entry of m.commonMistakes) {
      lines.push(`- **${bulletLine(entry.mistake)}** ${bulletLine(entry.fix)}`);
    }
    lines.push('');
  }

  if (hasDataShape) {
    lines.push('### Data shape');
    lines.push('');
    for (const rule of m.dataShapeGuidance) {
      lines.push(`- ${bulletLine(rule)}`);
    }
    lines.push('');
  }
}

function emitDocsPurpose(m, lines) {
  if (m.purpose) {
    lines.push(m.purpose);
    lines.push('');
  }
}

function emitDocsGuidance(m, lines) {
  if (Array.isArray(m.whenToUse) && m.whenToUse.length) {
    lines.push('## When to use');
    lines.push('');
    for (const item of m.whenToUse) {
      lines.push(`- **${item.title}.** ${item.body}`);
    }
    lines.push('');
  }
  if (Array.isArray(m.antiPatterns) && m.antiPatterns.length) {
    lines.push('## When NOT to use');
    lines.push('');
    for (const item of m.antiPatterns) {
      lines.push(`- **${item.title}.** ${item.body}`);
    }
    lines.push('');
  }
}

function emitDocsAuthoring(m, lines) {
  lines.push('## Authoring');
  lines.push('');
  lines.push('```markdown');
  lines.push(m.skeleton.replace(/\n$/, ''));
  lines.push('```');
  lines.push('');
  if (m.anatomyBlock) {
    lines.push('## Anatomy');
    lines.push('');
    lines.push('```text');
    lines.push(resolveAnatomy(m.anatomyBlock));
    lines.push('```');
    lines.push('');
  }
}

function emitDocsVariants(m, lines) {
  const variantDocs = m.variantDocs || {};
  const variantKeys = Array.isArray(m.variants) ? m.variants.filter((v) => variantDocs[v]) : [];
  if (variantKeys.length) {
    lines.push('## Variants (component-specific)');
    lines.push('');
    for (const v of variantKeys) {
      const vd = variantDocs[v];
      const heading = vd.label ? `\`${v}\` — ${vd.label}` : `\`${v}\``;
      lines.push(`### ${heading}`);
      lines.push('');
      lines.push(vd.summary);
      lines.push('');
      lines.push('```markdown');
      lines.push(vd.sample.replace(/\n$/, ''));
      lines.push('```');
      lines.push('');
    }
  }
  lines.push('## Universal modifiers');
  lines.push('');
  lines.push('This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.');
  lines.push('');
}

function emitDocsPointers(m, lines) {
  if (Array.isArray(m.related) && m.related.length) {
    lines.push('## Related components');
    lines.push('');
    for (const r of m.related) {
      const b = bucketOf(r.name);
      const href = b ? `../../${b}/${r.name}/${r.name}.docs.md` : `../${r.name}/${r.name}.docs.md`;
      lines.push(`- [\`${r.name}\`](${href}) — ${r.when}`);
    }
    lines.push('');
  }
  lines.push('## Demo deck');
  lines.push('');
  lines.push(`See [${m.name}.gallery.light.pdf](./${m.name}.gallery.light.pdf) for rendered examples of every variant.`);
  lines.push('');
}

function renderDocs(m) {
  const lines = [];
  emitDocsHeader(m, lines);
  emitDocsPurpose(m, lines);
  emitAgentContract(m, lines);
  emitDocsGuidance(m, lines);
  emitDocsAuthoring(m, lines);
  emitDocsVariants(m, lines);
  emitDocsPointers(m, lines);
  return lines.join('\n');
}

/**
 * Build <name>.gallery.md content from a manifest. The deck is a Marp
 * source file rendered to PDF by lattice-emulator.
 *
 * Slide order:
 *   1. Title (dark bookend, no chrome)
 *   2. Default appearance (component's own layout with sample content)
 *   3..N+2. One slide per variant (component's layout + variant modifier)
 *   N+3. Anti-patterns (cards-stack compact meta-layout, omitted if none)
 *   N+4. Closing — related components (closing index, omitted if no related)
 *
 * The anti-patterns slide uses `cards-stack compact` and the see-also
 * slide uses `closing index` as meta-layouts for documenting the component.
 * When the component being documented IS one of those, the dogfooding is
 * intentional.
 *
 * Page count derivable as expectedGallerySlideCount(m).
 */
/**
 * Universal modifiers we showcase per component in the gallery. Each gets
 * one composition slide that re-uses the component's sample with the
 * modifier appended to the `_class:` directive. Components opt out via
 * manifest.excludes (semi-universals) or by being unsuitable for the
 * modifier (e.g. layouts that already declare `dark` in their default
 * chrome — title, divider, closing — get no extra dark composition).
 *
 * The set is bounded: dark / compact / accent. mirror is layout-specific
 * (only some layouts have asymmetric halves to flip).
 */
const COMPOSITION_MODIFIERS = ['dark', 'compact', 'accent'];

/**
 * Layouts whose default chrome already includes dark (so a `dark`
 * composition slide would be visually identical and add noise).
 */
const DARK_BY_DEFAULT = new Set(['title', 'divider', 'closing']);

/**
 * Compute the list of composition modifiers that apply to a component.
 * Returns the subset of COMPOSITION_MODIFIERS that:
 *   - the manifest doesn't list in `excludes`,
 *   - aren't already in `variants[]` (the variant slide demos it),
 *   - aren't already default-on for the layout (dark on bookends).
 */
function compositionModifiersFor(m) {
  const excludes = new Set(Array.isArray(m.excludes) ? m.excludes : []);
  const variants = new Set(Array.isArray(m.variants) ? m.variants : []);
  return COMPOSITION_MODIFIERS.filter((mod) => {
    if (excludes.has(mod)) return false;
    if (variants.has(mod)) return false;
    if (mod === 'dark' && DARK_BY_DEFAULT.has(m.name)) return false;
    return true;
  });
}

/**
 * Build a composition slide: take the sample (or another representative
 * slide content) and append the modifier to its `_class:` directive.
 * Returns null if the manifest has no sample to compose from.
 */
function renderCompositionSlide(m, modifier) {
  if (!m.sample) return null;
  // Append the modifier to the existing _class directive.
  const composed = m.sample.replace(
    /^<!--\s*_class:\s*([^>]*?)\s*-->/,
    (_match, klass) => `<!-- _class: ${klass.trim()} ${modifier} -->`
  );
  return injectFooter(composed, `Composition: ${modifier} · ${m.name} ${modifier}`);
}

/**
 * Normalize the stress-test content to { summary, sample } regardless of
 * which manifest spelling carries it. `stressDoc` ({ summary, sample }) is
 * the target shape; the legacy `stressSample` string is accepted during
 * the voice migration and reads as a summary-less stressDoc. Returns null
 * when the manifest declares neither.
 */
function stressDocOf(m) {
  if (m.stressDoc && typeof m.stressDoc === 'object') return m.stressDoc;
  if (m.stressSample) return { summary: '', sample: m.stressSample };
  return null;
}

/**
 * The gallery deck as an ordered plan: one entry per slide, each with a
 * stable `kind` key (title / default / variant:<v> / stress /
 * composition:<mod> / anti-patterns / see-also), the caption that narrates
 * it, and the slide markdown. Every consumer of the deck — the PDF
 * renderer (renderGallery), the page-count contract
 * (expectedGallerySlideCount), and the docs-site Explore surface — reads
 * THIS plan, so the walk order cannot fork between them.
 *
 * Caption footers (the `— <caption>` suffix on variant/stress footers)
 * are gated on `manifest.specimenVoice`: an unmigrated manifest renders
 * today's short footers byte-for-byte, so each deck's rendered output
 * changes exactly once, inside the migration PR whose visual review
 * covers it.
 */
function galleryPlan(m) {
  const specimen = m.specimenVoice === true;
  const slides = [];
  const variantKeys = Array.isArray(m.variants) && m.variantDocs
    ? m.variants.filter((v) => m.variantDocs[v])
    : [];

  slides.push({
    kind: 'title',
    caption: m.description || '',
    md: `<!-- _class: title silent -->

# ${m.name}

\`${tc(m.function)} · ${tc(m.form)} · ${tc(m.substance)}\`

${m.description}`,
  });

  if (m.sample) {
    slides.push({
      kind: 'default',
      caption: m.description || '',
      md: injectFooter(m.sample, `Default · ${m.name}`),
    });
  }

  for (const v of variantKeys) {
    const vd = m.variantDocs[v];
    const label = vd.label || v;
    const base = `${label} · ${m.name} ${v}`;
    const footer = specimen && vd.summary ? `${base} — ${vd.summary}` : base;
    slides.push({
      kind: `variant:${v}`,
      caption: vd.summary || '',
      md: injectFooter(vd.sample, footer),
    });
  }

  // Optional stress-test slide — an edge-case input (volume, range,
  // length) that exercises the engine past the tidy default sample.
  const stress = stressDocOf(m);
  if (stress) {
    const base = `Stress test · ${m.name}`;
    const footer = specimen && stress.summary ? `${base} — ${stress.summary}` : base;
    let md = injectFooter(stress.sample, footer);
    // Specimen stress slides sit in the crowd band by contract; the marker
    // tells lint-core to hold the capacity-crowd warning (overflow still
    // fires). Gated on specimenVoice so unmigrated decks stay byte-identical.
    if (specimen) {
      md = md.replace(
        /^(<!--\s*_class:[^>]*-->)/,
        '$1\n<!-- stress-slide -->'
      );
    }
    slides.push({
      kind: 'stress',
      caption: stress.summary || '',
      md,
    });
  }

  // Composition slides — one per universal modifier the component accepts.
  for (const mod of compositionModifiersFor(m)) {
    const slide = renderCompositionSlide(m, mod);
    if (slide) {
      slides.push({
        kind: `composition:${mod}`,
        caption: `Composition: ${mod} · ${m.name} ${mod}`,
        md: slide,
      });
    }
  }

  if (Array.isArray(m.antiPatterns) && m.antiPatterns.length) {
    slides.push({
      kind: 'anti-patterns',
      caption: `When NOT to reach for ${m.name}.`,
      md: renderAntiPatternsSlide(m),
    });
  }

  if (Array.isArray(m.related) && m.related.length) {
    slides.push({
      kind: 'see-also',
      caption: 'Related components.',
      md: renderClosingSlide(m),
    });
  }

  return slides;
}

function renderGallery(m) {
  const frontMatter = `---
marp: true
theme: indaco
paginate: true
header: "Lattice · ${m.name}"
---`;

  const slides = galleryPlan(m).map((s) => s.md);
  return `${frontMatter}\n\n${slides.join('\n\n---\n\n')}\n`;
}

/**
 * Inject a `<!-- _footer: "..." -->` directive immediately after the
 * `<!-- _class: ... -->` line of a slide. Idempotent — if the slide
 * already declares its own footer, leave it alone.
 */
function injectFooter(slide, footer) {
  if (/<!--\s*_footer:/.test(slide)) return slide;
  return slide.replace(
    /^<!--\s*_class:\s*([^>]*?)\s*-->/,
    (_match, klass) => `<!-- _class: ${klass} -->\n<!-- _footer: "${footer}" -->`
  );
}

function renderAntiPatternsSlide(m) {
  // Use `cards-stack compact` for the anti-patterns meta-slide. Each
  // anti-pattern is a title + body card, authored with the HARD RULE #5
  // nested contract (`- Title` / `  - body`) so the body renders as prose
  // and any inline code in it stays inline code — NOT promoted to a status
  // pill (the failure mode that ruled out cards-grid, whose title-trailing
  // `code` becomes a pill). `compact` keeps the 4-item components (the
  // catalog max) inside the frame while the 3-item norm still breathes.
  // Full-width stacked cards read as a cautionary ledger; the old `list`
  // register laid each <li> out as flex, so an inline-code body shattered
  // into scattered chips and overflowed. Slide count is unchanged.
  //
  // Titles are stripped of backticks: cards-stack promotes a `code` span on
  // the title line to a right-anchored pill (no :last-child guard), which
  // would scatter a title that carries inline vocab. Bodies keep their
  // backticks — nested-list code is never pilled — so this only defends the
  // title line, matching the old format's inline-code resilience. No shipping
  // manifest has a code-bearing title today; this keeps a future one safe.
  const items = m.antiPatterns.map(
    (p) => `- ${p.title.replace(/`/g, '')}\n  - ${p.body}`
  );
  return `<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · ${m.name}" -->

## When NOT to reach for ${m.name}.

${items.join('\n')}`;
}

function renderClosingSlide(m) {
  // `index` is closing's list-bearing variant: the related list renders as a
  // centered reference index on the dark canvas, legible in BOTH themes.
  // A plain `closing silent` left the list unstyled, so its descriptions
  // inherited --text-body and vanished on the dark canvas under the light
  // theme. See closing.styles.css and closing.manifest.json.
  const items = m.related.map((r) => `- \`${r.name}\` — ${r.when}`).join('\n');
  return `<!-- _class: closing silent index -->

## See also.

\`Related components\`

${items}`;
}

/**
 * Page count the gallery is expected to produce. Used by the per-
 * component integration test to assert the renderer matches the
 * manifest's declared variant count.
 */
function expectedGallerySlideCount(m) {
  return galleryPlan(m).length;
}

// Resolve the on-disk directory for a component. Tolerates three shapes
// during the Phase 3 migration: bucket-nested (preferred), flat per-
// component, and the rare diagram-like collision where the component
// name matches a bucket name. The first existing path wins; if none
// exist (a brand-new component being scaffolded), fall back to the
// bucket-nested shape.
function componentDir(m) {
  const bucket = manifestBucket(m);
  const candidates = [
    bucket ? path.join(COMPONENTS_DIR, bucket, m.name) : null,
    path.join(COMPONENTS_DIR, m.name),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function targetPaths(m) {
  const dir = componentDir(m);
  return {
    docs: path.join(dir, `${m.name}.docs.md`),
    gallery: path.join(dir, `${m.name}.gallery.md`),
  };
}

function writeIfChanged(file, content) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current === content) return { wrote: false, file };
  fs.writeFileSync(file, content);
  return { wrote: true, file };
}

function buildOne(m) {
  if (!isEnriched(m)) return { skipped: true, name: m.name };
  const paths = targetPaths(m);
  const docs = renderDocs(m);
  const a = writeIfChanged(paths.docs, docs);
  // Hand-authored gallery (galleryAuthored: true) — generator emits
  // docs.md but leaves gallery.md alone. Used for components where
  // variation lives in slide content, not modifier classes (e.g.
  // `diagram`'s per-Mermaid-type showcase).
  let b = { wrote: false, file: paths.gallery };
  if (!m.galleryAuthored) {
    const gallery = renderGallery(m);
    b = writeIfChanged(paths.gallery, gallery);
  }
  return {
    name: m.name,
    docsWrote: a.wrote,
    galleryWrote: b.wrote,
    galleryAuthored: !!m.galleryAuthored,
    expectedPages: m.galleryAuthored ? null : expectedGallerySlideCount(m),
    paths,
  };
}

function checkOne(m) {
  if (!isEnriched(m)) return { name: m.name, skipped: true, stale: false };
  const paths = targetPaths(m);
  const docs = renderDocs(m);
  const docsStale = !fs.existsSync(paths.docs) || fs.readFileSync(paths.docs, 'utf8') !== docs;
  // Hand-authored galleries are never "stale relative to generator
  // output" — by definition the source is the canonical content.
  let galleryStale = false;
  if (!m.galleryAuthored) {
    const gallery = renderGallery(m);
    galleryStale = !fs.existsSync(paths.gallery) || fs.readFileSync(paths.gallery, 'utf8') !== gallery;
  } else {
    galleryStale = !fs.existsSync(paths.gallery);
  }
  return { name: m.name, stale: docsStale || galleryStale, docsStale, galleryStale };
}

function main(argv) {
  const args = new Set(argv.filter((a) => a.startsWith('--')));
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;
  const manifests = loadAll();
  const filtered = only ? manifests.filter((m) => m.name === only) : manifests;
  if (only && filtered.length === 0) {
    process.stderr.write(`error: no component named "${only}"\n`);
    return 2;
  }

  if (args.has('--list')) {
    for (const m of filtered) {
      if (isEnriched(m)) process.stdout.write(`${m.name}\n`);
    }
    return 0;
  }

  if (args.has('--check')) {
    let staleCount = 0;
    for (const m of filtered) {
      const r = checkOne(m);
      if (r.stale) {
        process.stderr.write(`stale: ${m.name} (`);
        const parts = [];
        if (r.docsStale) parts.push('docs.md');
        if (r.galleryStale) parts.push('gallery.md');
        process.stderr.write(`${parts.join(', ')})\n`);
        staleCount += 1;
      }
    }
    if (staleCount) {
      process.stderr.write(`\n${staleCount} component(s) stale. Run \`node tools/build-component-docs.js\` to regenerate.\n`);
      return 1;
    }
    process.stdout.write(`${filtered.length} component(s) checked, all up to date.\n`);
    return 0;
  }

  let wrote = 0;
  let skipped = 0;
  for (const m of filtered) {
    const r = buildOne(m);
    if (r.skipped) {
      skipped += 1;
      continue;
    }
    if (r.docsWrote || r.galleryWrote) {
      wrote += 1;
      const parts = [];
      if (r.docsWrote) parts.push('docs.md');
      if (r.galleryWrote) parts.push('gallery.md');
      process.stdout.write(`wrote ${m.name} (${parts.join(', ')}; expected ${r.expectedPages} pages)\n`);
    }
  }
  if (!wrote) process.stdout.write(`no changes (${filtered.length - skipped} enriched, ${skipped} skipped)\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  renderDocs,
  renderGallery,
  galleryPlan,
  stressDocOf,
  injectFooter,
  expectedGallerySlideCount,
  compositionModifiersFor,
  COMPOSITION_MODIFIERS,
  isEnriched,
  buildOne,
  checkOne,
  targetPaths,
};
