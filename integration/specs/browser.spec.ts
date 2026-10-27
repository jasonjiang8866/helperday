import {
  test as base,
  expect,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import {
  account,
  auditClient,
  dashboard,
  household,
  login,
  newTask,
  rpc,
  saved,
  sync,
} from "../helpers";
import { randomUUID } from "node:crypto";

type Pair = Awaited<ReturnType<typeof household>> & {
  employerPage: Page;
  helperPage: Page;
  helperContext: BrowserContext;
  task: Awaited<ReturnType<typeof newTask>>;
};
const test = base.extend<{ pair: Pair }>({
  pair: async ({ browser, page }, runTest) => {
    const home = await household();
    const task = await newTask(
      home.employer.api,
      "Browser shared task",
      home.helper.id,
    );
    const helperContext = await browser.newContext({
      baseURL: "http://127.0.0.1:4173",
      viewport: { width: 1440, height: 1100 },
    });
    try {
      const helperPage = await helperContext.newPage();
      await login(page, home.employer);
      await login(helperPage, home.helper);
      for (const p of [page, helperPage]) {
        await expect(
          p.getByRole("button", { name: `${task.title}, to do`, exact: true }),
        ).toBeVisible();
      }
      await runTest({
        ...home,
        task,
        employerPage: page,
        helperPage,
        helperContext,
      });
    } finally {
      await helperContext.close();
    }
  },
});
async function complete(page: Page, title: string, note: string) {
  await page
    .getByRole("button", { name: `${title}, to do`, exact: true })
    .click();
  await page.getByLabel("Leave a note", { exact: true }).fill(note);
  await page.getByRole("button", { name: "Mark as done", exact: true }).click();
}

base(
  "UI sign-in, household creation, invitation and cross-account task polling",
  async ({ browser, page }) => {
    const employer = await account("ui-employer");
    const helper = await account("ui-helper");
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:4173",
    });
    try {
      const second = await context.newPage();
      await login(page, employer);
      await page.getByLabel("Your name", { exact: true }).fill("UI Employer");
      await page
        .getByLabel("Household name", { exact: true })
        .fill("UI synthetic home");
      await page
        .getByRole("button", { name: "Create household", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Household", exact: true })
        .click();
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/rpc/create_invite") &&
          r.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Create invitation", exact: true })
        .click();
      const inviteResponse = await response;
      expect(inviteResponse.ok()).toBe(true);
      const token = await inviteResponse.json();
      expect(token).toMatch(/^[a-f0-9-]{36}$/);
      await expect(page.getByText(token, { exact: true })).toBeVisible();
      await login(second, helper);
      await second
        .getByRole("button", { name: "Use an invitation", exact: true })
        .click();
      await second.getByLabel("Your name", { exact: true }).fill("UI Helper");
      await second.getByLabel("Invitation code", { exact: true }).fill(token);
      await second
        .getByRole("button", { name: "Join household", exact: true })
        .click();
      await expect(
        second.getByText("A good day starts together."),
      ).toBeVisible();
      await expect(
        second.getByRole("button", { name: "Add task", exact: true }),
      ).toHaveCount(0);
      await sync(page);
      await expect
        .poll(
          async () => (await saved(page, employer.id))?.snapshot.members.length,
        )
        .toBe(2);
      await page.getByRole("button", { name: "Add task", exact: true }).click();
      await page
        .getByLabel("Task title", { exact: true })
        .fill("UI-created task");
      await page
        .getByRole("switch", { name: "Skip rest day", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Add to the schedule", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "UI-created task, to do",
          exact: true,
        }),
      ).toBeVisible();
      // No manual refresh: exercise the actual 15-second polling path.
      await expect(
        second.getByRole("button", {
          name: "UI-created task, to do",
          exact: true,
        }),
      ).toBeVisible({ timeout: 35_000 });
      await complete(
        second,
        "UI-created task",
        "Completed by independent helper account",
      );
      await expect(
        page.getByRole("button", {
          name: "UI-created task, completed",
          exact: true,
        }),
      ).toBeVisible({ timeout: 35_000 });
      const server = (await dashboard(employer.api)).tasks[0];
      expect(server).toMatchObject({
        status: "done",
        feedback: "Completed by independent helper account",
        version: 1,
        assignee: helper.id,
      });
    } finally {
      await context.close();
    }
  },
);

test("offline outbox survives reload, reconnects, and synchronizes exactly once", async ({
  pair,
}) => {
  const { helperContext, helperPage, employerPage, helper, employer, task } =
    pair;
  await helperContext.setOffline(true);
  await complete(helperPage, task.title, "Offline note retained across reload");
  await expect(
    helperPage.getByText("Saved · waiting to sync", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await saved(helperPage, helper.id))?.queue.length)
    .toBe(1);
  const pending = (await saved(helperPage, helper.id))!.queue[0];
  expect(pending).toMatchObject({
    task_id: task.id,
    expected_version: 0,
    feedback: "Offline note retained across reload",
  });
  expect((await dashboard(employer.api)).tasks[0]).toMatchObject({
    status: "todo",
    version: 0,
    feedback: "",
  });
  // Reload needs web assets (the app is not a service-worker PWA). Keep only
  // Supabase unreachable while restoring the page and its persisted session.
  await helperContext.route("http://127.0.0.1:55431/**", (route) =>
    route.abort("internetdisconnected"),
  );
  await helperContext.setOffline(false);
  await helperPage.reload();
  await expect(
    helperPage.getByText("Saved · waiting to sync", { exact: true }),
  ).toBeVisible();
  expect((await saved(helperPage, helper.id))!.queue[0]).toEqual(pending);
  await helperContext.unroute("http://127.0.0.1:55431/**");
  await sync(helperPage);
  await expect
    .poll(async () => (await saved(helperPage, helper.id))?.queue.length)
    .toBe(0);
  await sync(employerPage);
  await expect(
    employerPage.getByRole("button", {
      name: `${task.title}, completed`,
      exact: true,
    }),
  ).toBeVisible();
  const server = (await dashboard(employer.api)).tasks[0];
  expect(server).toMatchObject({
    status: "done",
    feedback: pending.feedback,
    version: 1,
  });
  await sync(helperPage);
  const events = await auditClient()
    .from("task_events")
    .select("id,feedback")
    .eq("task_id", task.id);
  expect(events.error).toBeNull();
  expect(events.data).toEqual([{ id: pending.id, feedback: pending.feedback }]);
});

test("committed update with a lost response retries the same mutation without duplication", async ({
  pair,
}) => {
  const { helperContext, helperPage, helper, employer, task } = pair;
  let forwarded = false;
  let committed = false;
  await helperContext.route("**/rest/v1/rpc/update_task", async (route) => {
    if (!forwarded) {
      forwarded = true;
      const response = await route.fetch(); // REAL RPC commits, then response is dropped.
      committed = response.ok();
    }
    await route.abort("connectionreset");
  });
  await complete(helperPage, task.title, "Committed but acknowledgement lost");
  await expect.poll(() => committed).toBe(true);
  await expect
    .poll(async () => (await saved(helperPage, helper.id))?.queue.length)
    .toBe(1);
  const pending = (await saved(helperPage, helper.id))!.queue[0];
  expect((await dashboard(employer.api)).tasks[0]).toMatchObject({
    version: 1,
    feedback: pending.feedback,
  });
  await helperContext.unroute("**/rest/v1/rpc/update_task");
  await sync(helperPage);
  await expect
    .poll(async () => (await saved(helperPage, helper.id))?.queue.length)
    .toBe(0);
  expect((await dashboard(employer.api)).tasks[0]).toMatchObject({
    version: 1,
    feedback: pending.feedback,
  });
  const events = await auditClient()
    .from("task_events")
    .select("id")
    .eq("task_id", task.id);
  expect(events.error).toBeNull();
  expect(events.data).toEqual([{ id: pending.id }]);
});

test("offline conflict retains both notes and never retries a rejected version silently", async ({
  pair,
}) => {
  const { helperContext, helperPage, helper, employer, task } = pair;
  await helperContext.setOffline(true);
  await complete(helperPage, task.title, "Helper offline note must survive");
  await expect
    .poll(async () => (await saved(helperPage, helper.id))?.queue.length)
    .toBe(1);
  const pending = (await saved(helperPage, helper.id))!.queue[0];
  await rpc(employer.api, "update_task", {
    p_id: task.id,
    p_mutation: randomUUID(),
    p_status: "needs_help",
    p_feedback: "Employer server note wins",
    p_version: 0,
  });
  await helperContext.setOffline(false);
  await sync(helperPage);
  await expect(
    helperPage.getByText("Review sync conflict", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await saved(helperPage, helper.id))?.snapshot.tasks[0].version,
    )
    .toBe(1);
  const conflict = (await saved(helperPage, helper.id))!;
  expect(conflict.queue[0]).toMatchObject({
    ...pending,
    error: expect.stringContaining("CONFLICT"),
  });
  expect(conflict.snapshot.tasks[0]).toMatchObject({
    status: "needs_help",
    feedback: "Employer server note wins",
    version: 1,
  });
  await helperPage.reload();
  await expect(
    helperPage.getByText("Review sync conflict", { exact: true }),
  ).toBeVisible();
  expect((await saved(helperPage, helper.id))!.queue[0]).toEqual(
    conflict.queue[0],
  );
  let retried = 0;
  const listener = (request: { url(): string }) => {
    if (request.url().endsWith("/rpc/update_task")) retried++;
  };
  helperPage.on("request", listener);
  await sync(helperPage);
  // A successful dashboard response fences the preceding serialized outbox flush.
  await expect
    .poll(
      async () =>
        (await saved(helperPage, helper.id))?.snapshot.tasks[0].version,
    )
    .toBe(1);
  await expect(helperPage.getByText("Syncing…", { exact: true })).toHaveCount(
    0,
  );
  expect(retried).toBe(0);
  helperPage.off("request", listener);
  await helperPage
    .getByRole("button", { name: `${task.title}, needs help`, exact: true })
    .click();
  await expect(
    helperPage.getByText("Employer server note wins", { exact: true }),
  ).toBeVisible();
  await expect(
    helperPage.getByText(
      "Your unsynced note: Helper offline note must survive",
      { exact: true },
    ),
  ).toBeVisible();
  expect((await dashboard(employer.api)).tasks[0]).toMatchObject({
    version: 1,
    feedback: "Employer server note wins",
  });
  // Discard only after proving persisted data retention; this is an explicit UI action.
  await helperPage
    .getByRole("button", {
      name: "Discard my pending change & reload",
      exact: true,
    })
    .click();
  await expect
    .poll(async () => (await saved(helperPage, helper.id))?.queue.length)
    .toBe(0);
  await helperPage
    .getByRole("button", { name: `${task.title}, needs help`, exact: true })
    .click();
  await helperPage
    .getByLabel("Leave a note", { exact: true })
    .fill(pending.feedback);
  await helperPage
    .getByRole("button", { name: "Save note", exact: true })
    .click();
  await expect
    .poll(async () => (await dashboard(employer.api)).tasks[0].version)
    .toBe(2);
  const events = await auditClient()
    .from("task_events")
    .select("feedback")
    .eq("task_id", task.id);
  expect(events.error).toBeNull();
  expect(events.data).toHaveLength(2);
  expect(events.data).toEqual(
    expect.arrayContaining([
      { feedback: "Employer server note wins" },
      { feedback: pending.feedback },
    ]),
  );
});
