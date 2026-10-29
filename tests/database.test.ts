import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const employer = "00000000-0000-4000-8000-000000000001",
  helper = "00000000-0000-4000-8000-000000000002",
  outsider = "00000000-0000-4000-8000-000000000003";
test("Postgres authorization, invitations, recurrence, conflicts and retry safety", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${employer}'),('${helper}'),('${outsider}');`,
  );
  await db.exec(
    readFileSync("supabase/migrations/202610270001_helperday.sql", "utf8"),
  );
  const as = async (id: string) => {
    await db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
    );
  };
  const scalar = async (sql: string, args: unknown[] = []) => {
    const r = await db.query(sql, args);
    return Object.values(r.rows[0] as object)[0] as any;
  };
  try {
    await as(employer);
    const home = await scalar(
      `select public.create_household('Garden House','Alex',0)`,
    );
    assert.ok(home);
    await assert.rejects(
      () => db.exec(`insert into public.households(name) values('Escalate')`),
      /permission denied/,
    );
    const invite = await scalar(`select public.create_invite('helper')`);
    await as(helper);
    assert.equal(
      await scalar("select public.join_household($1, $2)", [invite, "May"]),
      home,
    );
    await assert.rejects(
      () => db.exec(`select public.create_invite('employer')`),
      /Only an employer/,
    );
    await assert.rejects(
      () => db.exec(`select public.create_task('{}')`),
      /Only an employer/,
    );
    await as(outsider);
    await assert.rejects(
      () => db.query("select public.join_household($1,$2)", [invite, "Other"]),
      /used or expired/,
    );
    assert.equal(
      (await db.query("select * from public.households")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.members")).rows.length,
      0,
    );
    await scalar(`select public.create_household('Other home','Other',6)`);
    await as(employer);
    const task = {
      title: "Laundry",
      instructions: "Gentle cycle",
      category: "Home care",
      start_date: "2026-10-26",
      due_time: "09:00",
      assignee: helper,
      repeat: "daily",
      skip_rest_day: true,
    };
    await assert.rejects(
      () =>
        db.query("select public.create_task($1)", [
          { ...task, assignee: outsider },
        ]),
      /Assignee/,
    );
    await scalar("select public.create_task($1)", [task]);
    const first = await scalar(`select public.dashboard('2026-10-26')`);
    assert.equal(first.tasks.length, 30);
    assert.equal(first.members.length, 2);
    assert.equal(
      (await scalar(`select public.dashboard('2026-10-26')`)).tasks.length,
      30,
    );
    const t = first.tasks[0];
    const mutation = "00000000-0000-4000-8000-000000000004";
    await as(outsider);
    await assert.rejects(
      () =>
        db.query(`select public.update_task($1,$2,'done','',0)`, [
          t.id,
          mutation,
        ]),
      /not accessible/,
    );
    assert.equal((await db.query("select * from public.tasks")).rows.length, 0);
    await as(helper);
    await db.query(`select public.update_task($1,$2,'done','All clean',0)`, [
      t.id,
      mutation,
    ]);
    await db.query(`select public.update_task($1,$2,'done','All clean',0)`, [
      t.id,
      mutation,
    ]);
    const second = await scalar(`select public.dashboard('2026-10-26')`);
    assert.equal(second.tasks[0].version, 1);
    assert.equal(second.tasks[0].status, "done");
    assert.equal(second.tasks[1].status, "todo");
    await assert.rejects(
      () =>
        db.query(`select public.update_task($1,$2,'todo','',0)`, [
          t.id,
          "00000000-0000-4000-8000-000000000005",
        ]),
      /CONFLICT/,
    );
    await assert.rejects(
      () =>
        db.query(`update public.tasks set status='done' where id=$1`, [t.id]),
      /permission denied/,
    );
    await db.exec("reset role");
    assert.equal(await scalar("select count(*)::int from task_events"), 1);
    await db.exec("set role anon");
    await assert.rejects(
      () => db.exec(`select public.dashboard('2026-10-26')`),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
