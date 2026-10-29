#!/usr/bin/env bash
set -euo pipefail
apk="artifacts/helperday-preview.apk"
if [[ $# -gt 0 ]]; then apk="$1"; fi
sdk_root="$(printenv ANDROID_HOME || printenv ANDROID_SDK_ROOT || true)"
if [[ -z "$sdk_root" ]]; then
  echo "Set ANDROID_HOME to an Android SDK with build-tools installed." >&2
  exit 1
fi
tools_dir="$(find "$sdk_root/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
[[ -x "$tools_dir/apksigner" && -x "$tools_dir/aapt" ]] || {
  echo "Install Android SDK build-tools (apksigner and aapt)." >&2
  exit 1
}
mkdir -p artifacts
"$tools_dir/apksigner" verify --verbose --print-certs "$apk" | tee artifacts/apk-signature.txt
"$tools_dir/aapt" dump badging "$apk" > artifacts/apk-badging.txt
rg -q "^package: name='com.helperday.app' " artifacts/apk-badging.txt
rg -q "^launchable-activity:" artifacts/apk-badging.txt
if rg -q "^application-debuggable" artifacts/apk-badging.txt; then
  echo "Expected a release preview APK, received a debuggable app." >&2
  exit 1
fi
"$tools_dir/aapt" dump xmltree "$apk" AndroidManifest.xml > artifacts/apk-android-manifest.txt
rg -q 'android:scheme.*"helperday"' artifacts/apk-android-manifest.txt
node --input-type=module -e '
  import { readFileSync, writeFileSync } from "node:fs";
  const p = "artifacts/build-manifest.json";
  const m = JSON.parse(readFileSync(p, "utf8"));
  m.signatureVerification = "passed (apksigner)";
  m.packageVerification = "passed (aapt; package, launcher, release, scheme)";
  writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
'
echo "Signature, package, launcher and scheme verified. Installation and two-device tests remain UNVERIFIED."
