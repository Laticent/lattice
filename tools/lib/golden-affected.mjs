// WHICH GOLDENS CAN A PULL REQUEST'S DIFF AFFECT? — pure, so it is unit-tested.
//
// Under the bot-blessed design (2026-10-06-goldens-bot-blessed.md §2.2) a PR no longer
// commits PDFs, so `golden-diff` cannot learn what moved from the PDFs the PR changed. It
// learns it from the SOURCES the PR changed instead, renders those goldens fresh, and
// diffs them against the base branch's committed PDFs. This module is the mapping:
//
//   a deck's markdown (with a committed sibling PDF)  → that deck golden
//   a `*.gallery.md`                                  → that gallery, both moods
//   lib/components/<bucket>/<name>/**                 → <name>'s gallery + <bucket>'s gallery
//   lib/components/<bucket>/<shared, e.g. _x>/**       → every gallery in <bucket>
//   anything shared (engine, CSS, themes, emulator,
//     dependencies, the rest of lib/)                 → every gallery, bucket galleries first
//     (a package.json edit confined to `scripts` and other inert keys is not a dependency
//     change: renderRelevantChanges drops it first)
//   files that cannot change a render                 → nothing
//
// It errs toward rendering MORE: an unknown path under lib/ counts as shared. A deck whose
// only change is a shared input is NOT rendered here; ~200 decks is a nightly budget, not a
// per-PR one, and the nightly bless covers them. The cap bounds the per-PR cost; whatever
// it drops is counted and reported, never silently skipped (HARD RULE #25).

// Paths that cannot change how any golden renders.
const RENDER_IRRELEVANT = [
  /^lib\/authoring\//, // the deck linter
  /^lib\/diagnostics\//,
  /^lib\/playground\//,
  /\.docs\.md$/, // component prose (HARD RULE #6), not slides
  /^lib\/README\.md$/,
];

// Paths outside lib/ that DO change renders, for every gallery.
const SHARED_OUTSIDE_LIB = [
  /^themes\//,
  /^lattice-emulator\.js$/,
  /^mermaid-v11-min\.js$/,
  /^package(-lock)?\.json$/, // a dependency bump can move every render
  /^assets\/fonts\//,
  /^tools\/build-css\.js$/,
  /^tools\/build-galleries\.js$/,
  /^tools\/build-bucket-galleries\.js$/,
  /^tools\/lib\/golden-render\.mjs$/,
];

// package.json keys that cannot change a render. A change confined to these is not a
// dependency change: a PR that only adds an npm script must not widen the render to every
// gallery or skip the base render that tells "this PR moved it" from "stale on main" (#2583
// listed 46 changed slides for a one-line `scripts` edit). An ALLOWLIST, not a list of
// dependency fields, so a key nobody thought about (`version`, which lattice-emulator.js
// reads; `exports`; `engines`) still counts as a render input — the module errs toward
// rendering more. The lockfile is a separate path and always counts.
const PACKAGE_JSON_INERT_KEYS = new Set([
  'scripts', 'description', 'keywords', 'homepage', 'repository', 'bugs',
  'author', 'contributors', 'funding', 'license', 'files',
]);

/**
 * Does a package.json edit touch anything that can change a render?
 * @param {string|null} baseText  package.json on the base (null: absent there)
 * @param {string|null} headText  package.json on this branch (null: absent here)
 * @returns {boolean} false only when every changed top-level key is inert
 */
export function packageJsonMovesRenders(baseText, headText) {
  let base;
  let head;
  try {
    base = JSON.parse(baseText);
    head = JSON.parse(headText);
  } catch {
    return true; // missing or unparsable on a side: cannot prove it inert
  }
  if (!base || !head || typeof base !== 'object' || typeof head !== 'object') return true;
  for (const key of new Set([...Object.keys(base), ...Object.keys(head)])) {
    if (PACKAGE_JSON_INERT_KEYS.has(key)) continue;
    if (JSON.stringify(base[key]) !== JSON.stringify(head[key])) return true;
  }
  return false;
}

/**
 * The changed-path list golden-diff reasons about: `package.json` drops out when its edit is
 * inert, so neither the render scope nor the dependency-change rule sees it. The caller reads
 * the two texts lazily (`git show` costs a process), hence the thunks.
 * @param {string[]} changed
 * @param {() => string|null} readBase  package.json on the base
 * @param {() => string|null} readHead  package.json on this branch
 */
export function renderRelevantChanges(changed, readBase, readHead) {
  if (!changed.includes('package.json')) return changed;
  if (packageJsonMovesRenders(readBase(), readHead())) return changed;
  return changed.filter((f) => f !== 'package.json');
}

// The per-PR render cap (gallery × mood renders). golden-diff renders at most this many;
// the env GOLDEN_DIFF_RENDER_CAP overrides it there. One constant, so nothing that reasons
// about what a PR rendered can disagree with what it did.
export const DEFAULT_RENDER_CAP = 40;

const COMPONENT_RE = /^lib\/components\/([^/]+)\/([^/]+)\//;
const BUCKET_FILE_RE = /^lib\/components\/([^/]+)\/[^/]+$/;

/**
 * @param {string[]} changed   repo-relative paths the PR changed
 * @param {object}   corpus
 * @param {string[]} corpus.galleries    repo-relative `*.gallery.md` paths
 * @param {string[]} corpus.deckGoldens  repo-relative committed deck-golden `.pdf` paths
 * @param {number}   [corpus.cap]        max gallery renders (gallery × mood); default 40
 * @param {(md: string) => string|null} [corpus.newDeckPdf]  for a deck markdown with NO
 *        committed PDF yet: the PDF it should produce, or null when it is not a deck.
 *        Pull requests no longer commit PDFs (goldens step 3), so a new deck has none, and
 *        without this it would never be rendered on its PR.
 * @returns {{ galleries: string[], decks: string[], omitted: string[], scope: 'none'|'targeted'|'shared', reasons: string[] }}
 *   galleries — `*.gallery.md` to render in both moods (within the cap)
 *   decks     — deck-golden `.pdf` paths to render
 *   omitted   — galleries the cap dropped (left to the nightly bless)
 */
export function affectedGoldens(changed, { galleries, deckGoldens, cap = DEFAULT_RENDER_CAP, newDeckPdf = () => null }) {
  const gallerySet = new Set(galleries);
  const deckSet = new Set(deckGoldens);
  const wantGalleries = new Set();
  const decks = new Set();
  const reasons = [];
  let shared = false;

  const galleryOf = (bucket, name) => `lib/components/${bucket}/${name}/${name}.gallery.md`;
  const bucketGallery = (bucket) => `lib/components/${bucket}/${bucket}.gallery.md`;
  const add = (g) => { if (gallerySet.has(g)) wantGalleries.add(g); };

  for (const f of changed) {
    if (RENDER_IRRELEVANT.some((re) => re.test(f))) continue;
    if (f.endsWith('.gallery.md')) {
      add(f);
      continue;
    }
    if (f.endsWith('.md') && deckSet.has(f.replace(/\.md$/, '.pdf'))) {
      decks.add(f.replace(/\.md$/, '.pdf'));
      continue;
    }
    if (f.endsWith('.md')) {
      const pdf = newDeckPdf(f);
      if (pdf) { decks.add(pdf); continue; }
    }
    if (f.endsWith('.pdf')) continue; // committed PDFs are golden-diff's other path
    const comp = f.match(COMPONENT_RE);
    if (comp) {
      const [, bucket, dir] = comp;
      if (dir.startsWith('_')) {
        // A bucket-shared directory (e.g. chart/_chart-family): every gallery in the bucket.
        for (const g of galleries) if (g.startsWith(`lib/components/${bucket}/`)) add(g);
        reasons.push(`${f} is shared by the ${bucket} bucket`);
      } else {
        add(galleryOf(bucket, dir));
        add(bucketGallery(bucket));
      }
      continue;
    }
    const bucketFile = f.match(BUCKET_FILE_RE);
    if (bucketFile) {
      for (const g of galleries) if (g.startsWith(`lib/components/${bucketFile[1]}/`)) add(g);
      continue;
    }
    if (f.startsWith('lib/') || SHARED_OUTSIDE_LIB.some((re) => re.test(f))) {
      shared = true;
      if (reasons.length < 5) reasons.push(`${f} is shared by every gallery`);
    }
  }

  if (shared) for (const g of galleries) wantGalleries.add(g);

  // Bucket galleries first: each is one sample slide per component, so they cover the most
  // components per render. Then everything else, alphabetically.
  const isBucket = (g) => /^lib\/components\/([^/]+)\/\1\.gallery\.md$/.test(g);
  const ordered = [...wantGalleries].sort((a, b) => Number(isBucket(b)) - Number(isBucket(a)) || a.localeCompare(b));
  const perGallery = 2; // light + dark
  const fit = Math.max(0, Math.floor(cap / perGallery));
  const scope = shared ? 'shared' : ordered.length || decks.size ? 'targeted' : 'none';
  return {
    galleries: ordered.slice(0, fit),
    decks: [...decks].sort(),
    omitted: ordered.slice(fit),
    scope,
    reasons,
  };
}
