#!/usr/bin/env node
/**
 * The house US-English dictionary: one curated British-to-American word map, shared by the `build:check` ratchet and the commit-msg hook (HARD RULE #21).
 *
 * Why it lives here rather than inside tools/check-ownership.js, where it was
 * born: the gate scans tracked FILES, and the two surfaces that carry the most
 * drift are not files. A commit message and a PR body never reach
 * `listRepoTextFiles`, so 21 British spellings rode into the last 300 commit
 * subjects and bodies under a green gate. Two readers of one list is HARD RULE
 * #1 — a second copy in the hook would be a dictionary that silently disagrees
 * with the one the build enforces.
 *
 * The map is EXPLICIT, and deliberately so. A stem rule over-matches (`centre`
 * inside `epicentre`) and a suffix rule guesses wrong in both directions
 * (`practise`→`practice` is not `-ise`→`-ize`; `analyses` is also the US plural
 * of "analysis"). Only unambiguous UK/US pairs are listed, which is why the
 * many words US keeps in the British-looking form — `dialogue`, `analysis`,
 * `exercise`, `comprise`, `advise`, `surprise`, `cancellation`, the noun
 * `practice` — are absent. Add a pair only when the distinction is unambiguous.
 *
 * Detection is case-insensitive; `suggest()` restores the casing it was given,
 * so a warning about `Behaviour` reads `Behavior` rather than `behavior`.
 *
 * Usage:
 *   const { findBritishSpellings } = require('./us-english');
 *   node tools/us-english.js --warn <file>   # advisory scan, always exits 0
 */

const fs = require('node:fs');

// British → American. Grouped by the pattern that produced each cluster; the
// groups are for the reader, nothing reads them.
const UK_TO_US = Object.freeze({
  // -our → -or
  colour: 'color', colours: 'colors', coloured: 'colored', colouring: 'coloring',
  colourful: 'colorful', colourless: 'colorless',
  behaviour: 'behavior', behaviours: 'behaviors', behavioural: 'behavioral',
  favour: 'favor', favours: 'favors', favoured: 'favored', favouring: 'favoring',
  favourable: 'favorable', favourite: 'favorite', favourites: 'favorites',
  flavour: 'flavor', flavours: 'flavors', flavoured: 'flavored',
  honour: 'honor', honours: 'honors', honoured: 'honored',
  labour: 'labor', labours: 'labors', laboured: 'labored',
  rumour: 'rumor', rumours: 'rumors', neighbour: 'neighbor', neighbours: 'neighbors',

  // -re → -er
  centre: 'center', centres: 'centers', centred: 'centered', centring: 'centering',
  metre: 'meter', metres: 'meters', litre: 'liter', litres: 'liters',
  fibre: 'fiber', fibres: 'fibers', theatre: 'theater', theatres: 'theaters',
  calibre: 'caliber',

  // -ise/-isation → -ize/-ization (explicit verb roots only — NEVER a blunt -ise stem)
  normalise: 'normalize', normalised: 'normalized', normalises: 'normalizes',
  normalising: 'normalizing', normalisation: 'normalization',
  optimise: 'optimize', optimised: 'optimized', optimises: 'optimizes',
  optimising: 'optimizing', optimisation: 'optimization',
  organise: 'organize', organised: 'organized', organises: 'organizes',
  organising: 'organizing', organisation: 'organization',
  recognise: 'recognize', recognised: 'recognized', recognises: 'recognizes',
  recognising: 'recognizing',
  emphasise: 'emphasize', emphasised: 'emphasized', emphasises: 'emphasizes',
  emphasising: 'emphasizing',
  summarise: 'summarize', summarised: 'summarized', summarises: 'summarizes',
  summarising: 'summarizing',
  prioritise: 'prioritize', prioritised: 'prioritized', prioritises: 'prioritizes',
  prioritising: 'prioritizing',
  minimise: 'minimize', minimised: 'minimized', minimises: 'minimizes',
  minimising: 'minimizing',
  maximise: 'maximize', maximised: 'maximized', maximises: 'maximizes',
  maximising: 'maximizing',
  customise: 'customize', customised: 'customized', customises: 'customizes',
  customising: 'customizing',
  standardise: 'standardize', standardised: 'standardized', standardises: 'standardizes',
  categorise: 'categorize', categorised: 'categorized', categorises: 'categorizes',
  categorising: 'categorizing',
  specialise: 'specialize', specialised: 'specialized', specialises: 'specializes',
  initialise: 'initialize', initialised: 'initialized', initialises: 'initializes',
  initialising: 'initializing',
  utilise: 'utilize', utilised: 'utilized', utilises: 'utilizes', utilising: 'utilizing',
  realise: 'realize', realised: 'realized', realises: 'realizes', realising: 'realizing',
  finalise: 'finalize', finalised: 'finalized', finalises: 'finalizes',
  capitalise: 'capitalize', capitalised: 'capitalized', capitalises: 'capitalizes',
  visualise: 'visualize', visualised: 'visualized', visualises: 'visualizes',
  visualising: 'visualizing',
  // NOT 'analyses' — that is also the US plural noun of "analysis"
  analyse: 'analyze', analysed: 'analyzed', analysing: 'analyzing',
  apologise: 'apologize', apologised: 'apologized', apologises: 'apologizes',
  apologising: 'apologizing',

  // -ence → -ense / misc unambiguous
  defence: 'defense', defences: 'defenses', offence: 'offense', offences: 'offenses',
  licence: 'license', licences: 'licenses', pretence: 'pretense', pretences: 'pretenses',
  catalogue: 'catalog', catalogues: 'catalogs', analogue: 'analog', analogues: 'analogs',
  artefact: 'artifact', artefacts: 'artifacts',
  grey: 'gray', greys: 'grays', greyed: 'grayed', greyscale: 'grayscale',
  whilst: 'while', amongst: 'among',
  fulfil: 'fulfill', fulfils: 'fulfills', enrol: 'enroll', enrols: 'enrolls',
  instil: 'instill', skilful: 'skillful', wilful: 'willful',
  cancelled: 'canceled', cancelling: 'canceling', labelled: 'labeled',
  labelling: 'labeling', modelling: 'modeling', signalling: 'signaling',
  travelled: 'traveled', travelling: 'traveling', marvellous: 'marvelous',
  judgement: 'judgment', judgements: 'judgments',
  acknowledgement: 'acknowledgment', acknowledgements: 'acknowledgments',
  ageing: 'aging',
  programme: 'program', programmes: 'programs',
  practise: 'practice', practised: 'practiced', practises: 'practices',
});

const UK_ENGLISH_FORMS = Object.freeze(Object.keys(UK_TO_US));

/** A fresh matcher each call — a shared /g regex carries `lastIndex` between callers. */
function britishFormRe() {
  return new RegExp(`\\b(${UK_ENGLISH_FORMS.join('|')})\\b`, 'gi');
}

/**
 * The American form of `word`, wearing the casing `word` arrived in: `Colour` →
 * `Color`, `COLOUR` → `COLOR`, `colour` → `color`. Returns null for a word the
 * dictionary does not carry.
 */
function suggest(word) {
  const us = UK_TO_US[word.toLowerCase()];
  if (!us) return null;
  if (word === word.toUpperCase()) return us.toUpperCase();
  if (word[0] === word[0].toUpperCase()) return us[0].toUpperCase() + us.slice(1);
  return us;
}

/** Every British spelling in `text`, in order, as `{ found, suggestion, line }`. */
function findBritishSpellings(text) {
  const hits = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const re = britishFormRe();
    let m;
    while ((m = re.exec(lines[i])) !== null) {
      hits.push({ found: m[0], suggestion: suggest(m[0]), line: i + 1 });
    }
  }
  return hits;
}

/**
 * Strip what git itself wrote into a commit-message file: the `#` comment lines
 * of the template, and everything after the `--verbose` scissors line (which
 * carries the whole diff, i.e. the repo's tracked text — already the ratchet's
 * job, and quoting it here would report the same backlog on every commit).
 */
function commitMessageBody(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (/^#\s*-+\s*>8\s*-+/.test(line)) break;
    if (line.startsWith('#')) continue;
    out.push(line);
  }
  return out.join('\n');
}

// ── CLI: advisory scan of a commit-message file ────────────────────────────
// WARNS, never blocks (exit 0 in every path). A commit message legitimately
// quotes British-spelled text — an upstream error string, a dependency's option
// name, a cited filename — and HARD RULE #14 forbids `--no-verify` as the way
// out, so a hard failure here would be a 3am dead end for a false positive.
// The tracked-file ratchet is the enforcing surface; this one coaches.
if (require.main === module) {
  const args = process.argv.slice(2);
  const file = args[args.indexOf('--warn') + 1];
  if (!args.includes('--warn') || !file) {
    console.error('usage: node tools/us-english.js --warn <file>');
    process.exit(0);
  }
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    process.exit(0); // no message file is git's problem to report, not ours
  }
  const hits = findBritishSpellings(commitMessageBody(text));
  if (hits.length) {
    const seen = new Map();
    for (const h of hits) seen.set(h.found, h.suggestion);
    const pairs = [...seen].map(([uk, us]) => `${uk} → ${us}`).join(', ');
    console.error(
      `\nUS English is the house dialect (HARD RULE #21). This commit message uses: ${pairs}\n` +
      'Not blocking — amend if it is our prose; keep it if you are quoting someone else\'s.\n',
    );
  }
  process.exit(0);
}

module.exports = { UK_TO_US, UK_ENGLISH_FORMS, britishFormRe, suggest, findBritishSpellings, commitMessageBody };
