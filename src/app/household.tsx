import { useState } from "react";
import { Share, View } from "react-native";
import { useApp } from "../state/AppProvider";
import { rpc } from "../lib/backend";
import { weekdays } from "../lib/domain";
import {
  Button,
  Card,
  Chip,
  ErrorText,
  Label,
  Row,
  Tile,
  Title,
} from "../components/ui";
export default function Household() {
  const app = useApp();
  const [invite, setInvite] = useState("");
  const [role, setRole] = useState("helper");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    setBusy(true);
    setError("");
    try {
      setInvite(await rpc<string>("create_invite", { p_role: role }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 24, maxWidth: 850, width: "100%" }}>
      <Title>One home. One team.</Title>
      <Label muted>A shared plan works best when everyone has a voice.</Label>
      <Card>
        <Row>
          <Tile size={54} />
          <View style={{ flex: 1 }}>
            <Title small>{app.snapshot.household?.name}</Title>
            <Label muted>Singapore · Asia/Singapore</Label>
          </View>
        </Row>
        <Label>
          Weekly rest day: {weekdays[app.snapshot.household?.rest_day || 0]}
        </Label>
        <Label muted>
          Recurring tasks skip the agreed rest day by default. Please discuss
          any exceptions together.
        </Label>
      </Card>
      <Card>
        <Title small>The people who make it home</Title>
        {app.snapshot.members.map((m) => (
          <Row
            key={m.id}
            style={{ justifyContent: "space-between", paddingVertical: 8 }}
          >
            <Label style={{ fontWeight: "600" }}>
              {m.name}
              {m.id === app.snapshot.user_id ? " (you)" : ""}
            </Label>
            <Chip>{m.role === "helper" ? "Helper" : "Employer"}</Chip>
          </Row>
        ))}
      </Card>
      {app.role === "employer" && (
        <Card>
          <Title small>Invite someone home</Title>
          <Label muted>
            Each invitation works once and expires after seven days. Share it
            with the person you want to join.
          </Label>
          <Row>
            <Chip
              selected={role === "helper"}
              onPress={() => setRole("helper")}
            >
              Helper
            </Chip>
            <Chip
              selected={role === "employer"}
              onPress={() => setRole("employer")}
            >
              Employer
            </Chip>
          </Row>
          {app.demo ? (
            <Label muted>
              Invitations are available in a real household. The demo does not
              invite or message anyone.
            </Label>
          ) : (
            <>
              <Button disabled={busy} onPress={() => void create()}>
                {busy ? "Creating…" : "Create invitation"}
              </Button>
              {invite && (
                <>
                  <Label
                    selectable
                    style={{ fontFamily: "monospace", fontSize: 14 }}
                  >
                    {invite}
                  </Label>
                  <Button
                    secondary
                    onPress={() =>
                      Share.share({
                        message: `Join our household on Helperday. Sign in, choose “Use an invitation”, and enter this code: ${invite}`,
                      }).catch((e) => setError(e.message))
                    }
                  >
                    Share invitation
                  </Button>
                </>
              )}
              <ErrorText>{error}</ErrorText>
            </>
          )}
        </Card>
      )}
    </View>
  );
}
