import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  demoSnapshot,
  NewTask,
  occurrenceDates,
  overlay,
  singaporeDate,
  validateTask,
} from "../src/lib/domain";
const base: NewTask = {
  title: "Laundry",
  instructions: "Gentle cycle",
  category: "Home care",
  start_date: "2026-10-26",
  due_time: "09:00",
  assignee: null,
  repeat: "daily",
  skip_rest_day: true,
};
test("Singapore date changes at UTC 16:00, independent of device zone", () => {
  assert.equal(singaporeDate(new Date("2026-10-26T15:59:59Z")), "2026-10-26");
  assert.equal(singaporeDate(new Date("2026-10-26T16:00:00Z")), "2026-10-27");
});
test("daily tasks skip rest day; weekly and once generate distinct dates", () => {
  assert.deepEqual(occurrenceDates(base, 0, 7), [
    "2026-10-26",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-10-31",
  ]);
  assert.deepEqual(occurrenceDates({ ...base, repeat: "weekly" }, 0, 15), [
    "2026-10-26",
    "2026-11-02",
    "2026-11-09",
  ]);
  assert.equal(occurrenceDates({ ...base, repeat: "once" }, 0).length, 1);
  assert.equal(
    occurrenceDates({ ...base, start_date: "2026-11-01", repeat: "once" }, 0)
      .length,
    0,
  );
  assert.equal(
    occurrenceDates(
      {
        ...base,
        start_date: "2026-11-01",
        repeat: "once",
        skip_rest_day: false,
      },
      0,
    ).length,
    1,
  );
});
test("invalid dates and times fail before persistence", () => {
  for (const patch of [
    { title: " " },
    { start_date: "2026-02-30" },
    { due_time: "25:00" },
    { due_time: "09:61" },
  ])
    assert.throws(() => validateTask({ ...base, ...patch }));
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
test("optimistic changes affect only their instance; conflicts show server truth", () => {
  const s = demoSnapshot("2026-10-26");
  const t = s.tasks[1];
  const q = {
    id: "m",
    task_id: t.id,
    status: "done" as const,
    feedback: "Finished",
    expected_version: 0,
  };
  const result = overlay(s.tasks, [q]);
  assert.equal(result[1].status, "done");
  assert.equal(s.tasks[1].status, "todo");
  assert.equal(result[5].status, "todo");
  assert.equal(
    overlay(s.tasks, [{ ...q, error: "CONFLICT" }])[1].status,
    "todo",
  );
});
