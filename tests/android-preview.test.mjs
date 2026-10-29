import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import {
  readConfig,
  validatePreview,
} from "../scripts/check-android-preview.mjs";
import { selectBuild } from "../scripts/download-android-preview.mjs";

function config() {
  const value = readConfig();
  value.app.extra = {
    eas: { projectId: "01234567-89ab-4cde-8fab-0123456789ab" },
  };
  return {
    ...value,
    env: {
      EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        "sb_publishable_example_for_tests_only",
    },
  };
}
const jwt = (role) =>
  Buffer.from("{}").toString("base64url") +
  "." +
  Buffer.from(JSON.stringify({ role })).toString("base64url") +
  ".signature";

test("preview requires real backend configuration; rejects private credentials without printing them", () => {
  assert.doesNotThrow(() => validatePreview(config()));
  const anon = config();
  anon.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = jwt("anon");
  assert.doesNotThrow(() => validatePreview(anon));
  for (const key of [
    "",
    "sb_secret_do_not_echo_this_value",
    jwt("service_role"),
    jwt("admin"),
    "malformed.jwt.value",
  ]) {
    const value = config();
    value.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
    assert.throws(
      () => validatePreview(value),
      (error) => {
        assert.match(error.message, /PUBLISHABLE_KEY/);
        if (key) assert.ok(!error.message.includes(key));
        return true;
      },
    );
  }
  for (const url of [
    "",
    "http://example.supabase.co",
    "https://localhost",
    "https://127.0.0.1",
    "https://user:secret@example.com",
    "https://example.com/path",
    "https://example.com?token=secret",
  ]) {
    const value = config();
    value.env.EXPO_PUBLIC_SUPABASE_URL = url;
    assert.throws(() => validatePreview(value), /HTTPS project origin/);
  }
  for (const name of [
    "EXPO_PUBLIC_EXPO_TOKEN",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
  ]) {
    const value = config();
    value.env[name] = "private-do-not-echo";
    assert.throws(
      () => validatePreview(value),
      (e) => !e.message.includes("private-do-not-echo"),
    );
  }
});

test("preview cannot silently become an unsigned/dev/AAB build or use a missing project", () => {
  const missing = config();
  delete missing.app.extra;
  assert.throws(() => validatePreview(missing), /eas init/);
  assert.doesNotThrow(() =>
    validatePreview({ ...missing, env: {}, project: false, backend: false }),
  );
  for (const patch of [
    { distribution: "store" },
    { environment: "production" },
    { developmentClient: true },
    { android: { buildType: "app-bundle" } },
    {
      android: {
        buildType: "apk",
        credentialsSource: "remote",
        gradleCommand: ":app:assembleDebug",
      },
    },
  ]) {
    const value = config();
    Object.assign(value.eas.build.preview, patch);
    assert.throws(() => validatePreview(value), /signed internal APK/);
  }
});

test("artifact must be finished, tied to the exact commit and an APK", () => {
  const commit = "a".repeat(40);
  const build = {
    id: "test-build",
    status: "FINISHED",
    platform: "ANDROID",
    distribution: "INTERNAL",
    buildProfile: "preview",
    appIdentifier: "com.helperday.app",
    gitCommitHash: commit,
    artifacts: { buildUrl: "https://expo.dev/artifacts/eas/example.apk" },
  };
  assert.equal(selectBuild([build], commit).build.id, "test-build");
  for (const patch of [
    { status: "IN_QUEUE" },
    { status: "ERRORED" },
    { platform: "IOS" },
    { distribution: "STORE" },
    { buildProfile: "production" },
    { appIdentifier: "other.app" },
    { gitCommitHash: "b".repeat(40) },
    { artifacts: {} },
    { artifacts: { buildUrl: "https://expo.dev/example.aab" } },
    {
      artifacts: { buildUrl: "https://expo.dev.attacker.example/example.apk" },
    },
  ])
    assert.throws(() => selectBuild([{ ...build, ...patch }], commit));
  assert.throws(() => selectBuild([build, build], commit));
});
