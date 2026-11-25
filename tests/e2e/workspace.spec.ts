import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { dictionaries } from "../../src/lib/i18n";
import {
  EVIDENCE_QUOTE,
  installFixture,
  makeFixture,
  TENDER_ID,
} from "./fixtures";

const en = dictionaries.en;
const ar = dictionaries.ar;
const tenderPath = "/tenders/" + TENDER_ID;

test("legacy analysis links start once and retain a pre-claim rejection across navigation", async ({
  page,
}) => {
  const state = makeFixture();
  state.tender.status = "uploaded";
  state.tender.analysis = null;
  state.analysisErrorCode = "RATE_LIMITED";
  await installFixture(page, state);
  await page.goto(tenderPath + "?analyze=1");
  await expect(
    page.getByRole("heading", { name: en.analysisFailedTitle }),
  ).toBeVisible();
  await expect(
    page.locator(".processing-panel").getByRole("alert"),
  ).toContainText("Please wait");
  expect(state.analyzePosts).toBe(1);
  await page.getByRole("link", { name: en.backDashboard }).click();
  await expect(page.getByRole("table")).toContainText(en.failed);
  await expect(page.getByRole("table")).not.toContainText(en.noRequirements);
  await page
    .getByRole("table")
    .getByRole("link", {
      name: "Municipal digital services platform",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: en.analysisFailedTitle }),
  ).toBeVisible();
  expect(state.analyzePosts).toBe(1);
  state.analysisErrorCode = null;
  await page.getByRole("button", { name: en.retryAnalysis }).click();
  await expect(page.getByRole("heading", { name: en.summary })).toBeVisible();
  expect(state.analyzePosts).toBe(2);
});

test("sample analysis survives uploaded snapshots and navigation without duplicate requests", async ({
  page,
}) => {
  const state = makeFixture();
  let finish!: () => void;
  state.analysisGate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await installFixture(page, state);
  await page.goto("/");
  await page.getByRole("button", { name: en.useSample }).click();
  await expect.poll(() => state.analyzePosts).toBe(1);
  await expect(
    page.getByText(en.processingEstimate, { exact: true }),
  ).toBeVisible();
  // Multiple authoritative reads still say Uploaded until the server accepts
  // the request. They must not stop the spinner or expose a disabled Retry.
  await expect
    .poll(() => state.detailGets, { timeout: 10000 })
    .toBeGreaterThan(1);
  await expect(
    page.getByText(en.processingEstimate, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: en.retryAnalysis }),
  ).toHaveCount(0);
  await expect(page.locator(".tender-heading-actions")).toContainText(
    en.extracting,
  );
  await page.getByRole("link", { name: en.backDashboard }).click();
  await expect(page.getByRole("table")).toContainText(en.extracting);
  await expect(page.getByRole("table")).not.toContainText(en.noRequirements);
  state.tender.status = "analyzing";
  state.tender.updated_at = new Date().toISOString();
  await expect(page.getByRole("table")).toContainText(en.analyzing, {
    timeout: 10000,
  });
  await page
    .getByRole("table")
    .getByRole("link", {
      name: "Municipal digital services platform",
      exact: true,
    })
    .click();
  await expect(
    page.getByText(en.processingEstimate, { exact: true }),
  ).toBeVisible();
  expect(state.analyzePosts).toBe(1);
  await page.getByRole("button", { name: en.language }).click();
  await expect(
    page.getByText(ar.processingEstimate, { exact: true }),
  ).toBeVisible();
  finish();
  await expect(page.getByRole("heading", { name: ar.summary })).toBeVisible();
  await expect(page.locator(".tender-heading-actions")).toContainText(ar.ready);
  expect(state.analyzePosts).toBe(1);
});

test("a quota failure reconciles the dashboard and can be retried after reopening the tender", async ({
  page,
}) => {
  const state = makeFixture();
  let finish!: () => void;
  state.analysisGate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  state.analysisErrorCode = "AI_RATE_LIMITED";
  await installFixture(page, state);
  await page.goto("/");
  await page.getByRole("button", { name: en.useSample }).click();
  await expect(
    page.getByText(en.processingEstimate, { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: en.backDashboard }).click();
  finish();
  await expect(page.getByRole("table")).toContainText(en.failed);
  await page
    .getByRole("table")
    .getByRole("link", {
      name: "Municipal digital services platform",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: en.analysisFailedTitle }),
  ).toBeVisible();
  await expect(
    page.locator(".processing-panel").getByRole("alert"),
  ).toContainText("request or quota limit");
  expect(state.analyzePosts).toBe(1);
  await page.getByRole("button", { name: en.language }).click();
  await expect(
    page.locator(".processing-panel").getByRole("alert"),
  ).toContainText("الحصة المخصصة");
  state.analysisErrorCode = null;
  state.analysisGate = null;
  await page.getByRole("button", { name: ar.retryAnalysis }).click();
  await expect(page.getByRole("heading", { name: ar.summary })).toBeVisible();
  await expect(page.locator(".processing-error")).toHaveCount(0);
  expect(state.analyzePosts).toBe(2);
});

test("the dashboard marks a checklist complete only when every requirement is complete", async ({
  page,
}) => {
  const state = makeFixture();
  state.tender.requirement_count = 200;
  state.tender.completed_count = 199;
  await installFixture(page, state);
  await page.goto("/");
  const checklistMetric = page
    .getByRole("region", { name: en.dashboardEyebrow, exact: true })
    .locator(".metric-readiness");
  const tableProgress = page
    .getByRole("table")
    .getByRole("progressbar", { name: en.compliance, exact: true });
  await expect(checklistMetric.locator("strong")).toHaveText("99%");
  await expect(tableProgress).toHaveAttribute("aria-valuenow", "99");
  await expect(checklistMetric.locator(".gauge-check.is-complete")).toHaveCount(
    0,
  );

  state.tender.completed_count = 200;
  await page.reload();
  await expect(checklistMetric.locator("strong")).toHaveText("100%");
  await expect(tableProgress).toHaveAttribute("aria-valuenow", "100");
  await expect(checklistMetric.locator(".gauge-check.is-complete")).toHaveCount(
    1,
  );
});

test("dashboard distinguishes total risks from critical findings in both languages", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const state = makeFixture();
  await installFixture(page, state);
  await page.goto("/");
  const riskCell = page.locator(".tender-table tbody tr td").nth(3);
  await expect(riskCell.locator(".risk-table-count")).toHaveText("2", {
    timeout: 15_000,
  });

  for (const [locale, dictionary] of [
    ["en", en],
    ["ar", ar],
  ] as const) {
    if (locale === "ar") {
      await page.getByRole("button", { name: en.language }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    }
    state.tender.analysis!.risks = makeFixture().tender.analysis!.risks;
    state.tender.risk_count = 2;
    await page.reload();
    await expect(riskCell.locator(".risk-table-count")).toHaveText("2");
    await expect(riskCell.locator("svg")).toHaveCount(1);
    await expect(
      riskCell.getByText(`${dictionary.criticalRisks}: 1`, { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/qa-risk-count-${locale}-desktop.png`,
      fullPage: true,
    });
    if (locale === "ar") {
      await expect(page.locator(".attention-row small")).toHaveText(
        `${ar.criticalRisks}: 1`,
      );
      await page.setViewportSize({ width: 375, height: 812 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: "test-results/qa-risk-count-ar-mobile.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 1280, height: 720 });
    }

    state.tender.analysis!.risks[0].severity = "high";
    await page.reload();
    await expect(riskCell.locator(".risk-table-count")).toHaveText("2");
    await expect(riskCell.locator("svg")).toHaveCount(1);
    await expect(riskCell.locator("small")).toHaveCount(0);
    await expect(riskCell.locator(".danger-text")).toHaveCount(0);

    state.tender.analysis!.risks = [];
    state.tender.risk_count = 0;
    await page.reload();
    await expect(riskCell.locator(".risk-table-count")).toHaveText("0");
    await expect(riskCell.locator("svg")).toHaveCount(0);
    await expect(riskCell.locator("small")).toHaveCount(0);
  }
});

test("processing shows the bilingual time estimate and keeps waiting past one minute", async ({
  page,
}) => {
  await page.clock.install({ time: new Date() });
  const state = makeFixture();
  state.tender.status = "analyzing";
  state.tender.analysis = null;
  state.tender.updated_at = new Date().toISOString();
  await installFixture(page, state);
  await page.goto(tenderPath);
  await expect(
    page.getByRole("heading", { name: en.processingTitle }),
  ).toBeVisible();
  await expect(
    page.getByText(en.processingEstimate, { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(61_000);
  await expect(
    page.getByText(en.processingEstimate, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: en.analysisFailedTitle }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: en.language }).click();
  await expect(
    page.getByText(ar.processingEstimate, { exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("untrusted tender names and assistant text render as text, never executable HTML", async ({
  page,
}) => {
  const state = makeFixture();
  const payload = '<img src="x" onerror="window.__tenderXss=true">';
  state.tender.analysis!.title.en = payload;
  state.messages.push({
    id: "hostile-message",
    role: "assistant",
    content: payload,
    locale: "en",
    citations: [],
    supported: false,
    created_at: new Date().toISOString(),
  });
  await installFixture(page, state);
  await page.goto(tenderPath + "?tab=assistant");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(payload);
  await expect(page.locator(".message-text")).toHaveText(payload);
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  expect(await page.evaluate(() => "__tenderXss" in window)).toBe(false);
});

test("a tender with no extracted obligations never reports 100 percent complete", async ({
  page,
}) => {
  const state = makeFixture();
  state.requirements = [];
  state.tender.analysis!.requirements = [];
  state.tender.requirement_count = 0;
  state.tender.completed_count = 0;
  await installFixture(page, state);
  await page.goto(tenderPath + "?tab=requirements");
  await expect(
    page.getByText(en.noRequirements, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("100%", { exact: true })).not.toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.goto("/");
  await expect(
    page
      .getByRole("region", { name: en.dashboardEyebrow, exact: true })
      .locator(".metric-readiness strong"),
  ).toHaveText("—");
  await expect(page.locator(".readiness-gauge")).toHaveCount(0);
  await expect(page.getByText("100%", { exact: true })).not.toBeVisible();
});

test("unconfigured app is honest, bilingual, and serves a real sample PDF", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: en.setupTitle }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: en.upload, exact: true }).first(),
  ).toBeDisabled();
  await expect(page.getByRole("link", { name: en.sampleView })).toBeVisible();
  await page.screenshot({
    path: "test-results/qa-unconfigured.png",
    fullPage: true,
  });
  const sample = await request.get("/sample-tender.pdf");
  expect(sample.ok()).toBeTruthy();
  expect(sample.headers()["content-type"]).toContain("application/pdf");
  expect((await sample.body()).subarray(0, 5).toString()).toBe("%PDF-");
  await page.getByRole("button", { name: en.language }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: ar.setupTitle }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(
    page.getByRole("heading", { name: ar.setupTitle }),
  ).toBeVisible();
});

test("dashboard search filters saved tenders and can clear its filters", async ({
  page,
}) => {
  await installFixture(page);
  await page.goto("/");
  await expect(
    page
      .getByRole("link", { name: /Municipal digital services platform/ })
      .first(),
  ).toBeVisible();
  const search = page.getByRole("textbox", { name: en.search });
  await search.fill("does not exist");
  await expect(page.getByRole("heading", { name: en.noResults })).toBeVisible();
  await page.getByRole("button", { name: en.clearFilters }).click();
  await expect(search).toHaveValue("");
  await expect(
    page
      .getByRole("link", { name: /Municipal digital services platform/ })
      .first(),
  ).toBeVisible();
});

test("checklist saves completion across reload and opens inspectable source evidence", async ({
  page,
}) => {
  const state = await installFixture(page);
  await page.goto(tenderPath + "?tab=requirements");
  const checkbox = page.getByRole("checkbox").first();
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await expect.poll(() => state.requirements[0].completed).toBe(true);
  await page.reload();
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  await page.screenshot({
    path: "test-results/qa-requirements.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /Page 2/ })
    .first()
    .click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(EVIDENCE_QUOTE, { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/qa-evidence-drawer.png",
    fullPage: false,
  });
  const popupPromise = page.waitForEvent("popup");
  await drawer.getByRole("button", { name: en.openPdf }).click();
  const pdf = await popupPromise;
  await expect.poll(() => pdf.url()).toMatch(/sample-tender\.pdf#page=2/);
  await pdf.close();
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
});

test("failed checklist save rolls back the checkmark and explains the failure", async ({
  page,
}) => {
  const state = makeFixture();
  state.failChecklist = true;
  await installFixture(page, state);
  await page.goto(tenderPath + "?tab=requirements");
  const checkbox = page.getByRole("checkbox").first();
  // A failed save can roll back before check() performs its final checked-state assertion.
  await checkbox.click();
  await expect(
    page.getByRole("alert").filter({ hasText: en.saveFailed }),
  ).toBeVisible();
  await expect(checkbox).not.toBeChecked();
  expect(state.requirements[0].completed).toBe(false);
});

test("assistant sends real requests, renders citations, and restores conversation", async ({
  page,
}) => {
  const state = await installFixture(page);
  await page.goto(tenderPath + "?tab=assistant");
  const question = page.getByRole("textbox", { name: en.questionLabel });
  await question.fill("What bid bond is required?");
  await page.getByRole("button", { name: en.send, exact: true }).click();
  await expect(
    page.getByText("A bid bond of 2% of the proposal value is required.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(state.chatPosts).toBe(1);
  await page.screenshot({
    path: "test-results/qa-assistant.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /Page 2/ })
    .first()
    .click();
  await expect(
    page.getByRole("dialog").getByText(EVIDENCE_QUOTE, { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(
    page.getByText("What bid bond is required?", { exact: true }),
  ).toBeVisible();
  await question.fill("What is the budget?");
  await page.getByRole("button", { name: en.send, exact: true }).click();
  await expect(
    page.getByText("The document does not specify a budget ceiling.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(state.chatPosts).toBe(2);
});

test("assistant keeps an unsuccessful question available for retry", async ({
  page,
}) => {
  const state = makeFixture();
  state.failChat = true;
  await installFixture(page, state);
  await page.goto(tenderPath + "?tab=assistant");
  const question = page.getByRole("textbox", { name: en.questionLabel });
  await question.fill("Which deliverables are required?");
  await page.getByRole("button", { name: en.send, exact: true }).click();
  await expect(page.locator(".chat-form").getByRole("alert")).toBeVisible();
  await expect(question).toHaveValue("Which deliverables are required?");
});

test("language switching preserves the selected tender and tab", async ({
  page,
}) => {
  await installFixture(page);
  await page.goto(tenderPath + "?tab=requirements");
  await expect(page.getByRole("checkbox").first()).toBeVisible();
  await page.getByRole("button", { name: en.language }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("heading", { name: ar.checklistTitle }),
  ).toBeVisible();
  await expect(
    page.getByText("تقديم الضمان الابتدائي", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/tab=requirements/);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(
    page.getByRole("heading", { name: ar.checklistTitle }),
  ).toBeVisible();
});

test("failed analysis can be retried without uploading another document", async ({
  page,
}) => {
  const state = makeFixture();
  state.tender.status = "failed";
  state.tender.analysis = null;
  state.tender.error_code = "AI_TIMEOUT";
  state.tender.error_message = "Analysis took too long";
  await installFixture(page, state);
  await page.goto(tenderPath);
  await expect(
    page.getByRole("heading", { name: en.analysisFailedTitle }),
  ).toBeVisible();
  await page.getByRole("button", { name: en.retryAnalysis }).click();
  await expect.poll(() => state.analyzePosts).toBe(1);
  await expect(
    page.getByRole("heading", { name: en.analysisFailedTitle }),
  ).not.toBeVisible();
});

test("sample action uploads the actual sample and starts the analysis workflow", async ({
  page,
}) => {
  const state = await installFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: en.useSample }).click();
  await expect(page).toHaveURL(new RegExp(TENDER_ID));
  await expect.poll(() => state.createPosts).toBe(1);
  await expect.poll(() => state.analyzePosts).toBe(1);
  expect(state.storagePosts).toBe(1);
  expect(state.uploadedPdfBytes).toBe(true);
});

test("an interrupted analysis exposes recovery once its processing lease is stale", async ({
  page,
}) => {
  const state = makeFixture();
  state.tender.status = "analyzing";
  state.tender.analysis = null;
  state.tender.updated_at = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await installFixture(page, state);
  await page.goto(tenderPath);
  await page.getByRole("button", { name: en.retryAnalysis }).click();
  await expect.poll(() => state.analyzePosts).toBe(1);
  await expect(
    page.getByRole("tab", { name: en.overview, exact: true }),
  ).toBeVisible();
});

test("PDF picker rejects another format and submits a valid document", async ({
  page,
}) => {
  const state = await installFixture(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: en.upload, exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const input = dialog.getByLabel(en.chooseFile);
  await page.screenshot({
    path: "test-results/qa-upload-dialog.png",
    fullPage: false,
  });
  await input.setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Not a PDF"),
  });
  await expect(dialog.getByRole("alert")).toContainText(en.invalidPdf);
  await input.setInputFiles("public/sample-tender.pdf");
  await dialog.getByRole("button", { name: en.startAnalysis }).click();
  await expect(page).toHaveURL(new RegExp(TENDER_ID));
  await expect.poll(() => state.analyzePosts).toBe(1);
  // Chromium omits disk-backed multipart file bodies from CDP request.postData.
  // The sample-Blob test separately verifies actual PDF bytes in the upload request.
  expect(state.storagePosts).toBe(1);
});

test("risk review distinguishes source-backed obligations from missing information", async ({
  page,
}) => {
  await installFixture(page);
  await page.goto(tenderPath + "?tab=risks");
  await expect(
    page.getByRole("heading", { name: "Missing bond invalidates submission" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Budget not specified" }),
  ).toBeVisible();
  await expect(page.getByText(en.noSourceNote, { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/qa-risks.png",
    fullPage: true,
  });
  await page
    .getByRole("combobox", { name: en.allSeverities })
    .selectOption("medium");
  await expect(
    page.getByRole("heading", { name: "Missing bond invalidates submission" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Budget not specified" }),
  ).toBeVisible();
});

test("failed storage upload releases its reservation and keeps the file available for retry", async ({
  page,
}) => {
  const state = makeFixture();
  state.failStorage = true;
  await installFixture(page, state);
  await page.goto("/");
  await page
    .getByRole("button", { name: en.upload, exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel(en.chooseFile)
    .setInputFiles("public/sample-tender.pdf");
  await dialog.getByRole("button", { name: en.startAnalysis }).click();
  await expect(dialog.getByRole("alert")).toContainText(en.uploadFailed);
  await expect.poll(() => state.canceledReservations).toBe(1);
  await expect(
    dialog.getByText("sample-tender.pdf", { exact: true }),
  ).toBeVisible();
  state.failStorage = false;
  await dialog.getByRole("button", { name: en.startAnalysis }).click();
  await expect(page).toHaveURL(new RegExp(TENDER_ID));
  await expect.poll(() => state.analyzePosts).toBe(1);
});

test("a configuration fetch failure on a deep link offers a working retry", async ({
  page,
}) => {
  await installFixture(page);
  let failConfig = true;
  await page.route("**/api/config", async (route) => {
    if (failConfig)
      await route.fulfill({
        status: 503,
        json: { error: { code: "SERVER_ERROR", message: "Unavailable" } },
      });
    else await route.fallback();
  });
  await page.goto(tenderPath + "?tab=requirements");
  await expect(
    page.getByText(en.loadFailed, { exact: true }).first(),
  ).toBeVisible();
  failConfig = false;
  await page.getByRole("button", { name: en.tryAgain }).click();
  await expect(page.getByRole("checkbox").first()).toBeVisible();
});

test("English and Arabic workspace layouts fit a small phone and expose navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installFixture(page);
  await page.goto(tenderPath + "?tab=requirements");
  await expect(page.getByRole("checkbox").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: en.language }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/qa-arabic-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: ar.menu }).click();
  await expect(page.getByRole("dialog").getByRole("navigation")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("dashboard and requirements have no serious automated accessibility violations", async ({
  page,
}) => {
  await installFixture(page);
  await page.goto("/");
  await expect(
    page
      .getByRole("link", { name: /Municipal digital services platform/ })
      .first(),
  ).toBeVisible();
  let results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(
      (item) => item.impact === "serious" || item.impact === "critical",
    ),
  ).toEqual([]);
  await page.goto(tenderPath);
  await expect(page.getByRole("heading", { name: en.summary })).toBeVisible();
  await page.screenshot({
    path: "test-results/qa-overview.png",
    fullPage: true,
  });
  await page.goto(tenderPath + "?tab=requirements");
  await expect(page.getByRole("checkbox").first()).toBeVisible();
  results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(
      (item) => item.impact === "serious" || item.impact === "critical",
    ),
  ).toEqual([]);
});
