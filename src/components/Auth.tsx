import React, { useState } from "react";
import { Platform, View } from "react-native";
import { backend, rpc } from "../lib/backend";
import { nativeAuthRedirect } from "../lib/auth-callback";
import { useApp } from "../state/AppProvider";
import {
  Button,
  Card,
  ErrorText,
  Field,
  Label,
  Row,
  Tile,
  Title,
  useTheme,
  Chip,
} from "./ui";
export function Welcome() {
  const app = useApp();
  const c = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function auth() {
    if (!backend) return;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = signup
        ? await backend.auth.signUp({
            email: email.trim(),
            password,
            options: {
              emailRedirectTo:
                Platform.OS === "web"
                  ? `${window.location.origin}/auth/callback`
                  : nativeAuthRedirect,
            },
          })
        : await backend.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
      if (error) throw error;
      if (signup && !data.session)
        setMessage(
          "Check your email to confirm your account, then sign in here.",
        );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View
      style={{
        maxWidth: 760,
        alignSelf: "center",
        width: "100%",
        gap: 26,
        paddingVertical: 28,
      }}
    >
      <Row>
        <Tile size={62} />
        <Label style={{ fontSize: 30, fontWeight: "700" }}>
          helperday<Label style={{ color: c.coral, fontSize: 30 }}>•</Label>
        </Label>
      </Row>
      <Title>A little rhythm.{"\n"}A happier home.</Title>
      <Label muted style={{ fontSize: 18, lineHeight: 28, maxWidth: 530 }}>
        A shared space for helpers and employers to plan the day, keep in touch,
        and make room for what matters.
      </Label>
      <Row>
        <Chip>Made for Singapore</Chip>
        <Chip>One home, one team</Chip>
      </Row>
      <Card>
        <Title small>Welcome home</Title>
        <Label muted>
          Explore a sample household. Your demo changes stay on this device.
        </Label>
        <Button
          testID="start-demo"
          onPress={() => app.startDemo().catch((e) => app.setError(e.message))}
        >
          Explore the demo →
        </Button>
      </Card>
      {app.connected ? (
        <Card>
          <Title small>
            {signup ? "Create your account" : "Your household awaits"}
          </Title>
          <Field
            label="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
          <Field
            label="Password"
            secureTextEntry
            autoComplete={signup ? "new-password" : "current-password"}
            value={password}
            onChangeText={setPassword}
          />
          <Button
            disabled={busy || !email || password.length < 6}
            onPress={() => void auth()}
          >
            {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
          </Button>
          <Button
            secondary
            onPress={() => {
              setSignup(!signup);
              setMessage("");
            }}
          >
            {signup
              ? "Already registered? Sign in"
              : "New here? Create an account"}
          </Button>
          <ErrorText>{message}</ErrorText>
        </Card>
      ) : (
        <Label muted>
          Real household sign-in will appear when the app is connected to its
          backend.
        </Label>
      )}
    </View>
  );
}
export function Onboarding() {
  const app = useApp();
  const [join, setJoin] = useState(false);
  const [name, setName] = useState("");
  const [home, setHome] = useState("");
  const [token, setToken] = useState("");
  const [rest, setRest] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (join)
        await rpc("join_household", {
          p_token: token.trim(),
          p_name: name.trim(),
        });
      else
        await rpc("create_household", {
          p_name: home.trim(),
          p_member_name: name.trim(),
          p_rest_day: rest,
        });
      await app.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={{ maxWidth: 620, width: "100%", alignSelf: "center" }}>
      <Title small>
        {join ? "Join your household" : "Make yourself at home"}
      </Title>
      <Row>
        <Chip selected={!join} onPress={() => setJoin(false)}>
          Create a household
        </Chip>
        <Chip selected={join} onPress={() => setJoin(true)}>
          Use an invitation
        </Chip>
      </Row>
      <Field
        label="Your name"
        value={name}
        onChangeText={setName}
        maxLength={60}
      />
      {join ? (
        <Field
          label="Invitation code"
          autoCapitalize="none"
          value={token}
          onChangeText={setToken}
        />
      ) : (
        <>
          <Field
            label="Household name"
            value={home}
            onChangeText={setHome}
            maxLength={80}
          />
          <Label>Shared weekly rest day</Label>
          <Row>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
              <Chip key={d} selected={rest === i} onPress={() => setRest(i)}>
                {d}
              </Chip>
            ))}
          </Row>
          <Label muted>
            Agree this together. Recurring tasks can skip this day.
          </Label>
        </>
      )}
      <ErrorText>{error}</ErrorText>
      <Button
        disabled={busy || !name.trim() || !(join ? token.trim() : home.trim())}
        onPress={() => void submit()}
      >
        {busy ? "Saving…" : join ? "Join household" : "Create household"}
      </Button>
      <Button
        secondary
        onPress={() => app.leave().catch((e) => setError(e.message))}
      >
        Sign out
      </Button>
    </Card>
  );
}
