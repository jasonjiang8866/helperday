# Standalone Android Demo APK (no Expo account)

The **Android standalone Demo APK** GitHub workflow uses an Ubuntu 24.04 runner,
Node 22.23.3, Temurin JDK 17, `npm ci`, Expo SDK 58 prebuild and the generated
Gradle wrapper. It builds `:app:assembleRelease` with the template's **public debug
keystore**, not a production/store key. The release variant embeds JS/Hermes and
opens the app without Metro or the Expo development launcher. This is an internal
test artifact, not a production-signed release.

No Expo login/project ID/token, EAS credit, Supabase project, service-role key or
GitHub secret is needed. The EAS preview path remains available separately for
future testing with a real backend; see [android-preview.md](android-preview.md).

## Build and download

1. Open PR #1 → Checks → **Android standalone Demo APK**, then open its run.
   It runs for non-documentation PR changes (including this Draft PR).
   Manual `workflow_dispatch` is also supported once the workflow exists on the
   default branch; this is not required for the PR-triggered build.
2. Confirm job **apk** is green. Download the artifact named
   `helperday-demo-apk-<source-commit>` from the run's Summary (GitHub sign-in
   required; retained for 14 days). Extract its ZIP before installing.
3. The artifact contains `helperday-demo.apk`, its SHA-256 sidecar,
   `demo-build-manifest.json` with the exact checked-out source SHA and lock hash,
   APK signing certificate report, package/manifest output and entry listing.
   Job **emulator** is separate: its status and `helperday-demo-emulator-<sha>`
   artifact report runtime test results. A build success does not imply this job
   passed. Match every report/artifact to the same commit/run.

The APK verifier checks the actual signature against the generated debug
certificate, `com.helperday.app`, launcher activity, `helperday` callback scheme,
non-debuggable runtime, embedded `assets/index.android.bundle`, arm64-v8a and
x86_64 native libraries and SHA-256. No store upload/release is performed.

## Install on a phone

Use an ARM64 Android phone meeting the generated APK's minimum SDK requirement
(recorded in `demo-badging.txt`), or an x86_64 emulator. 32-bit-only phones are not
included. On a desktop with Android platform-tools and USB debugging enabled:

```sh
cd extracted-artifact
sha256sum -c helperday-demo.apk.sha256
adb install -r helperday-demo.apk
adb shell am start -W -n com.helperday.app/.MainActivity
```

Alternatively copy the APK to the phone and open it in Files, temporarily allowing
that app to install unknown apps if Android asks. Open **Helperday** →
**Explore the demo →**. No credentials or network are required. The welcome page
is expected; it does not automatically log into a real household.

If Android reports `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, an installed
`com.helperday.app` uses a different signer (for example an EAS preview). Export
anything needed first, then uninstall the existing app before installing this
one. **Uninstalling clears local Demo data, preferences and auth tokens.** The
public test key provides no production identity guarantee; do not use this APK
with confidential household data. App package and callback scheme remain
`com.helperday.app` / `helperday` to match the existing application configuration.

## Repeat locally

Install JDK 17 and an Android SDK; set `ANDROID_HOME` and add platform-tools and
cmdline-tools to PATH. The locked RN 0.88 / Expo 58 toolchain uses Android platform
37.0 (`platforms;android-37.0`), build-tools 37.0.0, NDK 27.1.12297006 and CMake 3.22.1 (see CI).

```sh
git switch feat/helperday-mvp
npm ci
npm run build:android:demo
bash scripts/verify-android-demo.sh
```

The script **regenerates the ignored `android/` directory**; keep native changes in
Expo config/plugins instead of editing generated files. `--prepare-only` on
`node scripts/build-android-demo.mjs` checks native generation without claiming a
compiled APK. Compilation requires network access to npm/Maven/Gradle/Android SDK
repositories and sufficient runner disk/RAM. Build-tool versions/lockfile/source
are recorded. API 37 is published with a minor version; the script sets `compileSdkMinor = 0` for Android modules compiling against API 37. Bit-for-bit identical APK bytes are not promised.

The Demo build disables dotenv and removes all EXPO_ / EAS_ / SUPABASE_ variables
from child build processes before injecting empty public backend fields. A local
.env or GitHub environment secret cannot accidentally connect this artifact to a
real backend. Do not manually add credentials to client source or assets.

## Validation and phone checklist

The emulator job installs the exact APK from the build job, disables Wi-Fi/mobile
data, opens Demo, navigates to Settings, changes appearance and force-stops/
relaunches twice. It verifies both preferences and the Demo role/snapshot persist
in native AsyncStorage. Screenshots, UI XML, logcat and result JSON are retained.
It does not start Metro and does not connect to Supabase.

| Evidence | Meaning |
| --- | --- |
| Native bundle export | JS/assets only; no APK evidence |
| Green `apk` job | Gradle compilation and actual APK inspection passed |
| Green `emulator` job | The listed API 35 x86_64 native runtime checks passed |
| Physical Android phone | **UNVERIFIED until a person installs/tests it** |
| Real employer/Helper phones | **UNVERIFIED**; use a configured backend build |

On each phone to be supported, record model, Android version, APK SHA-256 and:

- Cold launch without network; tap Explore the demo.
- Today, Schedule, Household and Settings navigation; keyboard/back behavior,
  cutouts, font scaling and portrait/landscape layouts.
- Create a task, complete it and leave a note; force-stop, reopen Demo and verify
  its title/status/note remain. Check theme/style and role persistence as well.
- Leave/re-enter Demo; confirm it stays clearly labeled as local-only data.

For real two-account testing, use the retained EAS preview procedure with only
`EXPO_PUBLIC_SUPABASE_URL` and a Supabase publishable/legacy anon key, migrations,
Auth and redirect allowlist. These are build-time values: **rebuild** when they
change. Never put service-role/secret keys in EXPO_PUBLIC_ variables or an APK.
The Demo artifact itself intentionally has no runtime backend configuration.

Official references: [Expo local compilation](https://docs.expo.dev/guides/local-app-development/),
[Expo environment variables](https://docs.expo.dev/guides/environment-variables/),
[Android app signing](https://developer.android.com/studio/publish/app-signing).
