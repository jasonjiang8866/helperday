import { spawnSync, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

// This path intentionally never reads local .env files or EAS credentials.
export function demoEnvironment(input) {
  const env = Object.fromEntries(
    Object.entries(input).filter(([name]) => !/^(EXPO_|EAS_|SUPABASE_)/.test(name)),
  );
  return {
    ...env,
    CI: "1",
    EXPO_NO_DOTENV: "1",
    EXPO_NO_TELEMETRY: "1",
    EXPO_PUBLIC_SUPABASE_URL: "",
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  };
}

export function checkGeneratedProject(gradle) {
  if (
    !gradle.includes("applicationId 'com.helperday.app'") ||
    !/release\s*\{[\s\S]*?signingConfig signingConfigs\.debug/.test(gradle) ||
    !gradle.includes('bundleCommand = "export:embed"')
  ) throw new Error("Expo Android template changed: review applicationId, release debug signing and embedded bundle before building.");
}

function build() {
  const env = demoEnvironment(process.env);
  const run = (command, args, options = {}) => {
    const r = spawnSync(command, args, { stdio: "inherit", env, ...options });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error(`${command} failed (${r.status}); no successful APK is claimed.`);
  };
  // prebuild may rewrite npm's android/ios shortcuts; do not leave unrelated edits.
  const originalPackage = readFileSync("package.json");
  try {
    run(process.execPath, ["node_modules/expo/bin/cli", "prebuild", "--clean", "--platform", "android", "--no-install"]);
  } finally {
    writeFileSync("package.json", originalPackage);
  }
  checkGeneratedProject(readFileSync("android/app/build.gradle", "utf8"));
  // API 37 is published as android-37.0. Set the minor DSL on every Android
  // module after its own compileSdk is configured, before AGP finalizes variants.
  const rootGradle = "android/build.gradle";
  writeFileSync(rootGradle, readFileSync(rootGradle, "utf8") + `
subprojects { subproject ->
    ["com.android.application", "com.android.library"].each { pluginId ->
        subproject.plugins.withId(pluginId) {
            subproject.extensions.getByName("androidComponents").finalizeDsl { dsl ->
                if (dsl.compileSdk == 37) { dsl.compileSdkMinor = 0 }
            }
        }
    }
}
`);
  if (process.argv.includes("--prepare-only")) return;
  // Release variant embeds JS/Hermes and disables the development launcher/Metro.
  // Expo's generated release signingConfig uses only its public debug.keystore.
  run("bash", ["./gradlew", ":app:assembleRelease", "--no-daemon", "--max-workers=2",
    "-PreactNativeArchitectures=arm64-v8a,x86_64", "-Pandroid.enableMinifyInReleaseBuilds=false"], { cwd: "android" });
  mkdirSync("artifacts", { recursive: true });
  const apk = "artifacts/helperday-demo.apk";
  copyFileSync("android/app/build/outputs/apk/release/app-release.apk", apk);
  const sha256 = createHash("sha256").update(readFileSync(apk)).digest("hex");
  writeFileSync(apk + ".sha256", `${sha256}  helperday-demo.apk\n`);
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  writeFileSync("artifacts/demo-build-manifest.json", JSON.stringify({
    sourceCommit, package: "com.helperday.app", variant: "release", signing: "public Android debug key; internal testing only",
    backend: "none (local Demo)", architectures: ["arm64-v8a", "x86_64"], sha256,
    node: process.version, expo: JSON.parse(readFileSync("node_modules/expo/package.json")).version,
    compileSdk: "37.0", buildTools: "37.0.0", ndk: "27.1.12297006",
    lockfileSha256: createHash("sha256").update(readFileSync("package-lock.json")).digest("hex"),
    apkInspection: "not yet run", emulator: "not yet run", physicalDevice: "UNVERIFIED",
  }, null, 2) + "\n");
  console.log("Debug-signed standalone Demo APK assembled. Run the APK inspection before installation.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { build(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
