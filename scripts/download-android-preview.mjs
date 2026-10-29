import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function selectBuild(result, commit) {
  const builds = Array.isArray(result) ? result : [result];
  if (builds.length !== 1)
    throw new Error("Expected exactly one Android build.");
  const build = builds[0];
  if (
    build.status !== "FINISHED" ||
    build.platform !== "ANDROID" ||
    build.distribution !== "INTERNAL" ||
    build.buildProfile !== "preview" ||
    build.appIdentifier !== "com.helperday.app" ||
    build.gitCommitHash !== commit ||
    !/^[a-f0-9]{40}$/.test(commit) ||
    typeof build.id !== "string" ||
    !build.id
  )
    throw new Error(
      "EAS result is not a finished preview APK for this source commit.",
    );
  const url = new URL(build.artifacts?.buildUrl ?? "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !(
      url.hostname === "expo.dev" ||
      url.hostname.endsWith(".expo.dev") ||
      url.hostname === "expo.io" ||
      url.hostname.endsWith(".expo.io")
    ) ||
    !url.pathname.endsWith(".apk")
  )
    throw new Error("EAS did not return a trusted APK artifact URL.");
  return { build, url };
}

async function main() {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  // A clean checkout matters: EAS associates builds with HEAD even if uncommitted
  // source changes were uploaded. Never mislabel that APK as the committed source.
  if (
    execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
      encoding: "utf8",
    }).trim()
  )
    throw new Error(
      "Commit source changes before recording a reproducible APK.",
    );
  const { build, url } = selectBuild(
    JSON.parse(readFileSync(process.argv[2], "utf8")),
    commit,
  );
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok)
    throw new Error(
      "APK download failed; open the recorded EAS build instead of rebuilding.",
    );
  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    bytes.length < 4 ||
    bytes.length > 512 * 1024 * 1024 ||
    bytes.readUInt32LE(0) !== 0x04034b50
  )
    throw new Error("Artifact is not an APK/ZIP archive.");
  mkdirSync("artifacts", { recursive: true });
  writeFileSync("artifacts/helperday-preview.apk.part", bytes);
  renameSync(
    "artifacts/helperday-preview.apk.part",
    "artifacts/helperday-preview.apk",
  );
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(
    "artifacts/helperday-preview.apk.sha256",
    sha256 + "  helperday-preview.apk\n",
  );
  writeFileSync(
    "artifacts/build-manifest.json",
    JSON.stringify(
      {
        buildId: build.id,
        commit,
        profile: build.buildProfile,
        package: build.appIdentifier,
        version: build.appVersion,
        versionCode: build.appBuildVersion,
        sha256,
        signatureVerification: "pending",
        installation: "UNVERIFIED",
        twoDeviceTest: "UNVERIFIED",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Finished EAS APK downloaded with SHA-256 and source/build manifest. Device tests remain UNVERIFIED.",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    // Do not echo raw EAS metadata, signed download URLs or authentication data.
    console.error(
      "APK result/download verification failed. Check the EAS build status, source commit and APK artifact.",
    );
    process.exitCode = 1;
  });
}
