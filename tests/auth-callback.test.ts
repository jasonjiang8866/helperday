import assert from "node:assert/strict";
import test from "node:test";
import { confirmEmail, confirmationFailure } from "../src/lib/auth-callback";

test("email confirmation only exchanges a PKCE code and sanitizes provider errors", async () => {
  const calls: string[] = [];
  const auth = {
    exchangeCodeForSession: async (code: string) => {
      calls.push(code);
      return { error: null };
    },
  };
  await confirmEmail({ code: "one-time-code" }, auth);
  assert.deepEqual(calls, ["one-time-code"]);
  for (const params of [
    {},
    { access_token: "unsafe", refresh_token: "unsafe" },
    { code: ["one", "two"] },
    { code: "a b" },
    {
      code: "ignored",
      error: "access_denied",
      error_description: "private-details",
    },
  ])
    await assert.rejects(confirmEmail(params, auth), {
      message: confirmationFailure,
    });
  assert.deepEqual(calls, ["one-time-code"]);
  await assert.rejects(
    confirmEmail(
      { code: "expired" },
      {
        exchangeCodeForSession: async () => ({
          error: new Error("private URL or tokens"),
        }),
      },
    ),
    { message: confirmationFailure },
  );
});
