/**
 * lib/integrations/markdown-it/form-frame.js — which Frame a slide composes as, and the `form` class
 * that marks the chrome-hosting one. Shared by the engine (plugins.js) and the runtime's Form default
 * (lib/forms/form-default.js); a module of its own so the runtime does not bundle all of plugins.js
 * to get it (docs/route-budget.json `engineJsGz`). Kept in this directory: `deriveSovereignFrames`
 * reaches lib/forms by a relative path built at run time.
 */

/**
 * The SOVEREIGN Frames — the Frames that carry no chrome Cells, so the `form`
 * class must not tag them. DERIVED from the Form frame manifests
 * (lib/forms/frame/<id>/<id>.manifest.json — the set with `exemptFromChrome:
 * true`), so adding a sovereign Frame folder auto-updates this without editing
 * this file (design/forms.md §11; 2026-06-15-form-implementation.md §6 — the
 * Open/Closed win).
 *
 * DUAL-CONSUMER CONTRACT (see this file's header): the Form loader reads the
 * filesystem, which the browser playground bundle (esbuild, platform:browser)
 * cannot do. So the derivation runs ONLY at Node load, behind a guard that
 * esbuild cannot statically resolve; the browser bundle falls back to the
 * baked literal below. A unit test asserts the two are identical, so the baked
 * fallback can never drift from the manifests.
 */
const SOVEREIGN_FRAMES_FALLBACK = [
  'closing', 'compare-code', 'divider',
  'image', 'premise', 'scene',
  'split-compare', 'split-panel', 'title', 'topic',
];

function deriveSovereignFrames() {
  // `require` via a computed expression so esbuild leaves it as a runtime call
  // (unresolved in the browser bundle) instead of pulling node:fs into it.
  try {
    if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
      return SOVEREIGN_FRAMES_FALLBACK;
    }
    const req = (typeof module !== 'undefined' && module.require)
      ? module.require.bind(module)
      : require;
    // Computed (non-literal) specifier so esbuild can't statically resolve and
    // bundle the fs-using loader into the browser IIFE — it stays a runtime
    // require that simply fails (caught) in the browser.
    const spec = ['..', '..', 'forms'].join('/');
    const forms = req(spec);
    const derived = forms.sovereignFrames();
    return derived?.length ? derived : SOVEREIGN_FRAMES_FALLBACK;
  } catch (_e) {
    return SOVEREIGN_FRAMES_FALLBACK;
  }
}

const SOVEREIGN_FRAMES = deriveSovereignFrames();

/** The CSS hook for the CHROME-HOSTING Frame. Not "is this Form" — see below. */
const FORM_CLASS = 'form';
/** The rendering medium. One value today; a spatial renderer would be the second. */
const FORM_MEDIUM = '2d';

/**
 * Is this slide's Frame a SOVEREIGN one — a Frame that declares a single `stage`
 * Cell and no chrome Cells at all (title, divider, closing, image, premise, scene,
 * split-panel, split-compare, compare-code, topic)?
 */
function isSovereignFrame(classAttr) {
  return (classAttr || '').split(/\s+/).filter(Boolean).some((t) => SOVEREIGN_FRAMES.includes(t));
}

/**
 * Which Frame this slide composes as: the sovereign layout token, or `standard`.
 *
 * THE `form` CLASS WINS OVER A SOVEREIGN TOKEN, and that is not a tie-breaker — it is
 * the answer. A slide carrying `form` has the chrome Cells; that is what the class is
 * for. An AUTHORED `form` on a sovereign slide cannot reach here, because
 * `formToggleClass` strips it — so the only way both appear together is when the engine
 * itself put them there, and there is exactly one such producer: the split envelope's
 * `compareOptionSections`, which re-authors a `split-compare` slide into body pages that
 * keep the layout class for its `.compare-left` / `.compare-right` styling AND take real
 * masthead and footer Cells. Those pages compose under the chrome-hosting Frame while
 * still being painted by `section.split-compare` rules.
 *
 * Reading the sovereign token first said `split-compare` for four pages of
 * `examples/split-decision.md` and two of `examples/social-grid.md`, against a
 * `data-frame="standard"` the splitter had already stamped — so `frameIdFor` and the
 * shipped DOM disagreed, and the runtime twin would have rewritten the attribute to the
 * wrong value on any path where it runs after a split. Found by the red-team lens.
 */
function frameIdFor(classAttr) {
  const tokens = (classAttr || '').split(/\s+/).filter(Boolean);
  if (tokens.includes(FORM_CLASS)) return 'standard';
  return tokens.find((t) => SOVEREIGN_FRAMES.includes(t)) || 'standard';
}

/**
 * Does this slide's Frame host the chrome Cells — the masthead band, the bay, the
 * footer Cell and the progress rail? True for the chrome-hosting `standard` Frame,
 * false for the ten sovereign Frames.
 */
function hostsChromeCells(classAttr) {
  return !isSovereignFrame(classAttr);
}

/**
 * Resolve one section's class list. Appends `form` to a chrome-hosting slide.
 *
 * `form` IS NOT "THIS SLIDE COMPOSES AS FORM" — every slide does, unconditionally.
 * It is the CSS hook for the chrome-hosting Frame, and it is carried by the ~245
 * engine rules that paint the masthead band, the bay, the footer Cell and the rail.
 * The universal fact lives on the ATTRIBUTES instead (`data-form`, `data-frame`,
 * stamped by applyFormToHtml below), because that is a statement about the model
 * and this is a selector.
 *
 * We tried making the class universal and marking sovereignty with a second class.
 * It is the same fact either way, but the class is load-bearing for a decade of CSS
 * and the split envelope, and universalizing it moved real decks three separate
 * times — a full-bleed masthead on `social-grid`, a `:not()` specificity bump on
 * `palette-audit`, and the `premise` split runs in `split-horizontal` /
 * `autosplit-coverage` gaining chrome geometry they never had. Each needed its own
 * guard. The attributes say the same thing and move nothing.
 * See engineering/decisions/2026-09-20-form-is-not-configurable.md § "Why the class
 * did not become universal".
 *
 * Idempotent, and there is no opt-out token: a deck cannot refuse Form.
 *
 * `authored: false` TURNS THE STRIP OFF, and it is the whole reason this takes options.
 * The strip below corrects an AUTHOR. The engine itself writes the same combination on
 * purpose in one place — `compareOptionSections` re-authors a `split-compare` slide into
 * body pages that keep the layout class for its `.compare-left` / `.compare-right`
 * styling AND take real masthead and footer Cells — and stripping there would pull chrome
 * off pages the splitter had just built it into.
 *
 * That exemption used to live in the DOM twin, as a `data-split-role` check at the call
 * site, and the engine twin had no equivalent because it receives a class STRING and
 * cannot see the attribute. The two paths therefore agreed only because auto-split runs
 * later, in the browser — a fact about pass ordering, written in a comment, which is not
 * what HARD RULE #1 means by a shared kernel. The rule now lives here with its reason,
 * and each caller says which world it is in: the engine pass only ever meets authored
 * classes, so it passes nothing.
 *
 * SOVEREIGNTY IS TESTED FIRST, and an author-written `form` token is STRIPPED.
 * The order used to be the other way round, which left the one case where the token
 * was still live: `<!-- _class: title form -->` kept the class, so a sovereign slide
 * picked up `section.form`'s chrome geometry and its ink moved 16px at 2560x1440
 * (measured — `--footer-reserve` padding). That slide then said two contradictory
 * things about itself, `data-frame="title"` against a chrome-hosting class, and
 * `lint:deck` told the author the token was inert while deleting it moved their
 * deck. Stripping it is what makes all three true at once: the token does nothing,
 * the lint is honest, and the Frame decides alone.
 */
function formToggleClass(classAttr, { authored = true } = {}) {
  const tokens = (classAttr || '').split(/\s+/).filter(Boolean);
  if (isSovereignFrame(classAttr)) {
    // A SOVEREIGN CLASS IS NEVER GIVEN `form` HERE, whatever `authored` says. The option
    // only decides whether an existing one is taken AWAY — "do not strip", not "treat
    // this as non-sovereign". Conflating the two hands a `form` class to every
    // native-slice page of a sovereign run (`premise lat-split-native`, which carries
    // `data-split-role` and no `form`), which is the chrome geometry the abandoned
    // universal-class cut moved `split-horizontal` and `autosplit-coverage` with.
    if (!tokens.includes(FORM_CLASS)) return classAttr;
    // Return the ORIGINAL string when there is nothing to strip: callers compare the
    // result against the input to decide whether to rewrite the tag at all, so
    // re-joining would churn whitespace on every sovereign slide for no reason.
    return authored ? tokens.filter((t) => t !== FORM_CLASS).join(' ') : classAttr;
  }
  if (tokens.includes(FORM_CLASS)) return classAttr;
  tokens.push(FORM_CLASS);
  return tokens.join(' ');
}

module.exports = {
  SOVEREIGN_FRAMES_FALLBACK, deriveSovereignFrames, SOVEREIGN_FRAMES, FORM_CLASS, FORM_MEDIUM,
  isSovereignFrame, frameIdFor, hostsChromeCells, formToggleClass,
};
