---
origin: 3145
priority: P2
recorded: 2026-11-12
area: infra
severity: medium
swimlane: engineering/gotchas/ci.md
deferred: off-path — the puppeteer and node caches in ci.yml and the nightlies; #3145 changes only the apt and Playwright caches
source: https://github.com/Laticent/lattice/pull/3145
---
# Stop every pull request saving its own puppeteer cache

why now   — the repository's caches sit at GitHub's 10 GB limit, so GitHub evicts the least recently used entries, and
            on 2026-11-12 an entry left unused for about 84 minutes was gone. apt-cache-warm.yml's `cache usage` job
            measured the largest share: 12 `puppeteer-*` entries saved by pull requests, 2.77 GB, about 230 MB each;
            node-cache added 1.11 GB more from pull requests. The key is `puppeteer-<os>-<hash of package-lock.json>`,
            and nothing saves it on main except the nightlies, so the apt problem #3139 and #3145 fixed applies here
            too: a PR whose entry is not on main (a lockfile change, or main's entry evicted) saves a 230 MB entry of
            its own, which no other PR can restore, which pushes something else off the evicted end.
where     — the `Cache Puppeteer browser` steps in .github/workflows/ci.yml and the nightlies; apt-cache-warm.yml
            (a row family for the puppeteer and node caches), or a key on the Puppeteer version rather than the whole
            lockfile, so one entry serves every PR that does not change Puppeteer.
done when — a fresh PR that does not change Puppeteer's version restores the puppeteer entry from main, and the
            `cache usage` table shows no more than one puppeteer entry per Puppeteer version.
evidence  — the `cache usage` job in apt-cache-warm.yml's run on PR #3145 head 804eceab (run 43170066420).
verify    — that table after a day of PRs; the GitHub setting for the repository's cache limit is the owner's call.
