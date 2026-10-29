# Android internal APK testing

This procedure uses the existing preview profile to build a **signed standalone release APK**, without Expo Go, Metro, Google Play registration or store submission. It does not upgrade a plan or provision paid services. A manually started EAS build can consume the account's quota/credits; check existing billing/limits first.

## Validation boundary

| Evidence                                                                  | Status                                                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Real local Supabase Auth/JWT/RLS/RPC and two independent browser accounts | Previously passed at PR #1 commit 88436cc; the integration workflow continues to test changes |
| SDK 58 dependency/config checks, code and bundle exports                  | Run by Helperday checks; inspect the run for the exact commit                                 |
| EAS project/account permissions and Android keystore                      | **NOT CONFIGURED/VERIFIED by this change**                                                    |
| Signed APK build/download/apksigner/aapt checks                           | **UNVERIFIED until Android preview APK completes**                                            |
| Physical installation, email delivery, cold/warm callback, SecureStore    | **UNVERIFIED**                                                                                |
| Employer + Helper phones, offline restart/reconnect/conflicts             | **UNVERIFIED**                                                                                |

Native bundle export produces JavaScript/assets, not an APK/IPA. Static APK inspection does not prove installation or device compatibility.

## One-time account setup

Use Node **22.23.3**, EAS CLI **27.1.0** and the committed npm lockfile. Expo remains SDK 58 (~58.0.19); review native compatibility before changing SDK/dependency versions.

1. Check out the existing PR branch:

   ```sh
   git clone https://github.com/jasonjiang8866/helperday.git
   cd helperday
   git switch feat/helperday-mvp
   npm ci
   npm run check:android-config
   EXPO_OFFLINE=1 npx expo install --check
   ```

   CI checks compatibility against the installed SDK's bundled dependency map, with the lockfile unchanged. This is not an online latest-patch check: run npx expo install --check separately when reviewing SDK patch upgrades and update the lockfile deliberately. Online recommendations can move independently of a source commit.

2. Sign in locally, select/create the intended free Expo project under the correct account/organization, and link its real UUID:

   ```sh
   npx --yes eas-cli@27.1.0 login
   npx --yes eas-cli@27.1.0 init --id <your-existing-project-uuid>
   ```

   Commit the resulting **non-secret** extra.eas.projectId (and owner if added) in app.json to the same PR branch. Do not commit a placeholder UUID. Keep slug helperday, Android package com.helperday.app, iOS identifier com.helperday.app and scheme helperday. Resolve a mismatched project slug/account explicitly instead of silently creating another app.

3. Select/provision a Supabase test project reachable from both phones over HTTPS. Apply supabase/migrations/202610270001_helperday.sql **once**, or use migrations; repeatedly pasting this migration is not idempotent. Enable email/password authentication, email confirmation and working email delivery; keep RLS enabled. The APK workflow does not provision or migrate a cloud database.

4. In the **EAS project's Environment variables → preview**, configure:

   | Name                                 | Value                                                       | Visibility              |
   | ------------------------------------ | ----------------------------------------------------------- | ----------------------- |
   | EXPO_PUBLIC_SUPABASE_URL             | HTTPS project origin, e.g. https://your-project.supabase.co | Plain text              |
   | EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY | sb_publishable_… key (legacy anon JWT accepted)             | Plain text or Sensitive |

   These values are **client-visible and embedded in the APK**. Sensitive visibility does not make a bundled value secret. Do not use Secret visibility here: preflight must read the same values before submitting the build. Additional EXPO_PUBLIC_ variables require an allowlist review.

   Never put service-role/admin JWTs, sb_secret_… keys, database passwords, Supabase management tokens or Expo access tokens in these fields, app.json, eas.json, .env.example or source. Preflight rejects missing/invalid values, private keys and unexpected public variable names. This is structural validation; it cannot prove project ownership or connectivity. RLS protects the database.

   Local .env files are disabled for the build wrapper and excluded from EAS upload, alongside signing files and credentials.json. EAS preview variables are used by both preflight and remote build. Rebuild after changing them.

5. Configure **Supabase Authentication → URL Configuration**:

   - Add the exact Redirect URL **helperday://auth/callback**.
   - For web testing, also allow the exact origin plus /auth/callback, such as http://localhost:8081/auth/callback or https://your-owned-origin/auth/callback. Set Site URL to your controlled web origin. Avoid a broad production wildcard.
   - Keep confirmation emails using Supabase's ConfirmationURL so its verification endpoint confirms email before redirecting. Custom templates must preserve RedirectTo; hardcoding SiteURL bypasses the requested callback.

   Signup sets emailRedirectTo per platform. The callback exchanges a PKCE code with the verifier stored on the signup device. Open confirmation email **on that same phone** and choose Helperday. Both cold and warm opens need device testing. The callback is available before onboarding and never imports bearer tokens from a URL or displays raw provider errors.

   A link opened on another phone/browser lacks the verifier: verification may succeed, but automatic login cannot. Return to the app and sign in using email/password. For expired/unconfirmed links, request a new confirmation through your configured Supabase process. Magic-link login, OAuth and password-reset UI are not implemented. Verified app links need an owned domain and separate setup before public release.

6. Configure Android signing interactively once:

   ```sh
   npx --yes eas-cli@27.1.0 credentials:configure-build --platform android --profile preview
   ```

   Select/create the remote keystore for this package. Keep its backup in your secure credential store, never Git. Subsequent builds use --freeze-credentials and reuse that key; no unattended key creation/rotation occurs. Sideloading needs no Google Play developer account.

## Build from this PR now

Commit source/config changes first. The wrapper refuses a dirty checkout so the APK can be traced to a specific commit. On the trusted signed-in computer:

```sh
npm run build:android:preview
```

This checks the linked project, reads EAS preview variables with env:exec, validates them, then invokes:

```sh
npx --yes eas-cli@27.1.0 build --platform android --profile preview --non-interactive --freeze-credentials --wait --json
```

It requires FINISHED, the exact source commit/package/profile and an APK artifact, then downloads artifacts/helperday-preview.apk with SHA-256 and build-manifest.json. Queued/failed results, AABs, missing artifacts and mismatched commits fail. The EAS post-install hook also validates public configuration on the remote Android preview builder.

If the terminal disconnects or times out, inspect the existing build in Expo first; it may continue remotely. Avoid duplicate builds. After completion, retry only downloading with the ignored raw result file:

```sh
node scripts/download-android-preview.mjs artifacts/eas-build-result.json
```

The build UUID/status are also in Expo's dashboard. Do not publish raw build JSON or signed artifact URLs.

## Manual GitHub Actions entry

.github/workflows/android-preview.yml runs **only on workflow_dispatch**, never on push/PR/schedule. It checks source, waits for EAS, downloads and verifies the APK's signature/package/launcher/helperday scheme, then retains the APK, checksum, manifest and inspection reports for 14 days.

1. Finish the project/environment/keystore setup above.
2. In GitHub Settings → Environments, configure **android-preview**, restrict it to intended trusted branches, and save **EXPO_TOKEN** as an environment secret. Use an Expo account/token authorized for this project. Never put the token in public env fields, workflow inputs, repository variables, source or chat.
3. A **new workflow must exist on the default branch before GitHub enables workflow_dispatch**. Until then, use the local CLI entry; do not merge solely to get a button. Once available, choose Actions → Android preview APK → Run workflow, explicitly selecting the intended branch. The workflow builds that ref and records its exact commit.
4. Download helperday-android-preview-<commit> from a successful run. GitHub artifact access follows repository access. Check the EAS project's internal-distribution sharing settings before sharing EAS links.

Unset project/token/keystore/backend configuration fails explicitly. No auto-submit, EAS Update, store upload, billing upgrade or automatic cloud provisioning is performed. A successful submission alone is insufficient: the workflow waits for the APK and checks it. Device tests stay UNVERIFIED.

## Inspect and install on two phones

For local inspection install Android SDK build-tools/platform-tools and ripgrep (rg), and set ANDROID_HOME. The GitHub runner already has SDK tools.

```sh
bash scripts/verify-android-apk.sh
(cd artifacts && sha256sum -c helperday-preview.apk.sha256)
```

The reports record apksigner certificate fingerprints, package com.helperday.app, a launcher activity, a non-debuggable app and helperday scheme. Compare the signer fingerprint against your known previous APK before replacing an install. Transfer the **same APK/checksum** to both phones through your trusted file channel, then open it in Android's installer (temporarily allow installation from that app), or use USB debugging:

```sh
adb -s <device-serial> install -r artifacts/helperday-preview.apk
adb -s <device-serial> shell monkey -p com.helperday.app -c android.intent.category.LAUNCHER 1
adb -s <device-serial> shell am start -W -a android.intent.action.VIEW -d 'helperday://auth/callback' com.helperday.app
```

The last command tests routing only: with no code it must show the safe password-login fallback. Never put a real callback code or session token in shell history/logs. Test routing once after force-stop and once foregrounded; separately test real confirmation email delivery/code exchange.

INSTALL_FAILED_UPDATE_INCOMPATIBLE means the previous install uses another signer: prefer the original keystore. Uninstalling clears local data and may lose pending outbox updates; synchronize/preserve those first. Package/key and versionCode (currently 1) remain stable for previews; use install -r, never decrease versionCode, and increment deliberately when required. The profile does not mutate source through auto-increment.

## Employer + Helper acceptance record

Record tested commit, EAS build ID, checksum, signer fingerprint, phone models, Android versions, date and outcomes. Do not record passwords, invitation codes, tokens or personal household content.

| Step                                                                      | Expected result                                                       | Physical result |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------- |
| Install identical APK on employer phone A and Helper phone B              | Standalone launch without Expo Go/Metro; layout/keyboard/themes work  | UNVERIFIED      |
| Register two real emails; confirm each on its signup phone, cold and warm | Correct route, PKCE session or useful password-login fallback         | UNVERIFIED      |
| Sign out/in, force-stop/reopen                                            | Correct session restored through native SecureStore                   | UNVERIFIED      |
| Employer creates household/invite; Helper redeems                         | Correct membership/role on both phones; repeat redemption fails       | UNVERIFIED      |
| Employer creates/assigns task; Helper foregrounds/Sync now                | Task appears, normally within the 15-second foreground poll           | UNVERIFIED      |
| Helper changes status/feedback; employer refreshes                        | Exactly one logical update with the correct note and permissions      | UNVERIFIED      |
| Helper airplane mode → update existing task → force-stop/reopen           | Pending note/update persists; no false sync success                   | UNVERIFIED      |
| Reconnect → foreground/Sync now → repeat sync                             | Outbox drains; one logical server update; no duplicate mutation       | UNVERIFIED      |
| Both edit same task while Helper offline → reconnect                      | Explicit conflict, Helper note retained, review/discard/reapply works | UNVERIFIED      |
| Wi-Fi/mobile-data changes, background/foreground, account switch          | Recovery without silent loss or cross-account data                    | UNVERIFIED      |

Only **existing task status/feedback changes** queue offline. Creating tasks/households/invitations and joining need connectivity. Polling runs while open/on foreground; background delivery is not guaranteed.

Official references: [EAS CI prerequisites](https://docs.expo.dev/build/building-on-ci/), [internal distribution](https://docs.expo.dev/build/internal-distribution/), [EAS environments](https://docs.expo.dev/eas/environment-variables/usage/), [EAS CLI](https://docs.expo.dev/eas/cli/), [Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls), [PKCE limitations](https://supabase.com/docs/guides/auth/sessions/pkce-flow).
