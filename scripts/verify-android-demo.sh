#!/usr/bin/env bash
set -euo pipefail
apk=artifacts/helperday-demo.apk
sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
: "${sdk_root:?Set ANDROID_HOME to the Android SDK}"
tools_dir="$(find "$sdk_root/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
"$tools_dir/apksigner" verify --verbose --print-certs "$apk" | tee artifacts/demo-signature.txt
"$tools_dir/aapt" dump badging "$apk" > artifacts/demo-badging.txt
rg -q "^package: name='com.helperday.app' " artifacts/demo-badging.txt
rg -q "^launchable-activity:" artifacts/demo-badging.txt
! rg -q '^application-debuggable' artifacts/demo-badging.txt
"$tools_dir/aapt" dump xmltree "$apk" AndroidManifest.xml > artifacts/demo-android-manifest.txt
rg -q 'android:scheme.*"helperday"' artifacts/demo-android-manifest.txt
# Fail if a plain debug/dev-client APK requiring Metro was accidentally selected.
unzip -p "$apk" assets/index.android.bundle > artifacts/demo-bundle.bin
test -s artifacts/demo-bundle.bin
unzip -Z1 "$apk" > artifacts/demo-entries.txt
for abi in arm64-v8a x86_64; do rg -q "^lib/$abi/.*\.so$" artifacts/demo-entries.txt; done
# Compare APK signer to the generated public debug keystore, not just any signature.
keytool -exportcert -keystore android/app/debug.keystore -storepass android -alias androiddebugkey -file artifacts/demo-debug-cert.der
expected="$(sha256sum artifacts/demo-debug-cert.der | cut -d ' ' -f1)"
rg -qi "certificate SHA-256 digest: $expected" artifacts/demo-signature.txt
(cd artifacts && sha256sum -c helperday-demo.apk.sha256)
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const path = 'artifacts/demo-build-manifest.json';
const m = JSON.parse(readFileSync(path));
m.apkInspection = 'passed: signature/debug certificate, package, launcher, scheme, non-debuggable, embedded bundle, both ABIs, SHA-256';
writeFileSync(path, JSON.stringify(m, null, 2) + '\n');
JS
# Keep reports, not a second copy of the embedded JS or signing certificate.
rm artifacts/demo-bundle.bin artifacts/demo-debug-cert.der
