#!/data/data/com.termux/files/usr/bin/bash
# phone-install.sh — runs ONCE inside Termux on his phone. setup-phone.sh (on
# the Arch box, over adb) stages this file, phone-upload.sh and an env file in
# /sdcard/Download/aw-phone-setup/ and then types:
#
#   bash /sdcard/Download/aw-phone-setup/phone-install.sh
#
# It moves the files into Termux's private home, deletes the staged copies
# (the env file holds the token), installs curl/jq/termux-api, schedules the
# uploader every 15 min (persisted across reboots) and runs it once.
set -euo pipefail

STAGE=/sdcard/Download/aw-phone-setup
DEST="$HOME/.aw-phone"

# A fresh Termux bootstrap can lag the repo; a partial upgrade leaves curl
# unable to link (new libcurl, old OpenSSL), so bring everything up together.
apt update && apt full-upgrade -y -o Dpkg::Options::=--force-confnew
apt install -y curl jq termux-api

mkdir -p "$DEST"
install -m 700 "$STAGE/phone-upload.sh" "$DEST/phone-upload.sh"
install -m 600 "$STAGE/env" "$DEST/env"
rm -rf "$STAGE"

termux-job-scheduler --cancel --job-id 5600 >/dev/null 2>&1 || true
# The first Termux:API call can fail while that app cold-starts: retry.
for _ in 1 2 3; do
  termux-job-scheduler --job-id 5600 --script "$DEST/phone-upload.sh" \
    --period-ms 900000 --persisted true --network any --battery-not-low false && break
  sleep 5
done
termux-job-scheduler -p | grep -q 5600 || { echo "AW-PHONE-FAIL: job not scheduled"; exit 1; }

if "$DEST/phone-upload.sh"; then
  echo "AW-PHONE-OK: $(tail -n 1 "$DEST/upload.log")"
else
  echo "AW-PHONE-FAIL: see below"; tail -n 5 "$DEST/upload.log"
fi
