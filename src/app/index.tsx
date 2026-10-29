import { View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { Coffee, Heart } from "lucide-react-native";
import { useState } from "react";
import { useApp } from "../state/AppProvider";
import { displayDate, singaporeDate } from "../lib/domain";
import {
  Button,
  Card,
  Chip,
  Empty,
  Label,
  Row,
  Tile,
  Title,
  useTheme,
} from "../components/ui";
import { TaskCard } from "../components/Tasks";
export default function Today() {
  const app = useApp();
  const c = useTheme();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState("All tasks");
  const today = singaporeDate();
  const member = app.snapshot.members.find(
    (m) => m.id === app.snapshot.user_id,
  );
  const all = app.snapshot.tasks
    .filter((t) => t.due_date === today)
    .sort((a, b) => a.due_time.localeCompare(b.due_time));
  const done = all.filter((t) => t.status === "done").length;
  const filtered = all.filter(
    (t) =>
      filter === "All tasks" ||
      (filter === "To do"
        ? t.status === "todo"
        : filter === "Done"
          ? t.status === "done"
          : t.status === "needs_help"),
  );
  return (
    <View style={{ gap: 26 }}>
      <View style={{ gap: 6 }}>
        <Label muted style={{ fontSize: 12, letterSpacing: 1 }}>
          {displayDate(today).toUpperCase()}
        </Label>
        <Title>A good day starts together.</Title>
        <Label muted>
          Hello, {member?.name}. Here’s a little rhythm for your home.
        </Label>
      </View>
      <View
        style={{
          backgroundColor: c.soft,
          borderRadius: 24,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: c.line,
        }}
      >
        <View
          style={{
            padding: 26,
            flexDirection: "row",
            alignItems: "center",
            gap: 24,
          }}
        >
          <View style={{ flex: 1, gap: 12 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Label
                style={{
                  fontSize: 11,
                  letterSpacing: 2,
                  fontWeight: "700",
                  color: c.primary,
                }}
              >
                TODAY, AT A GLANCE
              </Label>
              {width <= 550 && !c.minimal && <Tile size={32} />}
            </Row>
            <Title small>
              {all.length === 0
                ? "A little room to breathe."
                : done === all.length
                  ? "All done. Time to unwind."
                  : `${all.length - done} little things, one lovely home.`}
            </Title>
            <Label muted>
              {all.length
                ? `${done} of ${all.length} tasks complete. Every little bit helps.`
                : "No tasks planned today. Enjoy a slower moment."}
            </Label>
            <View
              style={{
                height: 6,
                backgroundColor: c.line,
                borderRadius: 5,
                marginTop: 5,
                maxWidth: 360,
              }}
            >
              <View
                style={{
                  height: 6,
                  width: `${all.length ? (done / all.length) * 100 : 0}%`,
                  backgroundColor: c.primary,
                  borderRadius: 5,
                }}
              />
            </View>
          </View>
          {width > 550 && !c.minimal && (
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                transform: [{ rotate: "-8deg" }],
              }}
            >
              <View style={{ gap: 8 }}>
                <Tile size={65} />
                <Tile size={65} coral />
              </View>
              <View style={{ gap: 8, marginTop: 15 }}>
                <Tile size={65} coral />
                <Tile size={65} />
              </View>
            </View>
          )}
        </View>
        {!c.minimal && (
          <View style={{ height: 8, backgroundColor: c.coral, opacity: 0.6 }} />
        )}
      </View>
      <View
        style={{ flexDirection: width >= 1160 ? "row" : "column", gap: 26 }}
      >
        <View style={{ flex: 1, gap: 16 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Title small>On the list</Title>
            {app.role === "employer" && (
              <Button secondary onPress={() => router.push("/new-task")}>
                + Add task
              </Button>
            )}
          </Row>
          <Row>
            {["All tasks", "To do", "Done", "Needs help"].map((f) => (
              <Chip
                key={f}
                selected={filter === f}
                onPress={() => setFilter(f)}
              >
                {f}
              </Chip>
            ))}
          </Row>
          {filtered.length ? (
            filtered.map((t) => <TaskCard key={t.id} task={t} />)
          ) : (
            <Empty
              title="All clear here"
              body="Nothing in this list right now. Check another filter or plan something for your household."
            />
          )}
        </View>
        <View style={{ width: width >= 1160 ? 285 : undefined, gap: 16 }}>
          <Card
            style={{ backgroundColor: c.coralSoft, borderColor: "transparent" }}
          >
            <Coffee size={28} color={c.coral} />
            <Title small>A pause is part{"\n"}of the plan.</Title>
            <Label muted>
              Make space for a break, a cup of tea, and a moment to yourself.
            </Label>
          </Card>
          <Card>
            <Row>
              <Heart size={19} color={c.primary} />
              <Label style={{ fontWeight: "600" }}>Your home team</Label>
            </Row>
            {app.snapshot.members.map((m) => (
              <Row key={m.id}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: c.soft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Label>{m.name.slice(0, 1)}</Label>
                </View>
                <View>
                  <Label style={{ fontSize: 14 }}>
                    {m.name}
                    {m.id === app.snapshot.user_id ? " (you)" : ""}
                  </Label>
                  <Label muted style={{ fontSize: 11 }}>
                    {m.role === "employer" ? "Employer" : "Helper"}
                  </Label>
                </View>
              </Row>
            ))}
            <Button secondary onPress={() => router.navigate("/household")}>
              Household details ↗
            </Button>
          </Card>
        </View>
      </View>
    </View>
  );
}
