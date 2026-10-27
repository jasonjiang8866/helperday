import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
// Explicitly pinned: upgrades require rerunning the integration suite.
const cli = ["exec", "--yes", "--package=supabase@2.54.11", "--", "supabase"];
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status ?? result.error?.message})`,
    );
  }
  return result.stdout;
}
let workdir;
let started = false;
rmSync(join(root, "test-results/integration-junit.xml"), { force: true });
try {
  run("docker", ["info"], { stdio: "ignore" });
  workdir = mkdtempSync(join(tmpdir(), "helperday-it-"));
  console.log(`Disposable Supabase workdir: ${workdir}`);
  cpSync(join(root, "integration/supabase"), join(workdir, "supabase"), {
    recursive: true,
  });
  cpSync(
    join(root, "supabase/migrations"),
    join(workdir, "supabase/migrations"),
    { recursive: true },
  );
  const configPath = join(workdir, "supabase/config.toml");
  writeFileSync(
    configPath,
    readFileSync(configPath, "utf8").replace(
      'project_id = "helperday-integration"',
      `project_id = "helperday-it-${randomUUID().slice(0, 8)}"`,
    ),
  );
  const sb = (args, options = {}) =>
    run(npm, [...cli, ...args, "--workdir", workdir], options);
  started = true;
  console.log(
    "Starting disposable local Supabase (first run downloads Docker images)…",
  );
  // CLI status/start output contains local credentials; never persist it in reports.
  sb(
    [
      "start",
      "-x",
      "realtime,storage-api,imgproxy,studio,inbucket,edge-runtime,logflare,vector,supavisor",
    ],
    {
      stdio: ["ignore", "pipe", "inherit"],
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const status = JSON.parse(
    sb(["status", "-o", "json"], {
      stdio: ["ignore", "pipe", "inherit"],
      encoding: "utf8",
    }),
  );
  const url = new URL(status.API_URL);
  if (
    url.origin !== "http://127.0.0.1:55431" ||
    !status.ANON_KEY ||
    !status.SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "Unexpected local Supabase endpoint or missing local keys; refusing to run.",
    );
  }
  const env = {
    ...process.env,
    EXPO_NO_DOTENV: "1",
    EXPO_PUBLIC_SUPABASE_URL: url.origin,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
    HELPERDAY_TEST_SUPABASE_URL: url.origin,
    HELPERDAY_TEST_ANON_KEY: status.ANON_KEY,
  };
  // Never pass a service-role key to the Expo build or browser. Test runner only.
  run(npm, ["run", "build:web"], { env });
  run(
    npm,
    [
      "exec",
      "--",
      "playwright",
      "test",
      "--config=playwright.integration.config.ts",
      ...process.argv.slice(2),
    ],
    {
      env: { ...env, HELPERDAY_TEST_SERVICE_KEY: status.SERVICE_ROLE_KEY },
    },
  );
} catch (error) {
  console.error(error.message);
  console.error(
    "Integration suite did not pass. Requires Docker, Node 22+, npm ci and Playwright Chromium; no mock fallback.",
  );
  process.exitCode = 1;
} finally {
  if (workdir && started) {
    try {
      run(npm, [...cli, "stop", "--no-backup", "--workdir", workdir]);
    } catch {
      console.error(
        `Cleanup failed. Run: npm exec --yes --package=supabase@2.54.11 -- supabase stop --no-backup --workdir ${workdir}`,
      );
      process.exitCode = 1;
      workdir = undefined; // Preserve config so the printed cleanup command works.
    }
  }
  if (workdir) rmSync(resolve(workdir), { recursive: true, force: true });
}
