import { View } from "react-native";
import { useApp } from "../state/AppProvider";
import {
  Button,
  Card,
  Chip,
  Label,
  Row,
  Tile,
  Title,
  useTheme,
} from "../components/ui";
export default function Settings() {
  const app = useApp();
  const c = useTheme();
  function run(p: Promise<unknown>) {
    p.catch((e) => app.setError(e.message));
  }
  return (
    <View style={{ gap: 24, maxWidth: 850, width: "100%" }}>
      <Title>Make it feel like home.</Title>
      <Label muted>
        A little personality, at whatever brightness feels right.
      </Label>
      <Card>
        <Title small>Your style</Title>
        <Row>
          {(["peranakan", "minimal"] as const).map((style) => (
            <View
              key={style}
              style={{
                flex: 1,
                minWidth: 200,
                borderWidth: 2,
                borderColor: app.prefs.style === style ? c.primary : c.line,
                padding: 18,
                borderRadius: 18,
                gap: 15,
              }}
            >
              {style === "peranakan" ? (
                <Row>
                  <Tile />
                  <Tile coral />
                </Row>
              ) : (
                <Row>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: "#334F8A",
                    }}
                  />
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: "#E6E9F0",
                    }}
                  />
                </Row>
              )}
              <Label style={{ fontWeight: "600" }}>
                {style === "peranakan" ? "Peranakan" : "Minimal"}
              </Label>
              <Label muted style={{ fontSize: 13 }}>
                {style === "peranakan"
                  ? "Jade, warm porcelain and heritage-inspired tilework."
                  : "Quiet colours, clean lines, a little breathing room."}
              </Label>
              <Button
                secondary={app.prefs.style !== style}
                onPress={() => run(app.preferences({ ...app.prefs, style }))}
              >
                {app.prefs.style === style
                  ? "Selected"
                  : `Choose ${style === "peranakan" ? "Peranakan" : "Minimal"}`}
              </Button>
            </View>
          ))}
        </Row>
      </Card>
      <Card>
        <Title small>Light & shade</Title>
        <Row>
          {(["light", "dark", "system"] as const).map((mode) => (
            <Chip
              key={mode}
              selected={app.prefs.mode === mode}
              onPress={() => run(app.preferences({ ...app.prefs, mode }))}
            >
              {mode === "system"
                ? "Follow device"
                : mode === "dark"
                  ? "Dark"
                  : "Light"}
            </Chip>
          ))}
        </Row>
        <Label muted>Your style stays with you in light and dark mode.</Label>
      </Card>
      <Card>
        <Title small>
          {app.demo ? "Try both sides of the day" : "Your account"}
        </Title>
        {app.demo && (
          <>
            <Label muted>
              Switch roles to explore what a helper or employer sees. This
              switch is only available in the demo.
            </Label>
            <Button secondary onPress={() => run(app.switchRole())}>
              Switch to {app.role === "employer" ? "helper" : "employer"} view
            </Button>
          </>
        )}
        <Label muted>
          {app.demo
            ? "Demo data stays on this device."
            : "Updates sync every 15 seconds while this app is open. Push notifications are not enabled in this version."}
        </Label>
        <Button secondary onPress={() => run(app.leave())}>
          {app.demo ? "Leave demo" : "Sign out"}
        </Button>
      </Card>
      {app.queue.some((m) => m.error) && (
        <Card>
          <Title small>Changes to review</Title>
          {app.queue
            .filter((m) => m.error)
            .map((m) => (
              <View key={m.id} style={{ gap: 12 }}>
                <Label>{m.error}</Label>
                <Label selectable>Your note: {m.feedback || "(no note)"}</Label>
                <Button secondary onPress={() => run(app.resolve(m.id))}>
                  Discard pending change & refresh
                </Button>
              </View>
            ))}
        </Card>
      )}
      <Label muted style={{ fontSize: 12 }}>
        Helperday · v0.1 · Made for the everyday
      </Label>
    </View>
  );
}
