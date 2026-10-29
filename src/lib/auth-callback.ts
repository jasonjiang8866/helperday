export const nativeAuthRedirect = "helperday://auth/callback";
export type ConfirmationParams = Record<string, string | string[] | undefined>;
export const confirmationFailure =
  "Could not complete email confirmation here. If your email is confirmed, return to sign in with your password. Otherwise request a new confirmation email.";

// Only exchange a PKCE code. Never accept bearer tokens from an incoming URL,
// render provider error_description, or log the callback (which contains a code).
export async function confirmEmail(
  params: ConfirmationParams,
  auth: {
    exchangeCodeForSession: (code: string) => Promise<{ error: unknown }>;
  },
): Promise<void> {
  const code = params.code;
  if (
    params.error ||
    params.error_code ||
    typeof code !== "string" ||
    !code ||
    code.length > 2048 ||
    /\s/.test(code)
  )
    throw new Error(confirmationFailure);
  try {
    const { error } = await auth.exchangeCodeForSession(code);
    if (error) throw new Error(confirmationFailure);
  } catch {
    throw new Error(confirmationFailure);
  }
}
