import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  account,
  auditClient,
  client,
  dashboard,
  household,
  localConfig,
  newTask,
  rpc,
  taskInput,
} from "../helpers";

test("real Auth JWT, RLS and RPC match the database permission contract", async () => {
  const { employer, helper, home, token } = await household();
  const outsider = await account("outsider");
  const task = await newTask(employer.api, "Shared task", helper.id);
  const employerTask = await newTask(
    employer.api,
    "Employer-only assignment",
    employer.id,
  );

  await test.step("two independently signed-in users share the household and tasks", async () => {
    expect(helper.id).not.toBe(employer.id);
    const a = await dashboard(employer.api);
    const b = await dashboard(helper.api);
    expect(a.user_id).toBe(employer.id);
    expect(b.user_id).toBe(helper.id);
    expect(b.household?.id).toBe(home);
    expect(b.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: employer.id, role: "employer" }),
        expect.objectContaining({ id: helper.id, role: "helper" }),
      ]),
    );
    expect(b.tasks).toEqual(a.tasks);
    expect((await dashboard(helper.api)).tasks).toHaveLength(2);
  });

  await test.step("single-use invites cannot be reused or used to escalate a helper", async () => {
    const reused = await outsider.api.rpc("join_household", {
      p_token: token,
      p_name: "Other",
    });
    expect(reused.error?.message).toMatch(/used or expired/);
    expect((await dashboard(outsider.api)).household).toBeNull();
    const invite = await helper.api.rpc("create_invite", {
      p_role: "employer",
    });
    expect(invite.error?.message).toMatch(/Only an employer/);
    const create = await helper.api.rpc("create_task", {
      p_task: taskInput("Forbidden"),
    });
    expect(create.error?.message).toMatch(/Only an employer/);
    expect((await dashboard(employer.api)).tasks).toHaveLength(2);
  });

  await test.step("RLS filters every readable table, even with a known foreign ID", async () => {
    await rpc(outsider.api, "create_household", {
      p_name: "Other synthetic household",
      p_member_name: "Other",
    });
    await newTask(outsider.api, "Private task");
    for (const table of ["households", "members", "task_templates", "tasks"]) {
      for (const api of [employer.api, helper.api]) {
        const own = await api.from(table).select("*");
        expect(own.error).toBeNull();
        expect(own.data).toHaveLength(table === "households" ? 1 : 2);
        expect(
          own.data!.every(
            (row) =>
              (table === "households" ? row.id : row.household_id) === home,
          ),
        ).toBe(true);
      }
      const result = await outsider.api
        .from(table)
        .select("*")
        .eq(table === "households" ? "id" : "household_id", home);
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    }
    expect((await dashboard(outsider.api)).tasks.map((t) => t.title)).toEqual([
      "Private task",
    ]);
    const foreignAssignee = await employer.api.rpc("create_task", {
      p_task: taskInput("Foreign", outsider.id),
    });
    expect(foreignAssignee.error?.message).toMatch(/Assignee/);
    for (const api of [outsider.api, helper.api]) {
      const denied = await api.rpc("update_task", {
        p_id: api === outsider.api ? task.id : employerTask.id,
        p_mutation: randomUUID(),
        p_status: "done",
        p_feedback: "forbidden",
        p_version: 0,
      });
      expect(denied.error?.message).toMatch(/not accessible|another person/);
    }
  });

  await test.step("client table writes and private audit/invite reads are forbidden", async () => {
    for (const api of [employer.api, helper.api]) {
      for (const table of [
        "households",
        "members",
        "invites",
        "task_templates",
        "tasks",
        "task_events",
      ]) {
        // Check INSERT, UPDATE and DELETE grants, not just zero affected rows.
        const insert = await api.from(table).insert({});
        expect(insert.error?.code, `${table} insert`).toBe("42501");
        const remove = await api
          .from(table)
          .delete()
          .eq(table === "invites" ? "token" : "id", randomUUID());
        expect(remove.error?.code, `${table} delete`).toBe("42501");
        const field = table === "invites" ? "token" : "id";
        const update = await api
          .from(table)
          .update({ [field]: randomUUID() })
          .eq(field, randomUUID());
        expect(update.error?.code, `${table} update`).toBe("42501");
      }
      for (const table of ["invites", "task_events"]) {
        expect((await api.from(table).select("*")).error?.code).toBe("42501");
      }
    }
    expect(
      (await dashboard(helper.api)).tasks.find((t) => t.id === task.id)
        ?.version,
    ).toBe(0);
  });

  await test.step("anon and a forged JWT are rejected at the real HTTP boundary", async () => {
    const anon = client();
    expect(
      (await anon.rpc("dashboard", { p_from: task.due_date })).error?.code,
    ).toBe("42501");
    expect((await anon.from("tasks").select("*")).error?.code).toBe("42501");
    const session = (await helper.api.auth.getSession()).data.session!;
    const parts = session.access_token.split(".");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    parts[1] = Buffer.from(
      JSON.stringify({ ...payload, sub: employer.id, role: "service_role" }),
    ).toString("base64url");
    const { url, key } = localConfig();
    const forged = await fetch(`${url}/rest/v1/tasks?select=id`, {
      headers: { apikey: key, Authorization: `Bearer ${parts.join(".")}` },
    });
    expect(forged.status).toBe(401);
  });
});

test("simultaneous updates conflict atomically; retries preserve winner and audit history", async () => {
  const { employer, helper } = await household();
  const task = await newTask(employer.api, "Concurrent task", helper.id);
  const updates = [
    {
      api: employer.api,
      actor: employer.id,
      mutation: randomUUID(),
      status: "done",
      note: "Employer winning candidate",
    },
    {
      api: helper.api,
      actor: helper.id,
      mutation: randomUUID(),
      status: "needs_help",
      note: "Helper winning candidate",
    },
  ];
  const args = (u: (typeof updates)[number], version = 0) => ({
    p_id: task.id,
    p_mutation: u.mutation,
    p_status: u.status,
    p_feedback: u.note,
    p_version: version,
  });
  // Separate clients issue HTTP requests together. Do not serialize the race.
  const results = await Promise.all(
    updates.map((u) => u.api.rpc("update_task", args(u))),
  );
  expect(results.filter((r) => !r.error)).toHaveLength(1);
  expect(
    results.filter((r) => r.error?.message.includes("CONFLICT")),
  ).toHaveLength(1);
  const winner = updates[results.findIndex((r) => !r.error)];
  const loser = updates[results.findIndex((r) => r.error)];
  const read = async () =>
    (await dashboard(helper.api)).tasks.find((t) => t.id === task.id)!;
  expect(await read()).toMatchObject({
    status: winner.status,
    feedback: winner.note,
    version: 1,
  });
  // Retrying a lost success is a no-op; retrying a stale loser stays a conflict.
  await rpc(winner.api, "update_task", args(winner));
  expect(
    (await loser.api.rpc("update_task", args(loser))).error?.message,
  ).toMatch(/CONFLICT/);
  expect(await read()).toMatchObject({ feedback: winner.note, version: 1 });
  const audit = auditClient();
  const events = async () => {
    const result = await audit
      .from("task_events")
      .select("id,actor,status,feedback")
      .eq("task_id", task.id);
    expect(result.error).toBeNull();
    return result.data!;
  };
  expect(await events()).toEqual([
    {
      id: winner.mutation,
      actor: winner.actor,
      status: winner.status,
      feedback: winner.note,
    },
  ]);
  // Explicit review/reapply uses a NEW mutation and the observed current version.
  const reapply = { ...loser, mutation: randomUUID() };
  await rpc(reapply.api, "update_task", args(reapply, 1));
  await rpc(winner.api, "update_task", args(winner)); // old acknowledged mutation cannot roll back newer state
  expect(await read()).toMatchObject({
    feedback: loser.note,
    status: loser.status,
    version: 2,
  });
  expect(await events()).toHaveLength(2);
  expect(await events()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ feedback: winner.note }),
      expect.objectContaining({ feedback: loser.note }),
    ]),
  );
});

test("concurrent redemption consumes an invitation exactly once", async () => {
  const employer = await account("invite-owner");
  const a = await account("join-a");
  const b = await account("join-b");
  const home = await rpc<string>(employer.api, "create_household", {
    p_name: "Invite race",
    p_member_name: "Owner",
  });
  const token = await rpc<string>(employer.api, "create_invite", {
    p_role: "helper",
  });
  const results = await Promise.all(
    [a, b].map((u) =>
      u.api.rpc("join_household", { p_token: token, p_name: "Candidate" }),
    ),
  );
  expect(results.filter((r) => !r.error && r.data === home)).toHaveLength(1);
  expect(
    results.filter((r) => r.error?.message.includes("used or expired")),
  ).toHaveLength(1);
  expect((await dashboard(employer.api)).members).toHaveLength(2);
  const loser = [a, b][results.findIndex((r) => r.error)];
  expect((await dashboard(loser.api)).household).toBeNull();
});
