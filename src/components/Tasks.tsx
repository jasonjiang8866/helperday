import React, { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import {
  Check,
  ChevronRight,
  CookingPot,
  Flower2,
  ShoppingBasket,
  Users,
  X,
} from "lucide-react-native";
import { Task } from "../lib/domain";
import { useApp } from "../state/AppProvider";
import {
  Button,
  Card,
  Chip,
  ErrorText,
  Field,
  Label,
  Row,
  Title,
  useTheme,
} from "./ui";
const icons = {
  "Home care": Flower2,
  Kitchen: CookingPot,
  Family: Users,
  Errands: ShoppingBasket,
};
export function TaskCard({ task }: { task: Task }) {
  const app = useApp();
  const c = useTheme();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(task.feedback);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = app.queue.find((m) => m.task_id === task.id);
  const assigned = app.snapshot.members.find((m) => m.id === task.assignee);
  const Icon = icons[task.category];
  const canEdit =
    app.role === "employer" ||
    !task.assignee ||
    task.assignee === app.snapshot.user_id;
  async function update(status: Task["status"]) {
    setBusy(true);
    setError("");
    try {
      await app.updateTask(task, status, note);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${task.title}, ${task.status === "done" ? "completed" : task.status === "needs_help" ? "needs help" : "to do"}`}
        onPress={() => {
          setNote(task.feedback);
          setError("");
          setOpen(true);
        }}
        style={({ pressed }) => ({
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: 20,
          padding: 18,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Row style={{ flexWrap: "nowrap", gap: 16 }}>
          <View
            style={{
              backgroundColor:
                task.status === "done"
                  ? c.soft
                  : task.category === "Kitchen"
                    ? c.coralSoft
                    : c.soft,
              width: 46,
              height: 46,
              borderRadius: 15,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {task.status === "done" ? (
              <Check size={21} color={c.primary} />
            ) : (
              <Icon
                size={22}
                color={task.category === "Kitchen" ? c.coral : c.primary}
              />
            )}
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Label
              style={{
                fontWeight: "600",
                fontSize: 16,
                textDecorationLine:
                  task.status === "done" ? "line-through" : "none",
                opacity: task.status === "done" ? 0.65 : 1,
              }}
            >
              {task.title}
            </Label>
            <Label muted style={{ fontSize: 12 }}>
              {task.due_time.slice(0, 5)} · {task.category} ·{" "}
              {assigned?.name || "Anyone"}
            </Label>
            {task.status === "needs_help" && (
              <Label style={{ color: c.coral, fontSize: 12 }}>
                Needs a hand · {task.feedback || "Please check in"}
              </Label>
            )}
            {pending && (
              <Label
                style={{
                  fontSize: 12,
                  color: pending.error ? c.coral : c.gold,
                }}
              >
                {pending.error
                  ? "Review sync conflict"
                  : "Saved · waiting to sync"}
              </Label>
            )}
          </View>
          <ChevronRight size={18} color={c.muted} />
        </Row>
      </Pressable>
      <Modal
        visible={open}
        animationType="fade"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#00000080",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            keyboardShouldPersistTaps="handled"
          >
            <Card style={{ maxWidth: 560, width: "100%", alignSelf: "center" }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Chip>{task.category}</Chip>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close task"
                  onPress={() => setOpen(false)}
                  style={{ padding: 12 }}
                >
                  <X size={22} color={c.text} />
                </Pressable>
              </Row>
              <Title small>{task.title}</Title>
              <Label muted>
                {task.due_date} · {task.due_time.slice(0, 5)} ·{" "}
                {assigned?.name || "Anyone"}
              </Label>
              <Label>
                {task.instructions ||
                  "No extra instructions. A little care goes a long way."}
              </Label>
              {canEdit && !pending ? (
                <>
                  <Field
                    label="Leave a note"
                    multiline
                    maxLength={2000}
                    placeholder="Anything the household should know?"
                    value={note}
                    onChangeText={setNote}
                  />
                  <ErrorText>{error}</ErrorText>
                  <Button
                    disabled={busy}
                    onPress={() =>
                      void update(task.status === "done" ? "todo" : "done")
                    }
                  >
                    {task.status === "done" ? "Reopen task" : "Mark as done"}
                  </Button>
                  <Row>
                    <Button
                      secondary
                      disabled={busy}
                      onPress={() => void update("needs_help")}
                      style={{ flex: 1 }}
                    >
                      Need a hand
                    </Button>
                    <Button
                      secondary
                      disabled={busy}
                      onPress={() => void update(task.status)}
                      style={{ flex: 1 }}
                    >
                      Save note
                    </Button>
                  </Row>
                </>
              ) : (
                <>
                  <Label>{task.feedback || "No notes yet."}</Label>
                  {pending ? (
                    <>
                      <Label style={{ color: c.coral }}>
                        {pending.error ||
                          "This change is saved on your device and waiting to sync."}
                      </Label>
                      {pending.error && (
                        <>
                          <Label muted>
                            Your unsynced note:{" "}
                            {pending.feedback || "(no note)"}
                          </Label>
                          <Button
                            secondary
                            onPress={() =>
                              app
                                .resolve(pending.id)
                                .then(() => setOpen(false))
                                .catch((e) => setError(e.message))
                            }
                          >
                            Discard my pending change & reload
                          </Button>
                          <Label muted>
                            Copy your note first if you want to reapply it after
                            reviewing the latest task.
                          </Label>
                        </>
                      )}
                    </>
                  ) : (
                    <Label muted>
                      Only the assigned person or an employer can update this
                      task.
                    </Label>
                  )}
                </>
              )}
            </Card>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
