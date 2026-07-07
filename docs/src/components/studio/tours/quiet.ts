// ⑤ The quiet tour — show, don't tell. Angle: the confident teacher who under-explains. Few, short
// captions; the render does the talking; every reveal LINGERS. The `read` dwell floor (1600ms) plus
// long `land` holds make it the most patient tour — the antidote to a feature recital.

import { coach, landing, newDeck, reskin, revealSlide, SLIDE, type TourBuild, teachBeat, toWalkthrough } from './tour-kit';

const S = [SLIDE.title, SLIDE.radar];

export const quiet: TourBuild = ({ mobile }) =>
	toWalkthrough([
		teachBeat('Watch.', 700),
		...newDeck(mobile, 'A blank deck.', '“My First Deck.”'),
		...revealSlide(mobile, S, 1, { teach: 'Type.', reveal: 'You wrote that. In Markdown.', cadence: mobile ? 16 : 14, wow: true, land: mobile ? 2400 : 1800 }),
		...revealSlide(mobile, S, 2, { teach: 'A few values.', reveal: 'A chart. From text.', cadence: 8, wow: true, land: mobile ? 2400 : 1800 }),
		...reskin(mobile, 'One theme.', 'Or dark.'),
		...coach('Board-ready.'),
		...landing(mobile, 'That’s the Studio.'),
	]);
