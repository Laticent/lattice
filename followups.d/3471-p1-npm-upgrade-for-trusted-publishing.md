---
origin: 3471
priority: P1
recorded: 2026-11-23
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-07-first-npm-release.md §11
deferred: blocked — trusted publishing can only be attached to a package that exists, so it follows the first publish (Sun Nov 29); the upgrade belongs with slice F
source: https://github.com/Laticent/lattice/pull/3471
---
# Upgrade npm in the publish job so NPM_TOKEN can be revoked

why now   — npm trusted publishing (OIDC, no token) needs npm 11.5.1 or later. Node 22 ships npm 10.9,
            and .github/workflows/release-publish.yml has no upgrade step, so revoking NPM_TOKEN after
            1.0.0 (RELEASE.md release-day step 7) would make the next publish fail.
where     — .github/workflows/release-publish.yml, before "Publish to npm, tag, push the tags".
done when — the publish job runs `npm install -g npm@<11.5.1+>` and prints `npm --version`, a dispatch with
            no NPM_TOKEN publishes a library patch through its trusted publisher, and RELEASE.md step 7 says
            the token can go.
evidence  — the Actions run log and the provenance badge on npmjs.com.
verify    — tier 1 checker, because it changes how the registry credential works.
