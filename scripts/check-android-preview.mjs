import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { pathToFileURL } from "node:url";

export const easCliVersion = "27.1.0";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validatePreview({
  app,
  eas,
  pkg,
  env,
  backend = true,
  project = true,
}) {
  const problems = [];
  const profile = eas.build?.preview;
  if (!/^~?58\./.test(pkg.dependencies?.expo ?? ""))
    problems.push(
      "Expected Expo SDK 58; review native build compatibility before changing it.",
    );
  if (eas.cli?.version !== easCliVersion)
    problems.push("EAS CLI must match the pinned build scripts.");
  if (
    app.android?.package !== "com.helperday.app" ||
    app.scheme !== "helperday"
  )
    problems.push(
      "Keep package com.helperday.app and scheme helperday aligned with Auth callbacks.",
    );
  if (
    !Number.isInteger(app.android?.versionCode) ||
    app.android.versionCode < 1
  )
    problems.push("Set a positive Android versionCode.");
  if (
    profile?.distribution !== "internal" ||
    profile?.environment !== "preview" ||
    profile?.developmentClient !== false ||
    profile?.android?.buildType !== "apk" ||
    profile?.android?.credentialsSource !== "remote" ||
    profile?.android?.gradleCommand ||
    profile?.android?.withoutCredentials ||
    profile?.withoutCredentials ||
    profile?.extends
  )
    problems.push(
      "Preview must remain a signed internal APK with the preview environment.",
    );
  if (
    Object.keys(profile?.env ?? {}).some((name) =>
      name.startsWith("EXPO_PUBLIC_"),
    )
  )
    problems.push(
      "Configure client values in the EAS preview environment, not eas.json.",
    );
  if (project && !uuid.test(app.extra?.eas?.projectId ?? ""))
    problems.push(
      "Link your existing Expo project with eas init --id <project-id>, then commit app.json.",
    );
  if (backend) {
    const allowed = new Set([
      "EXPO_PUBLIC_SUPABASE_URL",
      "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]);
    for (const name of Object.keys(env)) {
      if (name.startsWith("EXPO_PUBLIC_") && !allowed.has(name))
        problems.push(
          "Unexpected EXPO_PUBLIC_ variable: review client-visible environment names.",
        );
      if (
        /^(SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD)$/.test(
          name,
        ) &&
        env[name]
      )
        problems.push(
          "Remove private Supabase credentials from the APK build environment.",
        );
    }
    try {
      const url = new URL(env.EXPO_PUBLIC_SUPABASE_URL);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/" ||
        /^(localhost|127\..*|0\.0\.0\.0|\[::1\])$/.test(url.hostname) ||
        url.hostname.endsWith(".localhost")
      )
        throw new Error();
    } catch {
      problems.push(
        "EXPO_PUBLIC_SUPABASE_URL must be a reachable HTTPS project origin (no path or credentials).",
      );
    }
    const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
    let publicKey = /^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key);
    // Legacy anon JWTs are supported, but never a service_role/admin JWT.
    if (!publicKey && key.split(".").length === 3) {
      try {
        const role = JSON.parse(
          Buffer.from(key.split(".")[1], "base64url").toString(),
        ).role;
        publicKey = role === "anon";
      } catch {
        publicKey = false;
      }
    }
    if (!publicKey)
      problems.push(
        "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be sb_publishable_* or a legacy anon JWT.",
      );
  }
  if (problems.length) throw new Error(problems.join("\n"));
}

export function readConfig() {
  const read = (name) =>
    JSON.parse(readFileSync(new URL("../" + name, import.meta.url), "utf8"));
  return {
    app: read("app.json").expo,
    eas: read("eas.json"),
    pkg: read("package.json"),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const hook = process.argv.includes("--eas-hook");
  if (
    !hook ||
    (process.env.EAS_BUILD_PROFILE === "preview" &&
      process.env.EAS_BUILD_PLATFORM === "android")
  ) {
    try {
      const configOnly = process.argv.includes("--config-only");
      validatePreview({
        ...readConfig(),
        env: process.env,
        backend: !configOnly && !process.argv.includes("--project-only"),
        project: !configOnly,
      });
      console.log(
        "Android preview preflight passed. This does not build an APK or verify a device.",
      );
    } catch (error) {
      // Validation messages only contain field names, never credential values.
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
