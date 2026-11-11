#!/usr/bin/env bash
# System packages from a cached folder of .deb files instead of Ubuntu's package mirror (owner call, 2026-11-11: "cache
# everything we use, a robust mirror list and 3 retries").
#
#   apt-cached.sh download <dir> <pkg>...   fetch <pkg>..., and the packages they need that this machine lacks, into <dir>
#                                           (a cache miss)
#   apt-cached.sh install <dir> <pkg>...    install every .deb in <dir> that this machine lacks or has at a lower version,
#                                           then make sure every <pkg> is installed
#
# Generalized from .github/actions/playwright-webkit/install-deps.sh (#3117's follow-up), which measured why: over 17 CI
# runs an apt step took 36 s at the median, but 5 took over 2 min, 2 over 10, and one never finished inside its job's 25
# minutes (flaky shape F6, engineering/decisions/2026-11-06-flaky-tests.md); on 2026-11-11 a DNS failure on the Azure
# mirror failed every integration shard of a PR twice. A .deb the image already holds at an equal or newer version is
# skipped, so a newer runner image is never downgraded.
#
# A cache built on one runner image can stop fitting a later one: it holds only what that image lacked, and packages pin
# each other's versions. So when dpkg refuses the set, or a listed package is still missing, this repairs from the
# mirror (with a warning), downloading into <dir> so the cache saved under the new image's key fits from then on. Every
# mirror call goes through apt-setup.sh's mirror list and retries, and is itself tried three times.
set -euo pipefail
mode=${1:?download or install}
dir=${2:?the .deb folder}
shift 2
[ "$#" -gt 0 ] || { echo "apt-cached.sh: no packages named" >&2; exit 1; }
pkgs=("$@")
SUDO=; [ "$(id -u)" = 0 ] || SUDO=sudo
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
bash "$here/apt-setup.sh"

# What the IMAGE lacks, not what this job lacks by now. The first call in a job copies dpkg's package list before any
# install, and every download is computed against that copy. Without it, a cache entry depended on what ran earlier in
# the job: a WebKit download after a Chromium install skipped the fonts both browsers need, and every later job that
# restored that entry had to fetch them from the mirror (found by review on #3139).
pristine=${RUNNER_TEMP:-/tmp}/lattice-dpkg-status.pristine
[ -f "$pristine" ] || cp /var/lib/dpkg/status "$pristine"

# A run that fails leaves no folder behind, so a job that tolerates the failure (continue-on-error) cannot save a half
# download as its cache entry.
drop_on_failure() {
  local rc=$?
  [ "$rc" = 0 ] || $SUDO rm -rf "$dir"
  exit "$rc"
}
trap drop_on_failure EXIT

# Three tries, 10 s then 20 s apart, around every call that reads a mirror. apt's own retries cover one download; this
# covers a whole `update` whose index files all failed (apt-get update exits 0 on that, so the install after it is what
# fails, and both are retried together).
with_mirror() {
  local n
  for n in 1 2 3; do
    if "$@"; then return 0; fi
    [ "$n" = 3 ] || { echo "::warning::apt attempt $n of 3 failed; retrying in $((n * 10)) s"; sleep $((n * 10)); }
  done
  return 1
}

# apt with <dir> as its download folder, so whatever it fetches lands in the cache.
apt_into() {
  mkdir -p "$dir/partial"
  $SUDO apt-get update && $SUDO apt-get "$@" -o Dir::Cache::archives="$dir"
}
settle() {
  $SUDO rm -rf "$dir/partial" "$dir/lock"
  $SUDO chown -R "$(id -u):$(id -g)" "$dir"
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
    with_mirror apt_into install -y --no-install-recommends --download-only -o Dir::State::status="$pristine" "${pkgs[@]}"
    settle
    echo "apt-cached.sh: $(find "$dir" -maxdepth 1 -name '*.deb' | wc -l) packages in $dir"
    ;;
  install)
    mkdir -p "$dir"
    todo=()
    for deb in "$dir"/*.deb; do
      [ -e "$deb" ] || continue
      name=$(dpkg-deb -f "$deb" Package)
      want=$(dpkg-deb -f "$deb" Version)
      have=$(dpkg-query -W -f='${db:Status-Abbrev} ${Version}' "$name" 2>/dev/null || true)
      if [ "${have%% *}" = ii ] && dpkg --compare-versions "${have##* }" ge "$want"; then continue; fi
      todo+=("$deb")
    done
    echo "apt-cached.sh: installing ${#todo[@]} packages from $dir"
    repaired=0
    if [ "${#todo[@]}" -gt 0 ] && ! $SUDO dpkg -i "${todo[@]}"; then
      echo "::warning::The cached packages in $dir do not fit this runner image; repairing from Ubuntu's mirror. The cache saved under this image's key will fit."
      # --no-remove: a repair that would take a package off the image fails here, loudly, rather than removing it.
      with_mirror apt_into install -f -y --no-install-recommends --no-remove
      repaired=1
    fi
    missing=()
    for name in "${pkgs[@]}"; do
      # The prefix: a package installed for two architectures prints its status twice ("ii ii ").
      case "$(dpkg-query -W -f='${db:Status-Abbrev}' "$name" 2>/dev/null || true)" in ii*) ;; *) missing+=("$name") ;; esac
    done
    if [ "${#missing[@]}" -gt 0 ]; then
      echo "::warning::${#missing[@]} package(s) are not in the cache (${missing[*]}); installing from Ubuntu's mirror."
      with_mirror apt_into install -y --no-install-recommends "${missing[@]}"
      repaired=1
    fi
    settle
    [ "$repaired" = 0 ] || prune
    ;;
  *) echo "apt-cached.sh: unknown mode $mode" >&2; exit 1 ;;
esac
