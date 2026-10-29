import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { backend } from "../../lib/backend";
import { confirmEmail, confirmationFailure } from "../../lib/auth-callback";
import { Button, Card, Label, Title } from "../../components/ui";

export default function AuthCallback() {
  const { code, error, error_code } = useLocalSearchParams<{
    code?: string | string[];
    error?: string | string[];
    error_code?: string | string[];
  }>();
  const requestKey = JSON.stringify([code, error, error_code]);
  const [result, setResult] = useState({ key: "", message: "" });
  const busy = result.key !== requestKey;
  const message = busy ? "Completing email confirmation…" : result.message;
  // Reuse an in-flight exchange across StrictMode effects and route rerenders.
  const pending = useRef<{ key: string; result: Promise<void> } | null>(null);
  useEffect(() => {
    let active = true;
    const key = requestKey;
    if (!pending.current || pending.current.key !== key) {
      const result = backend
        ? confirmEmail({ code, error, error_code }, backend.auth)
        : Promise.reject(new Error(confirmationFailure));
      pending.current = { key, result };
    }
    pending.current.result.then(
      () => {
        if (active) {
          setResult({
            key,
            message: "Email confirmed. Continue to your household.",
          });
        }
      },
      () => {
        if (active) {
          setResult({ key, message: confirmationFailure });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [code, error, error_code, requestKey]);
  return (
    <Card>
      <Title small>Email confirmation</Title>
      <Label accessibilityRole="alert">{message}</Label>
      <Button disabled={busy} onPress={() => router.replace("/")}>
        Continue
      </Button>
    </Card>
  );
}
