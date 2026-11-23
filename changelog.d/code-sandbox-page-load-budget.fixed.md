- **Internal: a code package's load limit now bounds only the package.** `openPackageSandbox` gave
  the same time limit to the sandbox's own page load and to the package's top-level code, so a caller
  passing a limit under 5 seconds could see a browser navigation timeout instead of the package's own
  error. The page now keeps its own 5-second limit. The export's default path already used 5 seconds
  and is unchanged.
