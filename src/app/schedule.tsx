import { useState } from "react";
import { Pressable, View } from "react-native";
import { useApp } from "../state/AppProvider";
import {
  addDays,
  dayOfWeek,
  displayDate,
  singaporeDate,
  weekdays,
} from "../lib/domain";
import {
  Button,
  Chip,
  Empty,
  Label,
  Row,
  Title,
  useTheme,
} from "../components/ui";
import { TaskCard } from "../components/Tasks";
export default function Schedule() {
  const app = useApp();
  const c = useTheme();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(singaporeDate());
  const start = addDays(singaporeDate(), offset);
  const tasks = app.snapshot.tasks
    .filter((t) => t.due_date === selected)
    .sort((a, b) => a.due_time.localeCompare(b.due_time));
  return (
    <View style={{ gap: 24 }}>
      <Title>A little structure. More ease.</Title>
      <Label muted>
        Plan together, with room for rest. All times are Singapore time.
      </Label>
      <Row style={{ justifyContent: "space-between" }}>
        <Button
          secondary
          disabled={offset === 0}
          onPress={() => {
            setOffset(offset - 7);
            setSelected(addDays(start, -7));
          }}
        >
          ← Previous
        </Button>
        <Label>
          {displayDate(start, { day: "numeric", month: "short" })} –{" "}
          {displayDate(addDays(start, 6), { day: "numeric", month: "short" })}
        </Label>
        <Button
          secondary
          disabled={offset >= 28}
          onPress={() => {
            setOffset(offset + 7);
            setSelected(addDays(start, 7));
          }}
        >
          Next →
        </Button>
      </Row>
      <View style={{ flexDirection: "row", gap: 5 }}>
        {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((day) => (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityLabel={displayDate(day)}
            accessibilityState={{ selected: day === selected }}
            onPress={() => setSelected(day)}
            style={{
              flex: 1,
              paddingVertical: 14,
              alignItems: "center",
              borderRadius: 16,
              gap: 7,
              backgroundColor: day === selected ? c.primary : c.card,
              borderWidth: 1,
              borderColor: c.line,
            }}
          >
            <Label
              style={{
                fontSize: 11,
                color: day === selected ? c.onPrimary : c.muted,
              }}
            >
              {weekdays[dayOfWeek(day)]}
            </Label>
            <Label
              style={{
                fontSize: 20,
                color: day === selected ? c.onPrimary : c.text,
              }}
            >
              {Number(day.slice(-2))}
            </Label>
            <View
              style={{
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: app.snapshot.tasks.some(
                  (t) => t.due_date === day,
                )
                  ? day === selected
                    ? c.onPrimary
                    : c.primary
                  : "transparent",
              }}
            />
          </Pressable>
        ))}
      </View>
      <Row>
        <Title small>
          {displayDate(selected, {
            weekday: "long",
            day: "numeric",
            month: "short",
          })}
        </Title>
        {dayOfWeek(selected) === app.snapshot.household?.rest_day && (
          <Chip>Rest day</Chip>
        )}
      </Row>
      {tasks.length ? (
        tasks.map((t) => <TaskCard key={t.id} task={t} />)
      ) : (
        <Empty
          title="A clear calendar"
          body="No tasks planned for this day. Rest and flexibility belong in the schedule too."
        />
      )}
    </View>
  );
}
