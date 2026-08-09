import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

import type { PublicAppState } from "../src/lib/app-types";

const mockBaseUrl = `http://127.0.0.1:${process.env.LOCALGROWTH_E2E_MOCK_PORT ?? "4100"}`;

async function navigate(page: Page, label: string, heading: string) {
  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: label }).click();
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
}

async function expectNoAccessibilityViolations(page: Page, testInfo: TestInfo, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  await testInfo.attach(`${name}-axe-results`, {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });

  const violations = results.violations.map((violation) => ({
    help: violation.help,
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => ({
      failureSummary: node.failureSummary,
      target: node.target,
    })),
  }));

  expect(violations, `${name} has automated WCAG A/AA violations`).toEqual([]);
}

test("runs real approved WordPress and Facebook publishing workflows", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Growth command" })).toBeVisible();

  await navigate(page, "Integrations", "Connections");

  await page.getByLabel("Workspace name").fill("E2E workspace");
  await page.getByLabel("Business name").fill("Northstar Studio");
  await page
    .getByLabel("What the business does")
    .fill("Northstar Studio helps local service businesses build clear, useful marketing systems.");
  await page.getByLabel("Timezone").fill("Asia/Karachi");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Business profile saved")).toBeVisible();

  await page.getByLabel("Adapter").click();
  await page.getByRole("option", { name: "OpenAI-compatible" }).click();
  await page.getByLabel("Base URL").fill(mockBaseUrl);
  await page.getByLabel("Model").fill("e2e-model");
  await page.getByLabel("API key").fill("e2e-provider-key");
  const providerForm = page.getByLabel("Base URL").locator("xpath=ancestor::form");
  await providerForm.getByRole("button", { name: "Save & test" }).click();
  await expect(page.getByText("Provider connected with 1 visible model(s).")).toBeVisible();

  const wordpressForm = page.getByLabel("Site URL").locator("xpath=ancestor::form");
  await wordpressForm.getByLabel("Connection name").fill("E2E WordPress");
  await wordpressForm.getByLabel("Site URL").fill(mockBaseUrl);
  await wordpressForm.getByLabel("Username").fill("editor");
  await wordpressForm.getByLabel("Application Password").fill("e2e-application-password");
  await wordpressForm.getByRole("button", { name: "Save & test" }).click();
  await expect(page.getByText("Connected to WordPress as E2E Editor.")).toBeVisible();

  await navigate(page, "Create content", "Create a draft");
  await page.getByLabel("Topic or source brief").fill(
    "Create a practical checklist that helps a local business publish useful content consistently.",
  );
  await page.getByLabel("Channel").click();
  await page.getByRole("option", { name: "Blog" }).click();

  const generateResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/posts/generate") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Generate review draft" }).click();
  await expect((await generateResponse).status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Approval queue" })).toBeVisible();

  const generatedTitle = "A practical local growth checklist";
  const editedTitle = "A reviewed local growth checklist";
  await expect(page.getByRole("heading", { level: 2, name: generatedTitle })).toBeVisible();
  await page.getByRole("button", { name: /^all / }).click();

  let postCard = page
    .getByRole("heading", { level: 2, name: generatedTitle })
    .locator('xpath=ancestor::div[@data-slot="card"]');
  await expect(postCard.getByText("pending", { exact: true })).toBeVisible();
  await postCard.getByRole("button", { name: "Edit" }).click();

  const editDialog = page.getByRole("dialog", { name: "Edit draft" });
  await expect(editDialog).toBeVisible();
  await editDialog.getByLabel("Title").fill(editedTitle);
  await editDialog
    .getByLabel("Post body")
    .fill("Define one customer problem, publish one useful answer, and review the result before repeating the cycle.");
  await editDialog.getByLabel("Hashtags").fill("#LocalGrowth #Reviewed");
  await editDialog.getByRole("button", { name: "Save new version" }).click();
  await expect(page.getByText("Draft updated")).toBeVisible();

  postCard = page
    .getByRole("heading", { level: 2, name: editedTitle })
    .locator('xpath=ancestor::div[@data-slot="card"]');
  await expect(postCard.getByText("pending", { exact: true })).toBeVisible();
  await postCard.getByRole("button", { name: "Approve" }).click();
  await expect(postCard.getByText("approved", { exact: true })).toBeVisible();

  const publishResponse = page.waitForResponse(
    (response) => /\/api\/posts\/[^/]+\/publish$/.test(response.url()) && response.request().method() === "POST",
  );
  await postCard.getByRole("button", { name: "Publish to WordPress" }).click();
  await expect((await publishResponse).status()).toBe(200);
  await expect(postCard.getByText("published", { exact: true })).toBeVisible();
  await expect(postCard.getByText("remote:4242", { exact: true })).toBeVisible();

  const stateResponse = await page.request.get("/api/state");
  expect(stateResponse.ok()).toBeTruthy();
  const state = (await stateResponse.json()) as PublicAppState;
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0]).toMatchObject({
    channel: "blog",
    remoteId: "4242",
    remoteUrl: `${mockBaseUrl}/posts/4242`,
    revision: 2,
    status: "published",
    title: editedTitle,
  });

  const mockStateResponse = await page.request.get(`${mockBaseUrl}/__e2e/state`);
  expect(mockStateResponse.ok()).toBeTruthy();
  const mockState = (await mockStateResponse.json()) as {
    generationRequests: number;
    lastPublishedPost: { content: string; status: string; title: string };
    modelRequests: number;
    wordpressAuthChecks: number;
    wordpressPublishes: number;
  };
  expect(mockState).toMatchObject({
    generationRequests: 1,
    modelRequests: 1,
    wordpressAuthChecks: 1,
    wordpressPublishes: 1,
  });
  expect(mockState.lastPublishedPost).toMatchObject({ status: "publish", title: editedTitle });
  expect(mockState.lastPublishedPost.content).toContain("Define one customer problem");
  expect(mockState.lastPublishedPost.content).toContain("#Reviewed");

  await navigate(page, "Integrations", "Connections");
  const metaForm = page.getByLabel("Facebook Page ID").locator("xpath=ancestor::form");
  await metaForm.getByLabel("Connection name").fill("E2E Facebook Page");
  await metaForm.getByLabel("Facebook Page ID").fill("123456789012345");
  await metaForm.getByLabel("Graph API version").fill("v25.0");
  await metaForm.getByLabel("Page Access Token").fill("e2e-page-access-token");
  await metaForm.getByRole("button", { name: "Save & test" }).click();
  await expect(page.getByText("Connected to Facebook Page Northstar Studio.")).toBeVisible();

  await navigate(page, "Create content", "Create a draft");
  await page.getByLabel("Topic or source brief").fill(
    "Create one concise, useful update for our local Facebook audience.",
  );
  await page.getByLabel("Channel").click();
  await page.getByRole("option", { name: "Facebook" }).click();

  const facebookGenerateResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/posts/generate") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Generate review draft" }).click();
  await expect((await facebookGenerateResponse).status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Approval queue" })).toBeVisible();
  await page.getByRole("button", { name: /^all / }).click();

  const facebookTitle = "A useful Facebook Page update";
  const facebookCard = page
    .getByRole("heading", { level: 2, name: facebookTitle })
    .locator('xpath=ancestor::div[@data-slot="card"]');
  await facebookCard.getByRole("button", { name: "Approve" }).click();
  await expect(facebookCard.getByText("approved", { exact: true })).toBeVisible();

  const facebookPublishResponse = page.waitForResponse(
    (response) => /\/api\/posts\/[^/]+\/publish$/.test(response.url()) && response.request().method() === "POST",
  );
  await facebookCard.getByRole("button", { name: "Publish to Facebook" }).click();
  await expect((await facebookPublishResponse).status()).toBe(200);
  await expect(facebookCard.getByText("published", { exact: true })).toBeVisible();
  await expect(facebookCard.getByText("remote:123456789012345_987654321", { exact: true })).toBeVisible();

  const finalStateResponse = await page.request.get("/api/state");
  const finalState = (await finalStateResponse.json()) as PublicAppState;
  expect(finalState.posts).toHaveLength(2);
  expect(finalState.posts.find((post) => post.channel === "facebook")).toMatchObject({
    remoteId: "123456789012345_987654321",
    revision: 1,
    status: "published",
    title: facebookTitle,
  });

  const finalMockResponse = await page.request.get(`${mockBaseUrl}/__e2e/state`);
  const finalMockState = (await finalMockResponse.json()) as {
    generationRequests: number;
    lastFacebookPost: { message: string };
    metaAuthChecks: number;
    metaPublishes: number;
  };
  expect(finalMockState).toMatchObject({
    generationRequests: 2,
    metaAuthChecks: 1,
    metaPublishes: 1,
  });
  expect(finalMockState.lastFacebookPost.message).toContain("Share one useful local insight");
  expect(finalMockState.lastFacebookPost.message).toContain("#FacebookMarketing");
});

test("passes automated accessibility checks in core workflow views", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Growth command" })).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo, "growth-command");

  await navigate(page, "Integrations", "Connections");
  await expectNoAccessibilityViolations(page, testInfo, "connections");

  await navigate(page, "Approval queue", "Approval queue");
  await expectNoAccessibilityViolations(page, testInfo, "approval-queue");
});

test("supports keyboard navigation on the mobile layout", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const navigationTrigger = page.getByRole("button", { name: "Open navigation" });
  await navigationTrigger.focus();
  await expect(navigationTrigger).toBeFocused();
  await navigationTrigger.press("Enter");

  const navigationDialog = page.getByRole("dialog", { name: "Navigation" });
  await expect(navigationDialog).toBeVisible();
  await expectNoAccessibilityViolations(page, testInfo, "mobile-navigation");
  await navigationDialog.getByRole("button", { name: "Activity" }).click();
  await expect(navigationDialog).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
});
