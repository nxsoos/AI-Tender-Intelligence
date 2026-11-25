import { expect, test } from "@playwright/test";
import { TENDER_ID } from "./fixtures";

test("public readiness response contains flags and variable names, never credential values", async ({
  request,
}) => {
  const response = await request.get("/api/config");
  expect(response.status()).toBe(200);
  const config = await response.json();
  expect(Object.keys(config).sort()).toEqual([
    "aiConfigured",
    "configured",
    "limits",
    "missing",
    "supabaseConfigured",
  ]);
  expect(typeof config.configured).toBe("boolean");
  expect(config.limits.maxBytes).toBe(10 * 1024 * 1024);
  expect(config.limits.maxPages).toBe(50);
  expect(config.limits.maxCharacters).toBe(120000);
  expect(
    config.missing.every(
      (value: unknown) => typeof value === "string" && /^[A-Z_]+$/.test(value),
    ),
  ).toBe(true);
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("all private document endpoints reject requests without a guest token", async ({
  request,
}) => {
  const paths = [
    "/api/tenders",
    "/api/tenders/" + TENDER_ID,
    "/api/tenders/" + TENDER_ID + "/document",
    "/api/tenders/" + TENDER_ID + "/chat",
  ];
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
  }
});

test("mutating endpoints reject unauthenticated uploads, analysis, chat, and checklist changes", async ({
  request,
}) => {
  const operations = [
    {
      path: "/api/tenders",
      method: "POST",
      data: { filename: "tender.pdf", fileSize: 100 },
    },
    {
      path: "/api/tenders/" + TENDER_ID + "/analyze",
      method: "POST",
      data: {},
    },
    { path: "/api/tenders/" + TENDER_ID, method: "DELETE", data: undefined },
    {
      path: "/api/tenders/" + TENDER_ID + "/chat",
      method: "POST",
      data: { message: "What is required?", locale: "en" },
    },
    {
      path:
        "/api/tenders/" +
        TENDER_ID +
        "/requirements/cc859eb3-c508-4e84-bc2b-f631bf92b31c",
      method: "PATCH",
      data: { completed: true },
    },
  ];
  for (const operation of operations) {
    const response = await request.fetch(operation.path, {
      method: operation.method,
      data: operation.data,
    });
    expect(response.status(), operation.path).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
  }
});
