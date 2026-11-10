#!/usr/bin/env bash
# WebKit's system packages for Playwright, from a cached folder of .deb files instead of Ubuntu's package mirror.
#
#   install-deps.sh download <dir>   fetch the packages `playwright install-deps webkit` names, and the ones they need
#                                    that this machine lacks, into <dir> (a cache miss)
#   install-deps.sh install <dir>    install every .deb in <dir> that this machine lacks or has at a lower version, then
#                                    make sure every package on Playwright's list is installed
#
# Why: `playwright install --with-deps webkit` ran apt-get against the mirror on every run. Over 17 CI runs the step took
# 36 s at the median, but 5 took over 2 min, 2 over 10, and one never finished inside its job's 25 minutes (flaky shape
# F6, engineering/decisions/2026-11-06-flaky-tests.md). A .deb the image already holds at an equal or newer version is
# skipped, so a newer runner image is never downgraded.
#
# A cache built on one runner image can stop fitting a later one: it holds only what that image lacked, and several of
# these packages pin each other's exact versions. So when dpkg refuses the set, or a listed package is still missing,
# this repairs from the mirror (with a warning), downloading into <dir> so the cache saved under the new image's key
# fits from then on. The mirror is read only when the cache does not fit.
set -euo pipefail
mode=${1:?download or install}
dir=${2:?the .deb folder}

# Playwright's own list for this OS, the same one `--with-deps` installs, so the two can never drift. Local, no network.
playwright_packages() {
  local list pkgs
  list=$(cd docs && npx playwright install-deps --dry-run webkit)
  pkgs=$(printf '%s\n' "$list" | sed -n 's/.*apt-get install -y --no-install-recommends \([^"&;]*\).*/\1/p' | head -1)
  [ -n "$pkgs" ] || { echo "install-deps.sh: no package list in: $list" >&2; exit 1; }
  printf '%s\n' "$pkgs"
}

# apt with <dir> as its download folder, so whatever it fetches lands in the cache.
apt_into() {
  mkdir -p "$dir/partial"
  sudo apt-get "$@" -o Dir::Cache::archives="$dir"
  sudo rm -rf "$dir/partial" "$dir/lock"
  sudo chown -R "$(id -u):$(id -g)" "$dir"
}

# One .deb per package, the newest: after a repair the folder can hold an old and a new version of one package.
prune() {
  local deb name ver best
  declare -A keep=()
  for deb in "$dir"/*.deb; do
    [ -e "$deb" ] || continue
    name=$(dpkg-deb -f "$deb" Package)
    ver=$(dpkg-deb -f "$deb" Version)
    best=${keep[$name]:-}
    if [ -z "$best" ] || dpkg --compare-versions "$ver" gt "$(dpkg-deb -f "$best" Version)"; then keep[$name]=$deb; fi
  done
  for deb in "$dir"/*.deb; do
    [ -e "$deb" ] || continue
    [ "${keep[$(dpkg-deb -f "$deb" Package)]}" = "$deb" ] || rm -f "$deb"
  done
}

case "$mode" in
  download)
    pkgs=$(playwright_packages) # an assignment, so a failure stops the script (set -e); `$(...)` inside a command would not
    sudo apt-get update
    # shellcheck disable=SC2086 # the list is words
    apt_into install -y --no-install-recommends --download-only $pkgs
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
    repaired=0
    if [ "${#todo[@]}" -gt 0 ] && ! sudo dpkg -i "${todo[@]}"; then
      echo "::warning::The cached WebKit packages do not fit this runner image; repairing from Ubuntu's mirror. The cache saved under this image's key will fit."
      sudo apt-get update
      apt_into install -f -y --no-install-recommends
      repaired=1
    fi
    pkgs=$(playwright_packages) # an assignment, so a failure stops the script rather than checking nothing
    missing=()
    for name in $pkgs; do
      [ "$(dpkg-query -W -f='${db:Status-Abbrev}' "$name" 2>/dev/null || true)" = 'ii ' ] || missing+=("$name")
    done
    if [ "${#missing[@]}" -gt 0 ]; then
      echo "::warning::${#missing[@]} WebKit package(s) are not in the cache (${missing[*]}); installing from Ubuntu's mirror."
      [ "$repaired" = 1 ] || sudo apt-get update
      apt_into install -y --no-install-recommends "${missing[@]}"
      repaired=1
    fi
    [ "$repaired" = 0 ] || prune
    ;;
  *) echo "install-deps.sh: unknown mode $mode" >&2; exit 1 ;;
esac
