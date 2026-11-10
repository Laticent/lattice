#!/usr/bin/env bash
# WebKit's system packages for Playwright, from a cached folder of .deb files instead of Ubuntu's package mirror.
#
#   install-deps.sh download <dir>   fetch the packages `playwright install-deps webkit` names, and the ones they need
#                                    that this machine lacks, into <dir> (a cache miss: the one time the mirror is used)
#   install-deps.sh install <dir>    install every .deb in <dir> that this machine lacks or has at a lower version
#
# Why: `playwright install --with-deps webkit` ran apt-get against the mirror on every run. Over 17 CI runs the step took
# 36 s at the median, but 5 took over 2 min, 2 over 10, and one never finished inside its job's 25 minutes (flaky shape
# F6, engineering/decisions/2026-11-06-flaky-tests.md). A .deb the image already holds at an equal or newer version is
# skipped, so a newer runner image is never downgraded; a library a newer image drops makes dpkg fail, loudly, here.
set -euo pipefail
mode=${1:?download or install}
dir=${2:?the .deb folder}
case "$mode" in
  download)
    # Playwright's own list for this OS, the same one `--with-deps` installs, so the two can never drift.
    list=$(cd docs && npx playwright install-deps --dry-run webkit)
    pkgs=$(printf '%s\n' "$list" | sed -n 's/.*apt-get install -y --no-install-recommends \([^"&;]*\).*/\1/p' | head -1)
    [ -n "$pkgs" ] || { echo "install-deps.sh: no package list in: $list" >&2; exit 1; }
    mkdir -p "$dir/partial"
    sudo apt-get update
    # shellcheck disable=SC2086 # the list is words
    sudo apt-get install -y --no-install-recommends --download-only -o Dir::Cache::archives="$dir" $pkgs
    sudo rm -rf "$dir/partial" "$dir/lock"
    sudo chown -R "$(id -u):$(id -g)" "$dir"
    echo "install-deps.sh: $(ls "$dir"/*.deb 2>/dev/null | wc -l) packages in $dir"
    ;;
  install)
    todo=()
    for deb in "$dir"/*.deb; do
      [ -e "$deb" ] || continue
      name=$(dpkg-deb -f "$deb" Package)
      want=$(dpkg-deb -f "$deb" Version)
      have=$(dpkg-query -W -f='${db:Status-Abbrev} ${Version}' "$name" 2>/dev/null || true)
      if [ "${have%% *}" = ii ] && dpkg --compare-versions "${have##* }" ge "$want"; then continue; fi
      todo+=("$deb")
    done
    echo "install-deps.sh: installing ${#todo[@]} packages from $dir"
    [ "${#todo[@]}" -eq 0 ] || sudo dpkg -i "${todo[@]}"
    ;;
  *) echo "install-deps.sh: unknown mode $mode" >&2; exit 1 ;;
esac
