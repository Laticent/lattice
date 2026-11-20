/**
 * Acronyms the exemplar segments write that have MORE THAN ONE reading across them, with the readings
 * we know of (engineering/decisions/2026-11-19-segment-acronyms.md). The speech dictionary
 * (docs/src/lib/cadenza/lexicon.ts) never expands one: a wrong expansion is worse than none, and the
 * deck's own `terms:` entry is the only thing that can say which reading it means. `lint:deck` names
 * these readings when it finds one unregistered (`narration-acronym-ambiguous`), so the author picks.
 *
 * It lives HERE, beside the linter that reads it, and not in Cadenza: Cadenza ships to the browser in
 * every route's startup JavaScript, and this table is only ever read by the command-line linter.
 * Data, not a rule: adding an entry changes only what the suggestion offers.
 */
const AMBIGUOUS_TERMS = Object.freeze({
  AP: ['accounts payable', 'Advanced Placement', 'Associated Press'],
  AF: ['atrial fibrillation', 'Air Force'],
  AA: ['the W C A G A A level', 'Alcoholics Anonymous', 'associate of arts'],
  TA: ['teaching assistant', 'technical assistance', 'target audience'],
  PO: ['purchase order', 'product owner', 'post office'],
  CS: ['customer success', 'computer science'],
  CI: ['continuous integration', 'confidence interval'],
  CAC: ['customer acquisition cost', 'Common Access Card'],
  LTV: ['lifetime value', 'loan to value'],
  ERP: ['enterprise resource planning', 'event-related potential'],
  EDI: ['electronic data interchange', 'equity, diversity and inclusion'],
  CFR: ['Code of Federal Regulations', 'case fatality rate'],
  MTTR: ['mean time to recovery', 'mean time to repair', 'mean time to resolve'],
  JV: ['joint venture', 'junior varsity'],
  // One meaning, but used as its own plural after a number ("250 FTE"), so no one spoken form is right
  // in both places: "two hundred fifty full-time equivalent" is wrong English. The deck says which.
  FTE: ['full-time equivalent', 'full-time equivalents'],
  CNA: ['certified nursing assistant', 'Center for Naval Analyses'],
  BMI: ['body mass index', 'Broadcast Music, Incorporated'],
  CRO: ['chief revenue officer', 'contract research organization', 'conversion rate optimization'],
  CMO: ['chief marketing officer', 'contract manufacturing organization'],
  IP: ['intellectual property', 'internet protocol'],
  AR: ['accounts receivable', 'augmented reality'],
  PM: ['product manager', 'project manager', 'afternoon'],
  US: ['the United States', 'us'],
  IT: ['information technology', 'it'],
});

module.exports = { AMBIGUOUS_TERMS };
