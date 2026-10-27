import { useState } from "react";
import { Switch, View } from "react-native";
import { router } from "expo-router";
import { useApp } from "../state/AppProvider";
import { categories, dayOfWeek, NewTask, singaporeDate } from "../lib/domain";
import {
  Button,
  Card,
  Chip,
  ErrorText,
  Field,
  Label,
  Row,
  Title,
} from "../components/ui";
export default function NewTaskScreen() {
  const app = useApp();
  const [form, setForm] = useState<NewTask>({
    title: "",
    instructions: "",
    category: "Home care",
    start_date: singaporeDate(),
    due_time: "09:00",
    assignee: app.snapshot.members.find((m) => m.role === "helper")?.id || null,
    repeat: "once",
    skip_rest_day: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function set<K extends keyof NewTask>(key: K, value: NewTask[K]) {
    setForm((v) => ({ ...v, [key]: value }));
  }
  async function submit() {
    setError("");
    setBusy(true);
    try {
      if (
        form.repeat !== "daily" &&
        form.skip_rest_day &&
        dayOfWeek(form.start_date) === app.snapshot.household?.rest_day
      )
        throw new Error(
          "This falls on your rest day. Pick another date or turn off “Skip rest day”.",
        );
      await app.addTask(form);
      router.replace("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (app.role !== "employer")
    return (
      <Card>
        <Title small>Planning is managed by your employer</Title>
        <Label>You can complete tasks and share feedback from Today.</Label>
      </Card>
    );
  return (
    <View
      style={{ maxWidth: 760, width: "100%", alignSelf: "center", gap: 22 }}
    >
      <Title>Make a little plan.</Title>
      <Label muted>Clear instructions make the day easier for everyone.</Label>
      <Card>
        <Field
          label="Task title"
          placeholder="e.g. Water the balcony plants"
          value={form.title}
          onChangeText={(v) => set("title", v)}
          maxLength={120}
        />
        <Field
          label="Instructions"
          placeholder="What would help someone do this well?"
          value={form.instructions}
          onChangeText={(v) => set("instructions", v)}
          multiline
          maxLength={2000}
        />
        <Label>Category</Label>
        <Row>
          {categories.map((v) => (
            <Chip
              key={v}
              selected={form.category === v}
              onPress={() => set("category", v)}
            >
              {v}
            </Chip>
          ))}
        </Row>
        <Row>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Field
              label="Date (YYYY-MM-DD)"
              value={form.start_date}
              onChangeText={(v) => set("start_date", v)}
            />
          </View>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Field
              label="Time (HH:MM, Singapore)"
              value={form.due_time}
              onChangeText={(v) => set("due_time", v)}
            />
          </View>
        </Row>
        <Label>Assigned to</Label>
        <Row>
          <Chip selected={!form.assignee} onPress={() => set("assignee", null)}>
            Anyone
          </Chip>
          {app.snapshot.members.map((m) => (
            <Chip
              key={m.id}
              selected={form.assignee === m.id}
              onPress={() => set("assignee", m.id)}
            >
              {m.name}
            </Chip>
          ))}
        </Row>
        <Label>Repeat</Label>
        <Row>
          {(["once", "daily", "weekly"] as const).map((r) => (
            <Chip
              key={r}
              selected={form.repeat === r}
              onPress={() => set("repeat", r)}
            >
              {r === "once"
                ? "Just once"
                : r === "daily"
                  ? "Every day"
                  : "Every week"}
            </Chip>
          ))}
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <Label>Skip rest day</Label>
          <Switch
            accessibilityLabel="Skip rest day"
            value={form.skip_rest_day}
            onValueChange={(v) => set("skip_rest_day", v)}
          />
        </Row>
        <ErrorText>{error}</ErrorText>
        <Button disabled={busy} onPress={() => void submit()}>
          {busy ? "Saving…" : "Add to the schedule"}
        </Button>
        <Button secondary disabled={busy} onPress={() => router.replace("/")}>
          Cancel
        </Button>
      </Card>
    </View>
  );
}
