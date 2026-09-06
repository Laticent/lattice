/**
 * Registry adapter for the `team-profile` component. Kernel:
 * lib/components/inventory/team-profile/team-profile.transform.js.
 *
 * Rebuilds an authored people list (`- Name` + nested portrait / role / note)
 * into flat portrait cards, and draws a token-colored monogram for anyone with
 * no photo. Idempotent on the `.team-roster` marker class.
 */

const engine = require('../components/inventory/team-profile/team-profile.transform');

const SEL = 'section.team-profile';

module.exports = {
  name: 'team-profile',
  selector: SEL,
  applyToHtml(html) {
    return engine.applyToRenderedHtml(html);
  },
  applyToDom(root) {
    engine.applyToDom(root);
  },
};
