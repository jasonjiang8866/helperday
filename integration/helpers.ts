import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import type { Mutation, Snapshot } from "../src/lib/domain";
import { singaporeDate } from "../src/lib/domain";

export function localConfig() {
  const url = process.env.HELPERDAY_TEST_SUPABASE_URL;
  const key = process.env.HELPERDAY_TEST_ANON_KEY;
  if (url !== "http://127.0.0.1:55431" || !key) {
    throw new Error(
      "Run npm run test:integration: only the disposable loopback Supabase stack is allowed.",
    );
  }
  return { url, key };
}
export function client(key = localConfig().key) {
  return createClient(localConfig().url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export function auditClient() {
  const key = process.env.HELPERDAY_TEST_SERVICE_KEY;
  if (!key)
    throw new Error(
      "Missing disposable local service key for audit assertions.",
    );
  return client(key);
}
export async function account(label: string) {
  const api = client();
  const email = `${label}-${randomUUID()}@example.test`;
  const password = `Test-only-${randomUUID()}!`;
  const signup = await api.auth.signUp({ email, password });
  expect(signup.error).toBeNull();
  expect(signup.data.user?.id).toBeTruthy();
  // Exercise password verification, not just auto-confirmed signup's session.
  const login = await api.auth.signInWithPassword({ email, password });
  expect(login.error).toBeNull();
  expect(login.data.session?.access_token).toBeTruthy();
  const verified = await api.auth.getUser();
  expect(verified.error).toBeNull();
  expect(verified.data.user?.id).toBe(login.data.user?.id);
  return { api, email, password, id: login.data.user!.id };
}
export async function rpc<T>(
  api: SupabaseClient,
  name: string,
  args?: Record<string, unknown>,
) {
  const result = await api.rpc(name, args);
  expect(result.error, `${name}: ${result.error?.message}`).toBeNull();
  return result.data as T;
}
export async function dashboard(api: SupabaseClient) {
  return rpc<Snapshot>(api, "dashboard", { p_from: singaporeDate() });
}
export function taskInput(title: string, assignee: string | null = null) {
  return {
    title,
    instructions: "Synthetic integration fixture",
    category: "Home care",
    start_date: singaporeDate(),
    due_time: "09:00",
    assignee,
    repeat: "once",
    skip_rest_day: false,
  };
}
export async function newTask(
  api: SupabaseClient,
  title: string,
  assignee: string | null = null,
) {
  const template = await rpc<string>(api, "create_task", {
    p_task: taskInput(title, assignee),
  });
  const task = (await dashboard(api)).tasks.find(
    (t) => t.template_id === template,
  );
  expect(task).toBeTruthy();
  return task!;
}
export async function household() {
  const employer = await account("employer");
  const helper = await account("helper");
  const home = await rpc<string>(employer.api, "create_household", {
    p_name: "Synthetic household",
    p_member_name: "Test Employer",
    p_rest_day: 0,
  });
  const token = await rpc<string>(employer.api, "create_invite", {
    p_role: "helper",
  });
  expect(
    await rpc(helper.api, "join_household", {
      p_token: token,
      p_name: "Test Helper",
    }),
  ).toBe(home);
  return { employer, helper, home, token };
}
export async function login(
  page: Page,
  user: Awaited<ReturnType<typeof account>>,
) {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
export async function saved(page: Page, userId: string) {
  return page.evaluate((id) => {
    const raw = localStorage.getItem(`helperday.v1.${id}`);
    return raw ? JSON.parse(raw) : null;
  }, userId) as Promise<{ snapshot: Snapshot; queue: Mutation[] } | null>;
}
export async function sync(page: Page) {
  await expect(page.getByText("Syncing…", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
}
