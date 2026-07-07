// ① First look — the 60-second magic trick. Angle: earn belief fast. Open almost cold, land three
// reveals (title → number → chart), skip the meta. Front-loads the impressive; every reveal is a
// Teaching Beat so the "wait, from text?" actually registers.

import { landing, newDeck, revealSlide, SLIDE, type TourBuild, teachBeat, toWalkthrough } from './tour-kit';

const S = [SLIDE.title, SLIDE.bigNumber, SLIDE.radar];

export const firstLook: TourBuild = ({ mobile }) =>
	toWalkthrough([
		teachBeat('The Studio builds boardroom slides from plain text. Watch.', 500),
		...newDeck(mobile, 'Start with a blank deck…', '…“My First Deck.”'),
		...revealSlide(mobile, S, 1, { teach: 'Three lines of Markdown…', reveal: '…a boardroom title. Instantly.', cadence: mobile ? 20 : 18, wow: true }),
		...revealSlide(mobile, S, 2, { teach: 'One number that matters…', reveal: 'The whole slide is the metric.', cadence: 11 }),
		...revealSlide(mobile, S, 3, { teach: 'A few values in a list…', reveal: '…and the engine draws the chart.', cadence: 8, wow: true }),
		...landing(mobile, 'That fast. Now go build yours.'),
	]);
