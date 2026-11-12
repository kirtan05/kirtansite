#!/usr/bin/env bash
# setup-phone.sh — set up activity tracking on his Android phone, from this box,
# over USB (adb). The phone twin of the laptop's setup.ps1.
#
#   bash scripts/activity/setup-phone.sh '<PHONE_INGEST_TOKEN>'
#
# Before: Developer options → USB debugging ON, phone plugged in, "Allow USB
# debugging" accepted on the phone. Safe to re-run.
#
# What it does:
#   1. installs ActivityWatch (aw-android), Termux and Termux:API from their
#      GitHub releases (checksummed where the project publishes sums);
#   2. grants aw-android usage access, its accessibility service (Chrome URLs)
#      and notification access (what is playing: YouTube titles), and exempts
#      all three apps from battery optimisation so they keep running;
#   3. stages the uploader + token for Termux and types the one install command
#      into Termux (phone-install.sh), which schedules the 15-min upload.
#
# Visible by design: ActivityWatch keeps its own notification on the phone, and
# its icon stays in the launcher. This reports; it never blocks anything.
set -euo pipefail

TOKEN="${1:?usage: setup-phone.sh <PHONE_INGEST_TOKEN>}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/aw-phone-apks"
AW=net.activitywatch.android
STAGE=/sdcard/Download/aw-phone-setup
say() { printf '\n== %s\n' "$*"; }
sh_() { adb shell "$@"; }

say "Phone"
adb get-state >/dev/null || { echo "No phone. Plug it in, enable USB debugging, accept the prompt."; exit 1; }
ABI="$(sh_ getprop ro.product.cpu.abi | tr -d '\r')"
SDK="$(sh_ getprop ro.build.version.sdk | tr -d '\r')"
echo "$(sh_ getprop ro.product.manufacturer | tr -d '\r') $(sh_ getprop ro.product.model | tr -d '\r'), Android $(sh_ getprop ro.build.version.release | tr -d '\r') (SDK $SDK), $ABI"

say "Downloading APKs"
mkdir -p "$CACHE"
asset() { # repo, jq filter on asset name → download url
  curl -fsSL "https://api.github.com/repos/$1/releases/latest" | jq -r --arg abi "$ABI" "$2"
}
fetch() { # url → path
  local f="$CACHE/$(basename "$1")"; [[ -s "$f" ]] || curl -fL --retry 3 -o "$f" "$1"; echo "$f"
}
AW_URL="$(asset ActivityWatch/aw-android '.assets[] | select(.name == ("aw-android-" + $abi + ".apk")) | .browser_download_url')"
[[ -n "$AW_URL" ]] || AW_URL="$(asset ActivityWatch/aw-android '.assets[] | select(.name == "aw-android.apk") | .browser_download_url')"
TX_URL="$(asset termux/termux-app '.assets[] | select(.name | endswith("_" + $abi + ".apk")) | .browser_download_url')"
TX_SUMS="$(asset termux/termux-app '.assets[] | select(.name | endswith("_sha256sums")) | .browser_download_url')"
TA_URL="$(asset termux/termux-api '.assets[] | select(.name | endswith(".apk")) | .browser_download_url')"
TA_SUMS="$(asset termux/termux-api '.assets[] | select(.name == "checksums-sha256.txt") | .browser_download_url')"

AW_APK="$(fetch "$AW_URL")"; TX_APK="$(fetch "$TX_URL")"; TA_APK="$(fetch "$TA_URL")"
( cd "$CACHE" && curl -fsSL "$TX_SUMS" | grep -F "$(basename "$TX_APK")" | sha256sum -c - )
( cd "$CACHE" && curl -fsSL "$TA_SUMS" | grep -F "$(basename "$TA_APK")" | sha256sum -c - )

say "Installing"
for apk in "$AW_APK" "$TX_APK" "$TA_APK"; do echo "$(basename "$apk")"; adb install -r -g "$apk"; done

say "Permissions for ActivityWatch"
sh_ cmd appops set "$AW" GET_USAGE_STATS allow
# Accessibility (Chrome URL watcher): add to whatever is already enabled.
A11Y="$AW/$AW.watcher.WebWatcher"
cur="$(sh_ settings get secure enabled_accessibility_services | tr -d '\r')"
case ":$cur:" in *":$A11Y:"*) ;; *) [[ -z "$cur" || "$cur" == null ]] && new="$A11Y" || new="$cur:$A11Y"
  sh_ settings put secure enabled_accessibility_services "$new" ;; esac
sh_ settings put secure accessibility_enabled 1
# Notification access (media watcher: what is playing).
sh_ cmd notification allow_listener "$AW/$AW.watcher.MediaWatcher" || true
(( SDK >= 33 )) && sh_ pm grant "$AW" android.permission.POST_NOTIFICATIONS 2>/dev/null || true

say "Battery: never put these to sleep"
for p in "$AW" com.termux com.termux.api; do
  sh_ dumpsys deviceidle whitelist +"$p" >/dev/null
  sh_ cmd appops set "$p" RUN_ANY_IN_BACKGROUND allow || true
  sh_ cmd appops set "$p" RUN_IN_BACKGROUND allow || true
done

say "Starting ActivityWatch (starts its server + notification)"
sh_ monkey -p "$AW" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 8
if sh_ "nc -z 127.0.0.1 5600" 2>/dev/null; then echo "server up on :5600"; else echo "server not answering yet (finish its onboarding screen on the phone)"; fi

say "Staging the uploader for Termux"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
umask 077
printf 'AW_TOKEN=%s\nAW_LABEL=his-phone\n' "$TOKEN" >"$tmp/env"
sh_ mkdir -p "$STAGE"
adb push "$SRC/phone-upload.sh" "$SRC/phone-install.sh" "$tmp/env" "$STAGE/" >/dev/null
# Termux reads the staged files from shared storage just once.
if (( SDK >= 30 )); then sh_ cmd appops set com.termux MANAGE_EXTERNAL_STORAGE allow
else sh_ pm grant com.termux android.permission.READ_EXTERNAL_STORAGE; fi

say "Running the installer inside Termux"
sh_ monkey -p com.termux -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
echo "Waiting 40s for Termux's first-run bootstrap…"; sleep 40
sh_ input text "bash%s$STAGE/phone-install.sh"
sh_ input keyevent 66
cat <<EOF

Typed into Termux:  bash $STAGE/phone-install.sh
Watch the phone: it installs packages (a minute or two) and ends with
AW-PHONE-OK or AW-PHONE-FAIL. If Termux was still bootstrapping, type that
command yourself once the \$ prompt appears.

Afterwards, revoke Termux's shared-storage access (it no longer needs it):
  adb shell cmd appops set com.termux MANAGE_EXTERNAL_STORAGE default
EOF
