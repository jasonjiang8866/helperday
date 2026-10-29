import { test, expect } from "@playwright/test";
test("create, complete and persist a task; switch themes and roles", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install({ time: new Date("2026-10-27T04:00:00Z") });
  await page.goto("/");
  await page.getByTestId("start-demo").click();
  await expect(page.getByText("A good day starts together.")).toBeVisible();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByLabel("Task title").fill("Water the balcony plants");
  await page.getByLabel("Instructions").fill("Use the small watering can.");
  await page.getByRole("button", { name: "Add to the schedule" }).click();
  await page
    .getByRole("button", { name: /Water the balcony plants, to do/ })
    .click();
  await page.getByLabel("Leave a note").fill("All watered.");
  await page.getByRole("button", { name: "Mark as done", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Water the balcony plants, completed/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose Minimal", exact: true })
    .click();
  await page.reload();
  await page.getByTestId("start-demo").click();
  await expect(
    page.getByRole("button", { name: "Dark", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Switch to helper view" }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByText("YOUR SHARED SPACE")).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Add task", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Water the balcony plants, completed/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByRole("button", { name: "Next →", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "← Previous", exact: true }),
  ).toBeEnabled();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test("all four themes render without horizontal overflow", async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date("2026-10-27T04:00:00Z") });
  await page.goto("/");
  await page.getByTestId("start-demo").click();
  for (const style of ["Peranakan", "Minimal"])
    for (const mode of ["Light", "Dark"]) {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      const choose = page.getByRole("button", {
        name: `Choose ${style}`,
        exact: true,
      });
      if (await choose.count()) await choose.click();
      await page.getByRole("button", { name: mode, exact: true }).click();
      await page.getByRole("button", { name: "Today", exact: true }).click();
      await expect(page.getByText("A good day starts together.")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1,
        ),
      ).toBe(false);
      if (process.env.CAPTURE_PREVIEWS)
        await page.screenshot({
          path: `docs/helperday-${testInfo.project.name}-${style.toLowerCase()}-${mode.toLowerCase()}.png`,
          fullPage: true,
        });
    }
});

test("a failed local write never appears as a successful completion", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-27T04:00:00Z") });
  await page.goto("/");
  await page.getByTestId("start-demo").click();
  await page
    .getByRole("button", { name: /Prepare lunch together, to do/ })
    .click();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Storage quota exceeded");
    };
  });
  await page.getByRole("button", { name: "Mark as done", exact: true }).click();
  await expect(page.getByText("Storage quota exceeded")).toBeVisible();
  await page.getByRole("button", { name: "Close task", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Prepare lunch together, to do/ }),
  ).toBeVisible();
});
