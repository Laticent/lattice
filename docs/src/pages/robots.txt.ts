// /robots.txt — built from src/lib/discovery.mjs, which says why it is one group for every
// crawler. Preview-vs-production comes from deploy-env.mjs, the site's one test for it.
//
// NOTE: the PR previews are built in GitHub Actions (docs-preview.yml) with CF_PAGES unset,
// so they get the production text here. What keeps a preview out of search results is the
// `X-Robots-Tag: noindex` rule in public/_headers, which only Cloudflare reads.
import type { APIRoute } from 'astro';
import { isPreviewDeploy } from '../lib/deploy-env.mjs';
import { robotsTxt } from '../lib/discovery.mjs';

export const GET: APIRoute = ({ site }) =>
	new Response(robotsTxt({ site, index: !isPreviewDeploy({ cfPages: process.env.CF_PAGES, cfBranch: process.env.CF_PAGES_BRANCH }) }), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
