// ① First look — the 60-second magic trick. Angle: earn belief fast. Open almost cold, land three
// reveals (title → number → chart), skip the meta. Front-loads the impressive; every reveal is a
// Teaching Beat so the "wait, from text?" actually registers.

import { FIRST_LOOK_LINES as L } from './lines';
import { landing, newDeck, revealSlide, SLIDE, type TourBuild, teachBeat, toWalkthrough } from './tour-kit';

const S = [SLIDE.title, SLIDE.bigNumber, SLIDE.radar];

export const firstLook: TourBuild = ({ mobile }) =>
	toWalkthrough([
		teachBeat(L.open, 500),
		...newDeck(mobile, L.deck, L.named),
		...revealSlide(mobile, S, 1, { teach: L.title, reveal: L.titled, cadence: mobile ? 20 : 18, wow: true }),
		...revealSlide(mobile, S, 2, { teach: L.number, reveal: L.numbered, cadence: 11 }),
		...revealSlide(mobile, S, 3, { teach: L.values, reveal: L.chart, cadence: 8, wow: true }),
		...landing(mobile, L.close),
	]);
