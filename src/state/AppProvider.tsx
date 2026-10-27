import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, useColorScheme } from "react-native";
import { randomUUID } from "expo-crypto";
import { backend, rpc } from "../lib/backend";
import {
  demoSnapshot,
  Mutation,
  NewTask,
  occurrenceDates,
  overlay,
  roleFor,
  singaporeDate,
  Snapshot,
  Status,
  Task,
  validateTask,
} from "../lib/domain";

type Preferences = {
  style: "peranakan" | "minimal";
  mode: "light" | "dark" | "system";
};
type Saved = { snapshot: Snapshot; queue: Mutation[] };
const empty: Snapshot = {
  household: null,
  members: [],
  tasks: [],
  user_id: "",
};
function useController() {
  const system = useColorScheme();
  const [prefs, setPrefs] = useState<Preferences>({
    style: "peranakan",
    mode: "system",
  });
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [queue, setQueue] = useState<Mutation[]>([]);
  const [demo, setDemo] = useState(false);
  const [ready, setReady] = useState(!backend);
  const [user, setUser] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const current = useRef<Saved>({ snapshot: empty, queue: [] });
  const key = useRef("");
  const busy = useRef(false);
  const serial = useRef(Promise.resolve());
  const epoch = useRef(0);
  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = serial.current.then(fn, fn);
    serial.current = next.then(
      () => {},
      () => {},
    );
    return next;
  }
  async function save(next: Saved) {
    await AsyncStorage.setItem(key.current, JSON.stringify(next));
    current.current = next;
    setSnapshot(next.snapshot);
    setQueue(next.queue);
  }
  async function load(id: string, isDemo: boolean) {
    const generation = ++epoch.current;
    await exclusive(async () => {
      key.current = `helperday.v1.${isDemo ? "demo" : id}`;
      const raw = await AsyncStorage.getItem(key.current);
      const data: Saved = raw
        ? JSON.parse(raw)
        : {
            snapshot: isDemo ? demoSnapshot() : { ...empty, user_id: id },
            queue: [],
          };
      if (generation !== epoch.current) return;
      current.current = data;
      setSnapshot(data.snapshot);
      setQueue(data.queue);
      setDemo(isDemo);
      setUser(isDemo ? null : id);
      setReady(true);
      setLastSync(null);
      setError("");
    });
  }
  useEffect(() => {
    AsyncStorage.getItem("helperday.preferences")
      .then((raw) => {
        if (raw) setPrefs(JSON.parse(raw));
      })
      .catch(() => setError("Could not load appearance settings."));
    if (!backend) return;
    const { data } = backend.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") return;
      if (session) {
        void load(session.user.id, false).catch((e) => setError(String(e)));
      } else {
        setUser(null);
        setReady(true);
      }
    });
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") backend?.auth.startAutoRefresh();
      else backend?.auth.stopAutoRefresh();
    });
    return () => {
      data.subscription.unsubscribe();
      sub.remove();
    };
    // One lifetime auth subscription; load reads account data through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function refresh() {
    if (demo || !user || busy.current) return;
    busy.current = true;
    setSyncing(true);
    const generation = epoch.current;
    try {
      await exclusive(async () => {
        if (generation !== epoch.current) return;
        for (const mutation of [...current.current.queue]) {
          if (mutation.error) continue;
          try {
            await rpc("update_task", {
              p_id: mutation.task_id,
              p_mutation: mutation.id,
              p_status: mutation.status,
              p_feedback: mutation.feedback,
              p_version: mutation.expected_version,
            });
            const next = {
              snapshot: {
                ...current.current.snapshot,
                tasks: current.current.snapshot.tasks.map((t) =>
                  t.id === mutation.task_id
                    ? {
                        ...t,
                        status: mutation.status,
                        feedback: mutation.feedback,
                        version: mutation.expected_version + 1,
                      }
                    : t,
                ),
              },
              queue: current.current.queue.filter((m) => m.id !== mutation.id),
            };
            await save(next);
          } catch (e) {
            const message = (e as Error).message;
            if (
              /CONFLICT|not accessible|another person|Invalid task/.test(
                message,
              )
            ) {
              await save({
                ...current.current,
                queue: current.current.queue.map((m) =>
                  m.id === mutation.id ? { ...m, error: message } : m,
                ),
              });
            } else throw e;
          }
        }
        const data = await rpc<Snapshot>("dashboard", {
          p_from: singaporeDate(),
        });
        await save({ snapshot: data, queue: current.current.queue });
        setError("");
        setLastSync(
          new Date().toLocaleTimeString("en-SG", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        );
      });
    } catch (e) {
      setError(
        `Sync unavailable. Saved changes will retry. ${(e as Error).message}`,
      );
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }
  useEffect(() => {
    if (!user || demo) return;
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 15000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      sub.remove();
    };
    // Session-scoped refresh; mutable work is read from current.current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, demo]);
  async function updateTask(task: Task, status: Status, feedback: string) {
    if (feedback.length > 2000)
      throw new Error("Keep your note under 2,000 characters.");
    await exclusive(async () => {
      if (current.current.queue.some((m) => m.task_id === task.id))
        throw new Error(
          "This task has a pending change. Sync or resolve it first.",
        );
      if (demo) {
        await save({
          ...current.current,
          snapshot: {
            ...current.current.snapshot,
            tasks: current.current.snapshot.tasks.map((t) =>
              t.id === task.id
                ? { ...t, status, feedback, version: t.version + 1 }
                : t,
            ),
          },
        });
        return;
      }
      await save({
        ...current.current,
        queue: [
          ...current.current.queue,
          {
            id: randomUUID(),
            task_id: task.id,
            status,
            feedback,
            expected_version: task.version,
          },
        ],
      });
    });
    void refresh();
  }
  async function addTask(task: NewTask) {
    validateTask(task);
    if (roleFor(current.current.snapshot) !== "employer")
      throw new Error("Only employers can schedule tasks.");
    if (demo)
      await exclusive(async () => {
        const id = randomUUID();
        const tasks: Task[] = occurrenceDates(
          task,
          snapshot.household!.rest_day,
        ).map((day) => ({
          id: `${id}-${day}`,
          template_id: id,
          title: task.title.trim(),
          instructions: task.instructions,
          category: task.category,
          due_date: day,
          due_time: task.due_time,
          assignee: task.assignee,
          status: "todo",
          feedback: "",
          version: 0,
        }));
        if (!tasks.length)
          throw new Error(
            "This date is a rest day. Choose another date or allow rest-day tasks.",
          );
        await save({
          ...current.current,
          snapshot: {
            ...current.current.snapshot,
            tasks: [...current.current.snapshot.tasks, ...tasks],
          },
        });
      });
    else {
      await rpc("create_task", { p_task: task });
      await refresh();
    }
  }
  async function preferences(next: Preferences) {
    await AsyncStorage.setItem("helperday.preferences", JSON.stringify(next));
    setPrefs(next);
  }
  async function switchRole() {
    await exclusive(async () => {
      if (!demo) return;
      await save({
        ...current.current,
        snapshot: {
          ...current.current.snapshot,
          user_id:
            snapshot.user_id === "demo-employer"
              ? "demo-helper"
              : "demo-employer",
        },
      });
    });
  }
  async function leave() {
    if (queue.length)
      throw new Error(
        "Sync or resolve your pending changes before signing out.",
      );
    if (backend && user) {
      const { error } = await backend.auth.signOut();
      if (error) throw error;
    }
    ++epoch.current;
    setDemo(false);
    setUser(null);
    setSnapshot(empty);
    setQueue([]);
    current.current = { snapshot: empty, queue: [] };
    setError("");
  }
  async function resolve(id: string) {
    await exclusive(() =>
      save({
        ...current.current,
        queue: current.current.queue.filter((m) => m.id !== id),
      }),
    );
    await refresh();
  }
  return {
    prefs,
    preferences,
    dark:
      prefs.mode === "dark" || (prefs.mode === "system" && system === "dark"),
    snapshot: { ...snapshot, tasks: overlay(snapshot.tasks, queue) },
    queue,
    demo,
    user,
    ready,
    error,
    setError,
    syncing,
    lastSync,
    refresh,
    updateTask,
    addTask,
    switchRole,
    leave,
    resolve,
    startDemo: () => load("demo", true),
    role: roleFor(snapshot),
    connected: !!backend,
  };
}
type Controller = ReturnType<typeof useController>;
const Context = createContext<Controller | null>(null);
export function AppProvider({ children }: React.PropsWithChildren) {
  return (
    <Context.Provider value={useController()}>{children}</Context.Provider>
  );
}
export function useApp() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("AppProvider missing");
  return ctx;
}
