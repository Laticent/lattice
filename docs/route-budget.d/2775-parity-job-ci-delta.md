studio: +4
playground: +4
This PR changes no file under `docs/src` or `lib` that reaches a built chunk: it adds a nightly workflow job, an e2e spec and project, and docs. No growth is claimed. CI's docs build reads +4 bytes on the two routes that embed the playground asset hash, and the cause was not reproduced (engineering/gotchas/ci.md, "A PR that changes only markdown fails the route budget by a few bytes").
