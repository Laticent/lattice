- The agent kit's generator wraps quoted canons in a fence longer than anything
  inside them. A fixed ` ``` ` splits the moment a payload carries one at the start
  of a line, and the remainder then parses as markup rather than as the quoted text
  — `COMPONENT_CANON` already carries inline runs, and these canons are prose anyone
  may edit.
- It calls esbuild through its API rather than spawning `node_modules/.bin/esbuild`,
  matching the other ten build tools. The shim is extensionless and not directly
  executable on Windows, and this build runs from `prepare`, so a spawn failure
  there is an install failure for a consumer.
