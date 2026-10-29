import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { easCliVersion } from "./check-android-preview.mjs";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, EXPO_NO_DOTENV: "1" },
    ...options,
  });
  if (result.error || result.status !== 0) {
    console.error(
      "Android preview stopped. Check the failed step; no successful APK is claimed.",
    );
    process.exit(result.status || 1);
  }
  return result;
}
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const cli = ["--yes", "eas-cli@" + easCliVersion];
if (
  execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
    encoding: "utf8",
  }).trim()
) {
  console.error(
    "Commit source changes before starting a reproducible APK build.",
  );
  process.exit(1);
}
// Fail before login/network/build requests when the project is not linked.
run(process.execPath, ["scripts/check-android-preview.mjs", "--project-only"]);
run(npx, [...cli, "whoami"]);
// Use exactly the server-side preview values; .env files are disabled/excluded.
run(npx, [
  ...cli,
  "env:exec",
  "preview",
  "node scripts/check-android-preview.mjs",
  "--non-interactive",
]);
mkdirSync("artifacts", { recursive: true });
const result = run(
  npx,
  [
    ...cli,
    "build",
    "--platform",
    "android",
    "--profile",
    "preview",
    "--non-interactive",
    "--freeze-credentials",
    "--wait",
    "--json",
  ],
  {
    stdio: ["inherit", "pipe", "inherit"],
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  },
);
writeFileSync("artifacts/eas-build-result.json", result.stdout);
run(process.execPath, [
  "scripts/download-android-preview.mjs",
  "artifacts/eas-build-result.json",
]);
console.log(
  "APK downloaded. Verify its signature/package (docs/android-preview.md), then install on two devices.",
);
