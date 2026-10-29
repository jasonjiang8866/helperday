import { expect, test } from "@playwright/test";

test("email callback is reachable without a session and has a safe fallback", async ({
  page,
}) => {
  await page.goto("/auth/callback");
  await expect(
    page.getByText("Email confirmation", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Could not complete email confirmation here/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByTestId("start-demo")).toBeVisible();
});

test("callback never displays raw provider errors or tokens", async ({
  page,
}) => {
  await page.goto(
    "/auth/callback?error=access_denied&error_description=PRIVATE_PROVIDER_DETAILS#access_token=PRIVATE_TOKEN",
  );
  await expect(
    page.getByText(/Could not complete email confirmation here/),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    "PRIVATE_PROVIDER_DETAILS",
  );
  await expect(page.locator("body")).not.toContainText("PRIVATE_TOKEN");
});
