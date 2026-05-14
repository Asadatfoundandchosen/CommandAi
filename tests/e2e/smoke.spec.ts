import { test, expect } from "@playwright/test";

test("health endpoint (E2E)", async ({ request }) => {
  const res = await request.get("/health");
  expect(res.ok()).toBeTruthy();
  await expect(res.json()).resolves.toEqual({ status: "ok" });
});
