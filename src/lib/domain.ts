export type Role = "employer" | "helper";
export type Status = "todo" | "done" | "needs_help";
export type Category = "Home care" | "Kitchen" | "Family" | "Errands";
export type Member = { id: string; name: string; role: Role };
export type Task = {
  id: string;
  template_id: string;
  title: string;
  instructions: string;
  category: Category;
  due_date: string;
  due_time: string;
  assignee: string | null;
  status: Status;
  feedback: string;
  version: number;
};
export type Snapshot = {
  household: { id: string; name: string; rest_day: number } | null;
  members: Member[];
  tasks: Task[];
  user_id: string;
};
export type NewTask = {
  title: string;
  instructions: string;
  category: Category;
  start_date: string;
  due_time: string;
  assignee: string | null;
  repeat: "once" | "daily" | "weekly";
  skip_rest_day: boolean;
};
export type Mutation = {
  id: string;
  task_id: string;
  status: Status;
  feedback: string;
  expected_version: number;
  error?: string;
};
export const categories: Category[] = [
  "Home care",
  "Kitchen",
  "Family",
  "Errands",
];
export const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function singaporeDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dayOfWeek(day: string) {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}
export function displayDate(
  day: string,
  opts: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
  },
) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-SG", {
    ...opts,
    timeZone: "Asia/Singapore",
  });
}
export function isDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function validateTask(t: NewTask) {
  if (!t.title.trim() || t.title.trim().length > 120)
    throw new Error("Give your task a title of 1–120 characters.");
  if (!isDate(t.start_date)) throw new Error("Use a valid date: YYYY-MM-DD.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.due_time))
    throw new Error("Use a time in 24-hour format, such as 09:30.");
  if (t.instructions.length > 2000)
    throw new Error("Keep instructions under 2,000 characters.");
}
export function occurrenceDates(t: NewTask, restDay: number, horizon = 35) {
  validateTask(t);
  return Array.from({ length: t.repeat === "once" ? 1 : horizon }, (_, i) =>
    addDays(t.start_date, i),
  ).filter(
    (day) =>
      (t.repeat !== "weekly" || dayOfWeek(day) === dayOfWeek(t.start_date)) &&
      (!t.skip_rest_day || dayOfWeek(day) !== restDay),
  );
}
export function overlay(tasks: Task[], queue: Mutation[]) {
  return tasks.map((t) =>
    queue
      .filter((m) => m.task_id === t.id && !m.error)
      .reduce((v, m) => ({ ...v, status: m.status, feedback: m.feedback }), t),
  );
}
export function roleFor(s: Snapshot): Role | undefined {
  return s.members.find((m) => m.id === s.user_id)?.role;
}
export function demoSnapshot(today = singaporeDate()): Snapshot {
  const household = { id: "demo-home", name: "The Garden House", rest_day: 0 };
  const members: Member[] = [
    { id: "demo-employer", name: "Alex", role: "employer" },
    { id: "demo-helper", name: "May", role: "helper" },
  ];
  const examples = [
    [
      "A fresh start for the living room",
      "Open the windows, dust the shelves and give the floor a quick mop.",
      "Home care",
      "08:30",
    ],
    [
      "Prepare lunch together",
      "Vegetable soup and steamed rice. Please check the fridge before shopping.",
      "Kitchen",
      "11:00",
    ],
    [
      "Fresh sheets, happy home",
      "Change the bedsheets in the main bedroom. Clean linen is in the hallway cupboard.",
      "Home care",
      "14:00",
    ],
    [
      "Pick up a few essentials",
      "Milk, eggs and fresh fruit. Leave a note if anything is unavailable.",
      "Errands",
      "16:30",
    ],
  ] as const;
  return {
    household,
    members,
    user_id: "demo-employer",
    tasks: Array.from({ length: 35 }, (_, offset) => {
      const day = addDays(today, offset);
      if (dayOfWeek(day) === 0) return [];
      return examples.map(([title, instructions, category, time], i) => ({
        id: `demo-${day}-${i}`,
        template_id: `demo-${i}`,
        title,
        instructions,
        category,
        due_date: day,
        due_time: time,
        assignee: "demo-helper",
        status: (offset === 0 && i === 0 ? "done" : "todo") as Status,
        feedback: "",
        version: 0,
      }));
    }).flat(),
  };
}
