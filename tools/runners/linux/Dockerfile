# Lattice self-hosted Linux runner image: one container = one CI job, then it is thrown away.
#
# Built on ubuntu:24.04 so a job sees the same distro as GitHub's `ubuntu-24.04` runners: the
# golden PDFs and pixel checks compare renders, so the userland has to match. The image bakes in
# what CI otherwise downloads on every job (the apt packages ci.yml asks `apt-cached` for, the
# Playwright browsers, Node 22), so a job's first minute is work, not downloads.
#
# Build:  ./build-image.sh            (resolves the newest actions/runner release)
# Runbook: engineering/self-hosted-runners.md

FROM ubuntu:24.04

ARG RUNNER_VERSION
ARG NODE_MAJOR=22
ARG PLAYWRIGHT_VERSION=1.56.1

# Every RUN fails on the first failing command, including inside a pipe.
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    TZ=Etc/UTC \
    PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
    ImageOS=ubuntu24 \
    RUNNER_ALLOW_RUNASROOT=0

# Tools the hosted image ships that ci.yml and its actions call (git, jq, zsh, curl, unzip, xz,
# python3, sudo), plus the packages ci.yml installs through `.github/actions/apt-cached`
# (zsh; poppler-utils imagemagick fonts-noto-color-emoji).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl wget git git-lfs gnupg jq zsh unzip zip xz-utils sudo \
      python3 python3-pip build-essential pkg-config \
      poppler-utils imagemagick fonts-noto-color-emoji fontconfig \
      libicu74 libkrb5-3 zlib1g liblttng-ust1t64 \
 && rm -rf /var/lib/apt/lists/*

# Node from nodejs.org, newest release of NODE_MAJOR, checked against the published SHA-256 list.
RUN base="https://nodejs.org/dist/latest-v${NODE_MAJOR}.x" \
 && file=$(curl -fsSL "$base/SHASUMS256.txt" | grep -oE "node-v[0-9.]+-linux-x64\.tar\.xz" | head -n1) \
 && curl -fsSLO "$base/$file" \
 && curl -fsSL "$base/SHASUMS256.txt" | grep " $file\$" | sha256sum -c - \
 && tar -xJf "$file" -C /usr/local --strip-components=1 --no-same-owner \
 && rm "$file" \
 && node --version | grep -q "^v${NODE_MAJOR}\."

# GitHub CLI, from GitHub's own apt repository.
RUN install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli.gpg \
 && echo "deb [signed-by=/etc/apt/keyrings/githubcli.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# The job runs as `runner`, never root. Passwordless sudo stays, because workflow steps call
# `sudo apt-get` exactly as they do on a hosted runner; the container is discarded after one job.
RUN useradd -m -u 1001 -s /bin/bash runner \
 && echo 'runner ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/runner \
 && chmod 0440 /etc/sudoers.d/runner

# Playwright browsers and their system libraries, at the version docs/package.json pins.
# Bump PLAYWRIGHT_VERSION with it, or jobs download their own copy every run.
RUN npx -y "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium webkit firefox \
 && chmod -R a+rX "$PLAYWRIGHT_BROWSERS_PATH" \
 && rm -rf /var/lib/apt/lists/* /root/.npm

# The GitHub Actions runner itself.
WORKDIR /home/runner/actions-runner
RUN test -n "$RUNNER_VERSION" || { echo "RUNNER_VERSION is required (build-image.sh sets it)"; exit 1; } \
 && curl -fsSL -o runner.tgz \
      "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" \
 && tar xzf runner.tgz && rm runner.tgz \
 && chown -R runner:runner /home/runner

COPY --chmod=0755 entrypoint.sh /usr/local/bin/entrypoint.sh

USER runner
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
