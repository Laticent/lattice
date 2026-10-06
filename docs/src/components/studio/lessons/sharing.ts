// SHARING — handing the finished deck to someone who does not use Lattice: the webpage player and
// PowerPoint.
//
// Loaded on demand, like every track (catalog.ts). Both lessons take the PDF lesson's shape (Share,
// then the format's row, then its options) and stop at the Download button: the file is the user's
// to make, so a lesson never downloads for them. Kit and rules: ./lesson-kit.ts; every line lives
// in ./lines.ts.

import { type LessonBuild, SEL, settle, tell, visible, yourTurn } from './lesson-kit';
import { LESSON_LINES } from './lines';

const H = LESSON_LINES['share-html'];
const P = LESSON_LINES['share-pptx'];

const ready = (sel: string) => (): boolean => visible(sel)() != null;

const shareHtml: LessonBuild = () => async (ctx) => {
	await tell(ctx, { say: H.what });
	await yourTurn(ctx, { say: H.share, target: SEL.share, perform: (a) => a.run('share'), missing: H.shareMissing });
	if (!(await settle(ctx, ready(SEL.shareHtml)))) return;
	await yourTurn(ctx, { say: H.html, target: SEL.shareHtml, perform: (a) => a.press(SEL.shareHtml), missing: H.htmlMissing });
	if (!(await settle(ctx, ready(SEL.htmlDownload)))) return;
	// No `perform`: downloading a file is the one step a lesson never takes for the user.
	await yourTurn(ctx, { say: H.download, target: SEL.htmlDownload });
	await tell(ctx, { say: H.next });
};

const sharePptx: LessonBuild = () => async (ctx) => {
	await tell(ctx, { say: P.what });
	await yourTurn(ctx, { say: P.share, target: SEL.share, perform: (a) => a.run('share'), missing: P.shareMissing });
	if (!(await settle(ctx, ready(SEL.sharePptx)))) return;
	await yourTurn(ctx, { say: P.pptx, target: SEL.sharePptx, perform: (a) => a.press(SEL.sharePptx), missing: P.pptxMissing });
	if (!(await settle(ctx, ready(SEL.pptxDownload)))) return;
	// No `perform`, as above.
	await yourTurn(ctx, { say: P.download, target: SEL.pptxDownload });
	await tell(ctx, { say: P.next });
};

export const SHARING = {
	'share-html': shareHtml,
	'share-pptx': sharePptx,
} as const satisfies Record<string, LessonBuild>;
