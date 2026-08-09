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

test("runs real approved WordPress, Facebook, Instagram, and LinkedIn publishing workflows", async ({ page }) => {
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

  await navigate(page, "Integrations", "Connections");
  const instagramForm = page.getByLabel("Professional Account ID").locator("xpath=ancestor::form");
  await instagramForm.getByLabel("Connection name").fill("E2E Instagram");
  await instagramForm.getByLabel("Professional Account ID").fill("17841400000000000");
  await instagramForm.getByLabel("Graph API version").fill("v25.0");
  await instagramForm.getByLabel("Instagram Access Token").fill("e2e-instagram-access-token");
  await instagramForm.getByRole("button", { name: "Save & test" }).click();
  await expect(page.getByText("Connected to Instagram @northstarstudio.")).toBeVisible();

  const instagramImageUrl = "https://cdn.example.test/e2e-instagram.jpg?approved=true";
  await navigate(page, "Create content", "Create a draft");
  await page.getByLabel("Topic or source brief").fill(
    "Create one useful single-image update for our professional Instagram account.",
  );
  await page.getByLabel("Channel").click();
  await page.getByRole("option", { name: "Instagram" }).click();
  await page.getByLabel("Public image URL").fill(instagramImageUrl);
  await expect(page.getByRole("img", { name: "Instagram image preview" })).toBeVisible();

  const instagramGenerateResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/posts/generate") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Generate review draft" }).click();
  await expect((await instagramGenerateResponse).status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Approval queue" })).toBeVisible();
  await page.getByRole("button", { name: /^all / }).click();

  const instagramTitle = "A reviewed Instagram image update";
  const instagramCard = page
    .getByRole("heading", { level: 2, name: instagramTitle })
    .locator('xpath=ancestor::div[@data-slot="card"]');
  await expect(instagramCard.getByRole("img", { name: `Media preview for ${instagramTitle}` })).toBeVisible();
  await instagramCard.getByRole("button", { name: "Approve" }).click();
  await expect(instagramCard.getByText("approved", { exact: true })).toBeVisible();

  const instagramPublishResponse = page.waitForResponse(
    (response) => /\/api\/posts\/[^/]+\/publish$/.test(response.url()) && response.request().method() === "POST",
  );
  await instagramCard.getByRole("button", { name: "Publish to Instagram" }).click();
  await expect((await instagramPublishResponse).status()).toBe(200);
  await expect(instagramCard.getByText("published", { exact: true })).toBeVisible();
  await expect(instagramCard.getByText("remote:18000000000000011", { exact: true })).toBeVisible();

  const instagramStateResponse = await page.request.get("/api/state");
  const instagramState = (await instagramStateResponse.json()) as PublicAppState;
  expect(instagramState.posts).toHaveLength(3);
  expect(instagramState.posts.find((post) => post.channel === "instagram")).toMatchObject({
    mediaUrl: instagramImageUrl,
    remoteId: "18000000000000011",
    revision: 1,
    status: "published",
    title: instagramTitle,
  });

  const instagramMockResponse = await page.request.get(`${mockBaseUrl}/__e2e/state`);
  const instagramMockState = (await instagramMockResponse.json()) as {
    generationRequests: number;
    instagramAuthChecks: number;
    instagramContainers: number;
    instagramPublishes: number;
    instagramStatusChecks: number;
    lastInstagramContainer: { caption: string; image_url: string };
    lastInstagramPublish: { creation_id: string };
  };
  expect(instagramMockState).toMatchObject({
    generationRequests: 3,
    instagramAuthChecks: 1,
    instagramContainers: 1,
    instagramPublishes: 1,
    instagramStatusChecks: 1,
  });
  expect(instagramMockState.lastInstagramContainer.image_url).toBe(instagramImageUrl);
  expect(instagramMockState.lastInstagramContainer.caption).toContain("Show one practical campaign idea");
  expect(instagramMockState.lastInstagramContainer.caption).toContain("#HumanReviewed");
  expect(instagramMockState.lastInstagramPublish).toEqual({ creation_id: "18000000000000010" });

  await navigate(page, "Integrations", "Connections");
  const linkedinForm = page.getByLabel("LinkedIn Member ID").locator("xpath=ancestor::form");
  await linkedinForm.getByLabel("Connection name").fill("E2E LinkedIn profile");
  await linkedinForm.getByLabel("LinkedIn Member ID").fill("782bbtaQ");
  await linkedinForm.getByLabel("LinkedIn API version").fill("202607");
  await linkedinForm.getByLabel("OAuth Access Token").fill("e2e-linkedin-access-token");
  await linkedinForm.getByRole("button", { name: "Save & test" }).click();
  await expect(page.getByText("Connected to LinkedIn as Waleed Khan.")).toBeVisible();

  await navigate(page, "Create content", "Create a draft");
  await page.getByLabel("Topic or source brief").fill(
    "Create one useful professional lesson for my LinkedIn network.",
  );
  await page.getByLabel("Channel").click();
  await page.getByRole("option", { name: "LinkedIn" }).click();

  const linkedinGenerateResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/posts/generate") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Generate review draft" }).click();
  await expect((await linkedinGenerateResponse).status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Approval queue" })).toBeVisible();
  await page.getByRole("button", { name: /^all / }).click();

  const linkedinTitle = "A reviewed LinkedIn member update";
  const linkedinCard = page
    .getByRole("heading", { level: 2, name: linkedinTitle })
    .locator('xpath=ancestor::div[@data-slot="card"]');
  await linkedinCard.getByRole("button", { name: "Approve" }).click();
  await expect(linkedinCard.getByText("approved", { exact: true })).toBeVisible();

  const linkedinPublishResponse = page.waitForResponse(
    (response) => /\/api\/posts\/[^/]+\/publish$/.test(response.url()) && response.request().method() === "POST",
  );
  await linkedinCard.getByRole("button", { name: "Publish to LinkedIn" }).click();
  await expect((await linkedinPublishResponse).status()).toBe(200);
  await expect(linkedinCard.getByText("published", { exact: true })).toBeVisible();
  await expect(linkedinCard.getByText("remote:urn:li:share:7190000000000000003", { exact: true })).toBeVisible();

  const linkedinStateResponse = await page.request.get("/api/state");
  const linkedinState = (await linkedinStateResponse.json()) as PublicAppState;
  expect(linkedinState.posts).toHaveLength(4);
  expect(linkedinState.posts.find((post) => post.channel === "linkedin")).toMatchObject({
    remoteId: "urn:li:share:7190000000000000003",
    revision: 1,
    status: "published",
    title: linkedinTitle,
  });

  const linkedinMockResponse = await page.request.get(`${mockBaseUrl}/__e2e/state`);
  const linkedinMockState = (await linkedinMockResponse.json()) as {
    generationRequests: number;
    lastLinkedInHeaders: {
      authorization: string;
      linkedinVersion: string;
      restliVersion: string;
    };
    lastLinkedInPost: {
      author: string;
      commentary: string;
      distribution: { feedDistribution: string };
      isReshareDisabledByAuthor: boolean;
      lifecycleState: string;
      visibility: string;
    };
    linkedinAuthChecks: number;
    linkedinPublishes: number;
  };
  expect(linkedinMockState).toMatchObject({
    generationRequests: 4,
    linkedinAuthChecks: 1,
    linkedinPublishes: 1,
  });
  expect(linkedinMockState.lastLinkedInHeaders).toEqual({
    authorization: "Bearer e2e-linkedin-access-token",
    linkedinVersion: "202607",
    restliVersion: "2.0.0",
  });
  expect(linkedinMockState.lastLinkedInPost).toMatchObject({
    author: "urn:li:person:782bbtaQ",
    distribution: { feedDistribution: "MAIN_FEED" },
    isReshareDisabledByAuthor: false,
    lifecycleState: "PUBLISHED",
    visibility: "PUBLIC",
  });
  expect(linkedinMockState.lastLinkedInPost.commentary).toContain("Share one practical lesson");
  expect(linkedinMockState.lastLinkedInPost.commentary).toContain("#HumanReviewed");
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
