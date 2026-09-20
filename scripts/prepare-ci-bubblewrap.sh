#!/usr/bin/env bash
set -euo pipefail

# Resolve the current bubblewrap .deb through apt instead of a pinned pool URL.
# Ubuntu removes superseded point releases from the pool the moment a security
# update lands, so a hard-pinned URL rots into a 404 (curl exit 22) on every
# such update — this broke every nightly run from 2026-08-24 onward when
# 0.9.0-1ubuntu0.1 was replaced by 0.9.0-1ubuntu0.3. `apt-get download`
# resolves the current version from the signed archive index and verifies the
# payload's SHA-256 against it, so integrity checking is preserved without a
# pin that rots. The download alone runs no package transaction: extraction
# still happens manually into the ephemeral runner directory.

: "${RUNNER_TEMP:?prepare-ci-bubblewrap requires RUNNER_TEMP}"
: "${GITHUB_PATH:?prepare-ci-bubblewrap requires GITHUB_PATH}"

if [[ "$(uname -s)" != 'Linux' || "$(uname -m)" != 'x86_64' ]]; then
  echo 'prepare-ci-bubblewrap supports only Linux x86_64 hosted runners' >&2
  exit 1
fi

download_dir="${RUNNER_TEMP}/dsh-bubblewrap-deb"
root="${RUNNER_TEMP}/dsh-bubblewrap"
mkdir -p "$download_dir"

sudo apt-get update -qq
(
  cd "$download_dir"
  apt-get download bubblewrap
)
archive="$(find "$download_dir" -maxdepth 1 -name 'bubblewrap_*_amd64.deb' -print -quit)"
if [[ -z "$archive" ]]; then
  echo 'apt-get download produced no bubblewrap .deb' >&2
  exit 1
fi

mkdir -p "$root"
dpkg-deb --extract "$archive" "$root"
printf '%s\n' "$root/usr/bin" >> "$GITHUB_PATH"

sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0 \
  || echo 'apparmor userns knob absent — the functional probe decides'
"$root/usr/bin/bwrap" --version
"$root/usr/bin/bwrap" --ro-bind / / --dev /dev --unshare-pid --proc /proc --die-with-parent -- true
echo 'bubblewrap functional probe passed'
